/**
 * AI StudyLab - Ask Your Document AI Chat Controller (Backend-Integrated)
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (!StudyLabAPI.requireAuth()) return;

  let docs = [];
  let activeDocId = StudyLabUI.getQueryParam("doc");
  const initialQuery = StudyLabUI.getQueryParam("q");

  const docListEl = document.getElementById("chat-doc-list");
  const messagesEl = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");

  function renderSidebar() {
    if (!docListEl) return;
    if (!docs.length) {
      docListEl.innerHTML = `<p style="font-size: 0.82rem; color: var(--text-muted); padding: 8px;">No documents uploaded yet.</p>`;
      return;
    }

    docListEl.innerHTML = docs
      .map(d => `
        <button type="button" class="chat-doc-item ${String(d.id) === String(activeDocId) ? "active" : ""}" data-id="${d.id}">
          <div style="display: flex; align-items: center; gap: 9px;">
            <i class="fa-solid ${StudyLabUI.getFormatIcon(d.format)}" style="color: var(--primary-light); font-size: 0.9rem;"></i>
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 0.83rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${d.filename}
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${d.subject}</div>
            </div>
          </div>
        </button>
      `)
      .join("");

    docListEl.querySelectorAll(".chat-doc-item").forEach(btn => {
      btn.addEventListener("click", () => {
        activeDocId = btn.getAttribute("data-id");
        renderSidebar();
        loadDocChat(activeDocId);
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatMessageText(text) {
    return escapeHtml(text).replace(/\n/g, "<br>");
  }

  function appendBubble(html, sender) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = html;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
  }

  async function loadDocChat(docId) {
    const doc = docs.find(d => String(d.id) === String(docId));
    if (!doc) return;

    document.getElementById("chat-active-filename").textContent = doc.filename;
    document.getElementById("chat-active-subject").textContent =
      doc.extractionStatus === "ready"
        ? `${doc.subject} • ${doc.pages} Pages • Ready for Q&A`
        : `${doc.subject} • OCR Required`;
    document.getElementById("chat-open-results-btn").href = `results.html?doc=${doc.id}`;

    messagesEl.innerHTML = `
      <div style="text-align: center; padding: 18px; color: var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin" style="color: var(--primary-light);"></i> Loading conversation...
      </div>
    `;

    try {
      const res = await StudyLabAPI.getChatHistory(doc.id);
      const history = res.messages || [];
      messagesEl.innerHTML = "";

      if (doc.extractionStatus !== "ready") {
        appendBubble(
          `<strong>OCR Required:</strong> ${escapeHtml(
            doc.extractionError || "This scanned PDF does not contain extractable text for AI chat."
          )}`,
          "ai"
        );
        return;
      }

      if (!history.length) {
        appendBubble(
          `Hello! Ask me anything about <strong>${escapeHtml(doc.filename)}</strong> (${escapeHtml(
            doc.subject
          )}). My answers are grounded strictly in your uploaded PDF content.`,
          "ai"
        );
      } else {
        history.forEach(item => {
          appendBubble(formatMessageText(item.message), item.role === "user" ? "user" : "ai");
        });
      }
    } catch (err) {
      messagesEl.innerHTML = "";
      appendBubble(`Could not load chat history: ${escapeHtml(err.message)}`, "ai");
    }
  }

  async function sendMessage(text) {
    if (!activeDocId || !text.trim()) return;
    const cleanText = text.trim();

    appendBubble(formatMessageText(cleanText), "user");
    const loadingBubble = appendBubble(
      '<i class="fa-solid fa-spinner fa-spin" style="color: var(--primary-light);"></i> Thinking using PDF context...',
      "ai"
    );

    const submitBtn = chatForm?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await StudyLabAPI.sendChatMessage(activeDocId, cleanText);
      loadingBubble.innerHTML = formatMessageText(res.assistantMessage.message);
    } catch (err) {
      loadingBubble.innerHTML = `<span style="color: var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(
        err.message
      )}</span>`;
      StudyLabUI.showToast(err.message, "danger");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = chatInput.value.trim();
      if (!val) return;
      chatInput.value = "";
      sendMessage(val);
    });
  }

  document.querySelectorAll(".chat-quick-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      sendMessage(chip.getAttribute("data-q"));
    });
  });

  document.getElementById("clear-chat-btn")?.addEventListener("click", () => {
    if (activeDocId) loadDocChat(activeDocId);
  });

  try {
    const docsRes = await StudyLabAPI.getDocuments();
    docs = docsRes.documents || [];
    if (!docs.length) {
      renderSidebar();
      document.getElementById("chat-active-filename").textContent = "No PDFs Uploaded";
      document.getElementById("chat-active-subject").textContent = "Upload a PDF to start chatting";
      messagesEl.innerHTML = `
        <div style="text-align: center; padding: 36px;">
          <p style="color: var(--text-secondary); margin-bottom: 12px;">Upload a PDF document to ask questions with AI.</p>
          <a href="upload.html" class="btn btn-primary btn-sm"><i class="fa-solid fa-cloud-arrow-up"></i> Upload PDF</a>
        </div>
      `;
      return;
    }

    if (!activeDocId || !docs.some(d => String(d.id) === String(activeDocId))) {
      activeDocId = String(docs[0].id);
    }

    renderSidebar();
    await loadDocChat(activeDocId);

    if (initialQuery) {
      await sendMessage(initialQuery);
    }
  } catch (err) {
    StudyLabUI.showToast(err.message, "danger");
  }
});
