import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url";

//Hàm gọi API 8001 của Admin Panel để kiểm tra quyền của client
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        // Kiểm tra lỗi (Ví dụ: Admin panel 8001 chưa chạy)
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(
            new Error(`Loi API 8001, StatusCode: ${res.statusCode}`)
          );
        }

        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });

        res.on("end", () => {
          try {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } catch (e) {
            reject(e); // Lỗi parse JSON
          }
        });
      })
      .on("error", (e) => {
        reject(e); // Lỗi kết nối (ví dụ: 8001 bị từ chối)
      });
  });
}

const WS_PORT = 8080;
const CMD_TCP_PORT = 9000;
const STREAM_TCP_PORT = 9001;
const TCP_HOST = "127.0.0.1";
const IPC_URL = "http://localhost:8001";

const EOI = Buffer.from([0xff, 0xd9]);
const SOI = Buffer.from([0xff, 0xd8]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Chuyển các file UI cần thiết trong thư mục public
const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "../public")));
console.log(
  `[SYSTEM] Dang phuc vu file tu: ${path.join(__dirname, "../public")}`
);

// Tạo kết nối TCP bền vững đến cổng 9000 của server
const pendingRequests = new Map();
let cmdIdCounter = 0;
let cmdTcp = null;
// Dữ liệu phản hồi có dạng CorrelationID|JSON...
function connectCmdTcp() {
  console.log(`[SYSTEM] [CMD_TCP] Dang ket noi Cong Lenh (9000)...`);
  cmdTcp = net.createConnection(CMD_TCP_PORT, TCP_HOST, () => {
    console.log("[SYSTEM] [CMD_TCP] Da ket noi Cong Lenh C++.");
  });
  let textBuffer = "";
  cmdTcp.on("data", (buffer) => {
    textBuffer += buffer.toString("utf-8");
    let newlineIndex;
    while ((newlineIndex = textBuffer.indexOf("\n")) >= 0) {
      const line = textBuffer.substring(0, newlineIndex).trim();
      textBuffer = textBuffer.substring(newlineIndex + 1);
      const parts = line.split("|", 2);
      if (parts.length < 2) continue;
      const correlationId = parts[0];
      const payloadLine = parts[1];
      const ws = pendingRequests.get(correlationId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        handleTcpResponse(ws, payloadLine);
      }
      pendingRequests.delete(correlationId);
    }
  });
  cmdTcp.on("close", () => {
    console.error(
      "[SYSTEM] [CMD_TCP] Mat ket noi Cong Lenh! Dang ket noi lai..."
    );
    pendingRequests.clear();
    setTimeout(connectCmdTcp, 2000);
  });
  cmdTcp.on("error", (err) => {
    console.error(`[SYSTEM] [CMD_TCP] Loi: ${err.message}`);
  });
}

// Hàm xử lý dữ liệu khi server phản hồi
function handleTcpResponse(ws, line) {
  let jsonString = line;

  // Nếu là gói tin Base64, giải mã trước
  if (line.startsWith("B64:")) {
    try {
      const b64 = line.substring(4); // Bo chu "B64:"
      jsonString = Buffer.from(b64, "base64").toString("utf-8");
    } catch (e) {
      console.error(`[SYSTEM] [TCP->WS] Loi Decode Base64: ${e.message}`);
      return;
    }
  }

  // Xử lý JSON
  if (jsonString.startsWith("JSON ")) {
    const jsonPayload = jsonString.substring(5);
    try {
      const data = JSON.parse(jsonPayload);
      let command = "UNKNOWN";

      if (data.log !== undefined) command = "GET_KEYLOG";
      else if (data.path !== undefined) command = "RECORD_VIDEO";
      else if (data.video !== undefined) command = "GET_DEVICES";
      else if (data.payload !== undefined) command = "GET_SCREENSHOT";
      else if (Array.isArray(data)) {
        if (data.length > 0 && data[0].hwnd !== undefined) command = "GET_APPS";
        else if (data.length > 0 && data[0].exe !== undefined)
          command = "GET_PROCS";
        else command = "GET_APPS";
      } else if (data.ok) command = "COMMAND_OK";

      const payloadToSend = command === "GET_SCREENSHOT" ? data.payload : data;
      ws.send(
        JSON.stringify({
          type: "json",
          command: command,
          payload: payloadToSend,
        })
      );
    } catch (e) {
      console.error(`[SYSTEM] [TCP->WS] Loi parse JSON phan hoi: ${e.message}`);
      console.error(`[DEBUG] Bad Payload: ${jsonPayload.substring(0, 50)}...`);
    }
  }
}

