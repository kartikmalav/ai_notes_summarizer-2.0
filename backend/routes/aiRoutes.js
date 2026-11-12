const express = require("express");
const { getAiHealth, runHealthCompletionTest } = require("../services/aiService");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * Middleware: Allow in development mode for independent AI testing,
 * otherwise enforce JWT authentication in production.
 */
function devOrProtected(req, res, next) {
  if (process.env.NODE_ENV === "development") {
    return next();
  }
  return protect(req, res, next);
}

/**
 * GET /api/ai/health
 * Reports whether Groq configuration is present without exposing any secret keys.
 */
router.get("/health", (_req, res) => {
  const health = getAiHealth();
  const statusCode = health.configured ? 200 : 503;

  return res.status(statusCode).json({
    success: health.configured,
    provider: health.provider,
    model: health.model,
    maxTokens: health.maxTokens,
    configured: health.configured,
    message: health.configured
      ? "Groq AI configuration is present."
      : "GROQ_API_KEY is missing or not configured in backend/.env.",
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/ai/test
 * Makes a real small Groq chat completion request to verify live API connectivity.
 */
router.post("/test", devOrProtected, async (_req, res, next) => {
  try {
    const result = await runHealthCompletionTest();
    return res.json({
      success: true,
      message: "Groq chat completion test succeeded.",
      ...result
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

