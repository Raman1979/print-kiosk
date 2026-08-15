// src/routes/qr.js
// GET /qr — a printable page showing a QR code that points at THIS
// server's own public URL. Works automatically wherever the app is
// deployed (Render, Railway, your own domain, etc.) because it reads
// the URL straight from the incoming request instead of a hardcoded value.

const express = require("express");
const QRCode = require("qrcode");

const router = express.Router();

router.get("/qr", async (req, res) => {
  // Render (and most PaaS hosts) sit behind a proxy, so the real
  // public protocol/host arrive via the x-forwarded-* headers.
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const kioskUrl = `${protocol}://${host}/`;

  try {
    const qrDataUrl = await QRCode.toDataURL(kioskUrl, {
      width: 480,
      margin: 2,
      color: { dark: "#1c2338", light: "#ffffff" },
    });

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Shop QR Code — Print &amp; Display</title>
<style>
  body {
    font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #eef0f4;
    color: #1c2338;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    margin: 0;
    padding: 24px;
    text-align: center;
  }
  .card {
    background: #fff;
    border-radius: 8px;
    padding: 32px;
    box-shadow: 0 12px 32px -12px rgba(28,35,56,0.28);
    max-width: 420px;
  }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { color: #565f7d; font-size: 14px; margin: 0 0 20px; }
  img { width: 100%; max-width: 320px; border: 1px solid #d6dae4; border-radius: 4px; }
  .url { margin-top: 16px; font-size: 12px; color: #565f7d; word-break: break-all; }
  @media print {
    body { background: #fff; }
    .card { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="card">
    <h1>Scan to print a document</h1>
    <p>Point your phone's camera at this code</p>
    <img src="${qrDataUrl}" alt="QR code linking to the print kiosk upload page">
    <p class="url">${kioskUrl}</p>
  </div>
</body>
</html>`);
  } catch (err) {
    res.status(500).send("Could not generate QR code.");
  }
});

module.exports = router;
