// public/app.js
// Handles the mobile upload form: file selection, preview, page-range
// selection, client-side checks, posting to POST /api/upload, and
// swapping between the four visual states (form / uploading / success / error).

(() => {
  const MAX_FILE_MB = 25;
  const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  const form = document.getElementById("uploadForm");
  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const dropzoneText = document.getElementById("dropzoneText");
  const fileError = document.getElementById("fileError");
  const copiesInput = document.getElementById("copiesInput");
  const copiesUp = document.getElementById("copiesUp");
  const copiesDown = document.getElementById("copiesDown");
  const paperSizeInput = document.getElementById("paperSizeInput");
  const duplexInput = document.getElementById("duplexInput");
  const duplexField = document.getElementById("duplexField");
  const submitBtn = document.getElementById("submitBtn");
  const formError = document.getElementById("formError");

  const previewBox = document.getElementById("previewBox");
  const previewImg = document.getElementById("previewImg");
  const previewCanvas = document.getElementById("previewCanvas");
  const previewMeta = document.getElementById("previewMeta");
  const pageRangeField = document.getElementById("pageRangeField");
  const pageRangeInput = document.getElementById("pageRangeInput");
  const pageRangeError = document.getElementById("pageRangeError");

  const states = {
    form: document.getElementById("uploadForm"),
    uploading: document.getElementById("uploadingState"),
    success: document.getElementById("successState"),
    error: document.getElementById("errorState"),
  };

  function showState(name) {
    Object.entries(states).forEach(([key, el]) => {
      el.hidden = key !== name;
    });
  }

  // ---- File selection state ----
  let selectedFile = null;
  let currentPdfPageCount = null; // null when the file isn't a PDF (or not yet parsed)

  function resetPreview() {
    previewBox.hidden = true;
    previewImg.hidden = false;
    previewImg.removeAttribute("src");
    previewCanvas.hidden = true;
    previewMeta.textContent = "—";
    pageRangeField.hidden = true;
    pageRangeInput.value = "";
    pageRangeError.textContent = "";
    currentPdfPageCount = null;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function showPdfPreview(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    currentPdfPageCount = pdf.numPages;

    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 100; // render a bit larger than the CSS box, then let CSS scale down crisply
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });

    previewCanvas.width = scaledViewport.width;
    previewCanvas.height = scaledViewport.height;
    const ctx = previewCanvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

    previewImg.hidden = true;
    previewCanvas.hidden = false;
    previewMeta.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"} · ${formatBytes(file.size)}`;
    previewBox.hidden = false;
    pageRangeField.hidden = false;
  }

  function showImagePreview(file) {
    const url = URL.createObjectURL(file);
    previewCanvas.hidden = true;
    previewImg.hidden = false;
    previewImg.src = url;
    previewMeta.textContent = formatBytes(file.size);
    previewBox.hidden = false;
    pageRangeField.hidden = true; // page ranges don't apply to a single image
  }

  fileInput.addEventListener("change", async () => {
    fileError.textContent = "";
    resetPreview();
    const file = fileInput.files[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      fileError.textContent = "Please choose a PDF, JPG, PNG, or WEBP file.";
      fileInput.value = "";
      selectedFile = null;
      dropzone.classList.remove("has-file");
      dropzoneText.textContent = "Tap to choose a PDF or photo";
      return;
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_FILE_MB) {
      fileError.textContent = `That file is ${sizeMb.toFixed(1)}MB — max is ${MAX_FILE_MB}MB.`;
      fileInput.value = "";
      selectedFile = null;
      dropzone.classList.remove("has-file");
      dropzoneText.textContent = "Tap to choose a PDF or photo";
      return;
    }

    selectedFile = file;
    dropzone.classList.add("has-file");
    dropzoneText.textContent = file.name;

    try {
      if (file.type === "application/pdf") {
        await showPdfPreview(file);
      } else {
        showImagePreview(file);
      }
    } catch (err) {
      // Preview is a nice-to-have; if rendering fails, don't block the upload.
      previewMeta.textContent = formatBytes(file.size);
      previewBox.hidden = false;
    }
  });

  // ---- Page range validation ----
  // Accepts things like "1-3, 5, 8" — empty means "all pages".
  function validatePageRange() {
    const raw = pageRangeInput.value.trim();
    pageRangeError.textContent = "";
    if (!raw) return { valid: true, value: "" };

    const cleaned = raw.replace(/\s+/g, "");
    if (!/^[0-9,-]+$/.test(cleaned)) {
      pageRangeError.textContent = "Use numbers, commas, and hyphens only, e.g. 1-3, 5.";
      return { valid: false };
    }

    const parts = cleaned.split(",").filter(Boolean);
    for (const part of parts) {
      const rangeMatch = part.match(/^(\d+)-(\d+)$/);
      const singleMatch = part.match(/^(\d+)$/);
      let pages = [];
      if (rangeMatch) {
        pages = [Number(rangeMatch[1]), Number(rangeMatch[2])];
      } else if (singleMatch) {
        pages = [Number(singleMatch[1])];
      } else {
        pageRangeError.textContent = `"${part}" isn't a valid page or range.`;
        return { valid: false };
      }
      for (const p of pages) {
        if (p < 1) {
          pageRangeError.textContent = "Page numbers start at 1.";
          return { valid: false };
        }
        if (currentPdfPageCount && p > currentPdfPageCount) {
          pageRangeError.textContent = `This document only has ${currentPdfPageCount} page${currentPdfPageCount === 1 ? "" : "s"}.`;
          return { valid: false };
        }
      }
      if (rangeMatch && Number(rangeMatch[1]) > Number(rangeMatch[2])) {
        pageRangeError.textContent = `"${part}" — the start page must come before the end page.`;
        return { valid: false };
      }
    }

    return { valid: true, value: cleaned };
  }

  pageRangeInput.addEventListener("input", () => {
    pageRangeError.textContent = "";
  });

  // ---- Copies stepper ----
  function clampCopies(val) {
    let n = parseInt(val, 10);
    if (!Number.isInteger(n) || n < 1) n = 1;
    if (n > 50) n = 50;
    return n;
  }

  copiesUp.addEventListener("click", () => {
    copiesInput.value = clampCopies(Number(copiesInput.value) + 1);
  });
  copiesDown.addEventListener("click", () => {
    copiesInput.value = clampCopies(Number(copiesInput.value) - 1);
  });
  copiesInput.addEventListener("blur", () => {
    copiesInput.value = clampCopies(copiesInput.value);
  });

  // ---- Duplex only makes sense for Black & White (the color printer is single-sided only) ----
  function syncDuplexAvailability() {
    const isColor = form.querySelector('input[name="color"]:checked').value === "true";
    if (isColor) {
      duplexInput.checked = false;
      duplexInput.disabled = true;
      duplexField.classList.add("field--disabled");
    } else {
      duplexInput.disabled = false;
      duplexField.classList.remove("field--disabled");
    }
  }
  form.querySelectorAll('input[name="color"]').forEach((el) => {
    el.addEventListener("change", syncDuplexAvailability);
  });
  syncDuplexAvailability();

  // ---- Submit ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    if (!selectedFile) {
      fileError.textContent = "Please choose a file first.";
      return;
    }

    const pageRangeCheck = validatePageRange();
    if (!pageRangeCheck.valid) {
      return; // error already shown next to the field
    }

    const color = form.querySelector('input[name="color"]:checked').value;
    const copies = clampCopies(copiesInput.value);
    const paperSize = paperSizeInput.value;
    const duplex = color === "false" && duplexInput.checked;
    const pageRange = pageRangeCheck.value;

    const body = new FormData();
    body.append("document", selectedFile);
    body.append("color", color);
    body.append("copies", String(copies));
    body.append("paperSize", paperSize);
    body.append("duplex", String(duplex));
    body.append("pageRange", pageRange);

    submitBtn.disabled = true;
    showState("uploading");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || !data.success) {
        const message = (data && data.error) || "Upload failed. Please try again.";
        document.getElementById("errorStateText").textContent = message;
        showState("error");
        submitBtn.disabled = false;
        return;
      }

      document.getElementById("receiptJobId").textContent = data.jobId;
      document.getElementById("receiptFile").textContent = selectedFile.name;
      document.getElementById("receiptFinish").textContent =
        color === "true" ? "Color" : "Black & White";
      document.getElementById("receiptCopies").textContent = String(copies);
      document.getElementById("receiptPaper").textContent = paperSize;
      document.getElementById("receiptDuplex").textContent = duplex ? "Both sides" : "Single side";
      document.getElementById("receiptPages").textContent = pageRange ? pageRange : "All pages";

      showState("success");
    } catch (err) {
      document.getElementById("errorStateText").textContent =
        "Couldn't reach the server. Check your connection and try again.";
      showState("error");
      submitBtn.disabled = false;
    }
  });

  // ---- Reset flows ----
  function resetForm() {
    form.reset();
    selectedFile = null;
    dropzone.classList.remove("has-file");
    dropzoneText.textContent = "Tap to choose a PDF or photo";
    fileError.textContent = "";
    formError.textContent = "";
    submitBtn.disabled = false;
    resetPreview();
    syncDuplexAvailability();
    showState("form");
  }

  document.getElementById("newJobBtn").addEventListener("click", resetForm);
  document.getElementById("retryBtn").addEventListener("click", () => {
    submitBtn.disabled = false;
    showState("form");
  });
})();
