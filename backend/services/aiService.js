const {
  Groq,
  APIError,
  RateLimitError,
  APIConnectionTimeoutError,
  AuthenticationError
} = require("groq-sdk");
const { AppError } = require("../middleware/errorMiddleware");
const {
  cleanDocumentText,
  estimateTokenCount,
  extractRepresentativeExcerpts,
  retrieveRelevantExcerpts
} = require("../utils/validators");

const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 30000;

// Application-level safety ceiling per request to stay safely under Groq's 8,000 TPM limit.
const SAFE_TOTAL_TOKEN_BUDGET = 6500;
const MESSAGE_OVERHEAD_TOKENS = 48;

const TASK_OUTPUT_TOKENS = {
  summary: 1000,
  notesAndQuestions: 1400,
  mcqs: 1300,
  chat: 700,
  examPrepFull: 1900,
  examPrepEnrich: 1500,
  definitions: 1100,
  health: 256
};

const TASK_CONTEXT_CHARS = {
  summary: 12000,
  notesAndQuestions: 9000,
  mcqs: 8500,
  chat: 7500,
  examPrep: 7500
};

/**
 * Read non-sensitive AI configuration & check whether Groq API key is present.
 * Never returns or logs the actual API key value.
 */
function getAiHealth() {
  const provider = (process.env.AI_PROVIDER || "groq").trim().toLowerCase();
  const model = (process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL).trim();
  const maxTokens = Number(process.env.AI_MAX_TOKENS) || DEFAULT_MAX_TOKENS;
  const rawKey = (process.env.GROQ_API_KEY || "").trim();
  const configured =
    provider === "groq" &&
    rawKey.length > 10 &&
    !rawKey.includes("your_groq_api_key");

  return {
    provider,
    model,
    maxTokens,
    safeTokenBudget: SAFE_TOTAL_TOKEN_BUDGET,
    configured
  };
}

