/**
 * AI StudyLab - Shared Horizontal Top Navbar Component (Backend-Integrated)
 */

function renderNavbar() {
  const navbarContainer = document.getElementById("app-navbar");
  if (!navbarContainer) return;

  // Enforce authenticated navigation on all protected dashboard pages
  if (!StudyLabAPI.requireAuth()) return;

  const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
  const cachedUser = StudyLabAPI.getCachedUser() || {
    name: "Student",
    email: "student@example.com"
  };
  const initials = StudyLabAPI.getInitials(cachedUser.name);
  const firstName = (cachedUser.name || "Student").split(" ")[0];

  const isStudyToolActive = [
    "exam-prep.html",
    "mcq-practice.html",
    "results.html",
    "chat.html"
  ].includes(currentPage);

  navbarContainer.className = "navbar";
  navbarContainer.innerHTML = `
    <div class="navbar-inner">
      <!-- Left: Logo + Nav Links -->
      <div class="navbar-left">
        <a href="dashboard.html" class="brand-logo" title="AI StudyLab Home">
          <div class="brand-icon">
            <i class="fa-solid fa-graduation-cap"></i>
          </div>
          <span class="brand-text">AI <span>StudyLab</span></span>
        </a>

        <nav class="nav-links" aria-label="Main Navigation">
          <a href="dashboard.html" class="nav-link ${currentPage === "dashboard.html" ? "active" : ""}">
            <i class="fa-solid fa-table-cells-large"></i>
            <span>Dashboard</span>
          </a>

          <a href="documents.html" class="nav-link ${currentPage === "documents.html" ? "active" : ""}">
            <i class="fa-solid fa-folder-open"></i>
            <span>My Documents</span>
          </a>

          <!-- Study Tools Dropdown -->
          <div class="nav-dropdown" id="study-tools-dropdown">
            <button type="button" class="nav-link ${isStudyToolActive ? "active" : ""}" id="study-tools-trigger" aria-expanded="false">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              <span>Study Tools</span>
              <i class="fa-solid fa-chevron-down dropdown-caret"></i>
            </button>
            <div class="dropdown-menu" role="menu">
              <div class="dropdown-header">AI Study Suite</div>
              <a href="exam-prep.html" class="dropdown-item">
                <i class="fa-solid fa-bullseye"></i>
                <span>Exam Preparation</span>
              </a>
              <a href="mcq-practice.html" class="dropdown-item">
                <i class="fa-solid fa-list-check"></i>
                <span>MCQ Practice</span>
              </a>
              <a href="results.html?tab=notes" class="dropdown-item">
                <i class="fa-solid fa-note-sticky"></i>
                <span>Short Notes</span>
              </a>
              <a href="results.html?tab=questions" class="dropdown-item">
                <i class="fa-solid fa-circle-question"></i>
                <span>Important Questions</span>
              </a>
              <a href="chat.html" class="dropdown-item">
                <i class="fa-solid fa-comments"></i>
                <span>Ask Your Document</span>
              </a>
            </div>
          </div>
        </nav>
      </div>

      <!-- Right: Search + Controls + Profile + Upload CTA -->
      <div class="navbar-right">
        <div class="nav-search">
          <i class="fa-solid fa-magnifying-glass nav-search-icon"></i>
          <input
            type="text"
            class="nav-search-input"
            id="global-nav-search"
            placeholder="Search notes, PDFs..."
            aria-label="Search documents"
          />
        </div>

        <button type="button" class="nav-icon-btn" id="theme-toggle-btn" title="Toggle Contrast Mode" aria-label="Toggle dark mode">
          <i class="fa-solid fa-moon"></i>
        </button>

        <!-- Notifications Dropdown -->
        <div class="nav-dropdown" id="notif-dropdown">
          <button type="button" class="nav-icon-btn" id="notif-trigger" title="Notifications" aria-label="Notifications">
            <i class="fa-regular fa-bell"></i>
            <span class="notif-badge" id="notif-dot"></span>
          </button>
          <div class="dropdown-menu dropdown-right notif-menu">
            <div class="notif-menu-head">
              <span>Notifications</span>
              <button type="button" id="mark-notif-read" style="color: var(--primary-light); font-size: 0.76rem; font-weight: 500;">Mark all read</button>
            </div>
            <div id="notif-items-container">
              <div class="notif-item">
                <div class="notif-icon"><i class="fa-solid fa-shield-check"></i></div>
                <div class="notif-text">
                  <p>Workspace connected to <strong>AI StudyLab Backend</strong>.</p>
                  <span>Active session</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- User Profile Dropdown -->
        <div class="nav-dropdown" id="profile-dropdown">
          <button type="button" class="user-profile-btn" id="profile-trigger" aria-expanded="false">
            <div class="user-avatar" id="nav-user-avatar">${initials}</div>
            <span class="user-name" id="nav-user-firstname">${firstName}</span>
            <i class="fa-solid fa-chevron-down dropdown-caret" style="font-size: 0.65rem; color: var(--text-muted);"></i>
          </button>
          <div class="dropdown-menu dropdown-right" style="min-width: 225px;">
            <div style="padding: 10px 12px; border-bottom: 1px solid var(--border-color); margin-bottom: 4px;">
              <div id="nav-profile-fullname" style="font-weight: 600; font-size: 0.88rem; color: var(--text-main);">${cachedUser.name}</div>
              <div id="nav-profile-email" style="font-size: 0.75rem; color: var(--text-muted);">${cachedUser.email}</div>
            </div>
            <a href="dashboard.html" class="dropdown-item">
              <i class="fa-solid fa-gauge-high"></i>
              <span>Study Overview</span>
            </a>
            <a href="documents.html" class="dropdown-item">
              <i class="fa-solid fa-folder"></i>
              <span>Document Library</span>
            </a>
            <div class="dropdown-divider"></div>
            <button type="button" id="nav-signout-btn" class="dropdown-item danger">
              <i class="fa-solid fa-right-from-bracket"></i>
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        <a href="upload.html" class="btn btn-primary nav-upload-btn">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Upload Document</span>
        </a>

        <button type="button" class="mobile-menu-btn" id="mobile-menu-toggle" aria-label="Toggle Menu">
          <i class="fa-solid fa-bars"></i>
        </button>
      </div>
    </div>

    <!-- Mobile Navigation Drawer -->
    <div class="mobile-drawer" id="mobile-drawer">
      <div class="mobile-nav-list">
        <div class="nav-search" style="display: flex; width: 100%; margin-bottom: 8px;">
          <i class="fa-solid fa-magnifying-glass nav-search-icon"></i>
          <input type="text" class="nav-search-input" id="mobile-nav-search" placeholder="Search documents..." style="width: 100%;" />
        </div>
        <a href="dashboard.html" class="nav-link ${currentPage === "dashboard.html" ? "active" : ""}">
          <i class="fa-solid fa-table-cells-large"></i> Dashboard
        </a>
        <a href="documents.html" class="nav-link ${currentPage === "documents.html" ? "active" : ""}">
          <i class="fa-solid fa-folder-open"></i> My Documents
        </a>
        <div class="mobile-nav-divider"></div>
        <div style="padding: 4px 12px; font-size: 0.72rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600;">Study Tools</div>
        <a href="exam-prep.html" class="nav-link"><i class="fa-solid fa-bullseye"></i> Exam Preparation</a>
        <a href="mcq-practice.html" class="nav-link"><i class="fa-solid fa-list-check"></i> MCQ Practice</a>
        <a href="results.html?tab=notes" class="nav-link"><i class="fa-solid fa-note-sticky"></i> Short Notes</a>
        <a href="results.html?tab=questions" class="nav-link"><i class="fa-solid fa-circle-question"></i> Important Questions</a>
        <a href="chat.html" class="nav-link"><i class="fa-solid fa-comments"></i> Ask Your Document</a>
        <div class="mobile-nav-divider"></div>
        <a href="upload.html" class="btn btn-primary" style="width: 100%; margin-top: 4px;">
          <i class="fa-solid fa-cloud-arrow-up"></i> Upload Document
        </a>
        <button type="button" id="mobile-signout-btn" class="btn btn-danger-soft" style="width: 100%; margin-top: 6px;">
          <i class="fa-solid fa-right-from-bracket"></i> Sign Out
        </button>
      </div>
    </div>
  `;

  setupNavbarInteractions();
  syncNavbarUserFromServer();
}

