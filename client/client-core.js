/**
 * CLIENT CORE (FINAL VERSION - NON-BLOCKING UI)
 */

let DEVICE_ID = localStorage.getItem("rc_device_id");
if (!DEVICE_ID) {
  DEVICE_ID = "CL_" + Math.random().toString(16).substring(2, 6);
  localStorage.setItem("rc_device_id", DEVICE_ID);
}

const store = {
  db: null,
  DEVICE_ID: DEVICE_ID,
  clientIP: null,
  socketReady: false,
  socket: null,
  isScreenStreamOn: false,
  isCamStreamOn: false,
  autoShotInt: null,
  keylogInt: null,
  isSavingScreenshot: false,
  isMuted: false,
  hasAudioContext: false,
};
const EventBus = new EventTarget();

// === UI HELPERS (MODAL ADDED) ===
const UI = {
  toggleTheme: () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem(
      "theme",
      document.body.classList.contains("dark-mode") ? "dark" : "light"
    );
  },
  initTheme: () => {
    if (localStorage.getItem("theme") === "dark")
      document.body.classList.add("dark-mode");
  },
  toggleActionLog: () =>
    document.getElementById("actionLogList").classList.toggle("minimized"),

  showConfirm: (msg, callback) => {
    const m = document.getElementById("confirmModal");
    const t = document.getElementById("confirmMsg");
    const b = document.getElementById("btnConfirmYes");
    if (m && t && b) {
      t.textContent = msg;
      const nb = b.cloneNode(true);
      b.parentNode.replaceChild(nb, b);
      nb.onclick = () => {
        callback();
        UI.closeConfirm();
      };
      m.style.display = "flex";
    }
  },
  closeConfirm: () =>
    (document.getElementById("confirmModal").style.display = "none"),

  logAction: (msg, success) => {
    const l = document.getElementById("actionLogList");
    if (l) {
      const i = document.createElement("div");
      i.className = "log-item " + (success ? "success" : "error");
      i.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
      l.insertBefore(i, l.firstChild);
    }
  },
  moveSlider: (btn) => {
    const s = document.getElementById("tab-slider");
    if (s && btn) {
      s.style.left = btn.offsetLeft + "px";
      s.style.width = btn.offsetWidth + "px";
    }
  },
  handleTabHover: (b) => UI.moveSlider(b),
  handleTabLeave: () => {
    const a = document.querySelector(".tab-btn.active");
    if (a) UI.moveSlider(a);
  },
  showTab: (id) => {
    if (store.isScreenStreamOn || store.isCamStreamOn) {
      UI.logAction("Chuyển tab -> Dừng stream.", true);
      if (store.isScreenStreamOn) toggleScreenStream(null);
      if (store.isCamStreamOn) toggleCamStream(null);
      sendCommand("STOP_STREAM");
    }
    document
      .querySelectorAll(".tab-content")
      .forEach((e) => e.classList.remove("active"));
    document
      .querySelectorAll(".tab-btn")
      .forEach((e) => e.classList.remove("active"));
    const b = document.querySelector(`button[onclick="showTab('${id}')"]`);
    if (b) {
      b.classList.add("active");
      UI.moveSlider(b);
    }
    document.getElementById("tab-" + id).classList.add("active");
    if (store.socketReady) {
      if (id === "apps") {
        loadApps();
        renderRecents();
      }
      if (id === "procs") loadProcs();
      if (id === "keylog") loadKeylog();
    }
  },
  filterTable: (id, c, t) => {
    document
      .querySelectorAll(`#${id} tbody tr`)
      .forEach(
        (r) =>
          (r.style.display = r.innerText.toLowerCase().includes(t.toLowerCase())
            ? ""
            : "none")
      );
  },
};
UI.initTheme();

// === AUDIO ENGINE ===
let audioCtx,
  audioDest,
  audioGain,
  nextAudioTime = 0;
