const express = require("express");
const examPrepController = require("../controllers/examPrepController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", examPrepController.getExamPrep);
router.get("/:documentId", examPrepController.getExamPrep);
router.post("/generate", examPrepController.generateExamPrep);
router.post("/:documentId/generate", examPrepController.generateExamPrep);

module.exports = router;

