// modules/tab-cam.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

// --- BIEN CUC BO ---
let mediaRecorder = null;
let recordedChunks = [];
let drawInterval = null;
let isRecording = false;
let recordTimeout = null;

// --- HAM CHUYEN DOI GIAO DIEN ---
window.toggleRecMode = function () {
  const mode = document.querySelector('input[name="recMode"]:checked').value;
  const timerRow = document.getElementById("timerInputRow");
  if (mode === "timer") {
    timerRow.style.display = "flex";
  } else {
    timerRow.style.display = "none";
  }
};

export function handleDevicesData(data) {
  // (Logic giu nguyen)
  const camSelect = document.getElementById("camName");
  const audioSelect = document.getElementById("audioName");

  if (data.status === "refresh_pending" || data.status === "refresh_busy") {
    if (camSelect && camSelect.options.length === 0) {
      camSelect.innerHTML = "<option>⏳ Đang quét...</option>";
    }
    setTimeout(() => sendCommand("GET_DEVICES"), 2000);
    return;
  }

  const currentCam = camSelect.value;
  camSelect.innerHTML = "";
  audioSelect.innerHTML = "<option value='none'>Mặc định (Client)</option>";

  if (data.video && data.video.length > 0) {
    data.video.forEach((cam) => {
      const opt = document.createElement("option");
      opt.value = cam;
      opt.textContent = cam;
      if (cam.toLowerCase().includes("usb")) opt.selected = true;
      camSelect.appendChild(opt);
    });
    if (currentCam) camSelect.value = currentCam;
  } else {
    camSelect.innerHTML = "<option value=''>Không tìm thấy camera</option>";
  }

  if (data.status === "not_ready") loadDevices(true);
}

export function loadDevices(force = false) {
  if (force) sendCommand("REFRESH_DEVICES");
  else sendCommand("GET_DEVICES");
}

// --- LOGIC RECORD CLIENT-SIDE ---
export function recordVideo() {
  const btnVid = document.getElementById("btnVid");
  const btnStream = document.getElementById("btnToggleCamStream"); // Nut bat stream
  const imgView = document.getElementById("camStreamView");
  const canvas = document.getElementById("camRecorderCanvas");
  const stat = document.getElementById("vidStatus");

  if (!store.isCamStreamOn || !imgView.src) {
    alert("Vui lòng BẬT STREAM trước khi quay!");
    return;
  }

  // == DUNG QUAY ==
  if (isRecording) {
    stopRecordingLogic();
    return;
  }

  // == BAT DAU QUAY ==
  try {
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream(25);

    let mime = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";

    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => saveRecordedFile();

    drawInterval = setInterval(() => {
      if (imgView.complete && imgView.naturalHeight !== 0) {
        ctx.drawImage(imgView, 0, 0, canvas.width, canvas.height);
      }
    }, 40);

    mediaRecorder.start();
    isRecording = true;

    // YEU CAU 1: KHOA NUT TAT STREAM KHI DANG QUAY
    if (btnStream) btnStream.disabled = true;

    // Update UI
    const mode = document.querySelector('input[name="recMode"]:checked').value;
    btnVid.textContent = "⏹️ DỪNG QUAY NGAY";
    btnVid.classList.add("btn-danger");
    btnVid.classList.remove("btn-primary");

    if (mode === "timer") {
      const seconds = parseInt(document.getElementById("vidDur").value) || 10;
      stat.innerText = `⏳ Đang quay ${seconds} giây...`;
      recordTimeout = setTimeout(() => {
        stopRecordingLogic();
      }, seconds * 1000);
    } else {
      stat.innerText = "🔴 Đang quay thủ công...";
    }
  } catch (e) {
    alert("Lỗi khởi tạo quay: " + e.message);
    isRecording = false;
    if (btnStream) btnStream.disabled = false;
  }
}