function initAudio() {
  if (store.hasAudioContext) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  audioCtx = new Ctor();
  audioDest = audioCtx.createMediaStreamDestination();
  audioGain = audioCtx.createGain();
  audioGain.connect(audioDest);
  audioGain.connect(audioCtx.destination);
  store.hasAudioContext = true;
  console.log("[AUDIO] Ready");
}
function playPcmData(buf) {
  if (!audioCtx || store.isMuted) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  if (buf.byteLength % 2 !== 0) buf = buf.slice(0, buf.byteLength - 1);
  const pcm = new Int16Array(buf);
  const float = audioCtx.createBuffer(1, pcm.length, 16000);
  const ch = float.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768.0;
  const src = audioCtx.createBufferSource();
  src.buffer = float;
  src.connect(audioGain);
  const now = audioCtx.currentTime;
  if (nextAudioTime < now) nextAudioTime = now;
  src.start(nextAudioTime);
  nextAudioTime += src.buffer.duration;
}
function toggleMute(btn) {
  store.isMuted = !store.isMuted;
  if (audioGain) audioGain.gain.value = store.isMuted ? 0 : 1;
  if (store.isMuted) {
    btn.textContent = "🔇 OFF";
    btn.classList.add("muted");
    btn.classList.remove("btn-warning");
  } else {
    btn.textContent = "🔊 ON";
    btn.classList.add("btn-warning");
    btn.classList.remove("muted");
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
}

// === SOCKET ===
const responseHandlers = {};
function onCommand(c, h) {
  responseHandlers[c] = h;
}
function sendCommand(c, p = null) {
  if (store.socket && store.socket.readyState === 1)
    store.socket.send(JSON.stringify({ command: c, payload: p }));
  else console.error("WS not ready");
}

// === MODULES (UPDATED WITH UI.showConfirm) ===
function handleAppsData(l) {
  document.querySelector("#appsTable tbody").innerHTML = l
    .map(
      (a) =>
        `<tr><td><strong>${a.path
          .split("\\")
          .pop()}</strong><br><span class="app-title">${
          a.title
        }</span></td><td><button class="btn-danger" onclick="closeWin('${
          a.hwnd
        }','${encodeURIComponent(a.path)}','${
          a.title
        }')">Đóng</button></td></tr>`
    )
    .join("");
}
function loadApps() {
  sendCommand("GET_APPS");
}
function closeWin(h, p, n) {
  UI.showConfirm(`Đóng "${n}"?`, () => {
    if (p && p !== "Unknown" && p.length > 3) addRecent(p, n);
    sendCommand("CLOSE_HWND", h);
    UI.logAction(`Đóng: ${n}`, true);
    setTimeout(loadApps, 1000);
  });
}
function startCmd(i, s, ov) {
  let v = ov || document.getElementById(i).value.trim();
  if (!v) return;
  sendCommand("START_CMD", v);
  addRecent(v, v.split("\\").pop());
  UI.logAction(`Mở: ${v}`, true);
  setTimeout(() => {
    if (document.getElementById("tab-apps").classList.contains("active"))
      loadApps();
  }, 2000);
}
function addRecent(p, n) {
  let r = JSON.parse(sessionStorage.getItem("recents") || "[]").filter(
    (x) => x.path !== p
  );
  r.unshift({ path: p, name: n });
  if (r.length > 8) r.pop();
  sessionStorage.setItem("recents", JSON.stringify(r));
  renderRecents();
}
function renderRecents() {
  document.getElementById("recentListTags").innerHTML =
    JSON.parse(sessionStorage.getItem("recents") || "[]")
      .map(
        (i) =>
          `<span class="tag" onclick="startCmd(null,'statusApp','${i.path.replace(
            /\\/g,
            "\\\\"
          )}')">🔄 ${i.name}</span>`
      )
      .join("") || "<i>Trống</i>";
}

function handleProcsData(l) {
  l.sort((a, b) => a.exe.localeCompare(b.exe));
  document.querySelector("#procTable tbody").innerHTML = l
    .map(
      (p) =>
        `<tr><td>${p.pid}</td><td><strong>${p.exe}</strong></td><td><button class="btn-danger" onclick="kill(${p.pid})">Kill</button></td></tr>`
    )
    .join("");
}
function loadProcs() {
  sendCommand("GET_PROCS");
}
function kill(pid) {
  UI.showConfirm(`Kill PID ${pid}?`, () => {
    sendCommand("KILL_PID", pid);
    UI.logAction(`Kill ${pid}`, true);
    setTimeout(loadProcs, 500);
  });
}

function handleKeylogData(p) {
  if (document.getElementById("chkKeylog"))
    document.getElementById("chkKeylog").checked = p.enabled;
  if (p.log) {
    let a = document.getElementById("logArea");
    a.value += p.log;
    a.scrollTop = a.scrollHeight;
    sessionStorage.setItem("keylogs", a.value);
  }
}
function loadKeylog() {
  sendCommand("GET_KEYLOG");
}
function toggleKeylog(c) {
  sendCommand("KEYLOG_SET", c.checked);
  UI.logAction("Keylog: " + (c.checked ? "ON" : "OFF"), true);
  if (c.checked) {
    if (!store.keylogInt) store.keylogInt = setInterval(loadKeylog, 500);
  } else {
    clearInterval(store.keylogInt);
    store.keylogInt = null;
  }
}
function clearLogs() {
  UI.showConfirm("Xóa log?", () => {
    document.getElementById("logArea").value = "";
    sessionStorage.removeItem("keylogs");
    UI.logAction("Đã xóa log", true);
  });
}

function handleScreenshotData(pl) {
  const src = "data:image/jpeg;base64," + pl;
  document.getElementById("screenImg").src = src;
  if (store.isSavingScreenshot && store.db) {
    fetch(src)
      .then((r) => r.blob())
      .then((b) => {
        store.db
          .transaction(["images"], "readwrite")
          .objectStore("images")
          .add({ blob: b, date: new Date() });
        UI.logAction("Đã lưu ảnh", true);
        loadGallery();
      });
    store.isSavingScreenshot = false;
  }
}
function updateScreen(s) {
  store.isSavingScreenshot = s;
  sendCommand("GET_SCREENSHOT");
}
function toggleAutoShot(c) {
  if (c.checked) {
    store.isSavingScreenshot = false;
    updateScreen();
    store.autoShotInt = setInterval(() => updateScreen(), 2000);
  } else clearInterval(store.autoShotInt);
}
function loadGallery() {
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
      )}')"><img src="${URL.createObjectURL(c.value.blob)}"></div>`;
      c.continue();
    } else
      document.getElementById("gallery").innerHTML =
        h || "<small>Trống</small>";
  };
}
function clearGallery() {
  UI.showConfirm("Xóa hết ảnh?", () => {
    if (store.db)
      store.db
        .transaction(["images"], "readwrite")
        .objectStore("images")
        .clear().onsuccess = () => {
        loadGallery();
        UI.logAction("Đã xóa ảnh", true);
      };
  });
}
function toggleScreenStream(btn) {
  const v = document.getElementById("screenStreamView");
  if (btn === null) {
    store.isScreenStreamOn = false;
    v.removeAttribute("src");
    v.src = "";
    v.style.display = "none";
    const b = document.getElementById("btnToggleScreenStream");
    if (b) {
      b.textContent = "▶️ Bật Stream Màn Hình";
      b.classList.remove("btn-danger");
      b.classList.add("btn-primary");
    }
    return;
  }
  store.isScreenStreamOn = !store.isScreenStreamOn;
  if (store.isScreenStreamOn) {
    if (store.isCamStreamOn) toggleCamStream(null);
    v.style.display = "block";
    btn.textContent = "⏹️ Tắt Stream Màn Hình";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    UI.logAction("Bật stream màn hình", true);
    sendCommand("START_STREAM_SCREEN");
  } else {
    toggleScreenStream(null);
    sendCommand("STOP_STREAM");
    UI.logAction("Tắt stream", true);
  }
}

