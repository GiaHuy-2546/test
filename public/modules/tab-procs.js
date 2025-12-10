// modules/tab-procs.js
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";

export function handleProcsData(list) {
  const tbody = document.querySelector("#procTable tbody");
  if (!tbody || !Array.isArray(list)) return;

  list.sort((a, b) => a.exe.localeCompare(b.exe));
  tbody.innerHTML = list
    .map(
      (p) =>
        `<tr><td>${p.pid}</td><td><strong>${p.exe}</strong></td><td><button class="btn-danger" onclick="kill(${p.pid})">Kill</button></td></tr>`
    )
    .join("");
}

export function loadProcs() {
  sendCommand("GET_PROCS");
}

export function kill(pid) {
  showConfirm(`Kill Process PID ${pid}?`, () => {
    sendCommand("KILL_PID", pid);
    logActionUI(`Kill PID ${pid}`, true);
    setTimeout(loadProcs, 500);
  });
}
