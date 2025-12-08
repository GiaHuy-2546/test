/**
 * CLIENT CORE (STANDALONE VERSION)
 * Dong bo logic voi Web Client (Dark Mode, Fix Stream, New Cam)
 */

// 1. STORE & STATE
const App = {
  socket: null,
  serverIP: null,
  DEVICE_ID:
    localStorage.getItem("rc_device_id") ||
    "CL_" + Math.random().toString(16).substring(2, 6),
  db: null,
  isScreenStreamOn: false,
  isCamStreamOn: false,
  autoShotInt: null,
  keylogInt: null,
  isSavingScreenshot: false,
};
localStorage.setItem("rc_device_id", App.DEVICE_ID);

// 2. UI HELPERS
const UI = {
  logAction: (msg, success) => {
    const list = document.getElementById("actionLogList");
    if (list) {
      const i = document.createElement("div");
      i.className = "log-item " + (success ? "success" : "error");
      i.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
      list.insertBefore(i, list.firstChild);
    }
  },
  toggleActionLog: () =>
    document.getElementById("actionLogList").classList.toggle("minimized"),

  // --- THEME ---
  toggleTheme: () => {
    document.body.classList.toggle("light-mode");
    localStorage.setItem(
      "theme",
      document.body.classList.contains("light-mode") ? "light" : "dark"
    );
  },
  initTheme: () => {
    if (localStorage.getItem("theme") === "light")
      document.body.classList.add("light-mode");
  },

  // --- TABS & SLIDER ---
  moveSlider: (btn) => {
    const slider = document.getElementById("tab-slider");
    if (slider && btn) {
      slider.style.left = `${btn.offsetLeft}px`;
      slider.style.width = `${btn.offsetWidth}px`;
    }
  },
  handleTabHover: (btn) => UI.moveSlider(btn),
  handleTabLeave: () => {
    const active = document.querySelector(".tab-btn.active");
    if (active) UI.moveSlider(active);
  },

  showTab: (id) => {
    // === FIX: DUNG HET STREAM KHI CHUYEN TAB ===
    if (App.isScreenStreamOn || App.isCamStreamOn) {
      UI.logAction("Chuyển tab -> Ngắt stream.", true);
      if (App.isScreenStreamOn) Screen.toggleScreenStream(null);
      if (App.isCamStreamOn) Cam.toggleCamStream(null);
      Socket.send("STOP_STREAM");
    }

    document
      .querySelectorAll(".tab-content")
      .forEach((el) => el.classList.remove("active"));
    document
      .querySelectorAll(".tab-btn")
      .forEach((el) => el.classList.remove("active"));

    const btn = document.querySelector(`button[onclick*="'${id}'"]`);
    if (btn) {
      btn.classList.add("active");
      UI.moveSlider(btn);
    }

    const content = document.getElementById("tab-" + id);
    if (content) content.classList.add("active");

    if (App.socket && App.socket.readyState === WebSocket.OPEN) {
      if (id === "apps") {
        Apps.loadApps();
        Apps.renderRecents();
      }
      if (id === "procs") Procs.loadProcs();
      if (id === "keylog") Keylog.loadKeylog();
    }
  },

  filterTable: (tid, col, txt) => {
    document
      .querySelectorAll(`#${tid} tbody tr`)
      .forEach(
        (tr) =>
          (tr.style.display = tr.innerText
            .toLowerCase()
            .includes(txt.toLowerCase())
            ? ""
            : "none")
      );
  },
};

