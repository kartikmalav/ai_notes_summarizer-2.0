const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const { generateMcqs } = require("../services/aiService");
const { parsePositiveInt, safeJsonParse } = require("../utils/validators");

/**
 * POST /api/mcqs/generate/:documentId? (or /api/mcqs/generate)
 */
async function createMcqs(req, res, next) {
  try {
    const rawDocId = req.params.documentId || req.body?.documentId || req.query?.doc;
    const docId = parsePositiveInt(rawDocId);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

    const count = req.body?.count ? Number(req.body.count) : 6;

    const docs = await db.query(
      `SELECT id, original_filename, subject, extracted_text, extraction_status, extraction_error
       FROM documents
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [docId, req.user.id]
    );

    if (docs.length === 0) {
      return next(new AppError("Document not found or access denied.", 404));
    }

    const doc = docs[0];
    if (doc.extraction_status !== "ready") {
      return next(
        new AppError(
          doc.extraction_error ||
            "Text extraction is not ready for this document (scanned PDFs require OCR).",
          422
        )
      );
    }

    const generated = await generateMcqs(
      doc.extracted_text,
      doc.original_filename,
      doc.subject,
      count
    );

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute("DELETE FROM mcqs WHERE document_id = ? AND user_id = ?", [
        docId,
        req.user.id
      ]);

      const savedMcqs = [];
      for (const item of generated) {
        const [ins] = await connection.execute(
          "INSERT INTO mcqs (document_id, user_id, question_text, options_json, correct_index, explanation) VALUES (?, ?, ?, ?, ?, ?)",
          [
            docId,
            req.user.id,
            item.question,
            JSON.stringify(item.options),
            item.correctIndex,
            item.explanation
          ]
        );
        savedMcqs.push({
          id: ins.insertId,
          documentId: docId,
          question: item.question,
          options: item.options
        });
      }

      await connection.commit();

      return res.status(201).json({
        success: true,
        message: `${savedMcqs.length} MCQs generated and saved.`,
        mcqs: savedMcqs
      });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/mcqs/:documentId? (or /api/mcqs?doc=)
 * Supports documentId = "all" (or empty) for mixed practice across user's documents.
 * Deliberately omits correct_index/explanation until submission so quiz scoring stays server-authoritative.
 */
async function getMcqsByDocument(req, res, next) {
  try {
    const rawParam = req.params.documentId || req.query.documentId || req.query.doc || "all";
    const param = String(rawParam).toLowerCase();

    if (param === "all") {
      const rows = await db.query(
        `SELECT m.id, m.document_id, d.original_filename, m.question_text, m.options_json
         FROM mcqs m
         INNER JOIN documents d ON d.id = m.document_id
         WHERE m.user_id = ?
         ORDER BY m.created_at DESC, m.id ASC
         LIMIT 30`,
        [req.user.id]
      );

      return res.json({
        success: true,
        mcqs: rows.map(r => ({
          id: r.id,
          documentId: r.document_id,
          source: r.original_filename,
          question: r.question_text,
          options: safeJsonParse(r.options_json, [])
        }))
      });
    }

    const docId = parsePositiveInt(param);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

    const docs = await db.query(
      "SELECT id, original_filename FROM documents WHERE id = ? AND user_id = ? LIMIT 1",
      [docId, req.user.id]
    );
    if (docs.length === 0) {
      return next(new AppError("Document not found or access denied.", 404));
    }

    const rows = await db.query(
      "SELECT id, document_id, question_text, options_json FROM mcqs WHERE document_id = ? AND user_id = ? ORDER BY id ASC",
      [docId, req.user.id]
    );

    return res.json({
      success: true,
      mcqs: rows.map(r => ({
        id: r.id,
        documentId: r.document_id,
        source: docs[0].original_filename,
        question: r.question_text,
        options: safeJsonParse(r.options_json, [])
      }))
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/mcqs/submit
 * Server-side authoritative quiz grading. Never trusts any score from frontend.
 */
async function submitQuiz(req, res, next) {
  try {
    const { documentId, answers, timeTakenSeconds } = req.body || {};

    if (!Array.isArray(answers) || answers.length === 0) {
      return next(new AppError("Please submit at least one answered question.", 400));
    }

    const parsedDocId = documentId && documentId !== "ALL" ? parsePositiveInt(documentId) : null;
    if (documentId && documentId !== "ALL" && !parsedDocId) {
      return next(new AppError("Invalid documentId provided.", 400));
    }

    if (parsedDocId) {
      const ownDoc = await db.query(
        "SELECT id FROM documents WHERE id = ? AND user_id = ? LIMIT 1",
        [parsedDocId, req.user.id]
      );
      if (ownDoc.length === 0) {
        return next(new AppError("Document not found or access denied.", 404));
      }
    }

    const mcqIds = answers
      .map(a => parsePositiveInt(a.mcqId))
      .filter(Boolean);

    if (mcqIds.length === 0) {
      return next(new AppError("Invalid MCQ identifiers in submission.", 400));
    }

    const placeholders = mcqIds.map(() => "?").join(",");
    const dbMcqs = await db.query(
      `SELECT id, document_id, question_text, options_json, correct_index, explanation
       FROM mcqs
       WHERE user_id = ? AND id IN (${placeholders})`,
      [req.user.id, ...mcqIds]
    );

    if (dbMcqs.length === 0) {
      return next(new AppError("No matching MCQs found for your account.", 404));
    }

    const mcqMap = new Map(dbMcqs.map(m => [m.id, m]));
    let correctCount = 0;
    const gradedBreakdown = [];

    for (const entry of answers) {
      const mcqId = parsePositiveInt(entry.mcqId);
      const selectedIdx = Number(entry.selectedIndex);
      const dbItem = mcqId ? mcqMap.get(mcqId) : null;
      if (!dbItem) continue;

      const isCorrect = Number.isInteger(selectedIdx) && selectedIdx === dbItem.correct_index;
      if (isCorrect) correctCount++;

      gradedBreakdown.push({
        mcqId: dbItem.id,
        question: dbItem.question_text,
        options: safeJsonParse(dbItem.options_json, []),
        selectedIndex: Number.isInteger(selectedIdx) ? selectedIdx : null,
        correctIndex: dbItem.correct_index,
        isCorrect,
        explanation: dbItem.explanation
      });
    }

    const totalQuestions = gradedBreakdown.length;
    if (totalQuestions === 0) {
      return next(new AppError("No valid answers could be graded.", 400));
    }

    const scorePercentage = Number(((correctCount / totalQuestions) * 100).toFixed(2));
    const safeTime = Math.max(0, Math.min(86400, Number(timeTakenSeconds) || 0));

    const insertRes = await db.query(
      `INSERT INTO quiz_results
        (user_id, document_id, total_questions, correct_answers, score_percentage, time_taken_seconds, answers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        parsedDocId,
        totalQuestions,
        correctCount,
        scorePercentage,
        safeTime,
        JSON.stringify(gradedBreakdown)
      ]
    );

    return res.status(201).json({
      success: true,
      result: {
        id: insertRes.insertId,
        documentId: parsedDocId,
        totalQuestions,
        correctAnswers: correctCount,
        scorePercentage,
        timeTakenSeconds: safeTime,
        breakdown: gradedBreakdown
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/mcqs/results
 */
async function getQuizResults(req, res, next) {
  try {
    const rows = await db.query(
      `SELECT r.id, r.document_id, d.original_filename, r.total_questions, r.correct_answers,
              r.score_percentage, r.time_taken_seconds, r.created_at
       FROM quiz_results r
       LEFT JOIN documents d ON d.id = r.document_id
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC
       LIMIT 25`,
      [req.user.id]
    );

    return res.json({
      success: true,
      results: rows.map(r => ({
        id: r.id,
        documentId: r.document_id,
        documentName: r.original_filename || "Mixed All Documents Quiz",
        totalQuestions: r.total_questions,
        correctAnswers: r.correct_answers,
        scorePercentage: Number(r.score_percentage),
        timeTakenSeconds: r.time_taken_seconds,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createMcqs,
  getMcqsByDocument,
  submitQuiz,
  getQuizResults
};