function stopRecordingLogic() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (drawInterval) clearInterval(drawInterval);
  if (recordTimeout) clearTimeout(recordTimeout);

  isRecording = false;
  recordTimeout = null;

  // KHOI PHUC NUT STREAM
  const btnStream = document.getElementById("btnToggleCamStream");
  if (btnStream) btnStream.disabled = false;

  // Reset UI
  const btnVid = document.getElementById("btnVid");
  btnVid.textContent = "🔴 BẮT ĐẦU QUAY";
  btnVid.classList.remove("btn-danger");
  btnVid.classList.add("btn-primary");
  document.getElementById("vidStatus").innerText =
    "✅ Đã lưu vào thư viện (Không tải xuống).";
}

function saveRecordedFile() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });
  if (store.db) {
    store.db
      .transaction(["videos"], "readwrite")
      .objectStore("videos")
      .add({ blob: blob, date: new Date() });
    loadVidGallery();
    logActionUI("Đã lưu video mới vào thư viện.", true);
  }
}

// Helper (Khong dung)
export function handleRecordVideoData(data) {}

export function loadVidGallery() {
  if (!store.db) return;
  let h = "";
  store.db
    .transaction(["videos"], "readonly")
    .objectStore("videos")
    .openCursor(null, "prev").onsuccess = (e) => {
    let c = e.target.result;
    if (c) {
      let u = URL.createObjectURL(c.value.blob);
      h += `<div class="gallery-item video-item"><video src="${u}" controls style="width:100%;height:80px"></video></div>`;
      c.continue();
    } else
      document.getElementById("vidGallery").innerHTML =
        h || "<small>Trống</small>";
  };
}

export function clearVideos() {
  if (confirm("Xóa hết video?")) {
    if (!store.db) return;
    store.db
      .transaction(["videos"], "readwrite")
      .objectStore("videos")
      .clear().onsuccess = () => {
      loadVidGallery();
      logActionUI("Đã xóa thư viện video", true);
    };
  }
}

export function toggleCamStream(btn) {
  const streamView = document.getElementById("camStreamView");
  const streamStatus = document.getElementById("camStreamStatus");

  // --- TRUONG HOP TAT STREAM ---
  if (btn === null) {
    store.isCamStreamOn = false;

    // YEU CAU 2: XOA ANH CU (DE HIEN MAN HINH DEN)
    streamView.removeAttribute("src"); // Xoa han attribute src
    streamView.src = ""; // Dam bao rong

    // Reset Nut Bam
    const activeBtn = document.getElementById("btnToggleCamStream");
    if (activeBtn) {
      activeBtn.textContent = "▶️ Bật Stream";
      activeBtn.classList.remove("btn-danger");
      activeBtn.classList.add("btn-primary");
      activeBtn.disabled = false; // Dam bao enable lai
    }
    streamStatus.textContent = "";

    // Neu dang quay thi dung quay
    if (isRecording) stopRecordingLogic();
    return;
  }

  // --- LOGIC BAT/TAT KHI BAM NUT ---
  store.isCamStreamOn = !store.isCamStreamOn;

  if (store.isCamStreamOn) {
    // YEU CAU 3: NGAT STREAM MAN HINH (NEU DANG CHAY)
    if (store.isScreenStreamOn) {
      // Goi ham tat stream man hinh thong qua global window (do app.js gan vao)
      if (window.toggleScreenStream) window.toggleScreenStream(null);
    }

    const camName = document.getElementById("camName").value;
    if (!camName) {
      alert("Chưa chọn Camera");
      store.isCamStreamOn = false;
      return;
    }

    // Reset view truoc khi bat
    streamView.src = "";

    btn.textContent = "⏹️ Tắt Stream";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    streamStatus.textContent = "⏳ Đang kết nối...";

    sendCommand("START_STREAM_CAM", { cam: camName, audio: "" });
  } else {
    // Tat thu cong bang nut
    btn.textContent = "▶️ Bật Stream";
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-primary");
    streamStatus.textContent = "";

    // Xoa anh
    streamView.removeAttribute("src");
    streamView.src = "";

    sendCommand("STOP_STREAM");
    if (isRecording) stopRecordingLogic();
  }
}
