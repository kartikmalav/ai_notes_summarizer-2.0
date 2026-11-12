const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const { answerDocumentQuestion } = require("../services/aiService");
const { parsePositiveInt } = require("../utils/validators");

/**
 * POST /api/chat/:documentId
 */
async function sendMessage(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.documentId);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!message || message.length > 2000) {
      return next(new AppError("Please enter a question between 1 and 2000 characters.", 400));
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

    const historyRows = await db.query(
      "SELECT role, message FROM chat_history WHERE document_id = ? AND user_id = ? ORDER BY created_at DESC, id DESC LIMIT 6",
      [docId, req.user.id]
    );
    const orderedHistory = historyRows.reverse();

    const aiReply = await answerDocumentQuestion(
      doc.extracted_text,
      doc.original_filename,
      doc.subject,
      orderedHistory,
      message
    );

    const userInsert = await db.query(
      "INSERT INTO chat_history (document_id, user_id, role, message) VALUES (?, ?, 'user', ?)",
      [docId, req.user.id, message]
    );

    const assistantInsert = await db.query(
      "INSERT INTO chat_history (document_id, user_id, role, message) VALUES (?, ?, 'assistant', ?)",
      [docId, req.user.id, aiReply]
    );

    return res.status(201).json({
      success: true,
      userMessage: {
        id: userInsert.insertId,
        role: "user",
        message
      },
      assistantMessage: {
        id: assistantInsert.insertId,
        role: "assistant",
        message: aiReply
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/chat/:documentId
 */
async function getChatHistory(req, res, next) {
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
      "SELECT id, role, message, created_at FROM chat_history WHERE document_id = ? AND user_id = ? ORDER BY created_at ASC, id ASC",
      [docId, req.user.id]
    );

    return res.json({
      success: true,
      messages: rows.map(r => ({
        id: r.id,
        role: r.role,
        message: r.message,
        createdAt: r.created_at
      }))
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  sendMessage,
  getChatHistory
};

