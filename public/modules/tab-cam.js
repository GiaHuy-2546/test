// modules/tab-cam.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";
import { initAudio, getAudioStream, resumeAudio } from "./audio.js";

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

  if (data.status === "refresh_pending" || data.status === "refresh_busy") {
    if (camSelect && camSelect.options.length === 0) {
      camSelect.innerHTML = "<option>⏳ Đang quét...</option>";
    }
    setTimeout(() => sendCommand("GET_DEVICES"), 2000);
    return;
  }

  const currentCam = camSelect.value;
  camSelect.innerHTML = "";
  if (audioSelect)
    audioSelect.innerHTML = "<option value='mic'>Mặc định</option>";

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
  const btnVid = document.getElementById("btnVid");
  const btnStream = document.getElementById("btnToggleCamStream");
  const imgView = document.getElementById("camStreamView");
  const canvas = document.getElementById("camRecorderCanvas");
  const stat = document.getElementById("vidStatus");

  if (!store.isCamStreamOn || !imgView.src) {
    alert("Vui lòng BẬT STREAM trước khi quay!");
    return;
  }

  if (isRecording) {
    stopRecordingLogic();
    return;
  }

  // Khởi động Audio để ghi âm
  initAudio();
  resumeAudio();

  try {
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    const vStream = canvas.captureStream(25);
    const aStream = getAudioStream();

    const tracks = [...vStream.getVideoTracks()];
    if (aStream) {
      tracks.push(...aStream.getAudioTracks());
    }

    const mixedStream = new MediaStream(tracks);

    let mime = "video/webm;codecs=vp8,opus";
    if (!MediaRecorder.isTypeSupported(mime)) mime = "video/webm";

    mediaRecorder = new MediaRecorder(mixedStream, { mimeType: mime });
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

    if (btnStream) btnStream.disabled = true;

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

  const btnStream = document.getElementById("btnToggleCamStream");
  if (btnStream) btnStream.disabled = false;

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
  showConfirm("Xóa hết video đã lưu?", () => {
    if (!store.db) return;
    store.db
      .transaction(["videos"], "readwrite")
      .objectStore("videos")
      .clear().onsuccess = () => {
      loadVidGallery();
      logActionUI("Đã xóa thư viện video", true);
    };
  });
}

export function toggleCamStream(btn) {
  const streamView = document.getElementById("camStreamView");
  const streamStatus = document.getElementById("camStreamStatus");
  const btnMute = document.getElementById("btnMute");

  if (btn === null) {
    store.isCamStreamOn = false;
    streamView.removeAttribute("src");
    streamView.src = "";
    if (btnMute) btnMute.style.display = "none";

    const activeBtn = document.getElementById("btnToggleCamStream");
    if (activeBtn) {
      activeBtn.textContent = "▶️ Bật Stream";
      activeBtn.classList.remove("btn-danger");
      activeBtn.classList.add("btn-primary");
      activeBtn.disabled = false;
    }
    streamStatus.textContent = "";
    if (isRecording) stopRecordingLogic();
    return;
  }

  store.isCamStreamOn = !store.isCamStreamOn;

  if (store.isCamStreamOn) {
    if (store.isScreenStreamOn) {
      if (window.toggleScreenStream) window.toggleScreenStream(null);
    }

    const camName = document.getElementById("camName").value;
    if (!camName) {
      alert("Chưa chọn Camera");
      store.isCamStreamOn = false;
      return;
    }

    streamView.src = "";
    if (btnMute) btnMute.style.display = "inline-block";
    initAudio();
    resumeAudio();

    btn.textContent = "⏹️ Tắt Stream";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    streamStatus.textContent = "⏳ Đang kết nối...";

    sendCommand("START_STREAM_CAM", { cam: camName, audio: "mic" });
  } else {
    toggleCamStream(null);
    sendCommand("STOP_STREAM");
  }
}
