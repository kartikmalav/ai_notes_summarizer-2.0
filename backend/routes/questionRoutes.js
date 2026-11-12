const express = require("express");
const questionController = require("../controllers/questionController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/:documentId", questionController.createNotesAndQuestions);
router.get("/:documentId", questionController.getNotesAndQuestions);

module.exports = router;

