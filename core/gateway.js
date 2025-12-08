// gateway.js (FIX 3: Doc va Gui Device ID)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { URL } from "url"; // Them URL de parse query string

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        // Kiem tra loi (vi du: admin panel 8001 chua chay)
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
            reject(e); // Loi parse JSON
          }
        });
      })
      .on("error", (e) => {
        reject(e); // Loi ket noi (vi du: 8001 bi tu choi)
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
  res.header("Access-Control-Allow-Origin", "*"); // Cho phep moi IP truy cap
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const server = http.createServer(app);
app.use(express.static(path.join(__dirname, "../public")));
console.log(
  `[SYSTEM] Dang phuc vu file tu: ${path.join(__dirname, "../public")}`
);

const pendingRequests = new Map();
let cmdIdCounter = 0;
let cmdTcp = null;

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

function handleTcpResponse(ws, line) {
  let jsonString = line;

  // 1. Neu la goi tin Base64 (phien ban moi), giai ma truoc
  if (line.startsWith("B64:")) {
    try {
      const b64 = line.substring(4); // Bo chu "B64:"
      jsonString = Buffer.from(b64, "base64").toString("utf-8");
    } catch (e) {
      console.error(`[SYSTEM] [TCP->WS] Loi Decode Base64: ${e.message}`);
      return;
    }
  }

  // 2. Xu ly JSON nhu binh thuong
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
      // Log mot phan payload de debug neu can
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

  // === FIX 3: Doc Device ID tu URL ===
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const deviceId = reqUrl.searchParams.get("id") || "ID_UNKNOWN";
  // === KET THUC FIX ===

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

  async function checkAuth() {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    let authStatus = "rejected";
    let recheckMs = 5000;

    try {
      const url = `${IPC_URL}/check-client?ip=${clientIP}&id=${deviceId}`;

      // Goi helper httpGetJson moi thay vi fetch
      const data = await httpGetJson(url);

      authStatus = data.status;
      if (data.recheck_ms) recheckMs = data.recheck_ms;
    } catch (e) {
      console.error(
        `[${clientInfo}] [AUTH] Khong the ket noi API 8001: ${e.message}`
      );
      authStatus = "rejected";
    }

    if (authStatus === "approved") {
      if (!isApproved) {
        isApproved = true;
        console.log(
          `[${clientInfo}] [AUTH] DA DUYET (ID: ${deviceId}). Dang ket noi...`
        );
        // === FIX 3: Gui them clientInfo va deviceId ===
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
      // status === "rejected"
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
    if (msg.command === "STOP_STREAM") {
      console.log(`[${clientInfo}] [WS] Nhan lenh STOP_STREAM.`);
      stopAllStreams();
      return;
    }
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
        if (isScreenStream) {
          streamBuffer = Buffer.concat([streamBuffer, buffer]);
          while (streamBuffer.length >= 4) {
            const frameSize = streamBuffer.readUInt32LE(0);
            if (streamBuffer.length >= 4 + frameSize) {
              const frame = streamBuffer.slice(4, 4 + frameSize);
              if (ws.readyState === WebSocket.OPEN) ws.send(frame);
              streamBuffer = streamBuffer.slice(4 + frameSize);
            } else break;
          }
        } else {
          streamBuffer = Buffer.concat([streamBuffer, buffer]);
          let eoiIndex;
          while ((eoiIndex = streamBuffer.indexOf(EOI)) !== -1) {
            const frameEnd = eoiIndex + 2;
            let frame = streamBuffer.slice(0, frameEnd);
            let soiIndex = frame.indexOf(SOI);
            if (soiIndex !== -1) {
              frame = frame.slice(soiIndex);
              if (ws.readyState === WebSocket.OPEN) ws.send(frame);
            }
            streamBuffer = streamBuffer.slice(frameEnd);
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
      if (msg.payload) {
        if (msg.command === "RECORD_VIDEO") {
          tcpCmd += ` ${msg.payload.duration} "${msg.payload.cam}" "${msg.payload.audio}"`;
        } else {
          tcpCmd += ` ${msg.payload}`;
        }
      }
      console.log(
        `[${clientInfo}] [WS->TCP] Gui Lenh 9000: ${correlationId}|${tcpCmd}`
      );
      cmdTcp.write(`${correlationId}|${tcpCmd}\n`);
    }
  });

  ws.on("close", () => {
    console.log(`[${clientInfo}] [WS] Client da ngat ket noi.`);
    if (authInterval) clearTimeout(authInterval);
    stopAllStreams();
    if (isApproved) {
      // === FIX 3: Gui ca 'id' (Device ID) khi bao cao ===
      httpGetJson(
        `${IPC_URL}/report-status?ip=${clientIP}&id=${deviceId}&status=offline`
      ).catch(() => {});
    }
  });
});

server.listen(WS_PORT, () => {
  console.log(
    `[SYSTEM] HTTP/WS Gateway dang chay tren http://localhost:${WS_PORT}`
  );
  connectCmdTcp();
});
