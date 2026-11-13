/**
 * AI StudyLab - PDF Results & Document Study View Controller (Backend-Integrated)
 */

let activeDocumentId = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!StudyLabAPI.requireAuth()) return;

  const docSelect = document.getElementById("results-doc-select");
  const initialTab = StudyLabUI.getQueryParam("tab") || "summary";
  activateTab(initialTab);

  // Tab switch listeners
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn.getAttribute("data-tab"));
    });
  });

  try {
    const docsRes = await StudyLabAPI.getDocuments();
    const docs = docsRes.documents || [];

    if (!docs.length) {
      document.getElementById("res-doc-title").textContent = "No PDFs Uploaded Yet";
      document.getElementById("res-doc-meta").textContent = "Upload a PDF document to view AI summaries, notes, and exam questions.";
      document.getElementById("res-summary-text").innerHTML = `
        <a href="upload.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Your First PDF</a>
      `;
      if (docSelect) docSelect.innerHTML = `<option value="">No documents</option>`;
      document.getElementById("res-mcq-link")?.setAttribute("href", "mcq-practice.html");
      document.getElementById("res-chat-link")?.setAttribute("href", "chat.html");
      document.getElementById("side-exam-link")?.setAttribute("href", "exam-prep.html");
      document.getElementById("side-mcq-link")?.setAttribute("href", "mcq-practice.html");
      document.getElementById("side-chat-link")?.setAttribute("href", "chat.html");
      return;
    }

    const requestedDoc = StudyLabUI.getQueryParam("doc");
    const exists = docs.some(d => String(d.id) === String(requestedDoc));
    activeDocumentId = exists ? String(requestedDoc) : String(docs[0].id);

    if (docSelect) {
      docSelect.innerHTML = docs.map(d => `<option value="${d.id}">${d.filename}</option>`).join("");
      docSelect.value = activeDocumentId;
      docSelect.addEventListener("change", () => {
        activeDocumentId = docSelect.value;
        loadAndRenderDocument(activeDocumentId);
      });
    }

    await loadAndRenderDocument(activeDocumentId);
  } catch (err) {
    StudyLabUI.showToast(err.message, "danger");
  }

  // Generate / Regenerate Summary
  document.getElementById("gen-summary-btn")?.addEventListener("click", async (e) => {
    if (!activeDocumentId) return;
    const btn = e.currentTarget;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    try {
      await StudyLabAPI.generateSummary(activeDocumentId);
      StudyLabUI.showToast("Executive summary generated!", "success");
      await loadAndRenderDocument(activeDocumentId);
    } catch (err) {
      StudyLabUI.showToast(err.message, "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  });

  // Generate / Regenerate Notes & Questions
  const handleGenNotesAndQuestions = async (btn) => {
    if (!activeDocumentId) return;
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    try {
      await StudyLabAPI.generateNotesAndQuestions(activeDocumentId);
      StudyLabUI.showToast("Short notes and exam questions generated!", "success");
      await loadAndRenderDocument(activeDocumentId);
    } catch (err) {
      StudyLabUI.showToast(err.message, "danger");
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  };

  document.getElementById("gen-notes-btn")?.addEventListener("click", (e) => handleGenNotesAndQuestions(e.currentTarget));
  document.getElementById("gen-questions-btn")?.addEventListener("click", (e) => handleGenNotesAndQuestions(e.currentTarget));

  // Copy Summary
  document.getElementById("copy-summary-btn")?.addEventListener("click", () => {
    const txt = document.getElementById("res-summary-text")?.textContent || "";
    navigator.clipboard?.writeText(txt);
    StudyLabUI.showToast("Executive summary copied to clipboard", "success");
  });

  // Copy Notes
  document.getElementById("copy-notes-btn")?.addEventListener("click", () => {
    const cards = [...document.querySelectorAll("#res-notes-container .note-section-card")];
    const txt = cards.map(c => c.innerText).join("\n\n");
    navigator.clipboard?.writeText(txt);
    StudyLabUI.showToast("Short notes copied to clipboard", "success");
  });

  // Toggle All Answers
  const toggleAllBtn = document.getElementById("toggle-all-answers-btn");
  let allRevealed = false;
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener("click", () => {
      allRevealed = !allRevealed;
      document.querySelectorAll(".question-card").forEach(card => {
        card.classList.toggle("open", allRevealed);
      });
      toggleAllBtn.innerHTML = allRevealed
        ? '<i class="fa-regular fa-eye-slash"></i> Hide All Answers'
        : '<i class="fa-regular fa-eye"></i> Reveal All Answers';
    });
  }
});

function activateTab(tabName) {
  document.querySelectorAll(".tab-btn").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-tab") === tabName);
  });
  document.querySelectorAll(".tab-panel").forEach(p => {
    p.classList.toggle("active", p.id === `panel-${tabName}`);
  });
}

