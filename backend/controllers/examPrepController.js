const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const {
  generateExamPrepPack,
  generateDefinitionsFromPdf
} = require("../services/aiService");
const { parsePositiveInt, safeJsonParse } = require("../utils/validators");

let ensureTablePromise = null;

function ensureExamPrepTable() {
  if (!ensureTablePromise) {
    ensureTablePromise = db.query(`
      CREATE TABLE IF NOT EXISTS exam_prep_packs (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        document_id INT UNSIGNED NOT NULL UNIQUE,
        user_id INT UNSIGNED NOT NULL,
        topics_json JSON NOT NULL,
        definitions_json JSON NOT NULL,
        notes_meta_json JSON NOT NULL,
        questions_meta_json JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_examprep_document
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        CONSTRAINT fk_examprep_user
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_examprep_user_doc (user_id, document_id)
      ) ENGINE=InnoDB
    `).catch(err => {
      ensureTablePromise = null;
      throw err;
    });
  }
  return ensureTablePromise;
}

function splitContentToPoints(content) {
  const raw = String(content || "").trim();
  if (!raw) return [];
  const lines = raw
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map(s => s.replace(/^[\-\*\u2022]\s*/, "").trim())
    .filter(s => s.length > 8);
  return lines.slice(0, 6);
}

async function buildExamPrepPayload(docId, userId) {
  await ensureExamPrepTable();

  const docs = await db.query(
    `SELECT id, original_filename, format, subject, file_size, page_count,
            extraction_status, extraction_error, created_at
     FROM documents
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [docId, userId]
  );

  if (docs.length === 0) {
    throw new AppError("Document not found or access denied.", 404);
  }

  const doc = docs[0];

  const [summaryRows, notesRows, questionRows, mcqCountRows, packRows] = await Promise.all([
    db.query(
      "SELECT executive_summary, key_takeaways, important_topics FROM summaries WHERE document_id = ? AND user_id = ? LIMIT 1",
      [docId, userId]
    ),
    db.query(
      "SELECT id, topic, content FROM notes WHERE document_id = ? AND user_id = ? ORDER BY sort_order ASC, id ASC",
      [docId, userId]
    ),
    db.query(
      "SELECT id, marks, question_text, answer_text FROM questions WHERE document_id = ? AND user_id = ? ORDER BY marks ASC, id ASC",
      [docId, userId]
    ),
    db.query(
      "SELECT COUNT(*) AS count FROM mcqs WHERE document_id = ? AND user_id = ?",
      [docId, userId]
    ),
    db.query(
      "SELECT topics_json, definitions_json, notes_meta_json, questions_meta_json, updated_at FROM exam_prep_packs WHERE document_id = ? AND user_id = ? LIMIT 1",
      [docId, userId]
    )
  ]);

  const summary = summaryRows[0]
    ? {
        executiveSummary: summaryRows[0].executive_summary,
        keyTakeaways: safeJsonParse(summaryRows[0].key_takeaways, []),
        importantTopics: safeJsonParse(summaryRows[0].important_topics, [])
      }
    : null;

  const pack = packRows[0]
    ? {
        topics: safeJsonParse(packRows[0].topics_json, []),
        definitions: safeJsonParse(packRows[0].definitions_json, []),
        notesMeta: safeJsonParse(packRows[0].notes_meta_json, []),
        questionsMeta: safeJsonParse(packRows[0].questions_meta_json, []),
        updatedAt: packRows[0].updated_at
      }
    : null;

  // Build Important Topics: prefer rich topics_json; fall back to existing summary topics if any
  let topics = Array.isArray(pack?.topics) ? pack.topics : [];
  if (!topics.length && Array.isArray(summary?.importantTopics) && summary.importantTopics.length) {
    topics = summary.importantTopics.map(name => ({
      name: String(name),
      explanation: "",
      keyPoints: [],
      importance: "High",
      pageRef: null
    }));
  }

  // Merge questions with cached question metadata
  const qMetaList = Array.isArray(pack?.questionsMeta) ? pack.questionsMeta : [];
  const questions = questionRows.map((q, idx) => {
    const meta = qMetaList.find(m => m.questionId === q.id) || qMetaList[idx] || {};
    return {
      id: q.id,
      marks: q.marks,
      question: q.question_text,
      answer: q.answer_text,
      keywords: Array.isArray(meta.keywords) ? meta.keywords : [],
      topic: meta.topic || topics[idx % Math.max(topics.length, 1)]?.name || "",
      pageRef: meta.pageRef || null
    };
  });

  // Definitions strictly from generated PDF pack
  const definitions = Array.isArray(pack?.definitions) ? pack.definitions : [];

  // Merge short notes with structured bullets/terminology/examFacts
  const nMetaList = Array.isArray(pack?.notesMeta) ? pack.notesMeta : [];
  const shortNotes = notesRows.map((n, idx) => {
    const meta = nMetaList.find(m => m.noteId === n.id) || nMetaList[idx] || {};
    const points =
      Array.isArray(meta.points) && meta.points.length
        ? meta.points
        : Array.isArray(meta.bullets) && meta.bullets.length
        ? meta.bullets
        : splitContentToPoints(n.content);
    return {
      id: n.id,
      heading: n.topic,
      content: n.content,
      points,
      terminology: Array.isArray(meta.terminology) ? meta.terminology : [],
      examFacts: Array.isArray(meta.examFacts) ? meta.examFacts : [],
      pageRef: meta.pageRef || null
    };
  });

  // Dynamic flashcards built exclusively from real generated questions & definitions
  const flashcards = [
    ...questions.map(q => ({
      id: `q-${q.id}`,
      type: "question",
      badge: `${q.marks}-Mark Question`,
      topic: q.topic || doc.subject,
      front: q.question,
      back: q.answer,
      keywords: q.keywords || [],
      pageRef: q.pageRef || null
    })),
    ...definitions.map((d, idx) => ({
      id: `d-${idx}`,
      type: "definition",
      badge: "Definition",
      topic: doc.subject,
      front: d.term,
      back: d.simpleExplanation ? `${d.definition}\n\nIn simple terms: ${d.simpleExplanation}` : d.definition,
      keywords: d.keywords || [],
      pageRef: d.pageRef || null
    }))
  ];

  return {
    document: {
      id: doc.id,
      filename: doc.original_filename,
      format: doc.format,
      subject: doc.subject,
      pages: doc.page_count,
      extractionStatus: doc.extraction_status,
      extractionError: doc.extraction_error
    },
    counts: {
      topics: topics.length,
      questions: questions.length,
      definitions: definitions.length,
      shortNotes: shortNotes.length,
      flashcards: flashcards.length,
      mcqs: Number(mcqCountRows[0]?.count || 0)
    },
    topics,
    questions,
    definitions,
    shortNotes,
    flashcards,
    hasSummary: Boolean(summary),
    hasPack: Boolean(pack),
    hasDefinitions: definitions.length > 0
  };
}

/**
 * GET /api/exam-prep/:documentId? (or /api/exam-prep?doc=)
 */
async function getExamPrep(req, res, next) {
  try {
    const rawDocId = req.params.documentId || req.query.documentId || req.query.doc;
    let docId = parsePositiveInt(rawDocId);

    if (!docId) {
      const latestDocs = await db.query(
        "SELECT id FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [req.user.id]
      );
      if (latestDocs.length === 0) {
        return res.json({
          success: true,
          examPrep: null,
          message: "No documents found for this user."
        });
      }
      docId = latestDocs[0].id;
    }

    const examPrep = await buildExamPrepPayload(docId, req.user.id);
    return res.json({
      success: true,
      examPrep
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/exam-prep/:documentId/generate (or POST /api/exam-prep/generate)
 * Body optional: { mode: "missing" | "all" | "definitions", documentId?: number }
 */
async function generateExamPrep(req, res, next) {
  try {
    const rawDocId = req.params.documentId || req.body?.documentId || req.query?.doc;
    let docId = parsePositiveInt(rawDocId);

    if (!docId) {
      const latestDocs = await db.query(
        "SELECT id FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
        [req.user.id]
      );
      if (latestDocs.length === 0) {
        return next(new AppError("No documents available to generate exam preparation.", 404));
      }
      docId = latestDocs[0].id;
    }

    await ensureExamPrepTable();

    const mode = ["missing", "all", "definitions"].includes(req.body?.mode)
      ? req.body.mode
      : "missing";

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

    if (mode === "definitions") {
      const definitions = await generateDefinitionsFromPdf(
        doc.extracted_text,
        doc.original_filename,
        doc.subject
      );

      const existingPackRows = await db.query(
        "SELECT topics_json, notes_meta_json, questions_meta_json FROM exam_prep_packs WHERE document_id = ? AND user_id = ? LIMIT 1",
        [docId, req.user.id]
      );
      const existingPack = existingPackRows[0];

      await db.query(
        `INSERT INTO exam_prep_packs (document_id, user_id, topics_json, definitions_json, notes_meta_json, questions_meta_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE definitions_json = VALUES(definitions_json)`,
        [
          docId,
          req.user.id,
          existingPack ? JSON.stringify(safeJsonParse(existingPack.topics_json, [])) : "[]",
          JSON.stringify(definitions),
          existingPack ? JSON.stringify(safeJsonParse(existingPack.notes_meta_json, [])) : "[]",
          existingPack ? JSON.stringify(safeJsonParse(existingPack.questions_meta_json, [])) : "[]"
        ]
      );

      const examPrep = await buildExamPrepPayload(docId, req.user.id);
      return res.status(201).json({
        success: true,
        message: `${definitions.length} PDF-grounded definitions generated and saved.`,
        examPrep
      });
    }

    // Check existing MySQL content to reuse wherever possible
    const currentPayload = await buildExamPrepPayload(docId, req.user.id);
    if (
      mode === "missing" &&
      currentPayload.counts.topics > 0 &&
      currentPayload.counts.questions > 0 &&
      currentPayload.counts.shortNotes > 0 &&
      currentPayload.counts.definitions > 0 &&
      currentPayload.hasPack
    ) {
      return res.json({
        success: true,
        reusedCache: true,
        message: "Loaded saved exam preparation materials.",
        examPrep: currentPayload
      });
    }

    const aiPack = await generateExamPrepPack(
      doc.extracted_text,
      doc.original_filename,
      doc.subject,
      mode === "all"
        ? {}
        : {
            importantTopics: currentPayload.topics.map(t => t.name),
            notes: currentPayload.shortNotes.map(n => ({ id: n.id, topic: n.heading })),
            questions: currentPayload.questions.map(q => ({
              id: q.id,
              marks: q.marks,
              question: q.question
            }))
          }
    );

    const connection = await db.pool.getConnection();
    try {
      await connection.beginTransaction();

      if (aiPack.mode === "full") {
        // Save notes into existing notes table
        await connection.execute("DELETE FROM notes WHERE document_id = ? AND user_id = ?", [
          docId,
          req.user.id
        ]);
        const notesMeta = [];
        for (let i = 0; i < aiPack.shortNotes.length; i++) {
          const note = aiPack.shortNotes[i];
          const plainContent = note.points.length
            ? note.points.map(p => `- ${p}`).join("\n")
            : note.heading;
          const [ins] = await connection.execute(
            "INSERT INTO notes (document_id, user_id, topic, content, sort_order) VALUES (?, ?, ?, ?, ?)",
            [docId, req.user.id, note.heading.slice(0, 255), plainContent, i]
          );
          notesMeta.push({
            noteId: ins.insertId,
            points: note.points,
            terminology: note.terminology,
            examFacts: note.examFacts,
            pageRef: note.pageRef
          });
        }

        // Save questions into existing questions table
        await connection.execute("DELETE FROM questions WHERE document_id = ? AND user_id = ?", [
          docId,
          req.user.id
        ]);
        const questionsMeta = [];
        for (const q of aiPack.questions) {
          const [ins] = await connection.execute(
            "INSERT INTO questions (document_id, user_id, marks, question_text, answer_text) VALUES (?, ?, ?, ?, ?)",
            [docId, req.user.id, q.marks, q.question, q.answer]
          );
          questionsMeta.push({
            questionId: ins.insertId,
            keywords: q.keywords,
            topic: q.topic,
            pageRef: q.pageRef
          });
        }

        // Keep summaries.important_topics aligned if no summary exists yet
        const [sumExisting] = await connection.execute(
          "SELECT id, important_topics FROM summaries WHERE document_id = ? AND user_id = ? LIMIT 1",
          [docId, req.user.id]
        );
        const topicNames = aiPack.topics.map(t => t.name);
        if (sumExisting.length === 0 && topicNames.length > 0) {
          const fallbackExecSummary = aiPack.topics
            .map(t => `${t.name}: ${t.explanation}`)
            .filter(Boolean)
            .slice(0, 3)
            .join(" ");
          const fallbackTakeaways = aiPack.topics.flatMap(t => t.keyPoints || []).slice(0, 5);
          await connection.execute(
            `INSERT INTO summaries (document_id, user_id, executive_summary, key_takeaways, important_topics)
             VALUES (?, ?, ?, ?, ?)`,
            [
              docId,
              req.user.id,
              fallbackExecSummary || `Key exam topics extracted from ${doc.original_filename}.`,
              JSON.stringify(fallbackTakeaways),
              JSON.stringify(topicNames)
            ]
          );
        }

        await connection.execute(
          `INSERT INTO exam_prep_packs (document_id, user_id, topics_json, definitions_json, notes_meta_json, questions_meta_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             topics_json = VALUES(topics_json),
             definitions_json = VALUES(definitions_json),
             notes_meta_json = VALUES(notes_meta_json),
             questions_meta_json = VALUES(questions_meta_json)`,
          [
            docId,
            req.user.id,
            JSON.stringify(aiPack.topics),
            JSON.stringify(aiPack.definitions),
            JSON.stringify(notesMeta),
            JSON.stringify(questionsMeta)
          ]
        );
      } else {
        // Enriched mode: reused existing notes & questions rows, attached metadata & definitions
        const notesMeta = currentPayload.shortNotes.map((n, idx) => {
          const found = aiPack.notesMeta.find(m => Number(m.index) === idx) || aiPack.notesMeta[idx] || {};
          return {
            noteId: n.id,
            points: Array.isArray(found.bullets) && found.bullets.length ? found.bullets : n.points,
            terminology: Array.isArray(found.terminology) ? found.terminology : [],
            examFacts: Array.isArray(found.examFacts) ? found.examFacts : [],
            pageRef: found.pageRef || null
          };
        });

        const questionsMeta = currentPayload.questions.map((q, idx) => {
          const found = aiPack.questionsMeta.find(m => Number(m.index) === idx) || aiPack.questionsMeta[idx] || {};
          return {
            questionId: q.id,
            keywords: Array.isArray(found.keywords) ? found.keywords : [],
            topic: found.topic || "",
            pageRef: found.pageRef || null
          };
        });

        await connection.execute(
          `INSERT INTO exam_prep_packs (document_id, user_id, topics_json, definitions_json, notes_meta_json, questions_meta_json)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             topics_json = VALUES(topics_json),
             definitions_json = VALUES(definitions_json),
             notes_meta_json = VALUES(notes_meta_json),
             questions_meta_json = VALUES(questions_meta_json)`,
          [
            docId,
            req.user.id,
            JSON.stringify(aiPack.topics),
            JSON.stringify(aiPack.definitions),
            JSON.stringify(notesMeta),
            JSON.stringify(questionsMeta)
          ]
        );
      }

      await connection.commit();
    } catch (txErr) {
      await connection.rollback();
      throw txErr;
    } finally {
      connection.release();
    }

    const examPrep = await buildExamPrepPayload(docId, req.user.id);
    return res.status(201).json({
      success: true,
      reusedCache: false,
      message:
        aiPack.mode === "enriched"
          ? "Exam preparation enriched existing notes & questions with definitions and topic breakdowns."
          : "Complete exam preparation materials generated and saved.",
      examPrep
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getExamPrep,
  generateExamPrep
};

