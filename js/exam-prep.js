/**
 * AI StudyLab - Exam Preparation Dashboard Controller (Backend-Integrated)
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (!StudyLabAPI.requireAuth()) return;

  const docSelect = document.getElementById("exam-doc-select");
  const generateBtn = document.getElementById("exam-generate-btn");
  const genDefsBtn = document.getElementById("exam-gen-defs-btn");
  const mcqBtn = document.getElementById("exam-mcq-btn");
  const resultsLink = document.getElementById("exam-results-link");

  const searchInput = document.getElementById("exam-search-input");
  const topicFilterSelect = document.getElementById("exam-topic-filter");
  const marksFilterGroup = document.getElementById("exam-marks-filter");
  const toggleAllAnswersBtn = document.getElementById("exam-toggle-answers-btn");
  const filterBar = document.getElementById("exam-filter-bar");

  const loadingState = document.getElementById("exam-loading-state");
  const loadingText = document.getElementById("exam-loading-text");
  const errorBanner = document.getElementById("exam-error-banner");
  const errorText = document.getElementById("exam-error-text");
  const workspaceEl = document.getElementById("exam-workspace");

  const state = {
    docs: [],
    currentDocId: StudyLabUI.getQueryParam("doc") || "",
    activeTab: StudyLabUI.getQueryParam("tab") || "questions",
    marksFilter: "ALL",
    topicFilter: "ALL",
    searchQuery: "",
    showAllAnswers: false,
    examPrep: null,
    flashcardType: "all",
    cardIndex: 0,
    showCardBack: false
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlightKeywords(text, keywords) {
    let safeHtml = escapeHtml(text);
    const terms = (Array.isArray(keywords) ? keywords : [])
      .map(k => String(k || "").trim())
      .filter(k => k.length >= 3)
      .sort((a, b) => b.length - a.length);

    if (!terms.length) return safeHtml;

    const pattern = new RegExp(`\\b(${terms.map(escapeRegex).join("|")})\\b`, "gi");
    return safeHtml.replace(pattern, '<span class="kw-highlight">$1</span>');
  }

  function showError(message) {
    if (!errorBanner || !errorText) return;
    errorText.textContent = message;
    errorBanner.style.display = "flex";
  }

  function clearError() {
    if (errorBanner) errorBanner.style.display = "none";
  }

  function setLoading(isLoading, message = "Loading exam preparation data...") {
    if (loadingState) loadingState.style.display = isLoading ? "block" : "none";
    if (loadingText) loadingText.textContent = message;
    if (workspaceEl) workspaceEl.style.display = isLoading ? "none" : "block";
  }

  function activateTab(tabName) {
    const allowed = ["questions", "topics", "definitions", "notes", "flashcards"];
    state.activeTab = allowed.includes(tabName) ? tabName : "questions";

    document.querySelectorAll(".tabs-bar .tab-btn").forEach(btn => {
      const isMatch = btn.getAttribute("data-tab") === state.activeTab;
      btn.classList.toggle("active", isMatch);
      btn.setAttribute("aria-selected", isMatch ? "true" : "false");
    });

    document.querySelectorAll(".tab-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `panel-${state.activeTab}`);
    });

    const isQuestions = state.activeTab === "questions";
    const isFlashcards = state.activeTab === "flashcards";
    if (filterBar) filterBar.style.display = isFlashcards ? "none" : "flex";
    if (marksFilterGroup) marksFilterGroup.style.display = isQuestions ? "inline-flex" : "none";
    if (toggleAllAnswersBtn) toggleAllAnswersBtn.style.display = isQuestions ? "inline-flex" : "none";
    if (topicFilterSelect) {
      topicFilterSelect.style.display =
        state.activeTab === "definitions" ? "none" : "inline-block";
    }
  }

  function updateDocumentHeaderAndCounts() {
    const ep = state.examPrep;
    if (!ep) return;

    const { document: doc, counts } = ep;
    const fmtBadge = document.getElementById("exam-doc-format");
    if (fmtBadge) {
      fmtBadge.className = `badge ${StudyLabUI.getFormatBadgeClass(doc.format)}`;
      fmtBadge.textContent = doc.format || "PDF";
    }

    document.getElementById("exam-doc-name").textContent = doc.filename;
    const metaParts = [doc.subject || "General", doc.pages ? `${doc.pages} Pages` : null];
    if (doc.extractionStatus && doc.extractionStatus !== "ready") {
      metaParts.push("OCR Required");
    }
    document.getElementById("exam-doc-meta").textContent = metaParts.filter(Boolean).join(" • ");

    if (mcqBtn) mcqBtn.href = `mcq-practice.html?doc=${doc.id}`;
    if (resultsLink) resultsLink.href = `results.html?doc=${doc.id}`;

    document.getElementById("stat-topics-count").textContent = counts.topics;
    document.getElementById("stat-questions-count").textContent = counts.questions;
    document.getElementById("stat-defs-count").textContent = counts.definitions;
    document.getElementById("stat-notes-count").textContent = counts.shortNotes;

    document.getElementById("tab-count-questions").textContent = counts.questions;
    document.getElementById("tab-count-topics").textContent = counts.topics;
    document.getElementById("tab-count-defs").textContent = counts.definitions;
    document.getElementById("tab-count-notes").textContent = counts.shortNotes;
    document.getElementById("tab-count-flashcards").textContent = counts.flashcards;

    const hasCompletePack =
      counts.topics > 0 && counts.questions > 0 && counts.definitions > 0 && counts.shortNotes > 0;
    if (generateBtn) {
      generateBtn.disabled = doc.extractionStatus !== "ready";
      generateBtn.innerHTML = hasCompletePack
        ? '<i class="fa-solid fa-rotate"></i> Regenerate Exam Pack'
        : '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Exam Prep';
    }
    if (genDefsBtn) {
      genDefsBtn.style.display = doc.extractionStatus === "ready" ? "inline-flex" : "none";
      genDefsBtn.innerHTML = counts.definitions > 0
        ? '<i class="fa-solid fa-rotate"></i> Refresh Definitions'
        : '<i class="fa-solid fa-book-open"></i> Generate Definitions';
    }

    // Populate dynamic topic filter dropdown
    if (topicFilterSelect) {
      const topicNames = Array.from(
        new Set([
          ...(ep.topics || []).map(t => t.name),
          ...(ep.questions || []).map(q => q.topic).filter(Boolean),
          ...(ep.shortNotes || []).map(n => n.heading).filter(Boolean)
        ])
      );
      topicFilterSelect.innerHTML =
        `<option value="ALL">All Topics</option>` +
        topicNames.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
      topicFilterSelect.value = topicNames.includes(state.topicFilter) ? state.topicFilter : "ALL";
      state.topicFilter = topicFilterSelect.value;
    }
  }

  function matchesSearch(haystackParts) {
    const q = state.searchQuery.trim().toLowerCase();
    if (!q) return true;
    return haystackParts.some(p => String(p || "").toLowerCase().includes(q));
  }

  function renderEmptyOrOcrCard(sectionName, actionHtml = "") {
    const doc = state.examPrep?.document;
    if (doc && doc.extractionStatus !== "ready") {
      return `
        <div class="exam-state-card" style="border-color: var(--danger-border);">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.5rem; color: var(--danger); margin-bottom: 10px;"></i>
          <h3 style="color: var(--text-main); font-size: 1rem; margin-bottom: 6px;">Text Extraction Not Ready</h3>
          <p style="max-width: 520px; margin: 0 auto;">${escapeHtml(doc.extractionError || "Scanned PDFs require OCR before AI exam generation.")}</p>
        </div>
      `;
    }

    return `
      <div class="exam-state-card">
        <i class="fa-solid fa-sparkles" style="font-size: 1.4rem; color: var(--primary-light); margin-bottom: 10px;"></i>
        <h3 style="color: var(--text-main); font-size: 1rem; margin-bottom: 6px;">No ${escapeHtml(sectionName)} Yet</h3>
        <p style="max-width: 520px; margin: 0 auto 14px;">Click <strong>Generate Exam Prep</strong> to extract exam-focused materials directly from this PDF.</p>
        ${actionHtml}
      </div>
    `;
  }

  function renderQuestionsPanel() {
    const panel = document.getElementById("panel-questions");
    if (!panel || !state.examPrep) return;

    const allQuestions = state.examPrep.questions || [];
    if (!allQuestions.length) {
      panel.innerHTML = renderEmptyOrOcrCard(
        "Exam Questions",
        `<button type="button" class="btn btn-primary btn-sm js-trigger-gen" data-mode="missing"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate Questions &amp; Exam Pack</button>`
      );
      bindPanelActionButtons(panel);
      return;
    }

    const filtered = allQuestions.filter(q => {
      if (state.marksFilter !== "ALL" && String(q.marks) !== state.marksFilter) return false;
      if (state.topicFilter !== "ALL" && (q.topic || "").toLowerCase() !== state.topicFilter.toLowerCase()) {
        return false;
      }
      return matchesSearch([q.question, q.answer, q.topic, ...(q.keywords || [])]);
    });

    if (!filtered.length) {
      panel.innerHTML = `
        <div class="exam-state-card">
          <p>No questions match the current search or mark filter.</p>
        </div>
      `;
      return;
    }

    const groups = [
      { marks: 2, label: "2-Mark Questions", hint: "Short definitions & concise concepts" },
      { marks: 5, label: "5-Mark Questions", hint: "Structured analytical & comparison questions" },
      { marks: 10, label: "10-Mark Questions", hint: "Comprehensive long-form exam answers" }
    ];

    let globalIdx = 0;
    const sectionsHtml = groups
      .map(group => {
        const items = filtered.filter(q => Number(q.marks) === group.marks);
        if (!items.length) return "";

        const cardsHtml = items
          .map(item => {
            globalIdx += 1;
            const isOpen = state.showAllAnswers || globalIdx === 1;
            const keywords = item.keywords || [];
            return `
              <article class="question-card ${isOpen ? "open" : ""}">
                <div class="question-header" tabindex="0" role="button" aria-expanded="${isOpen ? "true" : "false"}">
                  <div style="display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0;">
                    <span class="badge badge-purple" style="margin-top: 2px;">Q${globalIdx}</span>
                    <div style="min-width: 0;">
                      <strong style="font-size: 0.94rem; color: var(--text-main); line-height: 1.45; display: block;">${escapeHtml(item.question)}</strong>
                      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px;">
                        ${item.topic ? `<span class="badge badge-subject" style="font-size: 0.72rem;"><i class="fa-solid fa-tag"></i> ${escapeHtml(item.topic)}</span>` : ""}
                        ${item.pageRef ? `<span class="badge badge-purple" style="font-size: 0.72rem;"><i class="fa-regular fa-file-lines"></i> Page ${escapeHtml(item.pageRef)}</span>` : ""}
                      </div>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                    <span class="badge badge-success">${escapeHtml(item.marks)} Marks</span>
                    <i class="fa-solid fa-chevron-down" style="color: var(--text-muted); font-size: 0.8rem;"></i>
                  </div>
                </div>
                <div class="question-answer">
                  <strong style="color: var(--success); font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">Exam-Ready Answer</strong>
                  <p style="color: var(--text-main); font-size: 0.9rem; line-height: 1.65; white-space: pre-line;">${highlightKeywords(item.answer, keywords)}</p>
                  ${
                    keywords.length
                      ? `<div class="keyword-chips">
                          <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">Keywords:</span>
                          ${keywords.map(kw => `<span class="keyword-chip">${escapeHtml(kw)}</span>`).join("")}
                        </div>`
                      : ""
                  }
                </div>
              </article>
            `;
          })
          .join("");

        return `
          <div class="exam-group-header">
            <div>
              <h3 style="font-size: 0.98rem; font-weight: 600; color: var(--text-main);">${group.label}</h3>
              <span style="font-size: 0.78rem; color: var(--text-secondary);">${group.hint}</span>
            </div>
            <span class="badge badge-purple">${items.length}</span>
          </div>
          ${cardsHtml}
        `;
      })
      .join("");

    panel.innerHTML = sectionsHtml;

    panel.querySelectorAll(".question-header").forEach(header => {
      const toggle = () => {
        const card = header.parentElement;
        const opened = card.classList.toggle("open");
        header.setAttribute("aria-expanded", opened ? "true" : "false");
      };
      header.addEventListener("click", toggle);
      header.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  function renderTopicsPanel() {
    const panel = document.getElementById("panel-topics");
    if (!panel || !state.examPrep) return;

    const allTopics = state.examPrep.topics || [];
    if (!allTopics.length) {
      panel.innerHTML = renderEmptyOrOcrCard(
        "Important Topics",
        `<button type="button" class="btn btn-primary btn-sm js-trigger-gen" data-mode="missing"><i class="fa-solid fa-wand-magic-sparkles"></i> Extract Important Topics</button>`
      );
      bindPanelActionButtons(panel);
      return;
    }

    const filtered = allTopics.filter(t => {
      if (state.topicFilter !== "ALL" && t.name.toLowerCase() !== state.topicFilter.toLowerCase()) {
        return false;
      }
      return matchesSearch([t.name, t.explanation, ...(t.keyPoints || [])]);
    });

    if (!filtered.length) {
      panel.innerHTML = `<div class="exam-state-card"><p>No important topics match your search or filter.</p></div>`;
      return;
    }

    panel.innerHTML = `
      <div class="exam-cards-grid">
        ${filtered
          .map(topic => {
            const isHigh = String(topic.importance).toLowerCase() !== "medium";
            const impClass = isHigh ? "badge-importance-high" : "badge-importance-medium";
            const points = topic.keyPoints || [];
            return `
              <article class="exam-topic-card">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
                  <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-main);">${escapeHtml(topic.name)}</h3>
                  <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <span class="badge ${impClass}">${isHigh ? "High" : "Medium"} Importance</span>
                    ${topic.pageRef ? `<span class="badge badge-purple">Page ${escapeHtml(topic.pageRef)}</span>` : ""}
                  </div>
                </div>
                ${
                  topic.explanation
                    ? `<p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.58;">${escapeHtml(topic.explanation)}</p>`
                    : `<p style="font-size: 0.83rem; color: var(--text-muted);">Topic reused from summary. Click <strong>Regenerate Exam Pack</strong> for detailed explanation and key points.</p>`
                }
                ${
                  points.length
                    ? `<ul class="exam-bullet-list">${points.map(pt => `<li>${escapeHtml(pt)}</li>`).join("")}</ul>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderDefinitionsPanel() {
    const panel = document.getElementById("panel-definitions");
    if (!panel || !state.examPrep) return;

    const allDefs = state.examPrep.definitions || [];
    if (!allDefs.length) {
      panel.innerHTML = renderEmptyOrOcrCard(
        "Important Definitions",
        `<button type="button" class="btn btn-primary btn-sm js-trigger-gen" data-mode="definitions"><i class="fa-solid fa-book-open"></i> Generate PDF Definitions</button>`
      );
      bindPanelActionButtons(panel);
      return;
    }

    const filtered = allDefs.filter(d =>
      matchesSearch([d.term, d.definition, d.simpleExplanation, d.example, ...(d.keywords || [])])
    );

    if (!filtered.length) {
      panel.innerHTML = `<div class="exam-state-card"><p>No definitions match your search.</p></div>`;
      return;
    }

    panel.innerHTML = `
      <div class="exam-cards-grid">
        ${filtered
          .map(def => {
            const keywords = def.keywords || [];
            return `
              <article class="exam-def-card">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
                  <h3 style="font-size: 1rem; font-weight: 700; color: var(--primary-light);">${escapeHtml(def.term)}</h3>
                  ${def.pageRef ? `<span class="badge badge-purple" style="flex-shrink: 0;">Page ${escapeHtml(def.pageRef)}</span>` : ""}
                </div>
                <div>
                  <span style="font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 600;">Definition</span>
                  <p style="font-size: 0.9rem; color: var(--text-main); line-height: 1.6; margin-top: 3px;">${highlightKeywords(def.definition, keywords)}</p>
                </div>
                ${
                  def.simpleExplanation
                    ? `<div style="background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 9px 11px;">
                        <span style="font-size: 0.74rem; color: var(--success); font-weight: 600;">Simple Explanation: </span>
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(def.simpleExplanation)}</span>
                      </div>`
                    : ""
                }
                ${
                  def.example
                    ? `<div style="font-size: 0.84rem; color: var(--text-secondary); border-left: 2px solid var(--primary); padding-left: 10px;">
                        <strong style="color: var(--text-main);">Document Example:</strong> ${escapeHtml(def.example)}
                      </div>`
                    : ""
                }
                ${
                  keywords.length
                    ? `<div class="keyword-chips">${keywords.map(k => `<span class="keyword-chip">${escapeHtml(k)}</span>`).join("")}</div>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderShortNotesPanel() {
    const panel = document.getElementById("panel-notes");
    if (!panel || !state.examPrep) return;

    const allNotes = state.examPrep.shortNotes || [];
    if (!allNotes.length) {
      panel.innerHTML = renderEmptyOrOcrCard(
        "Short Notes",
        `<button type="button" class="btn btn-primary btn-sm js-trigger-gen" data-mode="missing"><i class="fa-solid fa-wand-magic-sparkles"></i> Generate Short Notes</button>`
      );
      bindPanelActionButtons(panel);
      return;
    }

    const filtered = allNotes.filter(n => {
      if (state.topicFilter !== "ALL" && n.heading.toLowerCase() !== state.topicFilter.toLowerCase()) {
        return false;
      }
      return matchesSearch([
        n.heading,
        n.content,
        ...(n.points || []),
        ...(n.terminology || []),
        ...(n.examFacts || [])
      ]);
    });

    if (!filtered.length) {
      panel.innerHTML = `<div class="exam-state-card"><p>No short notes match your search or topic filter.</p></div>`;
      return;
    }

    panel.innerHTML = `
      <div class="exam-cards-grid">
        ${filtered
          .map(note => {
            const points = note.points || [];
            const terms = note.terminology || [];
            const facts = note.examFacts || [];
            return `
              <article class="exam-note-card">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
                  <h3 style="font-size: 1rem; font-weight: 600; color: var(--primary-light);">${escapeHtml(note.heading)}</h3>
                  ${note.pageRef ? `<span class="badge badge-purple" style="flex-shrink: 0;">Page ${escapeHtml(note.pageRef)}</span>` : ""}
                </div>
                ${
                  points.length
                    ? `<ul class="exam-bullet-list">${points.map(pt => `<li>${escapeHtml(pt)}</li>`).join("")}</ul>`
                    : `<p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">${escapeHtml(note.content)}</p>`
                }
                ${
                  terms.length
                    ? `<div class="keyword-chips">
                        <span style="font-size: 0.74rem; color: var(--text-muted); font-weight: 600;">Terminology:</span>
                        ${terms.map(t => `<span class="keyword-chip">${escapeHtml(t)}</span>`).join("")}
                      </div>`
                    : ""
                }
                ${
                  facts.length
                    ? `<div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: var(--radius-sm); padding: 9px 11px; margin-top: 2px;">
                        <strong style="font-size: 0.75rem; color: var(--success); text-transform: uppercase; letter-spacing: 0.04em; display: block; margin-bottom: 4px;">Exam-Relevant Facts</strong>
                        <p style="font-size: 0.83rem; color: var(--text-secondary); line-height: 1.5;">${facts.map(escapeHtml).join(" • ")}</p>
                      </div>`
                    : ""
                }
              </article>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function getFilteredFlashcards() {
    const all = state.examPrep?.flashcards || [];
    if (state.flashcardType === "all") return all;
    return all.filter(c => c.type === state.flashcardType);
  }

  function renderFlashcard() {
    const counter = document.getElementById("flashcard-counter");
    const sideLabel = document.getElementById("flashcard-side-label");
    const topicLabel = document.getElementById("flashcard-topic-label");
    const cardText = document.getElementById("flashcard-text");
    const box = document.getElementById("flashcard-box");

    const cards = getFilteredFlashcards();
    if (!cards.length) {
      counter.textContent = "0 Cards";
      sideLabel.className = "badge badge-subject";
      sideLabel.textContent = "NO FLASHCARDS";
      topicLabel.style.display = "none";
      cardText.textContent = "Generate Exam Prep or Definitions for this PDF to study flashcards.";
      box.style.borderColor = "var(--border-color)";
      return;
    }

    if (state.cardIndex >= cards.length) state.cardIndex = 0;
    const card = cards[state.cardIndex];
    counter.textContent = `Card ${state.cardIndex + 1} of ${cards.length}`;

    if (card.topic) {
      topicLabel.textContent = card.pageRef ? `${card.topic} • p.${card.pageRef}` : card.topic;
      topicLabel.style.display = "inline-flex";
    } else {
      topicLabel.style.display = "none";
    }

    if (state.showCardBack) {
      sideLabel.className = "badge badge-success";
      sideLabel.textContent = card.type === "definition" ? "DEFINITION" : "MODEL ANSWER";
      cardText.style.whiteSpace = "pre-line";
      cardText.textContent = card.back;
      box.style.borderColor = "rgba(16, 185, 129, 0.45)";
    } else {
      sideLabel.className = "badge badge-purple";
      sideLabel.textContent = `${card.badge || "FRONT"} (Click to flip)`;
      cardText.style.whiteSpace = "normal";
      cardText.textContent = card.front;
      box.style.borderColor = "var(--border-color)";
    }
  }

  function renderAllPanels() {
    updateDocumentHeaderAndCounts();
    renderQuestionsPanel();
    renderTopicsPanel();
    renderDefinitionsPanel();
    renderShortNotesPanel();
    renderFlashcard();
    activateTab(state.activeTab);
  }

  function bindPanelActionButtons(container) {
    container.querySelectorAll(".js-trigger-gen").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode") || "missing";
        triggerGeneration(mode);
      });
    });
  }

  async function loadExamPrepForDoc(docId) {
    if (!docId) return;
    clearError();
    setLoading(true, "Loading exam preparation dashboard...");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("doc", docId);
      window.history.replaceState({}, "", url.toString());

      const res = await StudyLabAPI.getExamPrep(docId);
      state.examPrep = res.examPrep;
      state.cardIndex = 0;
      state.showCardBack = false;
      state.topicFilter = "ALL";
      setLoading(false);
      renderAllPanels();
    } catch (err) {
      setLoading(false);
      showError(err.message);
      StudyLabUI.showToast(err.message, "danger");
    }
  }

  async function triggerGeneration(mode = "missing") {
    if (!state.currentDocId) return;
    clearError();
    const activeButtons = [generateBtn, genDefsBtn].filter(Boolean);
    const originals = activeButtons.map(b => b.innerHTML);
    activeButtons.forEach(b => { b.disabled = true; });
    if (generateBtn) {
      generateBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    }
    setLoading(
      true,
      mode === "definitions"
        ? "Extracting document-grounded definitions with Groq AI..."
        : "Generating exam questions, definitions, topics, and notes with Groq AI..."
    );

    try {
      const res = await StudyLabAPI.generateExamPrep(state.currentDocId, mode);
      state.examPrep = res.examPrep;
      state.cardIndex = 0;
      state.showCardBack = false;
      setLoading(false);
      renderAllPanels();
      StudyLabUI.showToast(res.message || "Exam preparation materials updated!", "success");
    } catch (err) {
      setLoading(false);
      showError(err.message);
      StudyLabUI.showToast(err.message, "danger");
      if (state.examPrep) renderAllPanels();
    } finally {
      activeButtons.forEach((b, i) => {
        b.disabled = false;
        b.innerHTML = originals[i];
      });
      updateDocumentHeaderAndCounts();
    }
  }

  // Event bindings
  document.querySelectorAll(".tabs-bar .tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activateTab(btn.getAttribute("data-tab"));
    });
  });

  document.getElementById("exam-error-dismiss")?.addEventListener("click", clearError);

  generateBtn?.addEventListener("click", () => {
    const counts = state.examPrep?.counts;
    const hasCompletePack =
      counts && counts.topics > 0 && counts.questions > 0 && counts.definitions > 0 && counts.shortNotes > 0;
    triggerGeneration(hasCompletePack ? "all" : "missing");
  });

  genDefsBtn?.addEventListener("click", () => {
    triggerGeneration("definitions");
  });

  searchInput?.addEventListener("input", () => {
    state.searchQuery = searchInput.value || "";
    renderQuestionsPanel();
    renderTopicsPanel();
    renderDefinitionsPanel();
    renderShortNotesPanel();
  });

  topicFilterSelect?.addEventListener("change", () => {
    state.topicFilter = topicFilterSelect.value || "ALL";
    renderQuestionsPanel();
    renderTopicsPanel();
    renderShortNotesPanel();
  });

  marksFilterGroup?.querySelectorAll(".mark-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      marksFilterGroup.querySelectorAll(".mark-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.marksFilter = pill.getAttribute("data-marks") || "ALL";
      renderQuestionsPanel();
    });
  });

  toggleAllAnswersBtn?.addEventListener("click", () => {
    state.showAllAnswers = !state.showAllAnswers;
    toggleAllAnswersBtn.innerHTML = state.showAllAnswers
      ? '<i class="fa-regular fa-eye-slash"></i> Hide All Answers'
      : '<i class="fa-regular fa-eye"></i> Show All Answers';
    renderQuestionsPanel();
  });

  // Flashcard controls
  document.getElementById("flashcard-type-filter")?.querySelectorAll(".mark-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll("#flashcard-type-filter .mark-pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.flashcardType = pill.getAttribute("data-card-type") || "all";
      state.cardIndex = 0;
      state.showCardBack = false;
      renderFlashcard();
    });
  });

  const flipCard = () => {
    if (!getFilteredFlashcards().length) return;
    state.showCardBack = !state.showCardBack;
    renderFlashcard();
  };
  document.getElementById("flashcard-box")?.addEventListener("click", flipCard);
  document.getElementById("flip-card-btn")?.addEventListener("click", flipCard);
  document.getElementById("next-card-btn")?.addEventListener("click", () => {
    const cards = getFilteredFlashcards();
    if (!cards.length) return;
    state.cardIndex = (state.cardIndex + 1) % cards.length;
    state.showCardBack = false;
    renderFlashcard();
  });
  document.getElementById("prev-card-btn")?.addEventListener("click", () => {
    const cards = getFilteredFlashcards();
    if (!cards.length) return;
    state.cardIndex = (state.cardIndex - 1 + cards.length) % cards.length;
    state.showCardBack = false;
    renderFlashcard();
  });

  // Initial document list load
  setLoading(true, "Loading your study library...");
  try {
    const docsRes = await StudyLabAPI.getDocuments();
    state.docs = docsRes.documents || [];

    if (!state.docs.length) {
      setLoading(false);
      document.getElementById("exam-doc-name").textContent = "No PDFs Uploaded Yet";
      document.getElementById("exam-doc-meta").textContent = "Upload a PDF document to unlock AI Exam Preparation.";
      if (docSelect) docSelect.innerHTML = `<option value="">No documents available</option>`;
      if (generateBtn) generateBtn.disabled = true;
      if (mcqBtn) mcqBtn.href = "mcq-practice.html";
      if (resultsLink) resultsLink.href = "results.html";
      document.getElementById("panel-questions").innerHTML = `
        <div class="exam-state-card">
          <i class="fa-solid fa-file-circle-plus" style="font-size: 1.6rem; color: var(--primary-light); margin-bottom: 10px;"></i>
          <h3 style="color: var(--text-main); margin-bottom: 6px;">Upload a Study Document</h3>
          <p style="margin-bottom: 14px;">Once uploaded, AI StudyLab will extract topics, 2/5/10-mark questions, definitions, and revision notes.</p>
          <a href="upload.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-cloud-arrow-up"></i> Upload PDF</a>
        </div>
      `;
      activateTab("questions");
      return;
    }

    const exists = state.docs.some(d => String(d.id) === String(state.currentDocId));
    state.currentDocId = exists ? String(state.currentDocId) : String(state.docs[0].id);

    if (docSelect) {
      docSelect.innerHTML = state.docs
        .map(d => `<option value="${d.id}">${escapeHtml(d.filename)}</option>`)
        .join("");
      docSelect.value = state.currentDocId;
      docSelect.addEventListener("change", () => {
        state.currentDocId = docSelect.value;
        loadExamPrepForDoc(state.currentDocId);
      });
    }

    await loadExamPrepForDoc(state.currentDocId);
  } catch (err) {
    setLoading(false);
    showError(err.message);
    StudyLabUI.showToast(err.message, "danger");
  }
});
