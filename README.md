# AI StudyLab

An educational AI workspace featuring a dark-mode SaaS dashboard (HTML5, CSS3, Vanilla JS) backed by a Node.js, Express.js, and MySQL REST API with real PDF text extraction, JWT authentication, and AI-powered study tools.

---

## Project Structure

```text
ai_notes_summarizer-2.0/
├── index.html                  # Landing page
├── login.html / signup.html    # Authentication pages
├── dashboard.html              # Student dashboard & stats
├── documents.html              # Document library table
├── upload.html                 # PDF upload & AI processing
├── results.html                # Executive summary, short notes, 2/5/10-mark questions
├── exam-prep.html              # Flashcards, syllabus checklist & sprint timer
├── mcq-practice.html           # Server-graded MCQ practice studio
├── chat.html                   # Ask Your Document AI tutor
├── css/                        # Shared dark-purple stylesheets
├── js/                         # Vanilla JS frontend modules (api.js, auth.js, etc.)
└── backend/
    ├── config/db.js            # MySQL connection pool & prepared statement helper
    ├── controllers/            # Auth, Document, Summary, Question, MCQ, Chat logic
    ├── middleware/             # JWT auth guard & centralized error handling
    ├── routes/                 # Express REST endpoints
    ├── services/
    │   ├── pdfService.js       # PDF validation, text extraction & OCR detection
    │   └── aiService.js        # Server-side Groq SDK AI integration
    ├── uploads/                # User-specific PDF storage
    ├── utils/validators.js     # Input, email, password & PDF signature checks
    ├── database.sql            # MySQL database & tables schema
    ├── .env.example            # Environment variables template
    ├── server.js               # Express entry point
    └── package.json
```

---

## Prerequisites

- **Node.js** v18+ (tested on v26.13.0)
- **MySQL Server** 8.0+ (or XAMPP / MariaDB)
- **AI API Key**: Groq API key (`GROQ_API_KEY`)

---

## 1. Database Setup (MySQL)

1. Ensure your MySQL server is running.
2. Execute `backend/database.sql` to create the `ai_studylab` database and all 8 tables (`users`, `documents`, `summaries`, `notes`, `questions`, `mcqs`, `chat_history`, `quiz_results`):

```bash
mysql -u root -p < backend/database.sql
```

*(Alternatively, import `backend/database.sql` in MySQL Workbench or phpMyAdmin.)*

---

## 2. Backend Configuration

1. Install dependencies:

```bash
cd backend
npm install
```

2. Configure `backend/.env` (a starter file is provided alongside `backend/.env.example`):

```env
PORT=5000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=ai_studylab

JWT_SECRET=replace_with_a_strong_random_secret_at_least_32_chars
JWT_EXPIRES_IN=7d

ALLOWED_ORIGINS=http://localhost:5000,http://127.0.0.1:5000

AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
AI_MAX_TOKENS=2048
```

---

## 3. Running the Application

Start the backend server (which also serves the frontend pages on the same origin):

```bash
cd backend
npm start
```

Open your browser to:
- **Landing Page:** `http://localhost:5000/`
- **Sign Up:** `http://localhost:5000/signup.html`
- **Dashboard:** `http://localhost:5000/dashboard.html`

---

## REST API Endpoints

### Health & AI Diagnostics
- `GET /api/health` — Checks server status, MySQL connectivity, and Groq config status
- `GET /api/ai/health` — Checks whether Groq configuration is present (without exposing API keys)
- `POST /api/ai/test` — Runs a small Groq chat completion test (development or JWT-protected)

### Authentication
- `POST /api/auth/signup` — Register a new user
- `POST /api/auth/login` — Authenticate and receive JWT
- `GET /api/auth/me` — Get current user profile and study statistics *(protected)*
- `POST /api/auth/logout` — Sign out *(protected)*

### Documents
- `POST /api/documents/upload` — Upload PDF (`multipart/form-data`, field `file`), validate `%PDF-` signature, extract text *(protected)*
- `GET /api/documents` — List user's uploaded PDFs with search/subject filtering *(protected)*
- `GET /api/documents/:id` — Get document metadata, summary, notes, and questions *(protected)*
- `DELETE /api/documents/:id` — Delete document file and DB records *(protected)*

### Summaries, Notes & Questions
- `POST /api/summaries/:documentId` — Generate & save AI summary, takeaways, and topics *(protected)*
- `GET /api/summaries/:documentId` — Retrieve saved summary *(protected)*
- `POST /api/questions/:documentId` — Generate & save short notes + 2/5/10-mark exam questions *(protected)*
- `GET /api/questions/:documentId` — Retrieve saved notes and questions *(protected)*

### MCQs & Server-Graded Quizzes
- `POST /api/mcqs/generate/:documentId` — Generate & save MCQs for a PDF *(protected)*
- `GET /api/mcqs/:documentId` — Fetch MCQs (`all` supported for mixed quiz) *(protected)*
- `POST /api/mcqs/submit` — Submit answers, grade on server, save & return results *(protected)*
- `GET /api/mcqs/results` — Retrieve past quiz attempts *(protected)*

### Document Chat
- `POST /api/chat/:documentId` — Ask a question grounded in extracted PDF text *(protected)*
- `GET /api/chat/:documentId` — Retrieve conversation history *(protected)*