let camRecorder,
  camChunks = [],
  camInterval,
  isCamRec,
  camRecTimeout;
function toggleRecMode() {
  document.getElementById("timerInputRow").style.display =
    document.querySelector('input[name="recMode"]:checked').value === "timer"
      ? "flex"
      : "none";
}
function handleDevicesData(d) {
  const s = document.getElementById("camName");
  if (d.status === "refresh_pending") {
    if (s.options.length === 0) s.innerHTML = "<option>Wait...</option>";
    setTimeout(() => sendCommand("GET_DEVICES"), 2000);
    return;
  }
  s.innerHTML = "";
  if (d.video && d.video.length) {
    d.video.forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v;
      s.appendChild(o);
    });
  } else s.innerHTML = "<option>No Cam</option>";
  if (d.status === "not_ready") loadDevices(true);
}
function loadDevices(f) {
  f ? sendCommand("REFRESH_DEVICES") : sendCommand("GET_DEVICES");
}
function recordVideo() {
  if (!store.isCamStreamOn) return alert("Bật Stream trước!");
  if (isCamRec) {
    stopCamRecording();
    return;
  }
  initAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();
  try {
    const cvs = document.getElementById("camRecorderCanvas");
    const ctx = cvs.getContext("2d");
    cvs.width = 640;
    cvs.height = 480;
    const vStream = cvs.captureStream(25);
    const mix = new MediaStream([
      ...vStream.getVideoTracks(),
      ...audioDest.stream.getAudioTracks(),
    ]);
    try {
      camRecorder = new MediaRecorder(mix, {
        mimeType: "video/webm;codecs=vp8,opus",
      });
    } catch (e) {
      camRecorder = new MediaRecorder(mix);
    }
    camChunks = [];
    camRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) camChunks.push(e.data);
    };
    camRecorder.onstop = () => {
      const b = new Blob(camChunks, { type: "video/webm" });
      if (store.db) {
        store.db
          .transaction(["videos"], "readwrite")
          .objectStore("videos")
          .add({ blob: b, date: new Date() });
        loadVidGallery();
        UI.logAction("Đã lưu video", true);
      }
    };
    camInterval = setInterval(() => {
      const img = document.getElementById("camStreamView");
      if (img.naturalWidth) ctx.drawImage(img, 0, 0, 640, 480);
    }, 40);
    camRecorder.start();
    isCamRec = true;
    document.getElementById("btnToggleCamStream").disabled = true;
    const btn = document.getElementById("btnVid");
    btn.textContent = "⏹️ DỪNG";
    btn.classList.add("btn-danger");
    const mode = document.querySelector('input[name="recMode"]:checked').value;
    if (mode === "timer") {
      const sec = parseInt(document.getElementById("vidDur").value) || 10;
      document.getElementById("vidStatus").innerText = `⏳ ${sec}s...`;
      camRecTimeout = setTimeout(stopCamRecording, sec * 1000);
    } else document.getElementById("vidStatus").innerText = "🔴 REC...";
  } catch (e) {
    alert(e.message);
    isCamRec = false;
    document.getElementById("btnToggleCamStream").disabled = false;
  }
}
function stopCamRecording() {
  if (camRecorder && camRecorder.state !== "inactive") camRecorder.stop();
  clearInterval(camInterval);
  clearTimeout(camRecTimeout);
  isCamRec = false;
  document.getElementById("btnToggleCamStream").disabled = false;
  const btn = document.getElementById("btnVid");
  btn.textContent = "🔴 QUAY";
  btn.classList.remove("btn-danger");
  document.getElementById("vidStatus").innerText = "✅ Saved";
}
function loadVidGallery() {
  if (!store.db) return;
  let h = "";
  store.db
    .transaction(["videos"], "readonly")
    .objectStore("videos")
    .openCursor(null, "prev").onsuccess = (e) => {
    let c = e.target.result;
    if (c) {
      let u = URL.createObjectURL(c.value.blob);
      h += `<div class="gallery-item video-item"><video src="${u}" controls style="width:100%;height:80px"></video></div>`;
      c.continue();
    } else
      document.getElementById("vidGallery").innerHTML =
        h || "<small>Trống</small>";
  };
}
function clearVideos() {
  UI.showConfirm("Xóa hết video?", () => {
    if (store.db)
      store.db
        .transaction(["videos"], "readwrite")
        .objectStore("videos")
        .clear().onsuccess = () => {
        loadVidGallery();
        UI.logAction("Đã xóa video", true);
      };
  });
}
function toggleCamStream(btn) {
  const v = document.getElementById("camStreamView");
  const mb = document.getElementById("btnMute");
  if (btn === null) {
    store.isCamStreamOn = false;
    v.removeAttribute("src");
    v.src = "";
    v.style.display = "none";
    if (mb) mb.style.display = "none";
    const b = document.getElementById("btnToggleCamStream");
    if (b) {
      b.textContent = "▶️ Bật Stream";
      b.classList.remove("btn-danger");
      b.classList.add("btn-primary");
      b.disabled = false;
    }
    if (isCamRec) stopCamRecording();
    if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
    return;
  }
  store.isCamStreamOn = !store.isCamStreamOn;
  if (store.isCamStreamOn) {
    if (store.isScreenStreamOn) toggleScreenStream(null);
    const c = document.getElementById("camName").value;
    if (!c) {
      alert("Chọn Camera!");
      store.isCamStreamOn = false;
      return;
    }
    v.src = "";
    v.style.display = "block";
    if (mb) mb.style.display = "inline-block";
    initAudio();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
      nextAudioTime = audioCtx.currentTime;
    }
    btn.textContent = "⏹️ Tắt Stream";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    document.getElementById("camStreamStatus").textContent = "⏳ Connecting...";
    sendCommand("START_STREAM_CAM", { cam: c, audio: "mic" });
  } else {
    toggleCamStream(null);
    sendCommand("STOP_STREAM");
  }
}

