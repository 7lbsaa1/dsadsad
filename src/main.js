import "./style.css";
import removeBackground from "@imgly/background-removal";

const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput");
const uploadPanel = $("uploadPanel");
const editor = $("editor");
const originalPreview = $("originalPreview");
const resultPreview = $("resultPreview");
const processBtn = $("processBtn");
const downloadBtn = $("downloadBtn");
const progressWrap = $("progressWrap");
const progressBar = $("progressBar");
const progressText = $("progressText");
const progressPercent = $("progressPercent");
const toast = $("toast");

let currentFile = null;
let originalUrl = null;
let resultUrl = null;
let resultBlob = null;
let busy = false;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function setProgress(percent, message) {
  const value = Math.max(0, Math.min(100, percent));
  progressBar.style.width = `${value}%`;
  progressPercent.textContent = `${Math.round(value)}%`;
  progressText.textContent = message;
}
function setBusy(value) {
  busy = value;
  processBtn.disabled = value;
  $("chooseBtn").disabled = value;
  $("changePhoto").disabled = value;
  processBtn.innerHTML = value ? "<span>◌</span> جاري المعالجة..." : "<span>✦</span> إزالة الخلفية وتحسين الصورة";
}
function loadFile(file) {
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("من فضلك اختر صورة JPG أو PNG أو WEBP.");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showToast("حجم الصورة أكبر من 15 ميجابايت.");
    return;
  }
  currentFile = file;
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  originalUrl = URL.createObjectURL(file);
  originalPreview.src = originalUrl;
  resultPreview.classList.add("hidden");
  $("resultStage").querySelector(".empty-result").classList.remove("hidden");
  editor.classList.remove("hidden");
  uploadPanel.classList.add("hidden");
  downloadBtn.disabled = true;
  resultBlob = null;
  progressWrap.classList.add("hidden");
  showToast("تم تحميل الصورة. اضغط على زر المعالجة.");
}
$("chooseBtn").addEventListener("click", () => fileInput.click());
$("changePhoto").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => loadFile(e.target.files?.[0]));
["dragenter", "dragover"].forEach(type => uploadPanel.addEventListener(type, e => {
  e.preventDefault(); uploadPanel.classList.add("dragover");
}));
["dragleave", "drop"].forEach(type => uploadPanel.addEventListener(type, e => {
  e.preventDefault(); uploadPanel.classList.remove("dragover");
}));
uploadPanel.addEventListener("drop", e => loadFile(e.dataTransfer.files?.[0]));

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.96) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر تصدير الصورة")), type, quality));
}
function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذر قراءة الصورة الناتجة")); };
    img.src = url;
  });
}
function getOutputSize(sourceWidth, sourceHeight) {
  const mode = $("format").value;
  if (mode === "original") {
    const scale = Math.min(1, 2400 / Math.max(sourceWidth, sourceHeight));
    return [Math.round(sourceWidth * scale), Math.round(sourceHeight * scale)];
  }
  const ratios = {
    portrait: [3, 4, 1200, 1600],
    square: [1, 1, 1400, 1400],
    passport: [2, 3, 1200, 1800]
  };
  const [rw, rh, width, height] = ratios[mode];
  return [width, height];
}
async function composeWhiteBackground(foregroundBlob) {
  const img = await loadImage(foregroundBlob);
  const [width, height] = getOutputSize(img.naturalWidth, img.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // احتواء الشخص بالكامل داخل الإطار دون قص الوجه أو الجسم.
  const padding = Math.round(Math.min(width, height) * 0.045);
  const scale = Math.min((width - padding * 2) / img.naturalWidth, (height - padding * 2) / img.naturalHeight);
  const drawWidth = img.naturalWidth * scale;
  const drawHeight = img.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;

  const brightness = Number($("brightness").value);
  const contrast = Number($("contrast").value);
  ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
  ctx.drawImage(img, x, y, drawWidth, drawHeight);
  ctx.filter = "none";
  return canvasToBlob(canvas, "image/jpeg", 0.96);
}

processBtn.addEventListener("click", async () => {
  if (!currentFile || busy) return;
  setBusy(true);
  progressWrap.classList.remove("hidden");
  setProgress(3, "جاري تهيئة محرك الذكاء الاصطناعي...");
  try {
    // يتم تشغيل نموذج إزالة الخلفية داخل المتصفح.
    const foreground = await removeBackground(currentFile, {
      output: { format: "image/png", quality: 1, type: "foreground" },
      progress: (key, current, total) => {
        if (total > 0) {
          const pct = 8 + (current / total) * 72;
          setProgress(pct, "جاري تحميل نموذج المعالجة...");
        }
      }
    });
    setProgress(84, "تم عزل الشخص. جاري تجهيز الخلفية البيضاء...");
    resultBlob = await composeWhiteBackground(foreground);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(resultBlob);
    resultPreview.src = resultUrl;
    resultPreview.classList.remove("hidden");
    $("resultStage").querySelector(".empty-result").classList.add("hidden");
    downloadBtn.disabled = false;
    setProgress(100, "اكتملت الصورة بنجاح.");
    showToast("تم تجهيز صورتك بنجاح.");
  } catch (error) {
    console.error(error);
    showToast("حدثت مشكلة أثناء المعالجة. جرّب صورة أخرى أو متصفحاً أحدث.");
    setProgress(0, "تعذرت المعالجة.");
  } finally {
    setBusy(false);
  }
});

downloadBtn.addEventListener("click", () => {
  if (!resultBlob) return;
  const link = document.createElement("a");
  link.href = resultUrl;
  link.download = `white-studio-${Date.now()}.jpg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});
["brightness", "contrast"].forEach(id => $(id).addEventListener("input", e => {
  $(id + "Value").textContent = `${e.target.value}%`;
  // لا نعيد المعالجة تلقائياً؛ اضغط زر المعالجة لتطبيق القيم الجديدة.
}));
window.addEventListener("beforeunload", () => {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
});
