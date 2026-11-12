const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const documentController = require("../controllers/documentController");
const { protect } = require("../middleware/authMiddleware");
const { AppError } = require("../middleware/errorMiddleware");

const router = express.Router();

const uploadsRoot = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const userFolder = path.join(uploadsRoot, `user_${req.user.id}`);
    fs.mkdirSync(userFolder, { recursive: true });
    cb(null, userFolder);
  },
  filename(_req, file, cb) {
    const uniqueId = crypto.randomUUID();
    const safeExt = path.extname(file.originalname).toLowerCase() === ".pdf" ? ".pdf" : ".pdf";
    cb(null, `${Date.now()}-${uniqueId}${safeExt}`);
  }
});

const maxMb = Number(process.env.MAX_FILE_SIZE_MB) || 20;

const upload = multer({
  storage,
  limits: {
    fileSize: maxMb * 1024 * 1024,
    files: 1
  },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedMimes = ["application/pdf", "application/x-pdf"];
    if (ext !== ".pdf" || !allowedMimes.includes(file.mimetype)) {
      return cb(new AppError("Only PDF (.pdf) documents are supported for upload.", 400));
    }
    return cb(null, true);
  }
});

router.use(protect);

router.post("/upload", upload.single("file"), documentController.uploadDocument);
router.get("/", documentController.getDocuments);
router.get("/:id", documentController.getDocumentById);
router.delete("/:id", documentController.deleteDocument);

module.exports = router;