function getGroqClientAndConfig() {
  const health = getAiHealth();

  if (health.provider !== "groq") {
    throw new AppError(
      `Unsupported AI_PROVIDER "${health.provider}". Set AI_PROVIDER=groq in backend/.env.`,
      503
    );
  }

  const apiKey = (process.env.GROQ_API_KEY || "").trim();
  if (!health.configured || !apiKey) {
    throw new AppError(
      "Groq AI service is not configured: GROQ_API_KEY is missing in backend/.env.",
      503
    );
  }

  const timeoutMs = Number(process.env.AI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const client = new Groq({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 1
  });

  return {
    client,
    model: health.model,
    maxTokens: Math.min(Math.max(health.maxTokens, 256), 4096)
  };
}

/**
 * Enforce the 6500-token application budget before sending a Groq request.
 * If estimated tokens exceed the input allowance, shorten context rather than failing.
 */
function fitPromptToTokenBudget({
  systemPrompt,
  userPrompt = "",
  reservedOutputTokens,
  initialContext = "",
  buildUserPrompt = null,
  shortenContext = null
}) {
  const safeOutputReserve = Math.min(Math.max(reservedOutputTokens, 128), SAFE_TOTAL_TOKEN_BUDGET - 512);
  const maxInputTokens = SAFE_TOTAL_TOKEN_BUDGET - safeOutputReserve - MESSAGE_OVERHEAD_TOKENS;
  const systemTokens = estimateTokenCount(systemPrompt);
  const availableUserTokens = Math.max(256, maxInputTokens - systemTokens);

  if (!buildUserPrompt || !shortenContext) {
    const userTokens = estimateTokenCount(userPrompt);
    let finalUserPrompt = userPrompt;
    if (userTokens > availableUserTokens) {
      const targetChars = Math.max(300, Math.floor(availableUserTokens * 3.2));
      finalUserPrompt = userPrompt.slice(0, targetChars).trimEnd() + "\n[Shortened to fit token budget]";
    }
    const estimatedInputTokens = systemTokens + estimateTokenCount(finalUserPrompt) + MESSAGE_OVERHEAD_TOKENS;
    return {
      userPrompt: finalUserPrompt,
      reservedOutputTokens: safeOutputReserve,
      estimatedInputTokens,
      estimatedTotalTokens: estimatedInputTokens + safeOutputReserve
    };
  }

  let currentContext = initialContext;
  let currentPrompt = buildUserPrompt(currentContext);
  let currentUserTokens = estimateTokenCount(currentPrompt);

  for (let attempt = 0; attempt < 3 && currentUserTokens > availableUserTokens; attempt++) {
    const promptWithoutContext = buildUserPrompt("");
    const fixedUserTokens = estimateTokenCount(promptWithoutContext);
    const contextTokenBudget = Math.max(180, availableUserTokens - fixedUserTokens);
    const targetContextChars = Math.max(400, Math.floor(contextTokenBudget * 3.1));

    const shortened = shortenContext(targetContextChars);
    if (!shortened || shortened.length >= currentContext.length) {
      currentContext = currentContext.slice(0, targetContextChars).trimEnd() + "\n[Shortened]";
    } else {
      currentContext = shortened;
    }

    currentPrompt = buildUserPrompt(currentContext);
    currentUserTokens = estimateTokenCount(currentPrompt);
  }

  if (currentUserTokens > availableUserTokens) {
    const hardCapChars = Math.max(350, Math.floor(availableUserTokens * 3.1));
    currentPrompt = currentPrompt.slice(0, hardCapChars).trimEnd() + "\n[Shortened]";
  }

  const estimatedInputTokens = systemTokens + estimateTokenCount(currentPrompt) + MESSAGE_OVERHEAD_TOKENS;
  return {
    userPrompt: currentPrompt,
    reservedOutputTokens: safeOutputReserve,
    estimatedInputTokens,
    estimatedTotalTokens: estimatedInputTokens + safeOutputReserve
  };
}

/**
 * Execute a Groq chat completion with pre-flight token budgeting and 413/429 handling.
 */
async function callGroqChat(systemPrompt, userPrompt, options = {}) {
  const {
    expectJson = false,
    maxTokensOverride = null,
    budgetSpec = null
  } = options;
  const { client, model, maxTokens } = getGroqClientAndConfig();

  const desiredOutputTokens = Math.min(maxTokensOverride || maxTokens, maxTokens);
  const budgeted = fitPromptToTokenBudget({
    systemPrompt,
    userPrompt,
    reservedOutputTokens: desiredOutputTokens,
    ...(budgetSpec || {})
  });

  const payload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: budgeted.userPrompt }
    ],
    temperature: 0.3,
    max_completion_tokens: budgeted.reservedOutputTokens
  };

  if (model.startsWith("openai/gpt-oss")) {
    payload.reasoning_effort = "low";
  }

  if (expectJson) {
    payload.response_format = { type: "json_object" };
  }

  try {
    const completion = await client.chat.completions.create(payload);
    const choice = completion?.choices?.[0];
    const content = choice?.message?.content;

    if (!content || !content.trim()) {
      const reason = choice?.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : "";
      throw new AppError(`Groq AI returned an empty response${reason}.`, 502);
    }

    return {
      text: content.trim(),
      model: completion.model || model,
      usage: completion.usage || null,
      tokenBudget: {
        safeLimit: SAFE_TOTAL_TOKEN_BUDGET,
        estimatedInputTokens: budgeted.estimatedInputTokens,
        reservedOutputTokens: budgeted.reservedOutputTokens,
        estimatedTotalTokens: budgeted.estimatedTotalTokens
      }
    };
  } catch (err) {
    if (err instanceof AppError) throw err;

    if (err instanceof AuthenticationError) {
      throw new AppError("Groq authentication failed. Verify GROQ_API_KEY in backend/.env.", 502);
    }
    if (err instanceof RateLimitError || err?.status === 429) {
      throw new AppError(
        "Groq API rate or token limit reached (429). Please wait a few seconds and retry.",
        429
      );
    }
    if (err?.status === 413) {
      throw new AppError(
        "Groq request payload exceeded size limit (413). Document context was too large; retry with a shorter query.",
        413
      );
    }
    if (err instanceof APIConnectionTimeoutError) {
      throw new AppError("Groq API request timed out. Try again shortly.", 504);
    }
    if (err instanceof APIError) {
      const status = err.status >= 400 && err.status < 600 ? err.status : 502;
      throw new AppError(`Groq API error (${status}): ${err.message}`, status >= 500 ? 502 : status);
    }

    throw new AppError(`Failed to communicate with Groq API: ${err.message}`, 502);
  }
}

