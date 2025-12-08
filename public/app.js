// app.js (FIX 2: Typo + FIX 3: Hien thi Device ID)
import { store } from "./modules/store.js";
import { onCommand, sendCommand } from "./modules/socket.js";
import {
  logActionUI,
  toggleActionLog,
  showTab as uiShowTab,
  filterTable,
  handleTabHover,
  handleTabLeave,
} from "./modules/ui.js";

import * as appTab from "./modules/tab-apps.js";
import * as procTab from "./modules/tab-procs.js";
import * as screenTab from "./modules/tab-screen.js";
import * as camTab from "./modules/tab-cam.js";
import * as keylogTab from "./modules/tab-keylog.js";
import * as sysTab from "./modules/tab-sys.js";

const showTab = (id) => {
  // === LOGIC MỚI: DỪNG TOÀN BỘ STREAM KHI CHUYỂN TAB ===
  // Bất kể đang ở tab nào, cứ bấm chuyển tab là tắt hết stream cho an toàn
  if (store.isScreenStreamOn || store.isCamStreamOn) {
    logActionUI("Chuyển tab -> Dừng tất cả Stream.", true);

    // 1. Reset UI và biến trạng thái Client
    if (store.isScreenStreamOn) window.toggleScreenStream(null);
    if (store.isCamStreamOn) window.toggleCamStream(null);

    // 2. Gửi lệnh ngắt kết nối lên Server
    sendCommand("STOP_STREAM");
  }

  // === CHUYỂN GIAO DIỆN TAB ===
  uiShowTab(id);

  // === TẢI DỮ LIỆU CHO TAB MỚI ===
  if (store.socketReady) {
    if (id === "apps") {
      appTab.loadApps();
      appTab.renderRecents();
    }
    if (id === "procs") {
      procTab.loadProcs();
    }
    if (id === "keylog") {
      keylogTab.loadKeylog();
    }
  }
};
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
window.loadVidGallery = camTab.loadVidGallery; // <-- FIX 2: Sửa lỗi 'camDab'
window.clearVideos = camTab.clearVideos;
window.toggleCamStream = camTab.toggleCamStream;
window.toggleKeylog = keylogTab.toggleKeylog;
window.clearLogs = keylogTab.clearLogs;
window.loadKeylog = keylogTab.loadKeylog;
window.sendPower = sysTab.sendPower;

onCommand("GET_APPS", appTab.handleAppsData);
onCommand("GET_PROCS", procTab.handleProcsData);
onCommand("GET_DEVICES", camTab.handleDevicesData);
onCommand("GET_KEYLOG", keylogTab.handleKeylogData);
onCommand("RECORD_VIDEO", camTab.handleRecordVideoData);
onCommand("GET_SCREENSHOT", screenTab.handleScreenshotData);

window.addEventListener("socket:open", () => {
  // (Doi 'socket:auth')
});

// === FIX 3: Cap nhat ham hien thi Auth ===
function showAuthScreen(emoji, message, color) {
  // Dùng <pre> de giu nguyen dau \n (xuong hang)
  document.body.innerHTML = `
        <div style="padding: 40px; text-align: center; font-size: 1.2em; white-space: pre-wrap; color: ${color}; background: #222; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; margin: 0; line-height: 1.6;">
            <div style="font-size: 3em; margin-bottom: 20px;">${emoji}</div>
            
            <pre style="font-family: inherit; margin: 0;">${message}</pre>

            <div style="font-size: 0.8em; color: #888; margin-top: 20px; font-family: monospace;">
                Device ID: ${store.DEVICE_ID || "N/A"}
            </div>
        </div>
    `;
}

window.addEventListener("socket:auth", (event) => {
  const { type, status, message, clientIP, deviceId } = event.detail;

  // Luu thong tin vao store
  if (clientIP) store.clientIP = clientIP;
  if (deviceId) store.DEVICE_ID = deviceId; // (Mac du store da co, nhung de dong bo)

  if (status === "approved") {
    logActionUI("Đã kết nối và xác thực!", true);
    store.socketReady = true;
    showTab("apps");
    // Hien thi ID va Socket o goc
    const el = document.getElementById("client-info");
    if (el) el.textContent = `ID: ${store.DEVICE_ID}`;
  } else if (status === "pending") {
    logActionUI(message, true);
    store.socketReady = false;
    showAuthScreen("⌛", message, "#ffcc80"); // Mau Vang
  } else if (status === "rejected") {
    logActionUI(message, false);
    store.socketReady = false;
    showAuthScreen("⛔", message, "#ef9a9a"); // Mau Do
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
  // Kiem tra xem da san sang chua (vi auth co the chua xong)
  if (store.socketReady) {
    screenTab.loadGallery();
    camTab.loadVidGallery();
  } else {
    // Neu chua san sang, doi su kien auth xong moi load
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
if (logArea) {
  logArea.value = sessionStorage.getItem("keylogs") || "";
}
