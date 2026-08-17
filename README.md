# Cloud Print Kiosk System

A QR-code driven, cloud-based print kiosk. Customers scan a QR code, upload a
document from their phone, choose print options, and a local agent on the
shop computer automatically fetches and prints the job, then deletes it.

## Architecture

```
[Customer Phone] --(scan QR)--> [Mobile Web Page] --(upload)--> [Cloud API]
                                                                      |
                                                                (job queue)
                                                                      |
                                                            [Local Print Agent]
                                                          (polls, downloads,
                                                           prints, deletes)
                                                                      |
                                                              [Shop Printer]
```

## Tech Stack (Step 1: Backend)

| Layer              | Choice                          | Why |
|--------------------|----------------------------------|-----|
| Backend runtime     | Node.js + Express                | Lightweight, huge ecosystem, easy file-upload handling, non-blocking I/O is ideal for a kiosk that's mostly I/O (uploads/downloads), simple to deploy on Render/Railway/Fly.io. |
| File uploads        | Multer                           | De-facto standard multipart/form-data handler for Express, streams to disk without loading whole file into memory. |
| Job metadata store  | SQLite (via `better-sqlite3`)    | Zero-config, file-based, no separate DB server to manage — perfect for a single-shop kiosk. Synchronous API keeps the code simple; easy to swap for Postgres later if you scale to multiple shops. |
| Frontend            | Plain HTML/CSS/JS (mobile-first) | No build step, loads instantly on phones over cellular data, no framework overhead needed for a 1-page upload form. |
| QR code generation  | `qrcode` npm package             | Generates the kiosk URL as a QR you print/display once. |
| Print agent         | Node.js script (same language as backend) | One language across the whole stack reduces context-switching; uses `axios` to poll/download and shells out to the OS print command. |
| Local printing      | `pdf-to-printer` (Windows) or `lp`/`lpr` via `child_process` (macOS/Linux) | Talks directly to OS print spooler — no need to manage printer drivers yourself. |
| Hosting             | Render / Railway / Fly.io (or a VPS) | Cheap always-on Node hosting with persistent disk or object storage for temp files. |
| File cleanup        | Agent calls a `DELETE /api/jobs/:id` endpoint after a successful print | Ensures no customer document lingers on the server — privacy by design. |

This document covers **Step 1: the backend upload/queue service**. Steps 2–4
(frontend upload page, job queue polling API, and the local print agent) plug
into this same server.

## Project Structure

```
print-kiosk/
├── server/                      # Cloud backend (Node.js + Express)
│   ├── src/
│   │   ├── server.js            # App entrypoint
│   │   ├── routes/
│   │   │   ├── upload.js        # POST /api/upload  (Step 1 - done)
│   │   │   └── jobs.js          # GET/DELETE job queue endpoints (Step 3)
│   │   ├── config/
│   │   │   └── multerConfig.js  # Multer storage/filter/limits config
│   │   ├── db/
│   │   │   └── db.js            # SQLite connection + schema init
│   │   └── utils/
│   │       └── logger.js        # Simple request/error logger
│   ├── uploads/                 # Temp storage for incoming files (gitignored)
│   ├── data/                    # SQLite database file lives here
│   ├── .env.example
│   ├── package.json
│   └── .gitignore
│
├── print-agent/                 # Runs on the shop's Windows/Mac/Linux PC
│   ├── agent.js                 # Polls server, downloads, prints, deletes (Step 4)
│   ├── package.json
│   └── .env.example
│
├── public/                      # Mobile-friendly upload page (Step 2)
│   ├── index.html
│   ├── style.css
│   └── app.js
│
└── README.md
```

## Preview and page selection

The upload page now shows a live preview before the customer submits:

- **PDFs** render an actual thumbnail of page 1 (via pdf.js, loaded from a
  CDN — no server-side work needed) and show the total page count. A
  "Pages to print" field lets the customer type a range like `1-3, 5`;
  leaving it blank prints everything. Input is validated against the
  actual page count before submission.
- **Images** show the photo itself as the thumbnail; there's no page
  range field since a single image has no pages to choose from.

The chosen range is passed straight to SumatraPDF's `-print-settings`
flag on the agent side, so `1-3,5` really does print only those pages
(PDFs only — page ranges don't apply to images and are ignored for them).

## One-click start + auto-restart (recommended)

Instead of typing `npm start` every morning, set up a desktop icon once:

1. In the `print-agent` folder, double-click **`Setup Desktop Icon.bat`**
   (if Windows shows a security prompt, click "Run anyway" / "Yes")
2. This creates a **"Start Print Agent"** shortcut with a printer icon in
   two places:
   - Your **Desktop** — double-click it any time to start the agent
   - Your **Startup folder** — the agent now launches automatically every
     time the shop PC turns on, no manual step needed

The agent itself now runs through `start-agent.bat`, which **automatically
restarts it 5 seconds after it stops** (e.g. if it crashes or you
accidentally hit Ctrl+C) — as long as you don't close the window itself.
Minimizing the window is fine; closing it (the X button) stops printing
for real, so leave it open/minimized whenever the shop is open.

## Two printers (color + B&W) and paper size / duplex control

If your shop has two printers — e.g. a B&W printer that also does
double-sided (duplex) printing, and a color printer that's single-sided
only — the agent routes each job automatically:

- Jobs marked **Color** → `PRINTER_NAME_COLOR`
- Everything else (B&W) → `PRINTER_NAME_BW`

Set both in `print-agent/.env`. If you only have one printer, set both
variables to the same name.

**Paper size and "print on both sides"** are customer-facing options in
the upload form. To make these actually take effect (not just be recorded),
download the free, portable **SumatraPDF.exe** and place it at
`print-agent/tools/SumatraPDF.exe` — see `print-agent/tools/README.txt`
for the exact link. Without it, PDFs still print fine, just using the
printer's current default paper size / sidedness instead of what the
customer picked.

The server also enforces this rule itself: even if someone tampers with
the upload request directly, "duplex" is silently forced off for any job
marked "color", since the color printer can't do double-sided.

## Running Step 1 locally

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Server starts on `http://localhost:4000`. Test the upload endpoint:

```bash
curl -F "document=@/path/to/test.pdf" \
     -F "color=false" \
     -F "copies=2" \
     http://localhost:4000/api/upload
```
