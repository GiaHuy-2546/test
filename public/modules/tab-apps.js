// modules/tab-apps.js
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";

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
  showConfirm(`Đóng cửa sổ "${name}"?`, () => {
    if (path && path !== "Unknown" && path.length > 3) addRecent(path, name);
    sendCommand("CLOSE_HWND", h);
    logActionUI(`Đóng: ${name}`, true);
    setTimeout(loadApps, 1000);
  });
}

export function startCmd(inpId, statId, cmdOverride = null) {
  let val = cmdOverride || document.getElementById(inpId).value.trim();
  if (!val) return;

  const statusEl = document.getElementById(statId);
  if (statusEl) statusEl.textContent = "⏳ ...";

  sendCommand("START_CMD", val);

  let name = val.split("\\").pop();
  addRecent(val, name);

  logActionUI(`Mở: ${name}`, true);

  if (statusEl) statusEl.textContent = "✅ Đã gửi lệnh";

  setTimeout(() => {
    if (document.getElementById("tab-apps").classList.contains("active"))
      loadApps();
  }, 2000);
}

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
