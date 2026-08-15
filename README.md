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
