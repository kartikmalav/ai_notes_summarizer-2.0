const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const { generateSummaryAndTopics } = require("../services/aiService");
const { parsePositiveInt, safeJsonParse } = require("../utils/validators");

/**
 * POST /api/summaries/:documentId
 */
async function createSummary(req, res, next) {
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

    const aiResult = await generateSummaryAndTopics(
      doc.extracted_text,
      doc.original_filename,
      doc.subject
    );

    await db.query(
      `INSERT INTO summaries (document_id, user_id, executive_summary, key_takeaways, important_topics)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         executive_summary = VALUES(executive_summary),
         key_takeaways = VALUES(key_takeaways),
         important_topics = VALUES(important_topics)`,
      [
        docId,
        req.user.id,
        aiResult.executiveSummary,
        JSON.stringify(aiResult.keyTakeaways),
        JSON.stringify(aiResult.importantTopics)
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Summary generated and saved.",
      summary: aiResult
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/summaries/:documentId
 */
async function getSummary(req, res, next) {
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

    const rows = await db.query(
      "SELECT executive_summary, key_takeaways, important_topics, created_at, updated_at FROM summaries WHERE document_id = ? AND user_id = ? LIMIT 1",
      [docId, req.user.id]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        summary: null
      });
    }

    const row = rows[0];
    return res.json({
      success: true,
      summary: {
        executiveSummary: row.executive_summary,
        keyTakeaways: safeJsonParse(row.key_takeaways, []),
        importantTopics: safeJsonParse(row.important_topics, []),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createSummary,
  getSummary
};

