const fs = require("fs");
const pdfParse = require("pdf-parse");
const { hasValidPdfSignature } = require("../utils/validators");

/**
 * Extract real text and page count from an uploaded PDF file.
 * Handles invalid signatures, corrupted PDFs, empty PDFs, and scanned/image-only PDFs.
 */
async function extractPdfText(filePath) {
  const stats = await fs.promises.stat(filePath);
  if (stats.size === 0) {
    return {
      status: "failed",
      text: "",
      pageCount: 0,
      error: "The uploaded PDF file is empty (0 bytes)."
    };
  }

  const isPdfHeader = await hasValidPdfSignature(filePath);
  if (!isPdfHeader) {
    return {
      status: "failed",
      text: "",
      pageCount: 0,
      error: "Invalid file signature. The uploaded file is not a valid PDF document."
    };
  }

  try {
    const dataBuffer = await fs.promises.readFile(filePath);
    let pageCounter = 0;

    const parsed = await pdfParse(new Uint8Array(dataBuffer), {
      pagerender(pageData) {
        pageCounter += 1;
        const pageNum = pageData.pageNumber || (typeof pageData.pageIndex === "number" ? pageData.pageIndex + 1 : pageCounter);
        return pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then(textContent => {
          let lastY;
          let text = "";
          for (const item of textContent.items) {
            if (lastY === item.transform[5] || lastY === undefined) {
              text += item.str;
            } else {
              text += "\n" + item.str;
            }
            lastY = item.transform[5];
          }
          const trimmed = text.trim();
          return trimmed ? `[Page ${pageNum}]\n${trimmed}` : "";
        });
      }
    });

    const pageCount = parsed.numpages || 0;
    const rawText = (parsed.text || "").trim();

    if (pageCount === 0) {
      return {
        status: "failed",
        text: "",
        pageCount: 0,
        error: "The PDF contains zero readable pages."
      };
    }

    // Detect scanned/image-only PDFs excluding synthetic [Page N] markers
    const textWithoutMarkers = rawText.replace(/\[Page\s+\d+\]/gi, "");
    const meaningfulChars = textWithoutMarkers.replace(/\s+/g, "").length;
    if (meaningfulChars < 30) {
      return {
        status: "ocr_required",
        text: textWithoutMarkers.trim(),
        pageCount,
        error:
          "No selectable text could be extracted from this PDF. It appears to be a scanned or image-only PDF, which requires Optical Character Recognition (OCR) before AI text analysis."
      };
    }

    return {
      status: "ready",
      text: rawText,
      pageCount,
      error: null
    };
  } catch (err) {
    return {
      status: "failed",
      text: "",
      pageCount: 0,
      error: `Failed to parse PDF (the file may be corrupted or encrypted): ${err.message}`
    };
  }
}

module.exports = {
  extractPdfText
};
