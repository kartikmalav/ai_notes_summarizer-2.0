/**
 * AI StudyLab - Real PDF Upload & AI Generation Pipeline
 */

document.addEventListener("DOMContentLoaded", () => {
  if (!StudyLabAPI.requireAuth()) return;

  const dropzone = document.getElementById("upload-dropzone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-file-btn");
  const banner = document.getElementById("selected-file-banner");
  const fileNameEl = document.getElementById("selected-file-name");
  const fileSizeEl = document.getElementById("selected-file-size");
  const clearBtn = document.getElementById("clear-file-btn");
  const titleInput = document.getElementById("doc-title-input");
  const subjectSelect = document.getElementById("doc-subject-select");
  const uploadForm = document.getElementById("upload-form");

  let selectedFile = null;

  function handleFileSelected(file) {
    if (!file) return;
    const isPdfExt = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfExt) {
      StudyLabUI.showToast("Only PDF (.pdf) files are supported.", "danger");
      return;
    }

    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      StudyLabUI.showToast("PDF file exceeds the 20 MB upload limit.", "danger");
      return;
    }

    selectedFile = file;
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    const displaySize = file.size < 1024 * 1024 ? `${Math.max(1, Math.round(file.size / 1024))} KB` : `${sizeMB} MB`;

    if (fileNameEl) fileNameEl.textContent = file.name;
    if (fileSizeEl) fileSizeEl.textContent = `PDF • ${displaySize}`;
    if (banner) banner.style.display = "flex";
    if (titleInput) titleInput.value = file.name;
  }

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => fileInput.click());
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });
    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files.length) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length) {
        handleFileSelected(fileInput.files[0]);
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      selectedFile = null;
      if (fileInput) fileInput.value = "";
      if (banner) banner.style.display = "none";
      if (titleInput) titleInput.value = "";
    });
  }

  function updateProgress(pct, text) {
    const progressFill = document.getElementById("upload-progress-fill");
    const statusText = document.getElementById("progress-status-text");
    const pctText = document.getElementById("progress-pct-text");
    if (progressFill) progressFill.style.width = `${pct}%`;
    if (statusText) statusText.textContent = text;
    if (pctText) pctText.textContent = `${pct}%`;
  }

  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      if (!selectedFile) {
        StudyLabUI.showToast("Please select a PDF file to upload.", "danger");
        return;
      }

      const rawTitle = (titleInput.value || selectedFile.name).trim();
      const subject = subjectSelect.value;

      const wantSummary = document.getElementById("opt-summary")?.checked;
      const wantNotes = document.getElementById("opt-notes")?.checked;
      const wantQuestions = document.getElementById("opt-questions")?.checked;
      const wantMcqs = document.getElementById("opt-mcqs")?.checked;

      const progressBox = document.getElementById("upload-progress-box");
      const submitBtn = document.getElementById("start-analyze-btn");

      if (progressBox) progressBox.style.display = "block";
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing PDF...';
      }

      try {
        updateProgress(20, "Uploading PDF & extracting text...");

        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("title", rawTitle);
        formData.append("subject", subject);

        const uploadRes = await StudyLabAPI.uploadDocument(formData);
        const uploadedDoc = uploadRes.document;

        if (uploadedDoc.extractionStatus === "ocr_required") {
          updateProgress(100, "Uploaded — OCR required for scanned PDF");
          StudyLabUI.showToast(
            uploadedDoc.extractionError || "Scanned PDF uploaded. OCR is required before AI analysis.",
            "danger"
          );
          setTimeout(() => {
            window.location.href = `results.html?doc=${uploadedDoc.id}`;
          }, 1800);
          return;
        }

        const aiWarnings = [];

        if (wantSummary) {
          updateProgress(45, "Generating AI Executive Summary...");
          try {
            await StudyLabAPI.generateSummary(uploadedDoc.id);
          } catch (aiErr) {
            aiWarnings.push(`Summary: ${aiErr.message}`);
          }
        }

        if (wantNotes || wantQuestions) {
          updateProgress(70, "Generating Short Notes & 2/5/10-Mark Questions...");
          try {
            await StudyLabAPI.generateNotesAndQuestions(uploadedDoc.id);
          } catch (aiErr) {
            aiWarnings.push(`Notes/Questions: ${aiErr.message}`);
          }
        }

        if (wantMcqs) {
          updateProgress(90, "Generating MCQ Practice Quiz...");
          try {
            await StudyLabAPI.generateMcqs(uploadedDoc.id, 6);
          } catch (aiErr) {
            aiWarnings.push(`MCQs: ${aiErr.message}`);
          }
        }

        updateProgress(100, "Complete!");

        if (aiWarnings.length > 0) {
          StudyLabUI.showToast(
            `PDF uploaded & text extracted, but AI generation reported: ${aiWarnings[0]}`,
            "danger"
          );
        } else {
          StudyLabUI.showToast("PDF analyzed and study kit generated!", "success");
        }

        setTimeout(() => {
          window.location.href = `results.html?doc=${uploadedDoc.id}`;
        }, 900);
      } catch (err) {
        updateProgress(0, err.message);
        StudyLabUI.showToast(err.message, "danger");
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Upload &amp; Analyze PDF';
        }
      }
    });
  }
});
