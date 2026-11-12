const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const { extractPdfText } = require("../services/pdfService");
const { parsePositiveInt, safeJsonParse } = require("../utils/validators");

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 KB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function removeFileQuietly(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // Ignore if already deleted
  }
}

/**
 * POST /api/documents/upload
 */
async function uploadDocument(req, res, next) {
  if (!req.file) {
    return next(new AppError("Please select a PDF file to upload.", 400));
  }

  const filePath = req.file.path;
  const originalFilename = (req.body?.title || req.file.originalname || "document.pdf").trim().slice(0, 255);
  const subject = (req.body?.subject || "General").trim().slice(0, 120) || "General";

  try {
    const extraction = await extractPdfText(filePath);

    if (extraction.status === "failed") {
      await removeFileQuietly(filePath);
      return next(new AppError(extraction.error || "Invalid or corrupted PDF file.", 400));
    }

    const result = await db.query(
      `INSERT INTO documents
        (user_id, original_filename, stored_filename, file_path, mime_type, format, subject, file_size, page_count, extracted_text, extraction_status, extraction_error)
       VALUES (?, ?, ?, ?, ?, 'PDF', ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        originalFilename,
        req.file.filename,
        path.relative(path.join(__dirname, ".."), filePath).replace(/\\/g, "/"),
        req.file.mimetype || "application/pdf",
        subject,
        req.file.size,
        extraction.pageCount,
        extraction.text,
        extraction.status,
        extraction.error
      ]
    );

    const documentId = result.insertId;

    return res.status(201).json({
      success: true,
      message:
        extraction.status === "ocr_required"
          ? "PDF uploaded, but scanned/image-only pages require OCR before AI generation."
          : "PDF uploaded and text extracted successfully.",
      document: {
        id: documentId,
        filename: originalFilename,
        format: "PDF",
        subject,
        size: formatBytes(req.file.size),
        fileSizeBytes: req.file.size,
        pages: extraction.pageCount,
        extractionStatus: extraction.status,
        extractionError: extraction.error,
        textLength: extraction.text.length,
        createdAt: new Date().toISOString()
      }
    });
  } catch (err) {
    await removeFileQuietly(filePath);
    return next(err);
  }
}

/**
 * GET /api/documents
 */
async function getDocuments(req, res, next) {
  try {
    const search = (req.query.q || "").trim();
    const subject = (req.query.subject || "").trim();

    let sql = `
      SELECT
        d.id,
        d.original_filename,
        d.format,
        d.subject,
        d.file_size,
        d.page_count,
        d.extraction_status,
        d.extraction_error,
        d.created_at,
        d.updated_at,
        EXISTS(SELECT 1 FROM summaries s WHERE s.document_id = d.id) AS has_summary,
        (SELECT COUNT(*) FROM notes n WHERE n.document_id = d.id) AS notes_count,
        (SELECT COUNT(*) FROM questions q WHERE q.document_id = d.id) AS questions_count,
        (SELECT COUNT(*) FROM mcqs m WHERE m.document_id = d.id) AS mcqs_count
      FROM documents d
      WHERE d.user_id = ?
    `;
    const params = [req.user.id];

    if (subject && subject !== "ALL") {
      sql += " AND d.subject = ?";
      params.push(subject);
    }

    if (search) {
      sql += " AND (d.original_filename LIKE ? OR d.subject LIKE ?)";
      const likeVal = `%${search}%`;
      params.push(likeVal, likeVal);
    }

    sql += " ORDER BY d.created_at DESC";

    const rows = await db.query(sql, params);

    const documents = rows.map(row => ({
      id: row.id,
      filename: row.original_filename,
      format: row.format,
      subject: row.subject,
      size: formatBytes(row.file_size),
      fileSizeBytes: row.file_size,
      pages: row.page_count,
      extractionStatus: row.extraction_status,
      extractionError: row.extraction_error,
      hasSummary: Boolean(row.has_summary),
      stats: {
        notes: Number(row.notes_count || 0),
        questions: Number(row.questions_count || 0),
        mcqs: Number(row.mcqs_count || 0)
      },
      uploadDate: new Date(row.created_at).toISOString().split("T")[0],
      createdAt: row.created_at
    }));

    return res.json({
      success: true,
      documents
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/documents/:id
 */
async function getDocumentById(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.id);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

    const rows = await db.query(
      `SELECT id, user_id, original_filename, format, subject, file_size, page_count,
              extraction_status, extraction_error, CHAR_LENGTH(extracted_text) AS text_length,
              created_at, updated_at
       FROM documents
       WHERE id = ? AND user_id = ?
       LIMIT 1`,
      [docId, req.user.id]
    );

    if (rows.length === 0) {
      return next(new AppError("Document not found or access denied.", 404));
    }

    const doc = rows[0];
    const summaryRows = await db.query(
      "SELECT executive_summary, key_takeaways, important_topics, updated_at FROM summaries WHERE document_id = ? AND user_id = ? LIMIT 1",
      [docId, req.user.id]
    );
    const notesRows = await db.query(
      "SELECT id, topic, content FROM notes WHERE document_id = ? AND user_id = ? ORDER BY sort_order ASC, id ASC",
      [docId, req.user.id]
    );
    const questionRows = await db.query(
      "SELECT id, marks, question_text, answer_text FROM questions WHERE document_id = ? AND user_id = ? ORDER BY marks ASC, id ASC",
      [docId, req.user.id]
    );
    const [mcqCountRow] = await db.query(
      "SELECT COUNT(*) AS count FROM mcqs WHERE document_id = ? AND user_id = ?",
      [docId, req.user.id]
    );

    const summaryData = summaryRows[0]
      ? {
          executiveSummary: summaryRows[0].executive_summary,
          keyTakeaways: safeJsonParse(summaryRows[0].key_takeaways, []),
          importantTopics: safeJsonParse(summaryRows[0].important_topics, []),
          updatedAt: summaryRows[0].updated_at
        }
      : null;

    return res.json({
      success: true,
      document: {
        id: doc.id,
        filename: doc.original_filename,
        format: doc.format,
        subject: doc.subject,
        size: formatBytes(doc.file_size),
        pages: doc.page_count,
        extractionStatus: doc.extraction_status,
        extractionError: doc.extraction_error,
        textLength: Number(doc.text_length || 0),
        uploadDate: new Date(doc.created_at).toISOString().split("T")[0],
        createdAt: doc.created_at,
        summary: summaryData,
        notes: notesRows.map(n => ({ id: n.id, topic: n.topic, content: n.content })),
        questions: questionRows.map(q => ({
          id: q.id,
          marks: q.marks,
          question: q.question_text,
          answer: q.answer_text
        })),
        mcqsCount: Number(mcqCountRow?.count || 0)
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/documents/:id
 */
async function deleteDocument(req, res, next) {
  try {
    const docId = parsePositiveInt(req.params.id);
    if (!docId) {
      return next(new AppError("Invalid document ID.", 400));
    }

    const rows = await db.query(
      "SELECT id, file_path FROM documents WHERE id = ? AND user_id = ? LIMIT 1",
      [docId, req.user.id]
    );

    if (rows.length === 0) {
      return next(new AppError("Document not found or access denied.", 404));
    }

    const fullPath = path.join(__dirname, "..", rows[0].file_path);
    await db.query("DELETE FROM documents WHERE id = ? AND user_id = ?", [docId, req.user.id]);
    await removeFileQuietly(fullPath);

    return res.json({
      success: true,
      message: "Document and all generated study materials deleted."
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument
};