// 3. SOCKET LOGIC
const Socket = {
  send: (cmd, payload = null) => {
    if (App.socket && App.socket.readyState === WebSocket.OPEN) {
      App.socket.send(JSON.stringify({ command: cmd, payload: payload }));
    } else {
      console.error("Socket not ready");
    }
  },
  init: (ip) => {
    App.socket = new WebSocket(`ws://${ip}?id=${App.DEVICE_ID}`);
    App.socket.onopen = () => console.log("WS Connected");
    App.socket.onmessage = (event) => {
      // Binary Image
      if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
        const url = URL.createObjectURL(
          new Blob([event.data], { type: "image/jpeg" })
        );
        const sView = document.getElementById("screenStreamView");
        const cView = document.getElementById("camStreamView");
        if (App.isScreenStreamOn && sView) {
          sView.src = url;
          sView.onload = () => URL.revokeObjectURL(url);
        } else if (App.isCamStreamOn && cView) {
          cView.src = url;
          cView.onload = () => URL.revokeObjectURL(url);
        }
        return;
      }
      // JSON
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "auth") handleAuth(msg);
        else if (msg.type === "json") handleCommand(msg.command, msg.payload);
        else if (msg.type === "error")
          UI.logAction("Lỗi Server: " + msg.payload, false);
      } catch (e) {
        console.error(e);
      }
    };
    App.socket.onclose = () => {
      UI.logAction("Mất kết nối Server!", false);
      alert("Mất kết nối với Server!");
      location.reload();
    };
    App.socket.onerror = (e) => console.error("WS Error", e);
  },
};

