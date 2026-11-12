/**
 * AI StudyLab - Shared Utilities (Toasts, Modals, URL Params)
 */

const StudyLabUI = {
  getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  },

  showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const iconMap = {
      success: "fa-circle-check",
      danger: "fa-circle-exclamation",
      info: "fa-sparkles"
    };
    const colorMap = {
      success: "#10B981",
      danger: "#F43F5E",
      info: "#A78BFA"
    };

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${iconMap[type] || "fa-wand-magic-sparkles"}" style="color: ${colorMap[type] || "#A78BFA"}; font-size: 1rem;"></i>
      <span style="flex: 1; color: var(--text-main);">${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      toast.style.transition = "all 0.25s ease";
      setTimeout(() => toast.remove(), 260);
    }, 3000);
  },

  openModal(titleHtml, bodyHtml, footerHtml = "") {
    let overlay = document.getElementById("global-modal-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "global-modal-overlay";
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true">
          <div class="modal-header">
            <h3 class="modal-title" id="global-modal-title"></h3>
            <button class="modal-close" id="global-modal-close" aria-label="Close modal">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div class="modal-body" id="global-modal-body"></div>
          <div class="modal-footer" id="global-modal-footer"></div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.closeModal();
      });
      document.getElementById("global-modal-close").addEventListener("click", () => this.closeModal());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay.classList.contains("active")) {
          this.closeModal();
        }
      });
    }

    document.getElementById("global-modal-title").innerHTML = titleHtml;
    document.getElementById("global-modal-body").innerHTML = bodyHtml;
    const footerEl = document.getElementById("global-modal-footer");
    if (footerHtml) {
      footerEl.innerHTML = footerHtml;
      footerEl.style.display = "flex";
    } else {
      footerEl.innerHTML = "";
      footerEl.style.display = "none";
    }

    requestAnimationFrame(() => overlay.classList.add("active"));
  },

  closeModal() {
    const overlay = document.getElementById("global-modal-overlay");
    if (overlay) {
      overlay.classList.remove("active");
    }
  },

  getFormatBadgeClass(format) {
    const fmt = (format || "PDF").toUpperCase();
    if (fmt === "PDF") return "badge-pdf";
    if (fmt === "DOCX") return "badge-docx";
    if (fmt === "PPTX") return "badge-pptx";
    return "badge-purple";
  },

  getFormatIcon(format) {
    const fmt = (format || "PDF").toUpperCase();
    if (fmt === "PDF") return "fa-file-pdf";
    if (fmt === "DOCX") return "fa-file-word";
    if (fmt === "PPTX") return "fa-file-powerpoint";
    return "fa-file-lines";
  }
};

