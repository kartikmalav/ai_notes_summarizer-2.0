const express = require("express");
const chatController = require("../controllers/chatController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.post("/:documentId", chatController.sendMessage);
router.get("/:documentId", chatController.getChatHistory);

module.exports = router;