function handleAuth(msg) {
  if (msg.status === "approved") {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";
    document.getElementById("client-info").textContent = `ID: ${
      App.DEVICE_ID
    } | Connected: ${document.getElementById("ipInput").value}`;

    const req = indexedDB.open("RemoteDB_V2", 2);
    req.onupgradeneeded = (e) => {
      let db = e.target.result;
      if (!db.objectStoreNames.contains("images"))
        db.createObjectStore("images", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("videos"))
        db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = (e) => {
      App.db = e.target.result;
      Screen.loadGallery();
      Cam.loadVidGallery();
    };
    UI.showTab("apps");
    UI.logAction("Đã kết nối thành công!", true);
  } else {
    alert("Trạng thái: " + msg.status + "\n" + msg.message);
  }
}

function handleCommand(cmd, payload) {
  switch (cmd) {
    case "GET_APPS":
      Apps.render(payload);
      break;
    case "GET_PROCS":
      Procs.render(payload);
      break;
    case "GET_KEYLOG":
      Keylog.render(payload);
      break;
    case "GET_DEVICES":
      Cam.renderDevices(payload);
      break;
    case "RECORD_VIDEO":
      /* Server side rec removed */ break;
    case "GET_SCREENSHOT":
      Screen.handleShot(payload);
      break;
  }
}

// 4. MODULES
const Apps = {
  loadApps: () => Socket.send("GET_APPS"),
  render: (list) => {
    if (!Array.isArray(list)) return;
    document.querySelector("#appsTable tbody").innerHTML = list
      .map(
        (a) =>
          `<tr><td><strong>${a.path
            .split("\\")
            .pop()}</strong><br><span class="app-title">${a.title}</span></td>
      <td><button class="btn-danger" onclick="Apps.closeWin('${
        a.hwnd
      }','${encodeURIComponent(a.path)}','${a.title}')">Đóng</button></td></tr>`
      )
      .join("");
  },
  closeWin: (h, path, name) => {
    if (confirm("Đóng cửa sổ này?")) {
      Socket.send("CLOSE_HWND", h);
      UI.logAction(`Đóng: ${name}`, true);
      setTimeout(Apps.loadApps, 1000);
    }
  },
  startCmd: (inpId, statId, valOverride) => {
    let val = valOverride || document.getElementById(inpId).value.trim();
    if (!val) return;
    Socket.send("START_CMD", val);
    Apps.addRecent(val, val.split("\\").pop());
    UI.logAction(`Mở: ${val}`, true);
    document.getElementById(statId).innerText = "✅ Đã gửi";
    setTimeout(() => {
      if (document.getElementById("tab-apps").classList.contains("active"))
        Apps.loadApps();
    }, 2000);
  },
  addRecent: (path, name) => {
    let r = JSON.parse(sessionStorage.getItem("recents") || "[]");
    r = r.filter((x) => x.path !== path);
    r.unshift({ path, name });
    if (r.length > 8) r.pop();
    sessionStorage.setItem("recents", JSON.stringify(r));
    Apps.renderRecents();
  },
  renderRecents: () => {
    const list = JSON.parse(sessionStorage.getItem("recents") || "[]");
    document.getElementById("recentListTags").innerHTML =
      list
        .map(
          (i) =>
            `<span class="tag" onclick="Apps.startCmd(null,'statusApp','${i.path.replace(
              /\\/g,
              "\\\\"
            )}')">🔄 ${i.name}</span>`
        )
        .join("") || "<i>Chưa có</i>";
  },
};

const Procs = {
  loadProcs: () => Socket.send("GET_PROCS"),
  render: (list) => {
    if (!Array.isArray(list)) return;
    list.sort((a, b) => a.exe.localeCompare(b.exe));
    document.querySelector("#procTable tbody").innerHTML = list
      .map(
        (p) =>
          `<tr><td>${p.pid}</td><td><strong>${p.exe}</strong></td><td><button class="btn-danger" onclick="Procs.kill(${p.pid})">Kill</button></td></tr>`
      )
      .join("");
  },
  kill: (pid) => {
    if (confirm("Kill PID " + pid + "?")) {
      Socket.send("KILL_PID", pid);
      UI.logAction("Kill PID " + pid, true);
      setTimeout(Procs.loadProcs, 1000);
    }
  },
};

const Keylog = {
  loadKeylog: () => Socket.send("GET_KEYLOG"),
  render: (pl) => {
    if (document.getElementById("chkKeylog"))
      document.getElementById("chkKeylog").checked = pl.enabled;
    if (pl.log) {
      const area = document.getElementById("logArea");
      area.value += pl.log;
      area.scrollTop = area.scrollHeight;
    }
  },
  toggleKeylog: (cb) => {
    Socket.send("KEYLOG_SET", cb.checked);
    UI.logAction("Keylog: " + (cb.checked ? "ON" : "OFF"), true);
    if (cb.checked && !App.keylogInt)
      App.keylogInt = setInterval(Keylog.loadKeylog, 500);
    else if (!cb.checked && App.keylogInt) {
      clearInterval(App.keylogInt);
      App.keylogInt = null;
    }
  },
  clearLogs: () => {
    document.getElementById("logArea").value = "";
  },
};

const Screen = {
  updateScreen: (save) => {
    App.isSavingScreenshot = save;
    Socket.send("GET_SCREENSHOT");
  },
  handleShot: (b64) => {
    const src = "data:image/jpeg;base64," + b64;
    const imgEl = document.getElementById("screenImg");
    const streamEl = document.getElementById("screenStreamView");

    // UI: Hien anh chup, an stream
    imgEl.src = src;
    imgEl.classList.add("show-view");
    streamEl.classList.remove("show-view");

    if (App.isSavingScreenshot && App.db) {
      fetch(src)
        .then((r) => r.blob())
        .then((blob) => {
          App.db
            .transaction(["images"], "readwrite")
            .objectStore("images")
            .add({ blob, date: new Date() });
          Screen.loadGallery();
          UI.logAction("Đã lưu ảnh", true);
        });
      App.isSavingScreenshot = false;
    }
  },
  loadGallery: () => {
    if (!App.db) return;
    let h = "";
    App.db
      .transaction(["images"], "readonly")
      .objectStore("images")
      .openCursor(null, "prev").onsuccess = (e) => {
      let c = e.target.result;
      if (c) {
        h += `<div class="gallery-item" onclick="window.open('${URL.createObjectURL(
          c.value.blob
        )}')"><img src="${URL.createObjectURL(c.value.blob)}"></div>`;
        c.continue();
      } else document.getElementById("gallery").innerHTML = h || "Trống";
    };
  },
  clearGallery: () => {
    if (confirm("Xóa hết?"))
      App.db
        .transaction(["images"], "readwrite")
        .objectStore("images")
        .clear().onsuccess = () => Screen.loadGallery();
  },
  toggleAutoShot: (cb) => {
    if (cb.checked) {
      App.isSavingScreenshot = false;
      Screen.updateScreen(false);
      App.autoShotInt = setInterval(() => Screen.updateScreen(false), 2000);
    } else clearInterval(App.autoShotInt);
  },
  toggleScreenStream: (btn) => {
    const streamView = document.getElementById("screenStreamView");
    const imgView = document.getElementById("screenImg");

    if (btn === null) {
      App.isScreenStreamOn = false;
      streamView.src = "";
      streamView.classList.remove("show-view");
      imgView.classList.add("show-view"); // Hien lai khung anh (hoac den)

      const b = document.getElementById("btnToggleScreenStream");
      if (b) {
        b.textContent = "▶️ Bật Stream";
        b.classList.remove("btn-danger");
      }
      return;
    }
    App.isScreenStreamOn = !App.isScreenStreamOn;
    if (App.isScreenStreamOn) {
      if (App.isCamStreamOn && window.toggleCamStream)
        Cam.toggleCamStream(null); // Tat Cam

      imgView.classList.remove("show-view");
      streamView.classList.add("show-view");
      streamView.src = ""; // Clear buffer

      btn.textContent = "⏹️ Tắt Stream";
      btn.classList.add("btn-danger");
      Socket.send("START_STREAM_SCREEN");
    } else {
      Screen.toggleScreenStream(null);
      Socket.send("STOP_STREAM");
    }
  },
};

const Cam = {
  recorder: null,
  chunks: [],
  interval: null,
  isRec: false,
  recTimeout: null,

  loadDevices: (force) => {
    if (force) Socket.send("REFRESH_DEVICES");
    else Socket.send("GET_DEVICES");
  },
  renderDevices: (data) => {
    const cS = document.getElementById("camName");
    if (data.status === "refresh_pending") {
      if (cS.options.length === 0)
        cS.innerHTML = "<option>⏳ Đang quét...</option>";
      setTimeout(() => Socket.send("GET_DEVICES"), 2000);
      return;
    }
    cS.innerHTML = "";
    if (data.video && data.video.length) {
      data.video.forEach((v) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        cS.appendChild(o);
      });
    } else {
      cS.innerHTML = "<option>Không có cam</option>";
    }
  },

  // LOGIC MOI: Hen gio / Thu cong
  recordVideo: () => {
    if (!App.isCamStreamOn) return alert("Bật Stream trước!");

    const btn = document.getElementById("btnVid");
    const img = document.getElementById("camStreamView");
    const cvs = document.getElementById("recCanvas");
    const btnStream = document.getElementById("btnToggleCamStream");

    if (!Cam.isRec) {
      // START
      if (btnStream) btnStream.disabled = true;

      cvs.width = 640;
      cvs.height = 480;
      const ctx = cvs.getContext("2d");
      const stream = cvs.captureStream(25);
      Cam.chunks = [];
      try {
        Cam.recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      } catch (e) {
        Cam.recorder = new MediaRecorder(stream);
      }

      Cam.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) Cam.chunks.push(e.data);
      };
      Cam.recorder.onstop = () => {
        const blob = new Blob(Cam.chunks, { type: "video/webm" });
        if (App.db) {
          App.db
            .transaction(["videos"], "readwrite")
            .objectStore("videos")
            .add({ blob, date: new Date() });
          Cam.loadVidGallery();
        }
        UI.logAction("Đã lưu video (Client)", true);
      };

      Cam.interval = setInterval(() => {
        if (img.naturalWidth) ctx.drawImage(img, 0, 0, 640, 480);
      }, 40);

      Cam.recorder.start();
      Cam.isRec = true;
      btn.textContent = "⏹️ DỪNG";
      btn.classList.add("btn-danger");

      // Timer Mode check
      const mode = document.querySelector(
        'input[name="recMode"]:checked'
      ).value;
      if (mode === "timer") {
        const sec = parseInt(document.getElementById("vidDur").value) || 10;
        UI.logAction(`Đang quay hẹn giờ ${sec}s...`, true);
        Cam.recTimeout = setTimeout(() => {
          if (Cam.isRec) Cam.recordVideo();
        }, sec * 1000);
      } else {
        UI.logAction("Đang quay thủ công...", true);
      }
    } else {
      // STOP
      if (Cam.recorder) Cam.recorder.stop();
      if (Cam.interval) clearInterval(Cam.interval);
      if (Cam.recTimeout) clearTimeout(Cam.recTimeout);
      Cam.isRec = false;
      btn.textContent = "🔴 QUAY";
      btn.classList.remove("btn-danger");
      if (btnStream) btnStream.disabled = false;
    }
  },

  loadVidGallery: () => {
    if (!App.db) return;
    let h = "";
    App.db
      .transaction(["videos"], "readonly")
      .objectStore("videos")
      .openCursor(null, "prev").onsuccess = (e) => {
      let c = e.target.result;
      if (c) {
        let u = URL.createObjectURL(c.value.blob);
        h += `<div class="gallery-item video-item"><video src="${u}" controls style="width:100%;height:80px"></video></div>`;
        c.continue();
      } else document.getElementById("vidGallery").innerHTML = h || "Trống";
    };
  },
  clearVideos: () => {
    if (confirm("Xóa hết?"))
      App.db
        .transaction(["videos"], "readwrite")
        .objectStore("videos")
        .clear().onsuccess = () => Cam.loadVidGallery();
  },
  toggleCamStream: (btn) => {
    const view = document.getElementById("camStreamView");
    if (btn === null) {
      App.isCamStreamOn = false;
      view.src = "";
      view.removeAttribute("src"); // Hien man hinh den

      const b = document.getElementById("btnToggleCamStream");
      if (b) {
        b.textContent = "▶️ Stream";
        b.classList.remove("btn-danger");
        b.disabled = false;
      }
      if (Cam.isRec) Cam.recordVideo(); // Stop rec
      return;
    }
    App.isCamStreamOn = !App.isCamStreamOn;
    if (App.isCamStreamOn) {
      if (App.isScreenStreamOn) Screen.toggleScreenStream(null); // Tat Screen

      const c = document.getElementById("camName").value;
      view.src = "";
      btn.textContent = "⏹️ Tắt Stream";
      btn.classList.add("btn-danger");
      Socket.send("START_STREAM_CAM", { cam: c, audio: "" });
    } else {
      Cam.toggleCamStream(null);
      Socket.send("STOP_STREAM");
    }
  },
};