function parseJsonResponse(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    throw new AppError("Groq AI returned malformed JSON output. Please try again.", 502);
  }
}

function getRequiredCleanedText(extractedText) {
  const cleaned = cleanDocumentText(extractedText);
  if (!cleaned) {
    throw new AppError("Document has no extracted text available for AI analysis.", 400);
  }
  return cleaned;
}

/**
 * Select up to 3 relevant recent chat messages within a compact character cap.
 */
function selectRelevantChatHistory(chatHistory, userQuestion, maxMessages = 3) {
  const valid = (chatHistory || [])
    .filter(m => m && typeof m.message === "string" && m.message.trim())
    .slice(-6);

  if (valid.length <= maxMessages) {
    return valid.map(m => ({
      role: m.role,
      message: m.message.trim().slice(0, 320)
    }));
  }

  const queryTerms = Array.from(
    new Set((userQuestion.toLowerCase().match(/[a-z0-9]{3,}/g) || []))
  );

  const lastIdx = valid.length - 1;
  const scoredEarlier = valid.slice(0, lastIdx).map((msg, idx) => {
    const lower = msg.message.toLowerCase();
    let overlap = 0;
    for (const term of queryTerms) {
      if (lower.includes(term)) overlap += 1;
    }
    // Combine keyword relevance with recency weight
    const score = overlap * 3 + idx * 0.5;
    return { idx, msg, score };
  });

  const pickedIndices = new Set([lastIdx]);
  scoredEarlier
    .sort((a, b) => b.score - a.score || b.idx - a.idx)
    .slice(0, maxMessages - 1)
    .forEach(item => pickedIndices.add(item.idx));

  return Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .map(i => ({
      role: valid[i].role,
      message: valid[i].message.trim().slice(0, 320)
    }));
}

/**
 * 1 & 3. Generate PDF executive summary, key takeaways, and important topics.
 */
async function generateSummaryAndTopics(extractedText, filename, subject) {
  const cleaned = getRequiredCleanedText(extractedText);
  const maxContextChars = Number(process.env.MAX_AI_SUMMARY_CHARS) || TASK_CONTEXT_CHARS.summary;
  const initialContext = extractRepresentativeExcerpts(cleaned, maxContextChars);

  const systemPrompt = "Academic tutor. Reply ONLY with valid JSON.";
  const buildUserPrompt = ctx =>
    `Doc: "${filename}" (${subject})\nSchema: {"executiveSummary":"4-6 sentence summary","keyTakeaways":["4-6 bullets"],"importantTopics":["5-8 topics"]}\nExcerpts:\n${ctx}`;

  const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
    expectJson: true,
    maxTokensOverride: TASK_OUTPUT_TOKENS.summary,
    budgetSpec: {
      initialContext,
      buildUserPrompt,
      shortenContext: chars => extractRepresentativeExcerpts(cleaned, chars)
    }
  });

  const parsed = parseJsonResponse(result.text);

  if (!parsed.executiveSummary || !Array.isArray(parsed.keyTakeaways)) {
    throw new AppError("AI summary output did not match the expected JSON schema.", 502);
  }

  return {
    executiveSummary: String(parsed.executiveSummary),
    keyTakeaways: parsed.keyTakeaways.map(String),
    importantTopics: Array.isArray(parsed.importantTopics) ? parsed.importantTopics.map(String) : []
  };
}

