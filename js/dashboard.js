/**
 * AI StudyLab - Dashboard Controller (Backend-Integrated)
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (!StudyLabAPI.requireAuth()) return;

  const recentGrid = document.getElementById("recent-docs-grid");
  const docSelect = document.getElementById("assistant-doc-select");

  if (recentGrid) {
    recentGrid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 32px; color: var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin" style="color: var(--primary-light); font-size: 1.4rem; margin-bottom: 8px;"></i>
        <p>Loading your study workspace...</p>
      </div>
    `;
  }

  try {
    const [meRes, docsRes] = await Promise.all([
      StudyLabAPI.getMe(),
      StudyLabAPI.getDocuments()
    ]);

    const user = meRes.user || StudyLabAPI.getCachedUser() || { name: "Student" };
    const stats = meRes.stats || {
      totalDocuments: 0,
      notesGenerated: 0,
      questionsCreated: 0,
      mcqsGenerated: 0
    };
    const docs = docsRes.documents || [];

    const usernameEl = document.getElementById("dash-username");
    if (usernameEl) {
      usernameEl.textContent = user.name.split(" ")[0];
    }

    document.getElementById("stat-total-docs").textContent = stats.totalDocuments;
    document.getElementById("stat-notes-count").textContent = stats.notesGenerated;
    document.getElementById("stat-questions-count").textContent = stats.questionsCreated;
    document.getElementById("stat-mcqs-count").textContent = stats.mcqsGenerated;

    if (docSelect) {
      if (docs.length) {
        docSelect.innerHTML = docs
          .map(d => `<option value="${d.id}">${d.filename}</option>`)
          .join("");
      } else {
        docSelect.innerHTML = `<option value="">No documents uploaded</option>`;
      }
    }

    renderRecentDocuments(docs.slice(0, 6));
  } catch (err) {
    StudyLabUI.showToast(err.message, "danger");
    if (recentGrid) {
      recentGrid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 32px;">
          <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger); font-size: 1.6rem; margin-bottom: 8px;"></i>
          <p style="color: var(--text-secondary);">${err.message}</p>
        </div>
      `;
    }
  }

  const assistantForm = document.getElementById("dash-assistant-form");
  const assistantInput = document.getElementById("assistant-prompt-input");
  if (assistantForm && assistantInput) {
    assistantForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const prompt = assistantInput.value.trim();
      const docId = docSelect ? docSelect.value : "";
      if (!docId) {
        StudyLabUI.showToast("Please upload a PDF document first.", "info");
        return;
      }
      if (!prompt) return;
      window.location.href = `chat.html?doc=${encodeURIComponent(docId)}&q=${encodeURIComponent(prompt)}`;
    });
  }

  document.querySelectorAll(".suggestion-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const prompt = pill.getAttribute("data-prompt");
      const docId = docSelect ? docSelect.value : "";
      if (!docId) {
        StudyLabUI.showToast("Please upload a PDF document first.", "info");
        return;
      }
      if (prompt) {
        window.location.href = `chat.html?doc=${encodeURIComponent(docId)}&q=${encodeURIComponent(prompt)}`;
      }
    });
  });
});

function renderRecentDocuments(docs) {
  const grid = document.getElementById("recent-docs-grid");
  if (!grid) return;

  if (!docs.length) {
    grid.innerHTML = `
      <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 38px;">
        <i class="fa-regular fa-folder-open" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 10px;"></i>
        <h3 style="font-size: 1.05rem; margin-bottom: 6px;">No PDFs uploaded yet</h3>
        <p style="color: var(--text-secondary); font-size: 0.88rem;">Upload your first lecture PDF to generate AI summaries, notes, MCQs, and chat.</p>
        <a href="upload.html" class="btn btn-primary btn-sm" style="margin-top: 14px;">
          <i class="fa-solid fa-cloud-arrow-up"></i> Upload First PDF
        </a>
      </div>
    `;
    return;
  }

  grid.innerHTML = docs
    .map(doc => {
      const fmtLower = (doc.format || "pdf").toLowerCase();
      const iconClass = StudyLabUI.getFormatIcon(doc.format);
      const isReady = doc.extractionStatus === "ready";
      const statusBadge = isReady
        ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check" style="font-size: 0.65rem;"></i> Ready</span>`
        : `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation" style="font-size: 0.65rem;"></i> OCR Needed</span>`;

      return `
        <article class="recent-doc-card">
          <div class="doc-card-head">
            <div style="display: flex; align-items: center; gap: 11px; min-width: 0; flex: 1;">
              <div class="doc-icon-box ${fmtLower}">
                <i class="fa-solid ${iconClass}"></i>
              </div>
              <div class="doc-card-info">
                <a href="results.html?doc=${doc.id}" class="doc-card-filename" title="${doc.filename}">
                  ${doc.filename}
                </a>
                <div class="doc-card-meta">
                  <span>${doc.subject}</span>
                  <span>•</span>
                  <span>${doc.pages} pgs</span>
                </div>
              </div>
            </div>
            ${statusBadge}
          </div>

          <div class="doc-card-actions">
            <a href="results.html?doc=${doc.id}&tab=summary" class="doc-action-pill" title="View AI Summary">
              <i class="fa-solid fa-align-left"></i>
              <span>Summary</span>
            </a>
            <a href="results.html?doc=${doc.id}&tab=notes" class="doc-action-pill" title="View Short Notes">
              <i class="fa-solid fa-note-sticky"></i>
              <span>Notes</span>
            </a>
            <a href="results.html?doc=${doc.id}&tab=questions" class="doc-action-pill" title="Important Questions">
              <i class="fa-solid fa-circle-question"></i>
              <span>Questions</span>
            </a>
            <a href="chat.html?doc=${doc.id}" class="doc-action-pill" title="Ask AI about this document">
              <i class="fa-solid fa-comments"></i>
              <span>Chat</span>
            </a>
          </div>
        </article>
      `;
    })
    .join("");
}
