import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

let mediaRecorder = null;
let recordedChunks = [];
let drawInterval = null;
let isRecording = false;
let recordTimeout = null;

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
  const camSelect = document.getElementById("camName");
  const audioSelect = document.getElementById("audioName");

  if (data.status === "refresh_pending") {
    if (camSelect.options.length === 0)
      camSelect.innerHTML = "<option>⏳ Đang quét...</option>";
    setTimeout(() => sendCommand("GET_DEVICES"), 2000);
    return;
  }

  const currentCam = camSelect.value;
  camSelect.innerHTML = "";
  audioSelect.innerHTML = "<option value='none'>Mặc định (Client Mic)</option>";

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

export function recordVideo() {
  const btn = document.getElementById("btnVid");
  const imgView = document.getElementById("camStreamView");
  const canvas = document.getElementById("camRecorderCanvas");
  const stat = document.getElementById("vidStatus");

  if (!store.isCamStreamOn || !imgView.src) {
    alert("Vui lòng BẬT STREAM trước khi quay!");
    return;
  }

  // == TRUONG HOP 1: DANG QUAY -> BAM DE DUNG ==
  if (isRecording) {
    stopRecordingLogic();
    return;
  }

  // == TRUONG HOP 2: BAT DAU QUAY ==
  try {
    // 1. Chuan bi Canvas (Dung kich thuoc moi 640x480)
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    // 2. Setup MediaRecorder
    const stream = canvas.captureStream(25); // 25 FPS
    let mime = "video/webm;codecs=vp8";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";

    mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
    recordedChunks = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    // Khi dung quay -> Luu file
    mediaRecorder.onstop = () => saveRecordedFile();

    // 3. Bat dau vong lap ve anh
    drawInterval = setInterval(() => {
      if (imgView.complete && imgView.naturalHeight !== 0) {
        // Ve anh len canvas de recorder ghi lai
        ctx.drawImage(imgView, 0, 0, canvas.width, canvas.height);
      }
    }, 40);

    // 4. Khoi dong Recorder
    mediaRecorder.start();
    isRecording = true;

    // 5. Xu ly Che do (Timer vs Manual)
    const mode = document.querySelector('input[name="recMode"]:checked').value;

    btn.textContent = "⏹️ DỪNG QUAY NGAY";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");

    if (mode === "timer") {
      const seconds = parseInt(document.getElementById("vidDur").value) || 10;
      stat.innerText = `⏳ Đang quay ${seconds} giây...`;

      // Dat hen gio tu dong dung
      recordTimeout = setTimeout(() => {
        stopRecordingLogic();
      }, seconds * 1000);
    } else {
      stat.innerText = "🔴 Đang quay thủ công (Bấm nút để dừng)...";
    }
  } catch (e) {
    alert("Lỗi khởi tạo quay: " + e.message);
    isRecording = false;
  }
}

function stopRecordingLogic() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
  if (drawInterval) clearInterval(drawInterval);
  if (recordTimeout) clearTimeout(recordTimeout); // Xoa hen gio neu co

  isRecording = false;
  recordTimeout = null;

  // Reset UI
  const btn = document.getElementById("btnVid");
  btn.textContent = "🔴 BẮT ĐẦU QUAY";
  btn.classList.remove("btn-danger");
  btn.classList.add("btn-primary");
  document.getElementById("vidStatus").innerText =
    "✅ Đã lưu vào thư viện (Không tải xuống).";
}

function saveRecordedFile() {
  const blob = new Blob(recordedChunks, { type: "video/webm" });

  // 1. CHI LUU VAO DB, KHONG TAI XUONG
  if (store.db) {
    store.db
      .transaction(["videos"], "readwrite")
      .objectStore("videos")
      .add({ blob: blob, date: new Date() });

    // Tai lai thu vien ngay lap tuc
    loadVidGallery();
    logActionUI("Đã lưu video mới vào thư viện.", true);
  } else {
    alert("Lỗi DB: Không thể lưu video!");
  }
}

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
    } else document.getElementById("vidGallery").innerHTML = h || "Trống";
  };
}

export function clearVideos() {
  if (confirm("Xóa hết?")) {
    store.db
      .transaction(["videos"], "readwrite")
      .objectStore("videos")
      .clear().onsuccess = () => loadVidGallery();
  }
}

export function toggleCamStream(btn) {
  const streamView = document.getElementById("camStreamView");
  if (btn === null) {
    store.isCamStreamOn = false;
    streamView.src = "";
    if (isRecording) recordVideo(); // Stop rec
    return;
  }
  store.isCamStreamOn = !store.isCamStreamOn;

  if (store.isCamStreamOn) {
    const camName = document.getElementById("camName").value;
    if (!camName) {
      alert("Chưa chọn Cam");
      store.isCamStreamOn = false;
      return;
    }
    store.isScreenStreamOn = false;
    document.getElementById("screenStreamView").src = "";

    btn.textContent = "⏹️ Tắt Stream";
    btn.classList.add("btn-danger");
    sendCommand("START_STREAM_CAM", { cam: camName, audio: "" });
  } else {
    btn.textContent = "▶️ Bật Stream";
    btn.classList.remove("btn-danger");
    sendCommand("STOP_STREAM");
    if (isRecording) recordVideo(); // Stop rec
  }
}
