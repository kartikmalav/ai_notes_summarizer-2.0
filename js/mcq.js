/**
 * AI StudyLab - Interactive MCQ Practice Engine (Server-Graded)
 */

document.addEventListener("DOMContentLoaded", async () => {
  if (!StudyLabAPI.requireAuth()) return;

  const docSelect = document.getElementById("mcq-doc-select");
  const genBtn = document.getElementById("generate-mcqs-btn");
  let selectedDocId = StudyLabUI.getQueryParam("doc") || "ALL";

  let questions = [];
  let currentIndex = 0;
  let userAnswers = []; // [{ mcqId, selectedIndex }]
  let elapsedSec = 0;
  let timerId = null;

  async function initDropdown() {
    try {
      const res = await StudyLabAPI.getDocuments();
      const docs = res.documents || [];
      if (docSelect) {
        docSelect.innerHTML =
          `<option value="ALL">All Documents (Mixed Practice)</option>` +
          docs.map(d => `<option value="${d.id}">${d.filename}</option>`).join("");
        if (selectedDocId !== "ALL" && docs.some(d => String(d.id) === String(selectedDocId))) {
          docSelect.value = selectedDocId;
        } else {
          selectedDocId = "ALL";
          docSelect.value = "ALL";
        }
      }
      updateGenButtonState();
    } catch (err) {
      StudyLabUI.showToast(err.message, "danger");
    }
  }

  function updateGenButtonState() {
    if (!genBtn) return;
    if (selectedDocId === "ALL") {
      genBtn.title = "Select a specific PDF document to generate new MCQs";
    } else {
      genBtn.title = "Generate fresh AI MCQs for this document";
    }
  }

  async function loadQuizHistory() {
    const histEl = document.getElementById("mcq-history-list");
    if (!histEl) return;
    try {
      const res = await StudyLabAPI.getMcqResults();
      const results = res.results || [];
      if (!results.length) {
        histEl.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">No quiz attempts recorded yet.</p>`;
        return;
      }
      histEl.innerHTML = results
        .map(r => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-md); gap: 10px; flex-wrap: wrap;">
            <div>
              <strong style="font-size: 0.88rem;">${r.documentName}</strong>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${new Date(r.createdAt).toLocaleString()} • ${r.timeTakenSeconds}s</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge badge-purple">${r.correctAnswers} / ${r.totalQuestions}</span>
              <span class="badge ${r.scorePercentage >= 70 ? "badge-success" : "badge-danger"}">${r.scorePercentage}%</span>
            </div>
          </div>
        `)
        .join("");
    } catch {
      histEl.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem;">Could not load quiz history.</p>`;
    }
  }

  async function startQuiz() {
    clearInterval(timerId);
    elapsedSec = 0;
    currentIndex = 0;
    userAnswers = [];

    document.getElementById("mcq-quiz-card").style.display = "block";
    document.getElementById("mcq-result-card").style.display = "none";
    document.getElementById("mcq-score-pill").textContent = "Server Graded";
    document.getElementById("mcq-timer").textContent = "00:00";
    document.getElementById("mcq-question-text").innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" style="color: var(--primary-light);"></i> Loading MCQs...';
    document.getElementById("mcq-options-list").innerHTML = "";

    try {
      const target = selectedDocId === "ALL" ? "all" : selectedDocId;
      const res = await StudyLabAPI.getMcqs(target);
      questions = res.mcqs || [];

      if (!questions.length) {
        document.getElementById("mcq-q-counter").textContent = "0 Questions";
        document.getElementById("mcq-progress-bar").style.width = "0%";
        document.getElementById("mcq-question-text").textContent =
          selectedDocId === "ALL"
            ? "No MCQs generated yet. Select a PDF document and click 'Generate MCQs'."
            : "No MCQs found for this document yet. Click 'Generate MCQs' above to create a quiz.";
        document.getElementById("mcq-next-btn").disabled = true;
        return;
      }

      timerId = setInterval(() => {
        elapsedSec++;
        const m = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
        const s = String(elapsedSec % 60).padStart(2, "0");
        const tEl = document.getElementById("mcq-timer");
        if (tEl) tEl.textContent = `${m}:${s}`;
      }, 1000);

      renderQuestion();
    } catch (err) {
      document.getElementById("mcq-question-text").textContent = err.message;
      StudyLabUI.showToast(err.message, "danger");
    }
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    const total = questions.length;

    document.getElementById("mcq-q-counter").textContent = `Question ${currentIndex + 1} of ${total}`;
    document.getElementById("mcq-progress-bar").style.width = `${((currentIndex + 1) / total) * 100}%`;
    document.getElementById("mcq-question-text").textContent = q.question;
    document.getElementById("mcq-explanation-box").style.display = "none";

    const nextBtn = document.getElementById("mcq-next-btn");
    const existingChoice = userAnswers[currentIndex]?.selectedIndex;
    nextBtn.disabled = existingChoice === undefined;
    nextBtn.innerHTML =
      currentIndex === total - 1
        ? 'Submit Quiz <i class="fa-solid fa-flag-checkered"></i>'
        : 'Next Question <i class="fa-solid fa-arrow-right"></i>';

    const letters = ["A", "B", "C", "D"];
    const optionsList = document.getElementById("mcq-options-list");
    optionsList.innerHTML = q.options
      .map(
        (opt, idx) => `
        <button type="button" class="mcq-option ${existingChoice === idx ? "selected" : ""}" data-idx="${idx}">
          <span class="option-letter">${letters[idx]}</span>
          <span>${opt}</span>
        </button>
      `
      )
      .join("");

    optionsList.querySelectorAll(".mcq-option").forEach(btn => {
      btn.addEventListener("click", () => {
        const chosenIdx = parseInt(btn.getAttribute("data-idx"), 10);
        optionsList.querySelectorAll(".mcq-option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        userAnswers[currentIndex] = { mcqId: q.id, selectedIndex: chosenIdx };
        nextBtn.disabled = false;
      });
    });
  }

  document.getElementById("mcq-next-btn")?.addEventListener("click", async () => {
    if (currentIndex < questions.length - 1) {
      currentIndex++;
      renderQuestion();
      return;
    }

    // Submit all answers to server for authoritative grading
    const nextBtn = document.getElementById("mcq-next-btn");
    nextBtn.disabled = true;
    nextBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Grading on Server...';

    try {
      clearInterval(timerId);
      const res = await StudyLabAPI.submitMcqQuiz({
        documentId: selectedDocId === "ALL" ? null : selectedDocId,
        answers: userAnswers,
        timeTakenSeconds: elapsedSec
      });
      showResults(res.result);
      await loadQuizHistory();
    } catch (err) {
      StudyLabUI.showToast(err.message, "danger");
      nextBtn.disabled = false;
      nextBtn.innerHTML = 'Submit Quiz <i class="fa-solid fa-flag-checkered"></i>';
    }
  });

  function showResults(result) {
    document.getElementById("mcq-quiz-card").style.display = "none";
    document.getElementById("mcq-result-card").style.display = "block";

    const m = String(Math.floor(result.timeTakenSeconds / 60)).padStart(2, "0");
    const s = String(result.timeTakenSeconds % 60).padStart(2, "0");

    document.getElementById("mcq-final-pct").textContent = `${result.scorePercentage}%`;
    document.getElementById("mcq-final-score").textContent = `${result.correctAnswers} / ${result.totalQuestions}`;
    document.getElementById("mcq-final-time").textContent = `${m}:${s}`;
    document.getElementById("mcq-final-subtitle").textContent =
      result.scorePercentage >= 75
        ? "Excellent mastery! Server-verified quiz result saved."
        : "Good effort! Review the explanations below and retake to boost your score.";

    const letters = ["A", "B", "C", "D"];
    const reviewList = document.getElementById("mcq-review-list");
    if (reviewList) {
      reviewList.innerHTML = (result.breakdown || [])
        .map(
          (item, i) => `
          <div style="padding: 14px; border-radius: var(--radius-md); background: var(--bg-input); border: 1px solid ${
            item.isCorrect ? "var(--success-border)" : "var(--danger-border)"
          };">
            <div style="display: flex; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
              <strong style="font-size: 0.9rem;">Q${i + 1}: ${item.question}</strong>
              <span class="badge ${item.isCorrect ? "badge-success" : "badge-danger"}">
                ${item.isCorrect ? "Correct" : "Incorrect"}
              </span>
            </div>
            <div style="font-size: 0.83rem; color: var(--text-secondary); margin-bottom: 4px;">
              Your answer: <strong>${
                item.selectedIndex != null ? `${letters[item.selectedIndex]}. ${item.options[item.selectedIndex]}` : "Skipped"
              }</strong>
              ${
                !item.isCorrect
                  ? ` • Correct: <strong style="color: var(--success);">${letters[item.correctIndex]}. ${item.options[item.correctIndex]}</strong>`
                  : ""
              }
            </div>
            <div style="font-size: 0.82rem; color: var(--primary-light);">
              <i class="fa-solid fa-lightbulb"></i> ${item.explanation}
            </div>
          </div>
        `
        )
        .join("");
    }
  }

  if (docSelect) {
    docSelect.addEventListener("change", () => {
      selectedDocId = docSelect.value;
      updateGenButtonState();
      startQuiz();
    });
  }

  if (genBtn) {
    genBtn.addEventListener("click", async () => {
      if (selectedDocId === "ALL") {
        StudyLabUI.showToast("Please select a specific PDF document from the dropdown first.", "info");
        return;
      }
      const orig = genBtn.innerHTML;
      genBtn.disabled = true;
      genBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
      try {
        await StudyLabAPI.generateMcqs(selectedDocId, 6);
        StudyLabUI.showToast("Fresh MCQs generated and saved!", "success");
        await startQuiz();
      } catch (err) {
        StudyLabUI.showToast(err.message, "danger");
      } finally {
        genBtn.disabled = false;
        genBtn.innerHTML = orig;
      }
    });
  }

  document.getElementById("restart-quiz-btn")?.addEventListener("click", startQuiz);
  document.getElementById("retake-quiz-btn")?.addEventListener("click", startQuiz);

  await initDropdown();
  await Promise.all([startQuiz(), loadQuizHistory()]);
});
