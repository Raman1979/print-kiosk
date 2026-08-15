// src/routes/upload.js
// POST /api/upload
// Accepts a single PDF/image file plus print options from the customer's
// phone, saves it to the temp uploads/ folder, and writes a job row that
// the local print agent (Step 4) will later poll for.

const express = require("express");
const fs = require("fs");
const { upload } = require("../config/multerConfig");
const db = require("../db/db");
const { log, errorLog } = require("../utils/logger");

const router = express.Router();

router.post("/upload", (req, res) => {
  upload.single("document")(req, res, (err) => {
    if (err) {
      // Multer errors (bad type, too large, etc.) land here
      const isTypeError = err.message === "UNSUPPORTED_FILE_TYPE";
      const isSizeError = err.code === "LIMIT_FILE_SIZE";

      errorLog("Upload rejected:", err.message);

      return res.status(400).json({
        success: false,
        error: isTypeError
          ? "Only PDF, JPG, PNG, or WEBP files are allowed."
          : isSizeError
          ? "File is too large."
          : "Upload failed. Please try again.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file was uploaded.",
      });
    }

    // --- Validate print options coming from the form ---
    const color = req.body.color === "true" || req.body.color === "1" ? 1 : 0;
    let copies = parseInt(req.body.copies, 10);
    if (!Number.isInteger(copies) || copies < 1) copies = 1;
    if (copies > 50) copies = 50; // sane upper bound for a walk-in kiosk

    const jobId = req.generatedJobId; // set inside multerConfig's filename()

    try {
      db.insertJob({
        id: jobId,
        original_filename: req.file.originalname,
        stored_filename: req.file.filename,
        mime_type: req.file.mimetype,
        file_size_bytes: req.file.size,
        color,
        copies,
        status: "pending",
      });

      log(`Job queued: ${jobId} (${req.file.originalname}, ${copies}x, color=${!!color})`);

      return res.status(201).json({
        success: true,
        jobId,
        message: "Your document has been queued for printing.",
      });
    } catch (dbErr) {
      errorLog("Failed to save job to DB:", dbErr.message);

      // Clean up the orphaned file since the job record failed
      fs.unlink(req.file.path, () => {});

      return res.status(500).json({
        success: false,
        error: "Server error while queuing your print job.",
      });
    }
  });
});

module.exports = router;
