// modules/tab-screen.js
import { store } from "./store.js";
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";

export function handleScreenshotData(payload) {
  const imgData = "data:image/jpeg;base64," + payload;
  document.getElementById("screenImg").src = imgData;

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

export function updateScreen(save = false) {
  store.isSavingScreenshot = save;
  sendCommand("GET_SCREENSHOT");
}

export function toggleAutoShot(cb) {
  if (cb.checked) {
    store.isSavingScreenshot = false;
    updateScreen(true);
    store.autoShotInt = setInterval(() => updateScreen(true), 2000);
  } else {
    clearInterval(store.autoShotInt);
  }
}

export function loadGallery() {
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

export function clearGallery() {
  showConfirm("Xóa hết ảnh trong thư viện?", () => {
    if (!store.db) return;
    store.db
      .transaction(["images"], "readwrite")
      .objectStore("images")
      .clear().onsuccess = () => {
      loadGallery();
      logActionUI("Đã xóa thư viện ảnh", true);
    };
  });
}

// === BIẾN TOÀN CỤC ===
let isMouseControlEnabled = false;
let isKeyboardControlEnabled = false;

// === HÀM BẬT/TẮT STREAM ===
export function toggleScreenStream(btn) {
  const streamView = document.getElementById("screenStreamView");
  const streamStatus = document.getElementById("screenStreamStatus");
  const streamPlaceholder = document.getElementById("screenStreamPlaceholder");
  const chkMouse = document.getElementById("chkMouse");
  const chkKeyboard = document.getElementById("chkKeyboard");

  // TRƯỜNG HỢP 1: TẮT STREAM (gọi từ nội bộ hoặc khi chuyển tab)
  if (btn === null) {
    store.isScreenStreamOn = false;

    // Reset UI
    streamView.removeAttribute("src");
    streamView.style.display = "none";
    if (streamStatus) streamStatus.style.display = "none";
    if (streamPlaceholder) streamPlaceholder.style.display = "block";

    // Reset nút
    const activeBtn = document.getElementById("btnToggleScreenStream");
    if (activeBtn) {
      activeBtn.textContent = "▶️ Bật Stream Màn Hình";
      activeBtn.classList.remove("btn-danger");
      activeBtn.classList.add("btn-primary");
    }

    // TẮT HẾT điều khiển chuột/bàn phím
    if (chkMouse && chkMouse.checked) {
      chkMouse.checked = false;
      if (isMouseControlEnabled) toggleRemoteInput("mouse");
    }
    if (chkKeyboard && chkKeyboard.checked) {
      chkKeyboard.checked = false;
      if (isKeyboardControlEnabled) toggleRemoteInput("keyboard");
    }

    return;
  }

  // TRƯỜNG HỢP 2: NGƯỜI DÙNG BẤM NÚT
  store.isScreenStreamOn = !store.isScreenStreamOn;

  if (store.isScreenStreamOn) {
    // BẬT STREAM
    if (store.isCamStreamOn) {
      if (window.toggleCamStream) window.toggleCamStream(null);
    }

    if (streamPlaceholder) streamPlaceholder.style.display = "none";
    streamView.style.display = "block";

    btn.textContent = "⏹️ Tắt Stream Màn Hình";
    btn.classList.add("btn-danger");
    btn.classList.remove("btn-primary");

    logActionUI("Bật livestream màn hình", true);
    sendCommand("START_STREAM_SCREEN");
  } else {
    // TẮT STREAM
    toggleScreenStream(null);
    sendCommand("STOP_STREAM");
    logActionUI("Tắt livestream màn hình", true);
  }
}

// === HÀM BẬT/TẮT ĐIỀU KHIỂN (CHỈ HOẠT ĐỘNG KHI STREAM BẬT) ===
export function toggleRemoteInput(type) {
  // KIỂM TRA: Chỉ cho phép bật điều khiển khi stream đang chạy
  if (
    !store.isScreenStreamOn &&
    ((type === "mouse" && !isMouseControlEnabled) ||
      (type === "keyboard" && !isKeyboardControlEnabled))
  ) {
    logActionUI("⚠️ Bật Stream trước khi điều khiển!", false);

    // Reset checkbox về trạng thái cũ
    const chk = document.getElementById(
      type === "mouse" ? "chkMouse" : "chkKeyboard"
    );
    if (chk) chk.checked = false;
    return;
  }

  const streamView = document.getElementById("screenStreamView");
  const streamContainer = document.getElementById("streamContainer");

  if (type === "mouse") {
    isMouseControlEnabled = !isMouseControlEnabled;

    if (isMouseControlEnabled) {
      streamView.addEventListener("mousemove", handleMouseMove);
      streamView.addEventListener("mousedown", handleMouseDown);
      streamView.addEventListener("mouseup", handleMouseUp);
      streamView.addEventListener("contextmenu", (e) => e.preventDefault());
      streamView.style.cursor = "crosshair";
      logActionUI("Đã BẬT điều khiển chuột", true);
    } else {
      streamView.removeEventListener("mousemove", handleMouseMove);
      streamView.removeEventListener("mousedown", handleMouseDown);
      streamView.removeEventListener("mouseup", handleMouseUp);
      streamView.style.cursor = "default";
      logActionUI("Đã TẮT điều khiển chuột", true);
    }
  } else if (type === "keyboard") {
    isKeyboardControlEnabled = !isKeyboardControlEnabled;

    if (isKeyboardControlEnabled) {
      streamContainer.focus();
      streamContainer.addEventListener("keydown", handleKeyDown);
      streamContainer.addEventListener("keyup", handleKeyUp);
      logActionUI("Đã BẬT điều khiển bàn phím", true);
    } else {
      streamContainer.removeEventListener("keydown", handleKeyDown);
      streamContainer.removeEventListener("keyup", handleKeyUp);
      logActionUI("Đã TẮT điều khiển bàn phím", true);
    }
  }
}

// === XỬ LÝ SỰ KIỆN CHUỘT ===
function handleMouseMove(event) {
  if (!store.isScreenStreamOn || !isMouseControlEnabled) return;

  const rect = event.target.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  sendCommand(`INPUT_MOUSE move ${x.toFixed(4)} ${y.toFixed(4)}`);
}

function handleMouseDown(event) {
  event.preventDefault();
  if (!store.isScreenStreamOn || !isMouseControlEnabled) return;

  const btn = event.button;
  sendCommand(`INPUT_MOUSE down ${btn}`);
}

function handleMouseUp(event) {
  event.preventDefault();
  if (!store.isScreenStreamOn || !isMouseControlEnabled) return;

  const btn = event.button;
  sendCommand(`INPUT_MOUSE up ${btn}`);
}

// === XỬ LÝ SỰ KIỆN BÀN PHÍM ===
function handleKeyDown(event) {
  if (!store.isScreenStreamOn || !isKeyboardControlEnabled) return;
  event.preventDefault();
  // Chặn các phím đặc biệt
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  // -------------------------------

  event.preventDefault();

  sendCommand(`INPUT_KEY down ${event.keyCode}`);
}

function handleKeyUp(event) {
  if (!store.isScreenStreamOn || !isKeyboardControlEnabled) return;

  // Cũng chặn ở keyUp cho đồng bộ
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  sendCommand(`INPUT_KEY up ${event.keyCode}`);
}

window.toggleRemoteInput = toggleRemoteInput;
