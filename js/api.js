/**
 * AI StudyLab - Central REST API Client & Auth Session Manager
 */

const StudyLabAPI = {
  TOKEN_KEY: "ai_studylab_jwt_token",
  USER_KEY: "ai_studylab_user_profile",

  getBaseUrl() {
    const { protocol, hostname, port } = window.location;
    if (protocol === "file:") {
      return "http://localhost:5000/api";
    }
    if ((hostname === "localhost" || hostname === "127.0.0.1") && port !== "5000") {
      return "http://localhost:5000/api";
    }
    return "/api";
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  setSession(token, user) {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    }
    if (user) {
      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        major: user.major || "Student"
      };
      localStorage.setItem(this.USER_KEY, JSON.stringify(safeUser));
    }
  },

  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  getCachedUser() {
    try {
      const raw = localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  getInitials(name) {
    if (!name || typeof name !== "string") return "ST";
    return name
      .trim()
      .split(/\s+/)
      .map(p => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  },

  isTokenExpiredOrMalformed(token) {
    if (!token || typeof token !== "string") return true;
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    try {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      if (payload.exp && payload.exp * 1000 <= Date.now()) {
        return true;
      }
      return false;
    } catch {
      return true;
    }
  },

  requireAuth() {
    const token = this.getToken();
    if (!token || this.isTokenExpiredOrMalformed(token)) {
      this.clearSession();
      window.location.replace("login.html");
      return false;
    }
    return true;
  },

  async request(endpoint, options = {}) {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = { ...(options.headers || {}) };
    const token = this.getToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const isFormData = options.body instanceof FormData;
    if (!isFormData && options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers
      });
    } catch (networkErr) {
      throw new Error(
        "Cannot connect to AI StudyLab backend server. Ensure Node.js server is running on port 5000."
      );
    }

    const data = await response.json().catch(() => ({}));

    if (response.status === 401 && !endpoint.startsWith("/auth/login") && !endpoint.startsWith("/auth/signup")) {
      this.clearSession();
      const currentPage = (window.location.pathname.split("/").pop() || "").toLowerCase();
      if (currentPage !== "login.html" && currentPage !== "signup.html") {
        window.location.replace("login.html");
      }
      throw new Error(data.message || "Session expired. Please sign in again.");
    }

    if (!response.ok || data.success === false) {
      throw new Error(data.message || `Request failed with status ${response.status}`);
    }

    return data;
  },

  // Auth endpoints
  signup(payload) {
    return this.request("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  login(payload) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  async logout() {
    try {
      if (this.getToken()) {
        await this.request("/auth/logout", { method: "POST" });
      }
    } catch {
      // Proceed with local sign-out even if server unreachable
    } finally {
      this.clearSession();
    }
  },

  getMe() {
    return this.request("/auth/me");
  },

  // Documents endpoints
  uploadDocument(formData) {
    return this.request("/documents/upload", {
      method: "POST",
      body: formData
    });
  },

  getDocuments(params = {}) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.subject && params.subject !== "ALL") qs.set("subject", params.subject);
    const queryStr = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(`/documents${queryStr}`);
  },

  getDocument(id) {
    return this.request(`/documents/${encodeURIComponent(id)}`);
  },

  deleteDocument(id) {
    return this.request(`/documents/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });
  },

  // Summaries
  generateSummary(documentId) {
    return this.request(`/summaries/${encodeURIComponent(documentId)}`, {
      method: "POST"
    });
  },

  getSummary(documentId) {
    return this.request(`/summaries/${encodeURIComponent(documentId)}`);
  },

  // Notes & Questions
  generateNotesAndQuestions(documentId) {
    return this.request(`/questions/${encodeURIComponent(documentId)}`, {
      method: "POST"
    });
  },

  getNotesAndQuestions(documentId) {
    return this.request(`/questions/${encodeURIComponent(documentId)}`);
  },

  // Exam Preparation Pack
  getExamPrep(documentId) {
    return this.request(`/exam-prep/${encodeURIComponent(documentId)}`);
  },

  generateExamPrep(documentId, mode = "missing") {
    return this.request(`/exam-prep/${encodeURIComponent(documentId)}/generate`, {
      method: "POST",
      body: JSON.stringify({ mode })
    });
  },

  // MCQs
  generateMcqs(documentId, count = 6) {
    return this.request(`/mcqs/generate/${encodeURIComponent(documentId)}`, {
      method: "POST",
      body: JSON.stringify({ count })
    });
  },

  getMcqs(documentId = "all") {
    return this.request(`/mcqs/${encodeURIComponent(documentId)}`);
  },

  submitMcqQuiz(payload) {
    return this.request("/mcqs/submit", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },

  getMcqResults() {
    return this.request("/mcqs/results");
  },

  // Chat
  sendChatMessage(documentId, message) {
    return this.request(`/chat/${encodeURIComponent(documentId)}`, {
      method: "POST",
      body: JSON.stringify({ message })
    });
  },

  getChatHistory(documentId) {
    return this.request(`/chat/${encodeURIComponent(documentId)}`);
  }
};

