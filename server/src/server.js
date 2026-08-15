// src/server.js
// Entrypoint for the cloud print-kiosk backend (Step 1: uploads + queue).

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const uploadRoutes = require("./routes/upload");
const jobRoutes = require("./routes/jobs");
const qrRoutes = require("./routes/qr");
const { log } = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 4000;

// --- Middleware ---
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the future mobile upload page (Step 2) as static files
app.use(express.static(path.join(__dirname, "..", "..", "public")));

// --- Routes ---
app.use("/api", uploadRoutes);
app.use("/api", jobRoutes);
app.use("/", qrRoutes);

app.get("/api/health", (req, res) => {
  res.json({ success: true, status: "ok", uptime: process.uptime() });
});

// --- Fallback 404 handler for unknown API routes ---
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: "Not found" });
});

app.listen(PORT, () => {
  log(`Print kiosk server listening on http://localhost:${PORT}`);
});
