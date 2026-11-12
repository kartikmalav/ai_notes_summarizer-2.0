const express = require("express");
const examPrepController = require("../controllers/examPrepController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/:documentId", examPrepController.getExamPrep);
router.post("/:documentId/generate", examPrepController.generateExamPrep);

module.exports = router;

