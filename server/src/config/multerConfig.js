// src/config/multerConfig.js
// Controls WHERE files land on disk, WHAT filenames they get, and WHICH
// file types/sizes are accepted before a single byte is queued for print.

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

// Make sure the temp upload folder exists on boot
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Prefix with a UUID so we never collide or leak the customer's
    // original filename into a predictable/public path.
    const ext = path.extname(file.originalname).toLowerCase();
    const jobId = uuidv4();
    req.generatedJobId = jobId; // stash for the route handler
    cb(null, `${jobId}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(new Error("UNSUPPORTED_FILE_TYPE"));
  }
  cb(null, true);
}

const maxSizeMb = Number(process.env.MAX_FILE_SIZE_MB || 25);

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxSizeMb * 1024 * 1024,
    files: 1,
  },
});

module.exports = { upload, UPLOAD_DIR, ALLOWED_MIME_TYPES };
