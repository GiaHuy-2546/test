// app.js
import { store } from "./modules/store.js";
import { onCommand, sendCommand } from "./modules/socket.js";
import {
  logActionUI,
  toggleActionLog,
  toggleTheme,
  initTheme,
  showTab as uiShowTab,
  filterTable,
  handleTabHover,
  handleTabLeave,
  showConfirm,
  closeConfirm,
} from "./modules/ui.js";

import * as appTab from "./modules/tab-apps.js";
import * as procTab from "./modules/tab-procs.js";
import * as screenTab from "./modules/tab-screen.js";
import * as camTab from "./modules/tab-cam.js";
import * as keylogTab from "./modules/tab-keylog.js";
import * as sysTab from "./modules/tab-sys.js";
import * as audioMod from "./modules/audio.js";

initTheme();

const showTab = (id) => {
  if (store.isScreenStreamOn || store.isCamStreamOn) {
    logActionUI("Chuyển tab -> Dừng tất cả Stream.", true);
    if (store.isScreenStreamOn) window.toggleScreenStream(null);
    if (store.isCamStreamOn) window.toggleCamStream(null);
    sendCommand("STOP_STREAM");
  }
  uiShowTab(id);
  if (store.socketReady) {
    if (id === "apps") {
      appTab.loadApps();
      appTab.renderRecents();
    }
    if (id === "procs") procTab.loadProcs();
    if (id === "keylog") keylogTab.loadKeylog();
  }
};

window.toggleTheme = toggleTheme;
window.logActionUI = logActionUI;
window.toggleActionLog = toggleActionLog;
window.showTab = showTab;
window.filterTable = filterTable;
window.handleTabHover = handleTabHover;
window.handleTabLeave = handleTabLeave;
window.loadApps = appTab.loadApps;
window.closeWin = appTab.closeWin;
window.startCmd = appTab.startCmd;
window.renderRecents = appTab.renderRecents;
window.loadProcs = procTab.loadProcs;
window.kill = procTab.kill;
window.updateScreen = screenTab.updateScreen;
window.toggleAutoShot = screenTab.toggleAutoShot;
window.loadGallery = screenTab.loadGallery;
window.clearGallery = screenTab.clearGallery;
window.toggleScreenStream = screenTab.toggleScreenStream;
window.loadDevices = camTab.loadDevices;
window.recordVideo = camTab.recordVideo;
window.loadVidGallery = camTab.loadVidGallery;
window.clearVideos = camTab.clearVideos;
window.toggleCamStream = camTab.toggleCamStream;
window.toggleKeylog = keylogTab.toggleKeylog;
window.clearLogs = keylogTab.clearLogs;
window.loadKeylog = keylogTab.loadKeylog;
window.sendPower = sysTab.sendPower;
window.toggleMute = audioMod.toggleMute;
window.closeConfirm = closeConfirm;

onCommand("GET_APPS", appTab.handleAppsData);
onCommand("GET_PROCS", procTab.handleProcsData);
onCommand("GET_DEVICES", camTab.handleDevicesData);
onCommand("GET_KEYLOG", keylogTab.handleKeylogData);
onCommand("RECORD_VIDEO", camTab.handleRecordVideoData);
onCommand("GET_SCREENSHOT", screenTab.handleScreenshotData);

// Auth Screen
function showAuthScreen(emoji, message, color) {
  document.body.innerHTML = `
        <div style="padding: 40px; text-align: center; font-size: 1.2em; white-space: pre-wrap; color: ${color}; background: #222; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0; line-height: 1.6;">
            <div style="font-size: 3em; margin-bottom: 20px;">${emoji}</div>
            <pre style="font-family: inherit; margin: 0;">${message}</pre>
            <div style="font-size: 0.8em; color: #888; margin-top: 20px; font-family: monospace; ">
                Device ID: ${store.DEVICE_ID || "N/A"}
            </div>
        </div>
    `;
}

window.addEventListener("socket:auth", (event) => {
  const { status, message, clientIP, deviceId } = event.detail;
  if (clientIP) store.clientIP = clientIP;
  if (deviceId) store.DEVICE_ID = deviceId;

  if (status === "approved") {
    // --- BẮT ĐẦU SỬA ---
    
    // Kiểm tra: Nếu chưa có "cờ" đánh dấu trong sessionStorage thì mới reload
    if (!sessionStorage.getItem("auth_reloaded")) {
        // 1. Đánh dấu là chuẩn bị reload
        sessionStorage.setItem("auth_reloaded", "true");
        
        // 2. Thực hiện reload
        logActionUI("Đang tải lại trang...", true);
        setTimeout(() => window.location.reload(), 500);
        
        return; // Dừng code tại đây để chờ reload, không chạy đoạn hiển thị bên dưới
    }

    // Nếu chạy xuống được đây, tức là đã reload xong rồi (đã có cờ)
    // Ta xóa cờ đi để lần sau người dùng F5 thủ công thì logic vẫn đúng
    sessionStorage.removeItem("auth_reloaded");

    // --- KẾT THÚC SỬA ---
    
    logActionUI("Đã kết nối và xác thực!", true);
    store.socketReady = true;
    showTab("apps");
    const el = document.getElementById("client-info");
    if (el) el.textContent = `ID: ${store.DEVICE_ID}`;
  } else if (status === "pending") {
    logActionUI(message, true);
    store.socketReady = false;
    showAuthScreen("⌛", message, "#ffcc80");
  } else if (status === "rejected") {
    logActionUI(message, false);
    store.socketReady = false;
    showAuthScreen("⛔", message, "#ef9a9a");
  }
});

window.addEventListener("socket:close", (event) => {
  logActionUI(`Mất kết nối: ${event.detail}`, false);
  store.socketReady = false;
});
window.addEventListener("socket:error", (event) => {
  const msg =
    event.detail === "WebSocket not ready"
      ? "Lỗi: WebSocket chưa sẵn sàng!"
      : event.detail;
  logActionUI(msg, false);
});

const DB_REQ = indexedDB.open("RemoteDB_V2", 2);
DB_REQ.onupgradeneeded = (e) => {
  let db = e.target.result;
  if (!db.objectStoreNames.contains("images"))
    db.createObjectStore("images", { keyPath: "id", autoIncrement: true });
  if (!db.objectStoreNames.contains("videos"))
    db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
};
DB_REQ.onsuccess = (e) => {
  store.db = e.target.result;
  if (store.socketReady) {
    screenTab.loadGallery();
    camTab.loadVidGallery();
  } else {
    window.addEventListener(
      "socket:auth",
      (e) => {
        if (e.detail.status === "approved") {
          screenTab.loadGallery();
          camTab.loadVidGallery();
        }
      },
      { once: true }
    );
  }
};

const logArea = document.getElementById("logArea");
if (logArea) logArea.value = sessionStorage.getItem("keylogs") || "";


