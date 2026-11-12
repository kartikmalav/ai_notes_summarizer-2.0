const fs = require("fs");

/**
 * Validate standard email format.
 */
function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 190;
}

/**
 * Validate password minimum security requirements (at least 6 characters).
 */
function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6 && password.length <= 128;
}

/**
 * Parse and validate positive integer route parameters.
 */
function parsePositiveInt(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) return null;
  return num;
}

/**
 * Verify PDF file magic header (%PDF-) to avoid trusting file extensions alone.
 */
async function hasValidPdfSignature(filePath) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(5);
    const { bytesRead } = await handle.read(buffer, 0, 5, 0);
    if (bytesRead < 5) return false;
    return buffer.toString("ascii") === "%PDF-";
  } finally {
    await handle.close();
  }
}

/**
 * Safely parse JSON string or return already-parsed value.
 */
function safeJsonParse(value, fallback = []) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Clean extracted PDF text by collapsing excessive spacing and blank lines.
 */
function cleanDocumentText(text) {
  if (!text || typeof text !== "string") return "";
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Conservative token estimator (~3.5 chars/token) for pre-flight budget guards.
 */
function estimateTokenCount(text) {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(text.length / 3.5);
}

/**
 * Clean extracted PDF text and bound it to the configured character limit.
 */
function truncateTextForAI(text, maxChars = 12000) {
  const cleaned = cleanDocumentText(text);
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).trimEnd() + "\n[Truncated]";
}

/**
 * Split cleaned document text into overlapping semantic chunks near chunkSize chars.
 */
function chunkDocumentText(text, chunkSize = 1000, overlap = 120) {
  const cleaned = cleanDocumentText(text);
  if (!cleaned) return [];
  if (cleaned.length <= chunkSize) {
    return [{ index: 0, text: cleaned }];
  }

  const chunks = [];
  let start = 0;
  let idx = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + chunkSize, cleaned.length);
    if (end < cleaned.length) {
      const paraBreak = cleaned.lastIndexOf("\n\n", end);
      const sentenceBreak = cleaned.lastIndexOf(". ", end);
      if (paraBreak > start + chunkSize * 0.5) {
        end = paraBreak;
      } else if (sentenceBreak > start + chunkSize * 0.5) {
        end = sentenceBreak + 1;
      }
    }

    const slice = cleaned.slice(start, end).trim();
    if (slice) {
      chunks.push({ index: idx++, text: slice });
    }
    if (end >= cleaned.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

/**
 * Sample representative excerpts across start, middle, and end of long documents
 * instead of sending only the beginning or the entire PDF.
 */
function extractRepresentativeExcerpts(text, maxChars = 9000) {
  const cleaned = cleanDocumentText(text);
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;

  const chunks = chunkDocumentText(cleaned, 1100, 0);
  if (chunks.length <= 3) {
    return truncateTextForAI(cleaned, maxChars);
  }

  const maxSlots = Math.max(3, Math.floor(maxChars / 1120));
  const pickedIndices = new Set([0, chunks.length - 1]);

  if (chunks.length > 2) {
    pickedIndices.add(Math.floor(chunks.length / 2));
  }

  const step = Math.max(1, (chunks.length - 1) / Math.max(1, maxSlots - 1));
  for (let i = 1; pickedIndices.size < Math.min(maxSlots, chunks.length) && i < chunks.length - 1; i++) {
    const pos = Math.min(chunks.length - 1, Math.round(i * step));
    pickedIndices.add(pos);
  }

  const ordered = Array.from(pickedIndices)
    .sort((a, b) => a - b)
    .map(i => chunks[i].text);

  let combined = "";
  for (const part of ordered) {
    const separator = combined ? "\n...\n" : "";
    if (combined.length + separator.length + part.length > maxChars) {
      const remaining = maxChars - combined.length - separator.length;
      if (remaining > 180) {
        combined += separator + part.slice(0, remaining).trimEnd() + "...";
      }
      break;
    }
    combined += separator + part;
  }

  return combined || truncateTextForAI(cleaned, maxChars);
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "what", "when", "where", "which", "who", "whom", "whose", "why", "how",
  "can", "could", "should", "would", "into", "about", "there", "their",
  "have", "has", "had", "does", "did", "not", "but", "you", "your", "please",
  "explain", "tell", "describe", "document", "notes", "file", "pdf"
]);

function extractKeywords(queryText) {
  if (!queryText || typeof queryText !== "string") return [];
  const rawTokens = queryText.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  return Array.from(new Set(rawTokens.filter(tok => !STOPWORDS.has(tok))));
}

/**
 * Retrieve the most relevant document chunks for a student chat question within maxChars.
 */
function retrieveRelevantExcerpts(text, query, maxChars = 7500, maxChunks = 4) {
  const cleaned = cleanDocumentText(text);
  if (!cleaned) return "";
  if (cleaned.length <= maxChars) return cleaned;

  const chunks = chunkDocumentText(cleaned, 1000, 120);
  const keywords = extractKeywords(query);

  if (keywords.length === 0) {
    return extractRepresentativeExcerpts(cleaned, maxChars);
  }

  const scored = chunks.map(chunk => {
    const lower = chunk.text.toLowerCase();
    let distinctHits = 0;
    let totalHits = 0;

    for (const kw of keywords) {
      const matches = lower.split(kw).length - 1;
      if (matches > 0) {
        distinctHits += 1;
        totalHits += Math.min(matches, 5);
      }
    }

    const score = distinctHits * 4 + totalHits;
    return { ...chunk, score };
  });

  const nonZero = scored.filter(c => c.score > 0);
  if (nonZero.length === 0) {
    return extractRepresentativeExcerpts(cleaned, maxChars);
  }

  const topChunks = nonZero
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, maxChunks)
    .sort((a, b) => a.index - b.index);

  let combined = "";
  for (const chunk of topChunks) {
    const prefix = combined ? "\n...\n" : "";
    if (combined.length + prefix.length + chunk.text.length > maxChars) {
      const remaining = maxChars - combined.length - prefix.length;
      if (remaining > 180) {
        combined += prefix + chunk.text.slice(0, remaining).trimEnd() + "...";
      }
      break;
    }
    combined += prefix + chunk.text;
  }

  return combined || extractRepresentativeExcerpts(cleaned, maxChars);
}

module.exports = {
  isValidEmail,
  isValidPassword,
  parsePositiveInt,
  hasValidPdfSignature,
  safeJsonParse,
  cleanDocumentText,
  estimateTokenCount,
  truncateTextForAI,
  chunkDocumentText,
  extractRepresentativeExcerpts,
  retrieveRelevantExcerpts
};

