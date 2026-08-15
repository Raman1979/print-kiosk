// src/routes/jobs.js
// Placeholder for Step 3: endpoints the local print agent will call to
// list pending jobs, download a file, and delete it after printing.
// e.g. GET /api/jobs/pending, GET /api/jobs/:id/file, DELETE /api/jobs/:id
//
// Intentionally left minimal for now so Step 1 stays focused on uploads.

const express = require("express");
const router = express.Router();

router.get("/jobs/health", (req, res) => {
  res.json({ success: true, message: "Job queue routes coming in Step 3." });
});

module.exports = router;
