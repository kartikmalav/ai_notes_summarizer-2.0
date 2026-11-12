const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { AppError } = require("../middleware/errorMiddleware");
const { isValidEmail, isValidPassword } = require("../utils/validators");

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError("Server JWT_SECRET is not configured.", 500);
  }
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

/**
 * POST /api/auth/signup
 */
async function signup(req, res, next) {
  try {
    const { name, email, password, major } = req.body || {};

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return next(new AppError("Please provide your full name (at least 2 characters).", 400));
    }
    if (!isValidEmail(email)) {
      return next(new AppError("Please provide a valid email address.", 400));
    }
    if (!isValidPassword(password)) {
      return next(new AppError("Password must be at least 6 characters long.", 400));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existing.length > 0) {
      return next(new AppError("An account with this email already exists.", 409));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const cleanName = name.trim().slice(0, 120);
    const cleanMajor = typeof major === "string" && major.trim() ? major.trim().slice(0, 120) : "General Studies";

    const result = await db.query(
      "INSERT INTO users (name, email, password_hash, major) VALUES (?, ?, ?, ?)",
      [cleanName, normalizedEmail, passwordHash, cleanMajor]
    );

    const user = {
      id: result.insertId,
      name: cleanName,
      email: normalizedEmail,
      major: cleanMajor
    };

    const token = signToken(user);
    return res.status(201).json({
      success: true,
      message: "Account created successfully.",
      token,
      user
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!isValidEmail(email) || !password || typeof password !== "string") {
      return next(new AppError("Please provide both a valid email and password.", 400));
    }

    const normalizedEmail = email.trim().toLowerCase();
    const rows = await db.query(
      "SELECT id, name, email, password_hash, major, created_at FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return next(new AppError("Invalid email or password.", 401));
    }

    const userRow = rows[0];
    const isMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!isMatch) {
      return next(new AppError("Invalid email or password.", 401));
    }

    const user = {
      id: userRow.id,
      name: userRow.name,
      email: userRow.email,
      major: userRow.major,
      createdAt: userRow.created_at
    };

    const token = signToken(user);
    return res.json({
      success: true,
      message: "Signed in successfully.",
      token,
      user
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 */
async function getMe(req, res, next) {
  try {
    const rows = await db.query(
      "SELECT id, name, email, major, created_at, updated_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id]
    );

    if (rows.length === 0) {
      return next(new AppError("User account not found.", 404));
    }

    const [docStats] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM documents WHERE user_id = ?) AS totalDocuments,
        (SELECT COUNT(*) FROM notes WHERE user_id = ?) AS notesGenerated,
        (SELECT COUNT(*) FROM questions WHERE user_id = ?) AS questionsCreated,
        (SELECT COUNT(*) FROM mcqs WHERE user_id = ?) AS mcqsGenerated,
        (SELECT COUNT(*) FROM quiz_results WHERE user_id = ?) AS quizzesTaken,
        (SELECT ROUND(AVG(score_percentage), 0) FROM quiz_results WHERE user_id = ?) AS avgAccuracy`,
      [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]
    );

    const user = rows[0];
    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        major: user.major,
        createdAt: user.created_at
      },
      stats: {
        totalDocuments: Number(docStats?.totalDocuments || 0),
        notesGenerated: Number(docStats?.notesGenerated || 0),
        questionsCreated: Number(docStats?.questionsCreated || 0),
        mcqsGenerated: Number(docStats?.mcqsGenerated || 0),
        quizzesTaken: Number(docStats?.quizzesTaken || 0),
        accuracyRate: docStats?.avgAccuracy != null ? `${docStats.avgAccuracy}%` : "0%"
      }
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(_req, res) {
  return res.json({
    success: true,
    message: "Signed out successfully."
  });
}

module.exports = {
  signup,
  login,
  getMe,
  logout
};

