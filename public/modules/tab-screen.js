// modules/tab-screen.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

export function handleScreenshotData(payload) {
  const imgData = "data:image/jpeg;base64," + payload;
  document.getElementById("screenImg").src = imgData;

  if (store.isSavingScreenshot && store.db) {
    fetch(imgData)
      .then((res) => res.blob())
      .then((blob) => {
        store.db
          .transaction(["images"], "readwrite")
          .objectStore("images")
          .add({ blob, date: new Date() });
        logActionUI("Đã chụp & lưu", true);
        loadGallery();
      });
    store.isSavingScreenshot = false;
  }
}

export function updateScreen(save = false) {
  store.isSavingScreenshot = save;
  sendCommand("GET_SCREENSHOT");
}

export function toggleAutoShot(cb) {
  if (cb.checked) {
    store.isSavingScreenshot = false;
    updateScreen(false);
    store.autoShotInt = setInterval(() => updateScreen(false), 2000);
  } else {
    clearInterval(store.autoShotInt);
  }
}

export function loadGallery() {
  if (!store.db) return;
  let h = "";
  store.db
    .transaction(["images"], "readonly")
    .objectStore("images")
    .openCursor(null, "prev").onsuccess = (e) => {
    let c = e.target.result;
    if (c) {
      h += `<div class="gallery-item" onclick="window.open('${URL.createObjectURL(
        c.value.blob
      )}')"><img src="${URL.createObjectURL(
        c.value.blob
      )}" title="${c.value.date.toLocaleString()}"></div>`;
      c.continue();
    } else
      document.getElementById("gallery").innerHTML =
        h || "<small>Trống</small>";
  };
}
export function clearGallery() {
  if (confirm("Xóa hết ảnh?")) {
    if (!store.db) return;
    store.db
      .transaction(["images"], "readwrite")
      .objectStore("images")
      .clear().onsuccess = () => {
      loadGallery();
      logActionUI("Đã xóa thư viện ảnh", true);
    };
  }
}

export function toggleScreenStream(btn) {
  const streamView = document.getElementById("screenStreamView");
  const streamStatus = document.getElementById("screenStreamStatus");

  // --- TRUONG HOP TAT STREAM ---
  if (btn === null) {
    store.isScreenStreamOn = false;

    // YEU CAU 2: XOA ANH CU (VE MAN HINH DEN)
    streamView.removeAttribute("src");
    streamView.src = "";

    const activeBtn = document.getElementById("btnToggleScreenStream");
    if (activeBtn) {
      activeBtn.textContent = "▶️ Bật Stream Màn Hình";
      activeBtn.classList.remove("btn-danger");
      activeBtn.classList.add("btn-primary");
    }
    streamStatus.textContent = "";
    return;
  }

  // --- LOGIC BAT/TAT ---
  store.isScreenStreamOn = !store.isScreenStreamOn;

  if (store.isScreenStreamOn) {
    // YEU CAU 3: NGAT STREAM CAM (NEU DANG CHAY)
    if (store.isCamStreamOn) {
      if (window.toggleCamStream) window.toggleCamStream(null);
    }

    // Reset view
    streamView.src = "";

    streamView.alt = "Đang tải luồng...";
    btn.textContent = "⏹️ Tắt Stream Màn Hình";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    streamStatus.textContent = "⏳ Đang kết nối...";
    logActionUI("Bật livestream màn hình", true);

    sendCommand("START_STREAM_SCREEN");
  } else {
    // Tat thu cong
    streamView.removeAttribute("src");
    streamView.src = "";
    streamView.alt = "Stream đã tắt.";

    btn.textContent = "▶️ Bật Stream Màn Hình";
    btn.classList.remove("btn-danger");
    btn.classList.add("btn-primary");
    streamStatus.textContent = "";
    logActionUI("Tắt livestream màn hình", true);

    sendCommand("STOP_STREAM");
  }
}
