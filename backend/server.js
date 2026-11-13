require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const db = require("./config/db");
const { getAiHealth } = require("./services/aiService");
const { notFoundHandler, errorHandler } = require("./middleware/errorMiddleware");

const aiRoutes = require("./routes/aiRoutes");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const summaryRoutes = require("./routes/summaryRoutes");
const questionRoutes = require("./routes/questionRoutes");
const mcqRoutes = require("./routes/mcqRoutes");
const chatRoutes = require("./routes/chatRoutes");
const examPrepRoutes = require("./routes/examPrepRoutes");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Security headers with strict Content-Security-Policy (blocks phishing iframes, unauthorized scripts & form hijacking)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "https://fonts.gstatic.com",
          "data:"
        ],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    xssFilter: true,
    frameguard: { action: "deny" }
  })
);

// Strict CORS configuration
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5000,http://127.0.0.1:5000")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy: Origin not allowed"));
    },
    credentials: true
  })
);

// Request body limits
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many authentication attempts. Please try again later." }
});

app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);

// Health Check Endpoint
app.get("/api/health", async (_req, res) => {
  const aiHealth = getAiHealth();
  try {
    await db.testConnection();
    return res.json({
      success: true,
      status: "healthy",
      database: "connected",
      aiProvider: aiHealth.provider,
      aiModel: aiHealth.model,
      aiConfigured: aiHealth.configured,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      success: false,
      status: "degraded",
      database: "disconnected",
      aiProvider: aiHealth.provider,
      aiModel: aiHealth.model,
      aiConfigured: aiHealth.configured,
      message: "MySQL connection failed. Check backend/.env and ensure MySQL is running.",
      timestamp: new Date().toISOString()
    });
  }
});

// Mount API Routes
app.use("/api/ai", aiRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/summaries", summaryRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/mcqs", mcqRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/exam-prep", examPrepRoutes);

// Protect backend directory and hidden files from static serving
app.use((req, res, next) => {
  const reqPath = req.path.toLowerCase();
  if (reqPath.startsWith("/backend") || reqPath.includes("/.")) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  return next();
});

// Serve the public product landing page at root (prevents deceptive forced-redirect phishing flags)
const frontendRoot = path.join(__dirname, "..");
app.get(["/", "/index.html"], (_req, res) => {
  return res.sendFile(path.join(frontendRoot, "index.html"));
});

// Serve existing frontend files directly for seamless local running
app.use("/css", express.static(path.join(frontendRoot, "css")));
app.use("/js", express.static(path.join(frontendRoot, "js")));
app.use(
  express.static(frontendRoot, {
    index: false,
    extensions: ["html"]
  })
);

// 404 & Error Handlers for API routes
app.use("/api", notFoundHandler);
app.use(errorHandler);

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`AI StudyLab server running on http://localhost:${PORT}`);
    db.testConnection()
      .then(async () => {
        console.log("MySQL connection verified successfully.");
        try {
          await db.initDatabase();
          console.log("Database schema verified (all required tables exist).");
        } catch (schemaErr) {
          console.warn("Warning: Database auto-initialization error ->", schemaErr.message);
        }
      })
      .catch(err => console.warn("Warning: MySQL not connected yet ->", err.message));
  });

  server.on("error", err => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `Error: Port ${PORT} is already in use (EADDRINUSE). Another server instance may already be running.\n` +
          `To inspect the owning process on Windows PowerShell, run:\n` +
          `  Get-NetTCPConnection -LocalPort ${PORT} -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess\n` +
          `Stop the existing process (if it is an old AI StudyLab server) or adjust PORT in backend/.env, then retry.`
      );
      process.exit(1);
    }
    console.error("Failed to start AI StudyLab server:", err.message);
    process.exit(1);
  });
}

module.exports = app;

