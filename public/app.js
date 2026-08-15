// public/app.js
// Handles the mobile upload form: file selection, client-side checks,
// posting to POST /api/upload, and swapping between the four visual
// states (form / uploading / success / error).

(() => {
  const MAX_FILE_MB = 25;
  const ALLOWED_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const form = document.getElementById("uploadForm");
  const fileInput = document.getElementById("fileInput");
  const dropzone = document.getElementById("dropzone");
  const dropzoneText = document.getElementById("dropzoneText");
  const fileError = document.getElementById("fileError");
  const copiesInput = document.getElementById("copiesInput");
  const copiesUp = document.getElementById("copiesUp");
  const copiesDown = document.getElementById("copiesDown");
  const submitBtn = document.getElementById("submitBtn");
  const submitBtnText = document.getElementById("submitBtnText");
  const formError = document.getElementById("formError");

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

  // ---- File selection ----
  let selectedFile = null;

  fileInput.addEventListener("change", () => {
    fileError.textContent = "";
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

  // ---- Submit ----
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    if (!selectedFile) {
      fileError.textContent = "Please choose a file first.";
      return;
    }

    const color = form.querySelector('input[name="color"]:checked').value;
    const copies = clampCopies(copiesInput.value);

    const body = new FormData();
    body.append("document", selectedFile);
    body.append("color", color);
    body.append("copies", String(copies));

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
    showState("form");
  }

  document.getElementById("newJobBtn").addEventListener("click", resetForm);
  document.getElementById("retryBtn").addEventListener("click", () => {
    submitBtn.disabled = false;
    showState("form");
  });
})();
