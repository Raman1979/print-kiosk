// src/routes/jobs.js
// Endpoints the local print agent (running on the shop PC) calls to:
//   GET    /api/jobs/pending   -> list jobs waiting to be printed
//   GET    /api/jobs/:id/file  -> download the actual document
//   DELETE /api/jobs/:id       -> remove the job + file after printing
//
// All three require the agent's secret key in an "x-api-key" header so
// random internet traffic can't list or download customer documents.

const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("../db/db");
const { UPLOAD_DIR } = require("../config/multerConfig");
const { log, errorLog } = require("../utils/logger");

const router = express.Router();

function requireAgentKey(req, res, next) {
  const key = req.headers["x-api-key"];
  const expected = process.env.AGENT_API_KEY;

  if (!expected || key !== expected) {
    return res.status(401).json({ success: false, error: "Invalid or missing API key." });
  }
  next();
}

// List every job still waiting to be printed
router.get("/jobs/pending", requireAgentKey, (req, res) => {
  const jobs = db.getPendingJobs();
  res.json({ success: true, jobs });
});

// Download the raw file for a specific job
router.get("/jobs/:id/file", requireAgentKey, (req, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }

  const filePath = path.join(UPLOAD_DIR, job.stored_filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: "File missing on server." });
  }

  res.setHeader("Content-Type", job.mime_type);
  res.setHeader("Content-Disposition", `attachment; filename="${job.original_filename}"`);
  res.sendFile(filePath);
});

// Mark a job printed and remove both the file and the record (privacy)
router.delete("/jobs/:id", requireAgentKey, (req, res) => {
  const job = db.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }

  const filePath = path.join(UPLOAD_DIR, job.stored_filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      errorLog(`Failed to delete file for job ${job.id}:`, err.message);
    }
  });

  db.deleteJob(job.id);
  log(`Job ${job.id} printed and removed from server.`);

  res.json({ success: true, message: "Job deleted." });
});

module.exports = router;

