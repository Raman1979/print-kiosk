// src/db/db.js
// Simple JSON-file based job store. Chosen over better-sqlite3 because
// better-sqlite3 requires a native C++ compiler (Visual Studio Build Tools
// on Windows) to install, which is a big ask for a simple shop kiosk queue.
// This is pure JavaScript — installs instantly on any machine, no compiler
// needed. Perfectly adequate for a single-shop print queue (low volume,
// no concurrent-write pressure). Swap for a real DB later if you ever need
// to scale to many shops/high concurrency.

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_FILE = path.join(DATA_DIR, "jobs.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, "[]", "utf8");
}

function readAll() {
  const raw = fs.readFileSync(DB_FILE, "utf8");
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

function writeAll(jobs) {
  // Write to a temp file then rename — avoids a half-written file if the
  // process crashes mid-write.
  const tmpFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(jobs, null, 2), "utf8");
  fs.renameSync(tmpFile, DB_FILE);
}

const db = {
  /** Insert a new job. Throws if a job with the same id already exists. */
  insertJob(job) {
    const jobs = readAll();
    if (jobs.some((j) => j.id === job.id)) {
      throw new Error(`Job ${job.id} already exists`);
    }
    jobs.push({
      ...job,
      status: job.status || "pending",
      created_at: new Date().toISOString(),
      printed_at: null,
    });
    writeAll(jobs);
    return job;
  },

  /** Get every job (used by admin/debug views). */
  getAllJobs() {
    return readAll();
  },

  /** Get only jobs the print agent still needs to fetch. */
  getPendingJobs() {
    return readAll().filter((j) => j.status === "pending");
  },

  /** Get a single job by id, or undefined if not found. */
  getJobById(id) {
    return readAll().find((j) => j.id === id);
  },

  /** Update fields on an existing job (e.g. status). */
  updateJob(id, updates) {
    const jobs = readAll();
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return null;
    jobs[idx] = { ...jobs[idx], ...updates };
    writeAll(jobs);
    return jobs[idx];
  },

  /** Remove a job record entirely (called after the agent deletes the file). */
  deleteJob(id) {
    const jobs = readAll();
    const next = jobs.filter((j) => j.id !== id);
    writeAll(next);
    return next.length !== jobs.length;
  },
};

module.exports = db;
