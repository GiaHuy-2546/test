// modules/tab-cam.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

// === FIX: Logic xu ly danh sach thiet bi Thong minh hon ===
export function handleDevicesData(data) {
  // 1. Neu Server bao dang quet ("pending" hoac "busy")
  if (data.status === "refresh_pending" || data.status === "refresh_busy") {
    const camSelect = document.getElementById("camName");

    // Chi hien thong bao "Dang quet" neu danh sach dang rong
    if (camSelect && camSelect.options.length === 0) {
      camSelect.innerHTML = "<option>⏳ Đang quét thiết bị...</option>";
    } else {
      // Neu da co danh sach, GIU NGUYEN (khong xoa), chi bao log
      logActionUI(
        "Server đang làm mới thiết bị... (Tự động cập nhật sau 2s)",
        true
      );
    }

    // QUAN TRONG: Tu dong hoi lai Server sau 2 giay
    setTimeout(() => {
      sendCommand("GET_DEVICES");
    }, 2000);
    return; // DUNG HAM TAI DAY -> Khong xoa danh sach cu
  }

  // 2. Neu Server tra ve du lieu that (status != pending)
  const camSelect = document.getElementById("camName");
  const audioSelect = document.getElementById("audioName");

  // Luu lai thiet bi dang chon hien tai (de khong bi reset ve mac dinh)
  const currentCam = camSelect.value;
  const currentAudio = audioSelect.value;

  camSelect.innerHTML = "";
  audioSelect.innerHTML = "";

  if (data.video && data.video.length > 0) {
    data.video.forEach((cam) => {
      const opt = document.createElement("option");
      opt.value = cam;
      opt.textContent = cam;
      if (cam.toLowerCase().includes("usb")) opt.selected = true;
      camSelect.appendChild(opt);
    });
    // Khoi phuc lua chon cu (neu thiet bi do van con)
    if (
      currentCam &&
      Array.from(camSelect.options).some((o) => o.value === currentCam)
    ) {
      camSelect.value = currentCam;
    }
  } else {
    camSelect.innerHTML = "<option value=''>Không tìm thấy camera</option>";
  }

  if (data.audio && data.audio.length > 0) {
    data.audio.forEach((audio) => {
      const opt = document.createElement("option");
      opt.value = audio;
      opt.textContent = audio;
      if (
        audio.toLowerCase().includes("realtek") ||
        audio.toLowerCase().includes("microphone")
      )
        opt.selected = true;
      audioSelect.appendChild(opt);
    });
    // Khoi phuc lua chon cu
    if (
      currentAudio &&
      Array.from(audioSelect.options).some((o) => o.value === currentAudio)
    ) {
      audioSelect.value = currentAudio;
    }
  }

  // Neu day la lan dau tien (server chua quet lan nao), tu kich hoat quet
  if (data.status === "not_ready") {
    logActionUI("Dữ liệu chưa sẵn sàng, đang yêu cầu quét...", true);
    loadDevices(true);
  }
}

// === FIX: Logic Tai Video va Xoa File Goc ===
async function downloadAndSaveVideo(path) {
  const stat = document.getElementById("vidStatus");
  stat.textContent = "⬇️ Đang tải video...";
  try {
    const res = await fetch(path + "?t=" + Date.now()); // Cache-buster
    const blob = await res.blob();
    if (blob.size > 0 && store.db) {
      // Luu vao IndexedDB
      store.db
        .transaction(["videos"], "readwrite")
        .objectStore("videos")
        .add({ blob, date: new Date() });

      loadVidGallery();
      stat.textContent = "✅ Đã lưu vào thư viện!";

      // QUAN TRONG: Doi 2 giay de Gateway kip dong file, roi moi xoa
      setTimeout(() => {
        logActionUI(`Dọn dẹp file server: ${path}`, true);
        sendCommand("DELETE_VIDEO", path);
      }, 2000);
    } else {
      throw new Error("File rỗng hoặc DB lỗi");
    }
  } catch (e) {
    stat.textContent = "❌ Lỗi tải video về client";
    logActionUI(`Lỗi tải file ${path}: ${e.message}`, false);
  }
}

export function handleRecordVideoData(data) {
  const stat = document.getElementById("vidStatus");
  const btn = document.getElementById("btnVid");

  if (data.ok && data.path) {
    stat.textContent = "✅ Quay thành công! Đang tải...";
    logActionUI("Server đã quay xong: " + data.path, true);
    // Goi ham tai file
    downloadAndSaveVideo(data.path);
  } else {
    stat.textContent = `❌ ${data.error || "Lỗi quay."}`;
  }

  if (btn) btn.disabled = false;
}

export function loadDevices(forceRefresh = false) {
  if (forceRefresh) {
    logActionUI("Yêu cầu quét lại thiết bị...", true);
    sendCommand("REFRESH_DEVICES");
  } else {
    sendCommand("GET_DEVICES");
  }
}

export function recordVideo() {
  const btn = document.getElementById("btnVid");
  const stat = document.getElementById("vidStatus");
  let dur = parseInt(document.getElementById("vidDur").value) || 5;
  let camName = document.getElementById("camName").value;
  let audioName = document.getElementById("audioName").value;

  if (
    !camName ||
    !audioName ||
    camName.startsWith("Khong tim") ||
    camName.startsWith("⏳")
  ) {
    stat.textContent = "❌ Vui lòng chọn camera và micro.";
    return;
  }
  if (btn) btn.disabled = true;
  stat.textContent = `⏳ Đang ra lệnh quay ${dur}s...`;

  sendCommand("RECORD_VIDEO", {
    duration: dur,
    cam: camName,
    audio: audioName,
  });
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
      let url = URL.createObjectURL(c.value.blob);
      h += `<div class="gallery-item video-item"><video src="${url}" controls style="width:100%;height:80px"></video></div>`;
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

  if (btn === null) {
    store.isCamStreamOn = false;
    streamView.src = "";
    streamView.alt = "Stream đã tắt.";
    const activeBtn = document.getElementById("btnToggleCamStream");
    if (activeBtn) {
      activeBtn.textContent = "▶️ Bật Stream Camera";
      activeBtn.classList.remove("btn-danger");
      activeBtn.classList.add("btn-primary");
    }
    streamStatus.textContent = "";
    return;
  }

  store.isCamStreamOn = !store.isCamStreamOn;

  if (store.isCamStreamOn) {
    const camName = document.getElementById("camName").value;
    const audioName = document.getElementById("audioName").value;
    if (
      !camName ||
      !audioName ||
      camName.startsWith("Khong tim") ||
      camName.startsWith("⏳")
    ) {
      streamStatus.textContent = "❌ Vui lòng chọn Camera và Mic!";
      store.isCamStreamOn = false;
      return;
    }

    store.isScreenStreamOn = false;
    document.getElementById("screenStreamView").src = "";

    streamView.alt = "Đang tải luồng...";
    btn.textContent = "⏹️ Tắt Stream Camera";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    streamStatus.textContent = "⏳ Đang kết nối với ffmpeg...";
    logActionUI("Bật livestream camera", true);

    sendCommand("START_STREAM_CAM", { cam: camName, audio: audioName });
  } else {
    streamView.src = "";
    streamView.alt = "Stream đã tắt.";
    const activeBtn = document.getElementById("btnToggleCamStream");
    if (activeBtn) {
      activeBtn.textContent = "▶️ Bật Stream Camera";
      activeBtn.classList.remove("btn-danger");
      activeBtn.classList.add("btn-primary");
    }
    streamStatus.textContent = "";
    logActionUI("Tắt livestream camera", true);
    sendCommand("STOP_STREAM");
  }
}
