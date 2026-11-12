const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const { generateNotesAndQuestions } = require("../services/aiService");
const { parsePositiveInt } = require("../utils/validators");

/**
 * POST /api/questions/:documentId
 * Generates short notes + 2-mark, 5-mark, and 10-mark exam questions and stores them in MySQL.
 */
async function createNotesAndQuestions(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.documentId);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

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

    const aiResult = await generateNotesAndQuestions(
      doc.extracted_text,
      doc.original_filename,
      doc.subject
    );

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute("DELETE FROM notes WHERE document_id = ? AND user_id = ?", [
        docId,
        req.user.id
      ]);
      await connection.execute("DELETE FROM questions WHERE document_id = ? AND user_id = ?", [
        docId,
        req.user.id
      ]);

      const savedNotes = [];
      for (let i = 0; i < aiResult.notes.length; i++) {
        const note = aiResult.notes[i];
        const [ins] = await connection.execute(
          "INSERT INTO notes (document_id, user_id, topic, content, sort_order) VALUES (?, ?, ?, ?, ?)",
          [docId, req.user.id, note.topic.slice(0, 255), note.content, i]
        );
        savedNotes.push({ id: ins.insertId, topic: note.topic, content: note.content });
      }

      const savedQuestions = [];
      for (const q of aiResult.questions) {
        const [ins] = await connection.execute(
          "INSERT INTO questions (document_id, user_id, marks, question_text, answer_text) VALUES (?, ?, ?, ?, ?)",
          [docId, req.user.id, q.marks, q.question, q.answer]
        );
        savedQuestions.push({
          id: ins.insertId,
          marks: q.marks,
          question: q.question,
          answer: q.answer
        });
      }

      await connection.commit();

      return res.status(201).json({
        success: true,
        message: "Short notes and exam questions generated and saved.",
        notes: savedNotes,
        questions: savedQuestions
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
 * GET /api/questions/:documentId
 */
async function getNotesAndQuestions(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.documentId);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

    const docs = await db.query(
      "SELECT id FROM documents WHERE id = ? AND user_id = ? LIMIT 1",
      [docId, req.user.id]
    );
    if (docs.length === 0) {
      return next(new AppError("Document not found or access denied.", 404));
    }

    const notesRows = await db.query(
      "SELECT id, topic, content, created_at FROM notes WHERE document_id = ? AND user_id = ? ORDER BY sort_order ASC, id ASC",
      [docId, req.user.id]
    );

    const questionRows = await db.query(
      "SELECT id, marks, question_text, answer_text, created_at FROM questions WHERE document_id = ? AND user_id = ? ORDER BY marks ASC, id ASC",
      [docId, req.user.id]
    );

    return res.json({
      success: true,
      notes: notesRows.map(n => ({
        id: n.id,
        topic: n.topic,
        content: n.content,
        createdAt: n.created_at
      })),
      questions: questionRows.map(q => ({
        id: q.id,
        marks: q.marks,
        question: q.question_text,
        answer: q.answer_text,
        createdAt: q.created_at
      }))
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createNotesAndQuestions,
  getNotesAndQuestions
};

