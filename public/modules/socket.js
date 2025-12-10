// modules/socket.js
import { store } from "./store.js";
import { playPcmData, initAudio } from "./audio.js";

export const socket = new WebSocket(
  `ws://${window.location.host}?id=${store.DEVICE_ID}`
);

const responseHandlers = {};

export function onCommand(command, handler) {
  responseHandlers[command] = handler;
}

socket.onmessage = (event) => {
  if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
    const reader = new FileReader();
    reader.onload = function () {
      const buffer = this.result;
      const u8 = new Uint8Array(buffer);

      // Header JPEG: FF D8
      if (u8.length > 1 && u8[0] === 0xff && u8[1] === 0xd8) {
        const url = URL.createObjectURL(
          new Blob([buffer], { type: "image/jpeg" })
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
      } else {
        // Âm thanh PCM
        initAudio();
        playPcmData(buffer);
      }
    };

    if (event.data instanceof Blob) reader.readAsArrayBuffer(event.data);
    else reader.readAsArrayBuffer(new Blob([event.data]));
    return;
  }

  // Xử lý JSON
  try {
    const msg = JSON.parse(event.data);

    if (msg.type === "auth") {
      window.dispatchEvent(
        new CustomEvent("socket:auth", {
          detail: {
            status: msg.status,
            message: msg.message,
            clientInfo: msg.clientInfo,
            deviceId: msg.deviceId,
          },
        })
      );
      return;
    }

    if (msg.type === "stream_start") {
      console.log("Nhan tin hieu STREAM_START");
      if (store.isScreenStreamOn)
        document.getElementById("screenStreamStatus").textContent =
          "✅ Đã kết nối luồng.";
      if (store.isCamStreamOn)
        document.getElementById("camStreamStatus").textContent =
          "✅ Đã kết nối luồng.";
      return;
    }

    if (msg.type === "stream_stop") {
      console.log("Nhan tin hieu STREAM_STOP");
      if (store.isScreenStreamOn && window.toggleScreenStream)
        window.toggleScreenStream(null);
      if (store.isCamStreamOn && window.toggleCamStream)
        window.toggleCamStream(null);
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
      }
    }
  } catch (e) {
    console.error("Loi parse JSON socket:", e);
  }
};

socket.onopen = () => {
  console.log("WebSocket connected. Waiting auth...");
};

socket.onclose = (event) => {
  console.error("WebSocket closed", event.reason);
  window.dispatchEvent(
    new CustomEvent("socket:close", { detail: event.reason })
  );
};

socket.onerror = (err) => {
  console.error("WebSocket error", err);
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
    console.error("WebSocket not ready");
  }
}
