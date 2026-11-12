/**
 * AI StudyLab - My Document Library Controller (Backend-Integrated)
 */

let allUserDocuments = [];

document.addEventListener("DOMContentLoaded", async () => {
  if (!StudyLabAPI.requireAuth()) return;

  const searchInput = document.getElementById("doc-search-input");
  const subjectSelect = document.getElementById("subject-filter");
  const formatSelect = document.getElementById("format-filter");
  const clearFiltersBtn = document.getElementById("clear-filters-btn");

  const urlQuery = StudyLabUI.getQueryParam("q");
  if (urlQuery && searchInput) {
    searchInput.value = urlQuery;
  }

  await loadDocumentsFromBackend();

  if (searchInput) searchInput.addEventListener("input", renderDocumentsTable);
  if (subjectSelect) subjectSelect.addEventListener("change", renderDocumentsTable);
  if (formatSelect) formatSelect.addEventListener("change", renderDocumentsTable);

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (subjectSelect) subjectSelect.value = "ALL";
      if (formatSelect) formatSelect.value = "ALL";
      renderDocumentsTable();
    });
  }
});

async function loadDocumentsFromBackend() {
  const tbody = document.getElementById("documents-table-body");
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 36px; color: var(--text-secondary);">
          <i class="fa-solid fa-spinner fa-spin" style="color: var(--primary-light); font-size: 1.3rem;"></i>
          <div style="margin-top: 8px;">Loading your document library...</div>
        </td>
      </tr>
    `;
  }

  try {
    const res = await StudyLabAPI.getDocuments();
    allUserDocuments = res.documents || [];
    populateSubjectFilter();
    renderDocumentsTable();
  } catch (err) {
    StudyLabUI.showToast(err.message, "danger");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 36px; color: var(--danger);">
            ${err.message}
          </td>
        </tr>
      `;
    }
  }
}

function populateSubjectFilter() {
  const subjectSelect = document.getElementById("subject-filter");
  if (!subjectSelect) return;

  const currentVal = subjectSelect.value;
  const subjects = [...new Set(allUserDocuments.map(d => d.subject))].sort();

  subjectSelect.innerHTML = `<option value="ALL">All Subjects</option>` +
    subjects.map(subj => `<option value="${subj}">${subj}</option>`).join("");

  if (subjects.includes(currentVal)) {
    subjectSelect.value = currentVal;
  }
}

