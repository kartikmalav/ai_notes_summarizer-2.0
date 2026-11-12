const express = require("express");
const mcqController = require("../controllers/mcqController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/generate/:documentId", mcqController.createMcqs);
router.post("/submit", mcqController.submitQuiz);
router.get("/results", mcqController.getQuizResults);
router.get("/:documentId", mcqController.getMcqsByDocument);

module.exports = router;