/**
 * 2, 4, 5 & 6. Generate structured short notes plus 2-mark, 5-mark, and 10-mark questions.
 */
async function generateNotesAndQuestions(extractedText, filename, subject) {
  const cleaned = getRequiredCleanedText(extractedText);
  const maxContextChars = Number(process.env.MAX_AI_QUESTION_CHARS) || TASK_CONTEXT_CHARS.notesAndQuestions;
  const initialContext = extractRepresentativeExcerpts(cleaned, maxContextChars);

  const systemPrompt = "University professor. Reply ONLY with valid JSON grounded in the excerpts.";
  const buildUserPrompt = ctx =>
    `Doc: "${filename}" (${subject})\nSchema: {"notes":[{"topic":"title","content":"concise revision notes"}],"questions":[{"marks":2|5|10,"question":"exam question","answer":"model answer"}]}\nCounts: >=4 notes; >=2 2-mark, 2 5-mark, 1 10-mark questions.\nExcerpts:\n${ctx}`;

  const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
    expectJson: true,
    maxTokensOverride: TASK_OUTPUT_TOKENS.notesAndQuestions,
    budgetSpec: {
      initialContext,
      buildUserPrompt,
      shortenContext: chars => extractRepresentativeExcerpts(cleaned, chars)
    }
  });

  const parsed = parseJsonResponse(result.text);

  if (!Array.isArray(parsed.notes) || !Array.isArray(parsed.questions)) {
    throw new AppError("AI notes and questions output did not match the expected JSON schema.", 502);
  }

  return {
    notes: parsed.notes.map((n, idx) => ({
      topic: String(n.topic || `Topic ${idx + 1}`),
      content: String(n.content || "")
    })),
    questions: parsed.questions.map(q => ({
      marks: [2, 5, 10].includes(Number(q.marks)) ? Number(q.marks) : 5,
      question: String(q.question || ""),
      answer: String(q.answer || "")
    }))
  };
}

/**
 * 7 & 8. Generate MCQs with 4 options, correctIndex (0-3), and explanation.
 */
async function generateMcqs(extractedText, filename, subject, count = 6) {
  const cleaned = getRequiredCleanedText(extractedText);
  const safeCount = Math.min(Math.max(Number(count) || 6, 3), 12);
  const maxContextChars = Number(process.env.MAX_AI_MCQ_CHARS) || TASK_CONTEXT_CHARS.mcqs;
  const initialContext = extractRepresentativeExcerpts(cleaned, maxContextChars);

  const systemPrompt = "Exam author. Reply ONLY with valid JSON grounded in the excerpts.";
  const buildUserPrompt = ctx =>
    `Doc: "${filename}" (${subject})\nGenerate ${safeCount} MCQs.\nSchema: {"mcqs":[{"question":"stem","options":["A","B","C","D"],"correctIndex":0,"explanation":"brief reason"}]}\nExcerpts:\n${ctx}`;

  const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
    expectJson: true,
    maxTokensOverride: TASK_OUTPUT_TOKENS.mcqs,
    budgetSpec: {
      initialContext,
      buildUserPrompt,
      shortenContext: chars => extractRepresentativeExcerpts(cleaned, chars)
    }
  });

  const parsed = parseJsonResponse(result.text);

  if (!Array.isArray(parsed.mcqs) || parsed.mcqs.length === 0) {
    throw new AppError("AI MCQ output did not match the expected JSON schema.", 502);
  }

  return parsed.mcqs.map(m => {
    const options = Array.isArray(m.options) ? m.options.slice(0, 4).map(String) : [];
    while (options.length < 4) options.push("None of the above");
    const idx = Number(m.correctIndex);
    return {
      question: String(m.question || ""),
      options,
      correctIndex: Number.isInteger(idx) && idx >= 0 && idx <= 3 ? idx : 0,
      explanation: String(m.explanation || "")
    };
  });
}

/**
 * 9. Answer a student's question using chunked excerpt retrieval & top-3 relevant history.
 */
