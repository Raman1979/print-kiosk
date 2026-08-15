// print-agent/agent.js
//
// Runs on the shop PC. Every few seconds it:
//   1. Asks the cloud server for pending print jobs
//   2. Downloads each job's file to a local temp folder
//   3. Sends it to the local printer (repeated for the requested copies)
//   4. Tells the server to delete the job (file + record) once printed
//
// Keep this window open and running whenever the shop is open — as long
// as it's polling, the free cloud server also stays awake (see README).

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const axios = require("axios");

const SERVER_URL = (process.env.SERVER_URL || "").replace(/\/+$/, "");
const AGENT_API_KEY = process.env.AGENT_API_KEY;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_SECONDS || 5) * 1000;
const PRINTER_NAME = (process.env.PRINTER_NAME || "").trim();

const TEMP_DIR = path.join(__dirname, "temp");
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}
function errorLog(...args) {
  console.error(`[${new Date().toISOString()}] ERROR:`, ...args);
}

// ---- Startup checks ----
if (!SERVER_URL) {
  errorLog("SERVER_URL is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (!AGENT_API_KEY) {
  errorLog("AGENT_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const api = axios.create({
  baseURL: SERVER_URL,
  headers: { "x-api-key": AGENT_API_KEY },
  timeout: 30000,
});

// ---- Printing ----
// Fires one print via the OS's own "print" file association. This avoids
// needing any native Node modules (which require a C++ compiler to
// install on Windows) — it just asks Windows/macOS/Linux to do what
// right-click -> Print already does for that file type.
function printOnce(filePath) {
  return new Promise((resolve, reject) => {
    const platform = os.platform();
    let command;

    if (platform === "win32") {
      const psFile = filePath.replace(/'/g, "''");
      if (PRINTER_NAME) {
        const psPrinter = PRINTER_NAME.replace(/'/g, "''");
        command = `powershell -Command "Start-Process -FilePath '${psFile}' -Verb printto -ArgumentList '\\"${psPrinter}\\"' -Wait"`;
      } else {
        command = `powershell -Command "Start-Process -FilePath '${psFile}' -Verb Print -Wait"`;
      }
    } else if (platform === "darwin" || platform === "linux") {
      // Requires CUPS ('lp' command), which ships by default on macOS
      // and most Linux desktop distros.
      command = PRINTER_NAME
        ? `lp -d "${PRINTER_NAME}" "${filePath}"`
        : `lp "${filePath}"`;
    } else {
      return reject(new Error(`Unsupported platform: ${platform}`));
    }

    exec(command, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function printCopies(filePath, copies) {
  for (let i = 0; i < copies; i++) {
    await printOnce(filePath);
    // Small gap so the print spooler / default app doesn't choke on
    // back-to-back "open and print" calls.
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// ---- Job processing ----
async function downloadJobFile(job) {
  const ext = path.extname(job.original_filename) || guessExt(job.mime_type);
  const localPath = path.join(TEMP_DIR, `${job.id}${ext}`);

  const response = await api.get(`/api/jobs/${job.id}/file`, {
    responseType: "arraybuffer",
  });
  fs.writeFileSync(localPath, response.data);
  return localPath;
}

function guessExt(mime) {
  const map = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return map[mime] || "";
}

async function deleteJobOnServer(jobId) {
  await api.delete(`/api/jobs/${jobId}`);
}

async function processJob(job) {
  log(`Processing job ${job.id} — ${job.original_filename} (${job.copies}x, ${job.color ? "color" : "B&W"})`);

  let localPath;
  try {
    localPath = await downloadJobFile(job);
  } catch (err) {
    errorLog(`Failed to download job ${job.id}:`, err.message);
    return; // leave it pending — will retry next poll
  }

  try {
    await printCopies(localPath, job.copies);
    log(`Printed job ${job.id} (${job.copies} copies).`);
  } catch (err) {
    errorLog(`Failed to print job ${job.id}:`, err.message);
    // Still fall through to cleanup below so a bad file doesn't jam the
    // queue forever — remove this "return" if you'd rather retry instead.
  }

  try {
    await deleteJobOnServer(job.id);
  } catch (err) {
    errorLog(`Failed to delete job ${job.id} on server:`, err.message);
  }

  fs.unlink(localPath, () => {}); // clean up local temp copy either way
}

// ---- Poll loop ----
let isPolling = false;

async function pollOnce() {
  if (isPolling) return; // don't overlap if a previous cycle is still running
  isPolling = true;

  try {
    const { data } = await api.get("/api/jobs/pending");
    const jobs = (data && data.jobs) || [];

    if (jobs.length > 0) {
      log(`Found ${jobs.length} pending job(s).`);
    }

    // Process one at a time so we don't flood the printer with parallel jobs.
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (err) {
    if (err.response && err.response.status === 401) {
      errorLog("Server rejected the API key — check AGENT_API_KEY matches Render's Environment tab.");
    } else {
      errorLog("Poll failed:", err.message);
    }
  } finally {
    isPolling = false;
  }
}

log(`Print agent starting. Server: ${SERVER_URL} | Poll every ${POLL_INTERVAL_MS / 1000}s`);
if (PRINTER_NAME) {
  log(`Using printer: ${PRINTER_NAME}`);
} else {
  log("Using the Windows default printer (set PRINTER_NAME in .env to choose a specific one).");
}

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