function renderDocumentsTable() {
  const docs = allUserDocuments;
  const tbody = document.getElementById("documents-table-body");
  const countBadge = document.getElementById("doc-count-badge");
  const showingLabel = document.getElementById("showing-count-label");
  const clearBtn = document.getElementById("clear-filters-btn");

  const searchVal = (document.getElementById("doc-search-input")?.value || "").trim().toLowerCase();
  const subjectVal = document.getElementById("subject-filter")?.value || "ALL";
  const formatVal = document.getElementById("format-filter")?.value || "ALL";

  if (countBadge) {
    countBadge.textContent = `${docs.length} Document${docs.length === 1 ? "" : "s"}`;
  }

  const filtered = docs.filter(doc => {
    const matchesSearch =
      !searchVal ||
      doc.filename.toLowerCase().includes(searchVal) ||
      doc.subject.toLowerCase().includes(searchVal);
    const matchesSubject = subjectVal === "ALL" || doc.subject === subjectVal;
    const matchesFormat = formatVal === "ALL" || (doc.format || "").toUpperCase() === formatVal;
    return matchesSearch && matchesSubject && matchesFormat;
  });

  if (showingLabel) {
    showingLabel.textContent = `Showing ${filtered.length} of ${docs.length}`;
  }

  if (clearBtn) {
    const hasFilter = searchVal !== "" || subjectVal !== "ALL" || formatVal !== "ALL";
    clearBtn.style.display = hasFilter ? "inline-flex" : "none";
  }

  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-table-state">
            <i class="fa-regular fa-folder-open"></i>
            <h3 style="font-size: 1.05rem; margin-bottom: 6px;">${docs.length ? "No matching documents found" : "Your library is empty"}</h3>
            <p style="color: var(--text-secondary); font-size: 0.86rem; margin-bottom: 14px;">
              ${docs.length ? "Try clearing your search filters or upload a new study PDF." : "Upload your first PDF lecture file to generate notes, questions, and MCQs."}
            </p>
            <a href="upload.html" class="btn btn-primary btn-sm">
              <i class="fa-solid fa-cloud-arrow-up"></i> Upload PDF
            </a>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map(doc => {
      const fmtBadgeClass = StudyLabUI.getFormatBadgeClass(doc.format);
      const fmtIcon = StudyLabUI.getFormatIcon(doc.format);
      const notesCount = (doc.stats && doc.stats.notes) || 0;
      const mcqsCount = (doc.stats && doc.stats.mcqs) || 0;
      const isReady = doc.extractionStatus === "ready";

      const statusHtml = isReady
        ? `<span class="badge badge-success"><i class="fa-solid fa-circle-check" style="font-size: 0.65rem;"></i> Ready • Extracted</span>`
        : `<span class="badge badge-danger" title="${doc.extractionError || "Scanned PDF requires OCR"}"><i class="fa-solid fa-triangle-exclamation" style="font-size: 0.65rem;"></i> OCR Required</span>`;

      return `
        <tr>
          <td>
            <span class="badge ${fmtBadgeClass}">
              <i class="fa-solid ${fmtIcon}"></i>
              ${doc.format}
            </span>
          </td>
          <td>
            <div class="doc-name-cell">
              <a href="results.html?doc=${doc.id}" class="doc-name-link" title="${doc.filename}">
                ${doc.filename}
              </a>
              <span class="doc-date-sub">Uploaded ${doc.uploadDate || ""}</span>
            </div>
          </td>
          <td>
            <span class="badge badge-subject">${doc.subject}</span>
          </td>
          <td>
            <div class="size-items-cell">
              <span class="size-main">${doc.size} • ${doc.pages} Pages</span>
              <span class="items-sub">${notesCount} Notes • ${mcqsCount} MCQs</span>
            </div>
          </td>
          <td>${statusHtml}</td>
          <td>
            <div class="study-actions-wrap">
              <a href="results.html?doc=${doc.id}&tab=notes" class="action-btn-purple" title="Short Notes">
                <i class="fa-solid fa-note-sticky"></i> Notes
              </a>
              <a href="results.html?doc=${doc.id}&tab=questions" class="action-btn-purple" title="Important Questions">
                <i class="fa-solid fa-circle-question"></i> Questions
              </a>
              <a href="mcq-practice.html?doc=${doc.id}" class="action-btn-purple" title="MCQ Practice">
                <i class="fa-solid fa-list-check"></i> MCQs
              </a>
              <a href="exam-prep.html?doc=${doc.id}" class="action-btn-purple" title="Exam Preparation">
                <i class="fa-solid fa-bullseye"></i> Preparation
              </a>
              <a href="chat.html?doc=${doc.id}" class="action-btn-purple" title="Ask AI">
                <i class="fa-solid fa-comments"></i> Ask AI
              </a>
              <button type="button" class="action-btn-view" onclick="openDocPreviewModal(${doc.id})" title="Quick Preview">
                <i class="fa-regular fa-eye"></i> View
              </button>
              <button type="button" class="action-btn-delete" onclick="confirmDeleteDoc(${doc.id})" title="Delete Document" aria-label="Delete ${doc.filename}">
                <i class="fa-regular fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

window.openDocPreviewModal = async function(docId) {
  StudyLabUI.openModal(
    `<i class="fa-solid fa-file-pdf" style="color: var(--primary-light);"></i> Loading Document...`,
    `<div style="text-align: center; padding: 24px; color: var(--text-secondary);"><i class="fa-solid fa-spinner fa-spin"></i> Fetching document details...</div>`
  );

  try {
    const res = await StudyLabAPI.getDocument(docId);
    const doc = res.document;
    const summaryObj = doc.summary;
    const takeawaysHtml = (summaryObj?.keyTakeaways || [])
      .slice(0, 4)
      .map(t => `<li style="display: flex; gap: 8px; margin-bottom: 6px; font-size: 0.86rem; color: var(--text-secondary);">
        <i class="fa-solid fa-check" style="color: var(--success); margin-top: 4px; font-size: 0.75rem;"></i>
        <span>${t}</span>
      </li>`)
      .join("");

    const bodyHtml = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px; flex-wrap: wrap;">
        <span class="badge ${StudyLabUI.getFormatBadgeClass(doc.format)}">${doc.format}</span>
        <span class="badge badge-subject">${doc.subject}</span>
        <span class="badge ${doc.extractionStatus === "ready" ? "badge-success" : "badge-danger"}">
          ${doc.extractionStatus === "ready" ? "Ready • Text Extracted" : "OCR Required"}
        </span>
        <span style="font-size: 0.8rem; color: var(--text-muted); margin-left: auto;">${doc.size} • ${doc.pages} pgs</span>
      </div>
      ${doc.extractionStatus !== "ready" ? `
        <div style="padding: 12px; border-radius: var(--radius-md); background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--text-main); font-size: 0.86rem; margin-bottom: 14px;">
          ${doc.extractionError}
        </div>
      ` : ""}
      <h4 style="font-size: 0.86rem; color: var(--primary-light); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.04em;">Executive Summary</h4>
      <p style="font-size: 0.88rem; color: var(--text-main); line-height: 1.55; margin-bottom: 16px;">
        ${summaryObj ? summaryObj.executiveSummary : "Summary has not been generated yet. Open the Full Study View to generate an AI summary."}
      </p>
      ${takeawaysHtml ? `
        <h4 style="font-size: 0.86rem; color: var(--primary-light); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.04em;">Key Highlights</h4>
        <ul>${takeawaysHtml}</ul>
      ` : ""}
    `;

    const footerHtml = `
      <a href="chat.html?doc=${doc.id}" class="btn btn-secondary btn-sm"><i class="fa-solid fa-comments"></i> Ask AI</a>
      <a href="results.html?doc=${doc.id}" class="btn btn-primary btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Full Study View</a>
    `;

    StudyLabUI.openModal(
      `<i class="fa-solid ${StudyLabUI.getFormatIcon(doc.format)}" style="color: var(--primary-light);"></i> <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:390px;">${doc.filename}</span>`,
      bodyHtml,
      footerHtml
    );
  } catch (err) {
    StudyLabUI.closeModal();
    StudyLabUI.showToast(err.message, "danger");
  }
};

window.confirmDeleteDoc = function(docId) {
  const doc = allUserDocuments.find(d => d.id === docId);
  if (!doc) return;

  const bodyHtml = `
    <p style="font-size: 0.92rem; color: var(--text-secondary); line-height: 1.5;">
      Are you sure you want to delete <strong style="color: var(--text-main);">${doc.filename}</strong>?
      The uploaded PDF and all AI-generated summaries, notes, questions, MCQs, and chat history will be permanently removed.
    </p>
  `;

  const footerHtml = `
    <button type="button" class="btn btn-secondary btn-sm" onclick="StudyLabUI.closeModal()">Cancel</button>
    <button type="button" class="btn btn-danger-soft btn-sm" id="confirm-delete-btn">
      <i class="fa-regular fa-trash-can"></i> Delete Document
    </button>
  `;

  StudyLabUI.openModal(
    `<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i> Delete Document`,
    bodyHtml,
    footerHtml
  );

  document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
    const btn = document.getElementById("confirm-delete-btn");
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';

    try {
      await StudyLabAPI.deleteDocument(docId);
      StudyLabUI.closeModal();
      allUserDocuments = allUserDocuments.filter(d => d.id !== docId);
      populateSubjectFilter();
      renderDocumentsTable();
      StudyLabUI.showToast(`Deleted "${doc.filename}"`, "success");
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-regular fa-trash-can"></i> Delete Document';
      StudyLabUI.showToast(err.message, "danger");
    }
  });
};