async function answerDocumentQuestion(extractedText, filename, subject, chatHistory, userQuestion) {
  const cleaned = getRequiredCleanedText(extractedText);
  const trimmedQuestion = String(userQuestion || "").trim();
  const relevantHistory = selectRelevantChatHistory(chatHistory, trimmedQuestion, 3);
  const historyBlock = relevantHistory
    .map(m => `${m.role === "user" ? "Student" : "Tutor"}: ${m.message}`)
    .join("\n");

  const retrievalQuery = [
    trimmedQuestion,
    relevantHistory.length > 0 ? relevantHistory[relevantHistory.length - 1].message : ""
  ]
    .filter(Boolean)
    .join(" ");

  const maxContextChars = Number(process.env.MAX_AI_CHAT_CHARS) || TASK_CONTEXT_CHARS.chat;
  const initialContext = retrieveRelevantExcerpts(cleaned, retrievalQuery, maxContextChars, 4);

  const systemPrompt = `Academic tutor for "${filename}" (${subject}). Answer strictly from the provided excerpts; if missing, say the document does not cover it.`;
  const buildUserPrompt = ctx =>
    `Excerpts:\n${ctx}\n${historyBlock ? `\nRecent chat:\n${historyBlock}\n` : ""}\nQuestion: ${trimmedQuestion}`;

  const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
    expectJson: false,
    maxTokensOverride: TASK_OUTPUT_TOKENS.chat,
    budgetSpec: {
      initialContext,
      buildUserPrompt,
      shortenContext: chars => retrieveRelevantExcerpts(cleaned, retrievalQuery, chars, 3)
    }
  });

  return result.text;
}

function normalizePageRef(val) {
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : null;
}

function normalizeStringArray(arr, maxLen = 8) {
  if (!Array.isArray(arr)) return [];
  return arr.map(v => String(v || "").trim()).filter(Boolean).slice(0, maxLen);
}

function normalizeTopicEntry(item) {
  const imp = String(item?.importance || "").toLowerCase();
  return {
    name: String(item?.name || item?.topic || "Key Topic").trim(),
    explanation: String(item?.explanation || "").trim(),
    keyPoints: normalizeStringArray(item?.keyPoints, 5),
    importance: imp === "medium" ? "Medium" : "High",
    pageRef: normalizePageRef(item?.pageRef)
  };
}

function normalizeDefinitionEntry(item) {
  const exampleRaw = item?.example === null || item?.example === undefined ? "" : String(item.example).trim();
  return {
    term: String(item?.term || "").trim(),
    definition: String(item?.definition || "").trim(),
    simpleExplanation: String(item?.simpleExplanation || "").trim(),
    example: exampleRaw && !/^none$/i.test(exampleRaw) && !/^n\/a$/i.test(exampleRaw) ? exampleRaw : null,
    keywords: normalizeStringArray(item?.keywords, 5),
    pageRef: normalizePageRef(item?.pageRef)
  };
}

/**
 * Generate technical definitions grounded strictly in the uploaded PDF excerpts.
 */
async function generateDefinitionsFromPdf(extractedText, filename, subject) {
  const cleaned = getRequiredCleanedText(extractedText);
  const initialContext = extractRepresentativeExcerpts(cleaned, TASK_CONTEXT_CHARS.examPrep);

  const systemPrompt = "Academic glossary author. Reply ONLY with valid JSON grounded in the excerpts.";
  const buildUserPrompt = ctx =>
    `Doc: "${filename}" (${subject})
Extract 5-7 important exam definitions directly from Excerpts.
Schema: {"definitions":[{"term":"technical term","definition":"clear accurate definition","simpleExplanation":"plain-English intuition","example":"example from doc or null","keywords":["2-4 terms"],"pageRef":null}]}
Rules: Use ONLY facts in Excerpts. Never invent examples or page numbers; set pageRef only if [Page N] appears.
Excerpts:
${ctx}`;

  const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
    expectJson: true,
    maxTokensOverride: TASK_OUTPUT_TOKENS.definitions,
    budgetSpec: {
      initialContext,
      buildUserPrompt,
      shortenContext: chars => extractRepresentativeExcerpts(cleaned, chars)
    }
  });

  const parsed = parseJsonResponse(result.text);
  if (!Array.isArray(parsed.definitions)) {
    throw new AppError("AI definition output did not match the expected JSON schema.", 502);
  }

  return parsed.definitions.map(normalizeDefinitionEntry).filter(d => d.term && d.definition);
}

