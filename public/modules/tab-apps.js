// modules/tab-apps.js
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

// Ham nay se duoc 'app.js' dang ky voi 'onCommand'
export function handleAppsData(list) {
  const tbody = document.querySelector("#appsTable tbody");
  if (!tbody || !Array.isArray(list)) return;

  tbody.innerHTML = list
    .map((a) => {
      let name = a.path.split("\\").pop() || "Unknown";
      let path = encodeURIComponent(a.path);
      return `<tr><td><strong>${name}</strong><br><span class="app-title">${a.title}</span></td><td><button class="btn-danger" onclick="closeWin('${a.hwnd}', '${path}', '${name}')">Đóng</button></td></tr>`;
    })
    .join("");
}

export function loadApps() {
  sendCommand("GET_APPS");
}

export function closeWin(h, path, name) {
  if (confirm("Đóng cửa sổ này?")) {
    if (path && path !== "Unknown" && path.length > 3) addRecent(path, name);

    sendCommand("CLOSE_HWND", h); // Gui lenh

    logActionUI(`Đóng: ${name}`, true);
    setTimeout(loadApps, 1000);
  }
}

export function startCmd(inpId, statId, cmdOverride = null) {
  let val = cmdOverride || document.getElementById(inpId).value.trim();
  if (!val) return;

  const statusEl = document.getElementById(statId);
  if (statusEl) statusEl.textContent = "⏳ ...";

  // 1. Gui lenh MO
  sendCommand("START_CMD", val);

  // 2. Them vao danh sach GAN DAY
  // Lay ten file tu duong dan (vd: C:\Windows\notepad.exe -> notepad.exe)
  let name = val.split("\\").pop();
  addRecent(val, name);

  logActionUI(`Mở: ${name}`, true);

  if (statusEl) statusEl.textContent = "✅ Đã gửi lệnh";

  // 3. Tai lai danh sach (hy vong no mo kip de hien thi)
  setTimeout(() => {
    if (document.getElementById("tab-apps").classList.contains("active"))
      loadApps();
  }, 2000); // Apps mo len thuong cham, nen de 2s
}

// --- TIEN ICH "MO GAN DAY" ---
export function addRecent(path, name) {
  let r = JSON.parse(sessionStorage.getItem("recents") || "[]");
  r = r.filter((x) => x.path !== path);
  r.unshift({ path, name });
  if (r.length > 8) r.pop();
  sessionStorage.setItem("recents", JSON.stringify(r));
  renderRecents();
}

export function renderRecents() {
  const listEl = document.getElementById("recentListTags");
  if (!listEl) return;
  listEl.innerHTML =
    JSON.parse(sessionStorage.getItem("recents") || "[]")
      .map(
        (i) =>
          `<span class="tag" title="${
            i.path
          }" onclick="startCmd(null,'statusApp','${i.path.replace(
            /\\/g,
            "\\\\"
          )}')">🔄 ${i.name}</span>`
      )
      .join("") || "<i>Chưa có</i>";
}
