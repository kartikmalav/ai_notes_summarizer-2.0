const express = require("express");
const summaryController = require("../controllers/summaryController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/:documentId", summaryController.createSummary);
router.get("/:documentId", summaryController.getSummary);

module.exports = router;

