// modules/socket.js (NANG CAP: Gui Device ID)
import { store } from "./store.js";
// Khong import 'ui' de tranh loi phu thuoc vong

// === FIX 3: Gui DEVICE_ID qua Query Parameter ===
export const socket = new WebSocket(
  `ws://${window.location.host}?id=${store.DEVICE_ID}`
);

const responseHandlers = {};

export function onCommand(command, handler) {
  responseHandlers[command] = handler;
}

// 2. Ham xu ly trung tam KHI NHAN DU LIEU tu Gateway
socket.onmessage = (event) => {
  // Kiem tra stream binary (anh)
  if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
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

  // Xu ly JSON
  const msg = JSON.parse(event.data);

  // Xu ly tin nhan Xac thuc
  if (msg.type === "auth") {
    window.dispatchEvent(
      new CustomEvent("socket:auth", {
        detail: {
          status: msg.status,
          message: msg.message,
          clientInfo: msg.clientInfo, // Socket (IP:Port)
          deviceId: msg.deviceId, // Ma Dinh Danh (CL_f1b9)
        },
      })
    );
    return;
  }

  if (msg.type === "stream_start") {
    console.log("Nhan tin hieu STREAM_START tu server");
    if (store.isScreenStreamOn)
      document.getElementById("screenStreamStatus").textContent =
        "✅ Đã kết nối luồng.";
    if (store.isCamStreamOn)
      document.getElementById("camStreamStatus").textContent =
        "✅ Đã kết nối luồng.";
    return;
  }

  if (msg.type === "stream_stop") {
    console.log("Nhan tin hieu STREAM_STOP (tu Gateway)");
    if (store.isScreenStreamOn) {
      window.toggleScreenStream(null);
    }
    if (store.isCamStreamOn) {
      window.toggleCamStream(null);
    }
    return;
  }

  if (msg.type === "error") {
    window.dispatchEvent(
      new CustomEvent("socket:error", {
        detail: `Lỗi Gateway/TCP: ${msg.payload}`,
      })
    );
    return;
  }

  if (msg.type === "json") {
    const command = msg.command;
    const payload = msg.payload;

    if (responseHandlers[command]) {
      responseHandlers[command](payload);
    } else {
      console.log("Nhan duoc phan hoi khong xu ly:", command, payload);
    }
  }
};

socket.onopen = () => {
  console.log("WebSocket da ket noi! Dang cho xac thuc...");
  // Doi su kien 'socket:auth'
};

socket.onclose = (event) => {
  console.error("WebSocket da dong!", event.reason);
  window.dispatchEvent(
    new CustomEvent("socket:close", { detail: event.reason })
  );
};

socket.onerror = (err) => {
  console.error("Loi WebSocket!", err);
  window.dispatchEvent(
    new CustomEvent("socket:error", { detail: "Lỗi WebSocket Chung" })
  );
};

export function sendCommand(command, payload = null) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        command: command,
        payload: payload,
      })
    );
  } else {
    console.error(`Loi: WebSocket chua san sang (dinh goi lenh: ${command})!`);
    window.dispatchEvent(
      new CustomEvent("socket:error", { detail: "WebSocket not ready" })
    );
  }
}