/**
 * Generate an Exam Preparation Pack from PDF excerpts, reusing existing notes/questions
 * when available to stay inside the 6500-token budget and avoid redundant Groq calls.
 */
async function generateExamPrepPack(extractedText, filename, subject, existing = {}) {
  const cleaned = getRequiredCleanedText(extractedText);
  const initialContext = extractRepresentativeExcerpts(cleaned, TASK_CONTEXT_CHARS.examPrep);

  const existingQuestions = Array.isArray(existing.questions) ? existing.questions : [];
  const existingNotes = Array.isArray(existing.notes) ? existing.notes : [];
  const existingTopics = Array.isArray(existing.importantTopics) ? existing.importantTopics : [];
  const reuseQuestionsAndNotes = existingQuestions.length >= 3 && existingNotes.length >= 2;

  if (reuseQuestionsAndNotes) {
    const qBrief = existingQuestions
      .slice(0, 10)
      .map((q, idx) => `${idx}: [${q.marks}m] ${String(q.question || "").slice(0, 140)}`)
      .join("\n");
    const nBrief = existingNotes
      .slice(0, 8)
      .map((n, idx) => `${idx}: ${String(n.topic || "").slice(0, 80)}`)
      .join("\n");
    const tBrief = existingTopics.slice(0, 8).join(", ");

    const systemPrompt = "Exam study architect. Reply ONLY with valid JSON grounded in the excerpts.";
    const buildUserPrompt = ctx =>
      `Doc: "${filename}" (${subject})
Existing topics: ${tBrief || "derive from excerpts"}
Existing notes (index:heading):
${nBrief}
Existing questions (index:text):
${qBrief}
Return JSON enriching existing items + adding PDF definitions:
{"topics":[{"name":"","explanation":"","keyPoints":["2-4 bullets"],"importance":"High|Medium","pageRef":null}],"definitions":[{"term":"","definition":"","simpleExplanation":"","example":null,"keywords":["2-4"],"pageRef":null}],"notesMeta":[{"index":0,"bullets":["4-6 concise revision bullets"],"terminology":["terms"],"examFacts":["key exam facts"],"pageRef":null}],"questionsMeta":[{"index":0,"topic":"","keywords":["2-4"],"pageRef":null}]}
Rules: Ground strictly in Excerpts; set pageRef only when [Page N] appears; never invent facts.
Excerpts:
${ctx}`;

    const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
      expectJson: true,
      maxTokensOverride: TASK_OUTPUT_TOKENS.examPrepEnrich,
      budgetSpec: {
        initialContext,
        buildUserPrompt,
        shortenContext: chars => extractRepresentativeExcerpts(cleaned, chars)
      }
    });

    const parsed = parseJsonResponse(result.text);
    return {
      mode: "enriched",
      topics: Array.isArray(parsed.topics) ? parsed.topics.map(normalizeTopicEntry).filter(t => t.name) : [],
      definitions: Array.isArray(parsed.definitions)
        ? parsed.definitions.map(normalizeDefinitionEntry).filter(d => d.term && d.definition)
        : [],
      notesMeta: Array.isArray(parsed.notesMeta) ? parsed.notesMeta : [],
      questionsMeta: Array.isArray(parsed.questionsMeta) ? parsed.questionsMeta : []
    };
  }

  const systemPrompt = "University exam prep tutor. Reply ONLY with valid JSON grounded in the excerpts.";
  const buildUserPrompt = ctx =>
    `Doc: "${filename}" (${subject})
Create an exam pack prioritizing emphasized headings, definitions & repeated concepts.
Schema:
{"topics":[{"name":"","explanation":"simple explanation","keyPoints":["2-4 bullets"],"importance":"High|Medium","pageRef":null}],"questions":[{"marks":2|5|10,"question":"","answer":"exam-ready answer","keywords":["2-4"],"topic":"","pageRef":null}],"definitions":[{"term":"","definition":"","simpleExplanation":"","example":null,"keywords":["2-4"],"pageRef":null}],"shortNotes":[{"heading":"","points":["4-6 bullets"],"terminology":["key terms"],"examFacts":["exam facts"],"pageRef":null}]}
REQUIRED counts: 3-5 topics; 1 shortNote for EACH topic (minimum 3 shortNotes, each with 4-6 concise points, terminology, examFacts); >=2 2-mark, 2 5-mark, 1 10-mark questions; 4-6 definitions.
Rules: Use ONLY Excerpts. Never guess pageRef (use integer only if [Page N] exists) or invent examples.
Excerpts:
${ctx}`;

  const result = await callGroqChat(systemPrompt, buildUserPrompt(initialContext), {
    expectJson: true,
    maxTokensOverride: TASK_OUTPUT_TOKENS.examPrepFull,
    budgetSpec: {
      initialContext,
      buildUserPrompt,
      shortenContext: chars => extractRepresentativeExcerpts(cleaned, chars)
    }
  });

  const parsed = parseJsonResponse(result.text);
  if (!Array.isArray(parsed.topics) || !Array.isArray(parsed.questions) || !Array.isArray(parsed.definitions)) {
    throw new AppError("AI exam preparation output did not match the expected JSON schema.", 502);
  }

  const topics = parsed.topics.map(normalizeTopicEntry).filter(t => t.name);
  const definitions = parsed.definitions.map(normalizeDefinitionEntry).filter(d => d.term && d.definition);
  const questions = parsed.questions.map(q => ({
    marks: [2, 5, 10].includes(Number(q.marks)) ? Number(q.marks) : 5,
    question: String(q.question || "").trim(),
    answer: String(q.answer || "").trim(),
    keywords: normalizeStringArray(q.keywords, 5),
    topic: String(q.topic || topics[0]?.name || "Core Concept").trim(),
    pageRef: normalizePageRef(q.pageRef)
  })).filter(q => q.question && q.answer);

  const shortNotes = (Array.isArray(parsed.shortNotes) ? parsed.shortNotes : []).map((n, idx) => ({
    heading: String(n.heading || n.topic || topics[idx]?.name || `Topic ${idx + 1}`).trim(),
    points: normalizeStringArray(n.points, 6),
    terminology: normalizeStringArray(n.terminology, 6),
    examFacts: normalizeStringArray(n.examFacts, 4),
    pageRef: normalizePageRef(n.pageRef)
  })).filter(n => n.heading);

  return {
    mode: "full",
    topics,
    questions,
    definitions,
    shortNotes
  };
}

/**
 * Live small Groq completion check used by the /api/ai/test endpoint.
 */
async function runHealthCompletionTest() {
  const systemPrompt = "Concise health-check responder.";
  const userPrompt = "Reply with exactly: AI StudyLab Groq Connected";
  const result = await callGroqChat(systemPrompt, userPrompt, {
    expectJson: false,
    maxTokensOverride: TASK_OUTPUT_TOKENS.health
  });

  return {
    provider: "groq",
    model: result.model,
    reply: result.text,
    usage: result.usage,
    tokenBudget: result.tokenBudget
  };
}

module.exports = {
  SAFE_TOTAL_TOKEN_BUDGET,
  getAiHealth,
  fitPromptToTokenBudget,
  selectRelevantChatHistory,
  generateSummaryAndTopics,
  generateNotesAndQuestions,
  generateMcqs,
  answerDocumentQuestion,
  generateDefinitionsFromPdf,
  generateExamPrepPack,
  runHealthCompletionTest
};