const Sys = {
  sendPower: (a) => {
    if (confirm(a.toUpperCase() + "?")) Socket.send("POWER_CMD", a);
  },
};

// 5. STARTUP
const History = {
  key: "remote_ip_history",
  load: () => {
    const h = JSON.parse(localStorage.getItem(History.key) || "[]");
    document.getElementById("historyItems").innerHTML =
      h
        .map(
          (ip) =>
            `<div class="history-item" onclick="document.getElementById('ipInput').value='${ip}'"><span>${ip}</span> <span style="color:var(--danger-color)" onclick="event.stopPropagation();History.del('${ip}')">×</span></div>`
        )
        .join("") || "<small>Trống</small>";
    if (h.length) document.getElementById("ipInput").value = h[0];
  },
  add: (ip) => {
    let h = JSON.parse(localStorage.getItem(History.key) || "[]");
    h = h.filter((x) => x !== ip);
    h.unshift(ip);
    if (h.length > 5) h.pop();
    localStorage.setItem(History.key, JSON.stringify(h));
    History.load();
  },
  del: (ip) => {
    let h = JSON.parse(localStorage.getItem(History.key) || "[]");
    localStorage.setItem(
      History.key,
      JSON.stringify(h.filter((x) => x !== ip))
    );
    History.load();
  },
};

window.startConnection = () => {
  let ip = document.getElementById("ipInput").value.trim();
  if (!ip) return alert("Vui lòng nhập IP!");
  ip = ip.replace(/^(ws|http)s?:\/\//, "");
  let raw_ip = ip;
  if (ip.endsWith("/")) ip = ip.slice(0, -1);
  if (!ip.includes(":")) ip += ":8080";
  App.serverIP = ip;
  History.add(raw_ip);
  Socket.init(ip);
  document.getElementById("client-info").innerText = "CONNECTING...";
};

// DOM helper for Rec Mode
window.toggleRecMode = function () {
  const mode = document.querySelector('input[name="recMode"]:checked').value;
  document.getElementById("timerInputRow").style.display =
    mode === "timer" ? "flex" : "none";
};

// INIT
UI.initTheme();
History.load();
document.getElementById("ipInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") startConnection();
});
if (document.getElementById("lblDeviceId"))
  document.getElementById("lblDeviceId").textContent = App.DEVICE_ID;