const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
  let clientIP = req.socket.remoteAddress;
  if (clientIP.includes("::ffff:")) {
    clientIP = clientIP.split("::ffff:")[1];
  }
  const clientPort = req.socket.remotePort;
  const clientInfo = `${clientIP}:${clientPort}`; // IP:PORT (Socket)

  // Đọc ID Device từ URL
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const deviceId = reqUrl.searchParams.get("id") || "ID_UNKNOWN";

  console.log(
    `[${clientInfo}] [AUTH] Client moi (ID: ${deviceId}), dang kiem tra quyen...`
  );

  const activeStreamSockets = new Set();
  let authInterval = null;
  let isApproved = false;

  function stopAllStreams() {
    if (activeStreamSockets.size > 0) {
      console.log(
        `[${clientInfo}] [STREAM_TCP] Dang dong ${activeStreamSockets.size} luong stream cu...`
      );
      activeStreamSockets.forEach((sock) => sock.destroy());
      activeStreamSockets.clear();
    }
  }

  // Hàm xác thực gọi API 8001 để xem Admin đã duyệt chưa.
  async function checkAuth() {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let authStatus = "rejected";
    let recheckMs = 5000;

    try {
      const url = `${IPC_URL}/check-client?ip=${clientIP}&id=${deviceId}`;
      const data = await httpGetJson(url);

      authStatus = data.status;
      if (data.recheck_ms) recheckMs = data.recheck_ms;
    } catch (e) {
      console.error(
        `[${clientInfo}] [AUTH] Khong the ket noi API 8001: ${e.message}`
      );
      authStatus = "rejected";
    }

    // Nếu được duyệt thì gửi thông tin báo cho client
    if (authStatus === "approved") {
      if (!isApproved) {
        isApproved = true;
        console.log(
          `[${clientInfo}] [AUTH] DA DUYET (ID: ${deviceId}). Dang ket noi...`
        );
        ws.send(
          JSON.stringify({
            type: "auth",
            status: "approved",
            message: "Đã duyệt.",
            clientIP: clientIP,
            deviceId: deviceId,
          })
        );
        httpGetJson(
          `${IPC_URL}/report-status?ip=${clientIP}&id=${deviceId}&status=online`
        ).catch(() => {});
        if (cmdTcp && !cmdTcp.destroyed) {
          const correlationId = `${clientInfo}_${++cmdIdCounter}`;
          pendingRequests.set(correlationId, ws);
          cmdTcp.write(`${correlationId}|GET_DEVICES\n`);
        }
      }
      authInterval = setTimeout(checkAuth, recheckMs);
    } else if (authStatus === "pending") {
      if (isApproved) {
        console.log(
          `[${clientInfo}] [AUTH] BI CHAN (Approved -> Pending). Dang ngat ket noi...`
        );
        ws.send(
          JSON.stringify({
            type: "auth",
            status: "rejected",
            message: `Quyền truy cập của bạn đã bị thu hồi.\n(IP: ${clientIP})`,
            clientIP: clientIP,
            deviceId: deviceId,
          })
        );
        ws.close();
      } else {
        console.log(
          `[${clientInfo}] [AUTH] CHO DUYET. Check lai sau ${recheckMs}ms`
        );
        ws.send(
          JSON.stringify({
            type: "auth",
            status: "pending",
            message: `Đang chờ Admin duyệt...\n(IP: ${clientIP})`,
            clientIP: clientIP,
            deviceId: deviceId,
          })
        );
        authInterval = setTimeout(checkAuth, recheckMs);
      }
    } else {
      console.log(`[${clientInfo}] [AUTH] TU CHOI. Ngat ket noi.`);
      ws.send(
        JSON.stringify({
          type: "auth",
          status: "rejected",
          message: `Kết nối bị từ chối.\n(IP: ${clientIP})`,
          clientIP: clientIP,
          deviceId: deviceId,
        })
      );
      ws.close();
    }
  }

  checkAuth();

  ws.on("message", (data) => {
    if (!isApproved) {
      console.log(`[${clientInfo}] [WS] Bo qua message (chua duoc duyet).`);
      return;
    }
    const msg = JSON.parse(data.toString());
    let tcpCmd = msg.command;
    // Xử lý khi dừng stream
    if (msg.command === "STOP_STREAM") {
      console.log(`[${clientInfo}] [WS] Nhan lenh STOP_STREAM.`);
      stopAllStreams();
      return;
    }
    // Xử lý khi nhận lệnh stream: Tạo một kết nối TCP MỚI tới cổng 9001 của C++.
    if (
      msg.command === "START_STREAM_SCREEN" ||
      msg.command === "START_STREAM_CAM"
    ) {
      stopAllStreams();
      console.log(
        `[${clientInfo}] [STREAM_TCP] Yeu cau stream moi, mo ket noi 9001...`
      );
      const streamTcp = net.createConnection(STREAM_TCP_PORT, TCP_HOST);
      activeStreamSockets.add(streamTcp);
      const isScreenStream = msg.command === "START_STREAM_SCREEN";
      if (!isScreenStream) {
        tcpCmd += ` "${msg.payload.cam}" "${msg.payload.audio}"`;
      }
      streamTcp.on("connect", () => {
        console.log(
          `[${clientInfo}] [STREAM_TCP] Da ket noi 9001, gui lenh: ${tcpCmd}`
        );
        streamTcp.write(tcpCmd + "\n");
      });
      let streamBuffer = Buffer.alloc(0);
      streamTcp.on("data", (buffer) => {
        // GOM DỮ LIỆU VÀO BUFFER CHUNG
        streamBuffer = Buffer.concat([streamBuffer, buffer]);

        // VÒNG LẶP CẮT GÓI TIN (DỰA TRÊN 4 BYTE ĐẦU TIÊN LÀ KÍCH THƯỚC)
        // Áp dụng cho cả Video Màn hình, Video Camera và Audio
        while (streamBuffer.length >= 4) {
          // 1. Đọc 4 byte đầu để lấy kích thước gói (Little Endian)
          const frameSize = streamBuffer.readUInt32LE(0);

          // 2. Kiểm tra xem đã nhận đủ dữ liệu cho gói này chưa
          // (4 byte header + frameSize dữ liệu thực)
          if (streamBuffer.length >= 4 + frameSize) {
            // 3. Cắt lấy phần dữ liệu thực (bỏ 4 byte header đi)
            const frame = streamBuffer.slice(4, 4 + frameSize);

            // 4. Gửi xuống Client
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(frame);
            }

            // 5. Cắt phần đã xử lý khỏi buffer để xử lý gói tiếp theo
            streamBuffer = streamBuffer.slice(4 + frameSize);
          } else {
            // Chưa đủ dữ liệu, đợi gói TCP tiếp theo
            break;
          }
        }
      });
      streamTcp.on("close", () => {
        console.log(`[${clientInfo}] [STREAM_TCP] Da dong stream.`);
        activeStreamSockets.delete(streamTcp);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "stream_stop" }));
        }
      });
      streamTcp.on("error", (err) => {
        console.error(`[${clientInfo}] [STREAM_TCP] Loi: ${err.message}`);
        activeStreamSockets.delete(streamTcp);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "stream_stop" }));
        }
      });
    } else {
      // Kiểm lỗi
      if (!cmdTcp || cmdTcp.destroyed) {
        console.log(
          `[${clientInfo}] [WS->TCP] Loi: Dinh gui lenh nhung Cong Lenh 9000 offline.`
        );
        ws.send(
          JSON.stringify({
            type: "error",
            payload: "Loi: Cong Lenh C++ dang offline.",
          })
        );
        return;
      }
      const correlationId = `${clientInfo}_${++cmdIdCounter}`;
      pendingRequests.set(correlationId, ws);
      // Xử lý khi cần quay video
      if (msg.payload) {
        if (msg.command === "RECORD_VIDEO") {
          tcpCmd += ` ${msg.payload.duration} "${msg.payload.cam}" "${msg.payload.audio}"`;
        } else {
          tcpCmd += ` ${msg.payload}`;
        }
      }
      // Xử lý lệnh bình thường qua port 9000
      console.log(
        `[${clientInfo}] [WS->TCP] Gui Lenh 9000: ${correlationId}|${tcpCmd}`
      );
      cmdTcp.write(`${correlationId}|${tcpCmd}\n`);
    }
  });

  // Xử lý khi client ngắt kết nối
  ws.on("close", () => {
    console.log(`[${clientInfo}] [WS] Client da ngat ket noi.`);
    if (authInterval) clearTimeout(authInterval);
    stopAllStreams();
    if (isApproved) {
      httpGetJson(
        `${IPC_URL}/report-status?ip=${clientIP}&id=${deviceId}&status=offline`
      ).catch(() => {});
    }
  });
});

// Thực hiện khởi tạo kết nối TCP
server.listen(WS_PORT, () => {
  console.log(
    `[SYSTEM] HTTP/WS Gateway dang chay tren http://localhost:${WS_PORT}`
  );
  connectCmdTcp();
});
