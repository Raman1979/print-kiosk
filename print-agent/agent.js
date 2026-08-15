// print-agent/agent.js
//
// Runs on the shop PC. Every few seconds it:
//   1. Asks the cloud server for pending print jobs
//   2. Downloads each job's file to a local temp folder
//   3. Routes it to the correct printer (color vs B&W) and sends it,
//      applying paper size + duplex when possible
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

// Two physical printers: one for B&W (typically the one that also
// supports duplex), one for color (often single-sided only). Set BOTH to
// the same name in .env if you only have one printer.
const PRINTER_NAME_BW = (process.env.PRINTER_NAME_BW || "").trim();
const PRINTER_NAME_COLOR = (process.env.PRINTER_NAME_COLOR || "").trim();

// Optional: path to SumatraPDF.exe (portable, no install needed). When
// present, PDF jobs get real paper-size + duplex control. Without it, PDFs
// still print (via the default PDF app's Print verb) but paper size and
// duplex requests are ignored — see README for the 2-minute setup.
const SUMATRA_PATH = (process.env.SUMATRA_PATH || path.join(__dirname, "tools", "SumatraPDF.exe")).trim();
const sumatraAvailable = fs.existsSync(SUMATRA_PATH);

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
if (!PRINTER_NAME_BW && !PRINTER_NAME_COLOR) {
  errorLog("Set at least one of PRINTER_NAME_BW / PRINTER_NAME_COLOR in .env.");
  process.exit(1);
}

const api = axios.create({
  baseURL: SERVER_URL,
  headers: { "x-api-key": AGENT_API_KEY },
  timeout: 30000,
});

// ---- Printer selection ----
function pickPrinterName(job) {
  if (job.color) {
    return PRINTER_NAME_COLOR || PRINTER_NAME_BW; // fall back if only one configured
  }
  return PRINTER_NAME_BW || PRINTER_NAME_COLOR;
}

// ---- Printing ----
function isImageFile(filePath) {
  return [".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"].includes(
    path.extname(filePath).toLowerCase()
  );
}
function isPdfFile(filePath) {
  return path.extname(filePath).toLowerCase() === ".pdf";
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// PDFs via SumatraPDF: gives us real paper-size + duplex control, and can
// print all copies in a single call via the "Nx" setting.
async function printPdfWithSumatra(filePath, printerName, job) {
  const psFile = filePath.replace(/"/g, '\\"');
  const psPrinter = printerName.replace(/"/g, '\\"');

  const settings = [];
  if (job.page_range) settings.push(job.page_range); // e.g. "1-3,5"
  settings.push(`paper=${job.paper_size || "A4"}`);
  settings.push(job.duplex ? "duplex" : "simplex");
  settings.push(`${job.copies}x`); // repeat count, handled natively by Sumatra

  const command = `"${SUMATRA_PATH}" -print-to "${psPrinter}" -print-settings "${settings.join(",")}" -silent "${psFile}"`;
  await execPromise(command);
}

// Fallback PDF printing when SumatraPDF isn't installed: uses the default
// PDF app's own Print verb. Works, but paper size / duplex are whatever
// that app/printer currently defaults to — not controllable per job.
async function printPdfFallback(filePath, printerName, copies) {
  const psFile = filePath.replace(/'/g, "''");
  const command = printerName
    ? `powershell -Command "Start-Process -FilePath '${psFile}' -Verb printto -ArgumentList '\\"${printerName.replace(/'/g, "''")}\\"'"`
    : `powershell -Command "Start-Process -FilePath '${psFile}' -Verb Print"`;

  for (let i = 0; i < copies; i++) {
    await execPromise(command);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

// Images: shimgvw.dll ships with every Windows 10/11 install and reliably
// exposes a silent "print this image" entry point (unlike the generic
// shell Print verb, which depends on whichever photo app is default).
// Paper size / duplex are not controllable through this route — images
// print at the printer's currently configured default page setup.
async function printImageWindows(filePath, printerName, copies) {
  const psFile = filePath.replace(/"/g, '\\"');
  const psPrinter = printerName.replace(/"/g, '\\"');
  const command = `rundll32.exe C:\\Windows\\System32\\shimgvw.dll,ImageView_PrintTo "${psFile}" "${psPrinter}"`;

  for (let i = 0; i < copies; i++) {
    await execPromise(command);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function printJobWindows(filePath, printerName, job) {
  if (isPdfFile(filePath)) {
    if (sumatraAvailable) {
      return printPdfWithSumatra(filePath, printerName, job);
    }
    log(`SumatraPDF not found at ${SUMATRA_PATH} — printing without paper-size/duplex control. See README to enable it.`);
    return printPdfFallback(filePath, printerName, job.copies);
  }

  if (isImageFile(filePath)) {
    if (job.duplex) {
      log(`Note: duplex was requested but isn't supported for image files — printing single-sided.`);
    }
    if (job.page_range) {
      log(`Note: a page range was requested but doesn't apply to a single image — printing the whole image.`);
    }
    return printImageWindows(filePath, printerName, job.copies);
  }

  throw new Error(`Unsupported file type: ${filePath}`);
}

async function printJobUnix(filePath, printerName, job) {
  // macOS / Linux via CUPS. lp supports duplex, paper size, and page
  // ranges through -o (page-ranges only applies to PDFs; CUPS ignores it
  // harmlessly for images).
  const options = [`-n`, `${job.copies}`];
  if (job.duplex) options.push(`-o`, `sides=two-sided-long-edge`);
  if (job.paper_size) options.push(`-o`, `media=${job.paper_size}`);
  if (job.page_range && isPdfFile(filePath)) options.push(`-o`, `page-ranges=${job.page_range}`);
  const printerFlag = printerName ? `-d "${printerName}"` : "";
  const command = `lp ${printerFlag} ${options.join(" ")} "${filePath}"`;
  return execPromise(command);
}

async function printJob(filePath, job) {
  const printerName = pickPrinterName(job);
  if (!printerName) {
    throw new Error("No printer configured for this job's color mode.");
  }

  const platform = os.platform();
  if (platform === "win32") {
    return printJobWindows(filePath, printerName, job);
  }
  if (platform === "darwin" || platform === "linux") {
    return printJobUnix(filePath, printerName, job);
  }
  throw new Error(`Unsupported platform: ${platform}`);
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
  const printerName = pickPrinterName(job);
  log(
    `Processing job ${job.id} — ${job.original_filename} ` +
      `(${job.copies}x, ${job.color ? "color" : "B&W"}, ${job.paper_size || "A4"}, ` +
      `${job.duplex ? "duplex" : "single-sided"}, pages=${job.page_range || "all"}) -> printer: ${printerName || "NONE CONFIGURED"}`
  );

  let localPath;
  try {
    localPath = await downloadJobFile(job);
  } catch (err) {
    errorLog(`Failed to download job ${job.id}:`, err.message);
    return; // leave it pending — will retry next poll
  }

  try {
    await printJob(localPath, job);
    log(`Printed job ${job.id}.`);
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

    // Process one at a time so we don't flood the printers with parallel jobs.
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
log(`B&W printer: ${PRINTER_NAME_BW || "(not set)"} | Color printer: ${PRINTER_NAME_COLOR || "(not set)"}`);
log(sumatraAvailable
  ? `SumatraPDF found — full paper size + duplex control enabled for PDFs.`
  : `SumatraPDF not found at ${SUMATRA_PATH} — PDF paper size/duplex won't be controllable. See README.`);

pollOnce();
setInterval(pollOnce, POLL_INTERVAL_MS);