async function loadAndRenderDocument(docId) {
  if (!docId) return;

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("doc", docId);
    window.history.replaceState({}, "", url.toString());

    const res = await StudyLabAPI.getDocument(docId);
    const doc = res.document;

    const fmtBadge = document.getElementById("res-format-badge");
    if (fmtBadge) {
      fmtBadge.className = `badge ${StudyLabUI.getFormatBadgeClass(doc.format)}`;
      fmtBadge.textContent = doc.format;
    }

    document.getElementById("res-subject-badge").textContent = doc.subject;
    document.getElementById("res-doc-title").textContent = doc.filename;
    document.getElementById("res-doc-meta").textContent = `${doc.size} • ${doc.pages} Pages • Uploaded ${doc.uploadDate}`;

    document.getElementById("res-mcq-link").href = `mcq-practice.html?doc=${doc.id}`;
    document.getElementById("res-chat-link").href = `chat.html?doc=${doc.id}`;
    document.getElementById("side-exam-link").href = `exam-prep.html?doc=${doc.id}`;
    document.getElementById("side-mcq-link").href = `mcq-practice.html?doc=${doc.id}`;
    document.getElementById("side-chat-link").href = `chat.html?doc=${doc.id}`;

    const notes = doc.notes || [];
    const questions = doc.questions || [];

    document.getElementById("insight-notes-count").textContent = notes.length;
    document.getElementById("insight-q-count").textContent = questions.length;
    document.getElementById("insight-mcq-count").textContent = doc.mcqsCount || 0;

    // Summary Panel
    const summaryTextEl = document.getElementById("res-summary-text");
    const takeawaysList = document.getElementById("res-takeaways-list");

    if (doc.extractionStatus !== "ready") {
      summaryTextEl.innerHTML = `
        <div style="padding: 14px; border-radius: var(--radius-md); background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--text-main);">
          <strong><i class="fa-solid fa-triangle-exclamation"></i> OCR Required:</strong> ${doc.extractionError}
        </div>
      `;
      takeawaysList.innerHTML = "";
    } else if (doc.summary) {
      summaryTextEl.textContent = doc.summary.executiveSummary;
      const takeaways = doc.summary.keyTakeaways || [];
      const topics = doc.summary.importantTopics || [];
      takeawaysList.innerHTML = takeaways
        .map(item => `
          <li style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-md); font-size: 0.88rem; color: var(--text-main);">
            <i class="fa-solid fa-circle-check" style="color: var(--success); margin-top: 3px;"></i>
            <span>${item}</span>
          </li>
        `)
        .join("") +
        (topics.length ? `
          <li style="margin-top: 8px;">
            <div style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase;">Important Topics</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${topics.map(t => `<span class="badge badge-purple">${t}</span>`).join("")}
            </div>
          </li>
        ` : "");
    } else {
      summaryTextEl.innerHTML = `<span style="color: var(--text-muted);">No AI summary generated yet. Click <strong>Generate Summary</strong> above to analyze the extracted PDF text.</span>`;
      takeawaysList.innerHTML = "";
    }

    // Notes Panel
    const notesContainer = document.getElementById("res-notes-container");
    if (notes.length) {
      notesContainer.innerHTML = notes
        .map(n => `
          <div class="note-section-card">
            <h3>${n.topic}</h3>
            <p>${n.content}</p>
          </div>
        `)
        .join("");
    } else {
      notesContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 28px; color: var(--text-secondary);">
          No short notes generated yet. Click <strong>Generate Notes &amp; Q&amp;A</strong> above.
        </div>
      `;
    }

    // Questions Panel (2-mark, 5-mark, 10-mark)
    const qContainer = document.getElementById("res-questions-container");
    if (questions.length) {
      qContainer.innerHTML = questions
        .map((item, idx) => `
          <div class="question-card ${idx === 0 ? "open" : ""}">
            <div class="question-header" onclick="this.parentElement.classList.toggle('open')">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="badge badge-purple">Q${idx + 1}</span>
                <strong style="font-size: 0.92rem; color: var(--text-main);">${item.question}</strong>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <span class="badge badge-subject">${item.marks || 5} Marks</span>
                <i class="fa-solid fa-chevron-down" style="color: var(--text-muted); font-size: 0.8rem;"></i>
              </div>
            </div>
            <div class="question-answer">
              <strong style="color: var(--success); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 4px;">Model Answer</strong>
              ${item.answer}
            </div>
          </div>
        `)
        .join("");
    } else {
      qContainer.innerHTML = `
        <div class="card" style="text-align: center; padding: 28px; color: var(--text-secondary);">
          No exam questions generated yet. Click <strong>Generate Questions</strong> above to create 2-mark, 5-mark, and 10-mark questions.
        </div>
      `;
    }
  } catch (err) {
    StudyLabUI.showToast(err.message, "danger");
  }
}