async function syncNavbarUserFromServer() {
  try {
    const res = await StudyLabAPI.getMe();
    if (res.user) {
      StudyLabAPI.setSession(null, res.user);
      const avatarEl = document.getElementById("nav-user-avatar");
      const firstEl = document.getElementById("nav-user-firstname");
      const fullEl = document.getElementById("nav-profile-fullname");
      const emailEl = document.getElementById("nav-profile-email");

      if (avatarEl) avatarEl.textContent = StudyLabAPI.getInitials(res.user.name);
      if (firstEl) firstEl.textContent = res.user.name.split(" ")[0];
      if (fullEl) fullEl.textContent = res.user.name;
      if (emailEl) emailEl.textContent = res.user.email;
    }
  } catch {
    // 401 redirect already handled inside StudyLabAPI.request
  }
}

function setupNavbarInteractions() {
  const dropdowns = [
    { wrapper: "study-tools-dropdown", trigger: "study-tools-trigger" },
    { wrapper: "notif-dropdown", trigger: "notif-trigger" },
    { wrapper: "profile-dropdown", trigger: "profile-trigger" }
  ];

  dropdowns.forEach(({ wrapper, trigger }) => {
    const wrapEl = document.getElementById(wrapper);
    const trigEl = document.getElementById(trigger);
    if (!wrapEl || !trigEl) return;

    trigEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = wrapEl.classList.contains("open");
      document.querySelectorAll(".nav-dropdown.open").forEach(el => el.classList.remove("open"));
      if (!isOpen) wrapEl.classList.add("open");
    });
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".nav-dropdown")) {
      document.querySelectorAll(".nav-dropdown.open").forEach(el => el.classList.remove("open"));
    }
  });

  const mobileBtn = document.getElementById("mobile-menu-toggle");
  const mobileDrawer = document.getElementById("mobile-drawer");
  if (mobileBtn && mobileDrawer) {
    mobileBtn.addEventListener("click", () => {
      mobileDrawer.classList.toggle("open");
      const icon = mobileBtn.querySelector("i");
      icon.className = mobileDrawer.classList.contains("open") ? "fa-solid fa-xmark" : "fa-solid fa-bars";
    });
  }

  // Restore saved non-sensitive UI contrast preference
  const savedContrast = localStorage.getItem("ai_studylab_contrast_mode");
  const themeBtn = document.getElementById("theme-toggle-btn");
  if (savedContrast === "midnight") {
    document.body.classList.add("light-accent-mode");
    if (themeBtn) themeBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      document.body.classList.toggle("light-accent-mode");
      const isMidnight = document.body.classList.contains("light-accent-mode");
      localStorage.setItem("ai_studylab_contrast_mode", isMidnight ? "midnight" : "slate");
      themeBtn.innerHTML = isMidnight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
      StudyLabUI.showToast(isMidnight ? "Switched to Midnight Obsidian theme" : "Switched to Dark Slate theme", "info");
    });
  }

  const markReadBtn = document.getElementById("mark-notif-read");
  if (markReadBtn) {
    markReadBtn.addEventListener("click", () => {
      const dot = document.getElementById("notif-dot");
      if (dot) dot.style.display = "none";
      StudyLabUI.showToast("All notifications marked as read", "success");
    });
  }

  const handleSignOut = async () => {
    await StudyLabAPI.logout();
    StudyLabUI.showToast("Signed out successfully", "info");
    setTimeout(() => {
      window.location.href = "login.html";
    }, 300);
  };

  document.getElementById("nav-signout-btn")?.addEventListener("click", handleSignOut);
  document.getElementById("mobile-signout-btn")?.addEventListener("click", handleSignOut);

  const searchInput = document.getElementById("global-nav-search");
  const mobileSearch = document.getElementById("mobile-nav-search");
  [searchInput, mobileSearch].forEach(inp => {
    if (!inp) return;
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const query = inp.value.trim();
        if (window.location.pathname.includes("documents.html")) {
          const docSearch = document.getElementById("doc-search-input");
          if (docSearch) {
            docSearch.value = query;
            docSearch.dispatchEvent(new Event("input"));
          }
        } else {
          window.location.href = `documents.html?q=${encodeURIComponent(query)}`;
        }
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", renderNavbar);