function sendPower(act) {
  UI.showConfirm(`CHẮC CHẮN ${act.toUpperCase()}?`, () => {
    sendCommand("POWER_CMD", act);
    UI.logAction("Power: " + act, true);
  });
}
onCommand("GET_APPS", handleAppsData);
onCommand("GET_PROCS", handleProcsData);
onCommand("GET_DEVICES", handleDevicesData);
onCommand("GET_KEYLOG", handleKeylogData);
onCommand("GET_SCREENSHOT", handleScreenshotData);

// === STARTUP ===
function showAuthScreen(e, m, c) {
  document.body.innerHTML = `<div style="padding:40px;text-align:center;font-size:1.2em;color:${c};background:#222;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:3em;margin-bottom:20px;">${e}</div><pre>${m}</pre><div style="font-size:0.8em;color:#888;">ID: ${store.DEVICE_ID}</div></div>`;
}
function startConnection() {
  let ip = document.getElementById("ipInput").value.trim();
  if (!ip) return alert("Nhập IP!");
  ip = ip.replace(/^(ws|http)s?:\/\//, "");
  if (ip.endsWith("/")) ip = ip.slice(0, -1);
  if (!ip.includes(":")) ip += ":8080";
  store.clientIP = ip;
  addToHistory(ip);
  document.getElementById("client-info").innerText = "CONNECTING...";
  store.socket = new WebSocket(`ws://${ip}?id=${store.DEVICE_ID}`);
  store.socket.onopen = () => console.log("WS Open");
  store.socket.onmessage = (e) => {
    if (e.data instanceof Blob || e.data instanceof ArrayBuffer) {
      const reader = new FileReader();
      reader.onload = function () {
        const b = this.result,
          u8 = new Uint8Array(b);
        if (u8.length > 1 && u8[0] === 0xff && u8[1] === 0xd8) {
          const url = URL.createObjectURL(
            new Blob([b], { type: "image/jpeg" })
          );
          const sv = document.getElementById("screenStreamView"),
            cv = document.getElementById("camStreamView");
          if (store.isScreenStreamOn && sv) {
            sv.src = url;
            sv.onload = () => URL.revokeObjectURL(url);
          } else if (store.isCamStreamOn && cv) {
            cv.src = url;
            cv.onload = () => URL.revokeObjectURL(url);
          }
        } else {
          if (store.hasAudioContext && u8.length > 0) playPcmData(b);
        }
      };
      if (e.data instanceof Blob) reader.readAsArrayBuffer(e.data);
      else reader.readAsArrayBuffer(new Blob([e.data]));
      return;
    }
    try {
      const m = JSON.parse(e.data);
      if (m.type === "auth")
        EventBus.dispatchEvent(new CustomEvent("socket:auth", { detail: m }));
      else if (m.type === "stream_start") {
        if (store.isScreenStreamOn)
          document.getElementById("screenStreamStatus").innerText = "✅ OK";
        if (store.isCamStreamOn)
          document.getElementById("camStreamStatus").innerText = "✅ OK";
      } else if (m.type === "stream_stop") {
        if (store.isScreenStreamOn) toggleScreenStream(null);
        if (store.isCamStreamOn) toggleCamStream(null);
      } else if (m.type === "error") UI.logAction(`Lỗi: ${m.payload}`, false);
      else if (m.type === "json")
        if (responseHandlers[m.command]) responseHandlers[m.command](m.payload);
    } catch (e) {}
  };
  store.socket.onclose = (e) => {
    UI.logAction("Mất kết nối", false);
    store.socketReady = false;
    alert("Mất kết nối!");
    location.reload();
  };
  store.socket.onerror = () => UI.logAction("Lỗi WS", false);
}
EventBus.addEventListener("socket:auth", (e) => {
  const { status, message } = e.detail;
  if (status === "approved") {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";
    UI.logAction("Đã kết nối!", true);
    store.socketReady = true;
    showTab("apps");
    document.getElementById("client-info").innerText = `ID: ${store.DEVICE_ID}`;
    const r = indexedDB.open("RemoteDB_V2", 2);
    r.onupgradeneeded = (ev) => {
      let db = ev.target.result;
      if (!db.objectStoreNames.contains("images"))
        db.createObjectStore("images", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("videos"))
        db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = (ev) => {
      store.db = ev.target.result;
      loadGallery();
      loadVidGallery();
    };
  } else if (status === "pending") {
    store.socketReady = false;
    showAuthScreen("⌛", message, "#ffcc80");
  } else if (status === "rejected") {
    store.socketReady = false;
    showAuthScreen("⛔", message, "#ef9a9a");
  }
});
function loadHistory() {
  const h = JSON.parse(localStorage.getItem("remote_ip_history") || "[]");
  document.getElementById("historyItems").innerHTML =
    h
      .map(
        (ip) =>
          `<div class="history-item" onclick="document.getElementById('ipInput').value='${ip}'"><span>${ip}</span> <span style="color:var(--danger)" onclick="event.stopPropagation();delHistory('${ip}')">×</span></div>`
      )
      .join("") || "<small>Trống</small>";
  if (h.length && !document.getElementById("ipInput").value)
    document.getElementById("ipInput").value = h[0];
}
function addToHistory(ip) {
  let h = JSON.parse(localStorage.getItem("remote_ip_history") || "[]").filter(
    (x) => x !== ip
  );
  h.unshift(ip);
  if (h.length > 5) h.pop();
  localStorage.setItem("remote_ip_history", JSON.stringify(h));
}
window.delHistory = function (ip) {
  localStorage.setItem(
    "remote_ip_history",
    JSON.stringify(
      JSON.parse(localStorage.getItem("remote_ip_history") || "[]").filter(
        (x) => x !== ip
      )
    )
  );
  loadHistory();
};

if (document.getElementById("lblDeviceId"))
  document.getElementById("lblDeviceId").innerText = store.DEVICE_ID;
const la = document.getElementById("logArea");
if (la) la.value = sessionStorage.getItem("keylogs") || "";
loadHistory();
document.getElementById("ipInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") startConnection();
});

window.toggleTheme = UI.toggleTheme;
window.toggleActionLog = UI.toggleActionLog;
window.showTab = UI.showTab;
window.handleTabHover = UI.handleTabHover;
window.handleTabLeave = UI.handleTabLeave;
window.filterTable = UI.filterTable;
window.startCmd = startCmd;
window.loadApps = loadApps;
window.closeWin = closeWin;
window.startConnection = startConnection;
window.loadProcs = loadProcs;
window.kill = kill;
window.updateScreen = updateScreen;
window.toggleAutoShot = toggleAutoShot;
window.clearGallery = clearGallery;
window.toggleScreenStream = toggleScreenStream;
window.toggleKeylog = toggleKeylog;
window.clearLogs = clearLogs;
window.toggleRecMode = toggleRecMode;
window.loadDevices = loadDevices;
window.recordVideo = recordVideo;
window.clearVideos = clearVideos;
window.toggleCamStream = toggleCamStream;
window.sendPower = sendPower;
window.toggleMute = toggleMute;
window.UI = UI;
