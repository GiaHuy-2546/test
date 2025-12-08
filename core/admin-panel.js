// admin-panel.js (FIX 3: Dung Device ID lam Key)
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { spawn, exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const ADMIN_PORT = 8000;
const CLIENT_WEB_PORT = 8080;
const IPC_PORT = 8001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const childProcesses = { cpp: null, gateway: null };
const adminClients = new Set();

// === FIX 3: Chuyen Key tu IP -> Device ID ===
const clientLists = {
  // Map<string(DeviceID), { ip: string, firstSeen: Date }>
  pending: new Map(),
  approved: new Map(),
  rejected: new Map(),
};
// Set<string(DeviceID)>
const onlineClients = new Set();

function getClientAccessIPs() {
  const ips = [];
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastToAdmin(data) {
  const payload = JSON.stringify(data);
  adminClients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastClientListUpdate() {
  broadcastToAdmin({
    type: "CLIENT_LIST_UPDATE",
    lists: {
      pending: Array.from(clientLists.pending.entries()),
      approved: Array.from(clientLists.approved.entries()),
      rejected: Array.from(clientLists.rejected.entries()),
      online: Array.from(onlineClients),
    },
  });
}

function log(source, message) {
  console.log(`[${source}]: ${message}`);
  let clientIp = "SYSTEM";
  let cleanMessage = message;
  const ipMatch = message.match(/\[(::ffff:)?([\d\.:]+)\]/);
  if (ipMatch && ipMatch[2] !== "0.0.0.0") {
    clientIp = ipMatch[2];
    cleanMessage = message.substring(message.indexOf("]") + 1).trim();
    if (cleanMessage.startsWith("[")) {
      cleanMessage = cleanMessage
        .substring(cleanMessage.indexOf("]") + 1)
        .trim();
    }
  } else if (message.startsWith("[")) {
    const correlationIdMatch = message.match(/\[([^_]+_[0-9]+)\]/);
    if (correlationIdMatch) {
      clientIp = correlationIdMatch[1];
      cleanMessage = message.substring(message.indexOf("]") + 1).trim();
    }
  }
  broadcastToAdmin({ source, clientIp, message: cleanMessage });
}

function checkAndLogServersStopped() {
  if (!childProcesses.cpp && !childProcesses.gateway) {
    log("AdminPanel", "Ca hai server da dung hoan toan.");
  }
}

function startServers() {
  if (childProcesses.cpp || childProcesses.gateway) {
    log("AdminPanel", "Lỗi: Server đang chạy!");
    return;
  }
  log("AdminPanel", "Đang khởi động C++ Server (server.exe)...");
  try {
    childProcesses.cpp = spawn(path.join(__dirname, "server.exe"), [], {
      cwd: __dirname,
    });
    childProcesses.cpp.stdout.on("data", (data) =>
      log("C++ Server", data.toString().trim())
    );
    childProcesses.cpp.stderr.on("data", (data) =>
      log("C++ Server (ERR)", data.toString().trim())
    );
    childProcesses.cpp.on("close", (code) => {
      log("AdminPanel", `C++ Server đã dừng với mã ${code}.`);
      childProcesses.cpp = null;
      checkAndLogServersStopped();
    });
    childProcesses.cpp.on("error", (err) => {
      log("AdminPanel (ERR)", "Không thể khởi động server.exe: " + err.message);
    });
  } catch (e) {
    log("AdminPanel (ERR)", "Lỗi spawn server.exe: " + e.message);
    return;
  }
  log("AdminPanel", "Đang khởi động Gateway (gateway.js)...");
  try {
    childProcesses.gateway = spawn(
      "node",
      [path.join(__dirname, "gateway.js")],
      { cwd: __dirname }
    );
    childProcesses.gateway.stdout.on("data", (data) =>
      log("Gateway.js", data.toString().trim())
    );
    childProcesses.gateway.stderr.on("data", (data) =>
      log("Gateway.js (ERR)", data.toString().trim())
    );
    childProcesses.gateway.on("close", (code) => {
      log("AdminPanel", `Gateway.js đã dừng với mã ${code}.`);
      childProcesses.gateway = null;
      checkAndLogServersStopped();
    });
    childProcesses.gateway.on("error", (err) => {
      log("AdminPanel (ERR)", "Không thể khởi động gateway.js: " + err.message);
    });
  } catch (e) {
    log("AdminPanel (ERR)", "Lỗi spawn gateway.js: " + e.message);
    return;
  }
  log("AdminPanel", "Đã khởi động cả hai server.");
}

function stopServers() {
  let cppKilled = false;
  let gatewayKilled = false;
  if (childProcesses.cpp) {
    const pid = childProcesses.cpp.pid;
    log(
      "AdminPanel",
      `Dang gui lenh dung (taskkill /T /F) cho C++ Server (PID: ${pid})...`
    );
    exec(`taskkill /PID ${pid} /T /F`, (err, stdout, stderr) => {
      if (err) log("AdminPanel (WARN)", `Taskkill C++ co loi: ${stderr}`);
      else log("AdminPanel", "Taskkill C++ (va cay process) thanh cong.");
    });
    cppKilled = true;
  }
  if (childProcesses.gateway) {
    childProcesses.gateway.kill("SIGTERM");
    log("AdminPanel", "Đã gửi lệnh dừng cho Gateway.js.");
    gatewayKilled = true;
  }
  if (!cppKilled && !gatewayKilled) {
    log("AdminPanel", "Servers da dung san.");
  }
}

wss.on("connection", (ws) => {
  log("AdminPanel", "Giao diện Admin đã kết nối.");
  adminClients.add(ws);

  const accessIPs = getClientAccessIPs();
  broadcastToAdmin({
    type: "INIT_DATA",
    accessURLs: accessIPs.map((ip) => `http://${ip}:${CLIENT_WEB_PORT}`),
  });
  broadcastClientListUpdate();

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.command === "START") {
        log("AdminPanel", "Nhận lệnh START từ UI...");
        startServers();
      } else if (data.command === "STOP") {
        log("AdminPanel", "Nhận lệnh STOP từ UI...");
        stopServers();
      } else if (data.command === "CLOSE_ADMIN") {
        log("AdminPanel", "Nhan lenh dong Admin Panel... Tam biet!");
        stopServers();
        setTimeout(() => process.exit(0), 1000);
      }
      // === FIX 3: Logic duyet client (dung Device ID) ===
      else if (data.command === "APPROVE_ID" && data.id) {
        const clientData = clientLists.pending.get(data.id) ||
          clientLists.rejected.get(data.id) || {
            ip: "N/A",
            firstSeen: new Date(),
          };
        clientLists.pending.delete(data.id);
        clientLists.rejected.delete(data.id);
        clientLists.approved.set(data.id, clientData);
        log("AdminPanel", `DA DUYET client: ${data.id}`);
        broadcastClientListUpdate();
      } else if (data.command === "REJECT_ID" && data.id) {
        const clientData = clientLists.pending.get(data.id) ||
          clientLists.approved.get(data.id) || {
            ip: "N/A",
            firstSeen: new Date(),
          };
        clientLists.pending.delete(data.id);
        clientLists.approved.delete(data.id);
        clientLists.rejected.set(data.id, clientData);
        log("AdminPanel", `DA TU CHOI client: ${data.id}`);
        broadcastClientListUpdate();
      }
    } catch (e) {
      log("AdminPanel (ERR)", `Loi xu ly WS message: ${e.message}`);
    }
  });

  ws.on("close", () => {
    log("AdminPanel", "Giao diện Admin đã ngắt kết nối.");
    adminClients.delete(ws);
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-ui.html"));
});

server.listen(ADMIN_PORT, () => {
  console.log(`=================================================`);
  console.log(`  Bảng Điều Khiển Server dang chay tai:`);
  console.log(`  http://localhost:${ADMIN_PORT}`);
  console.log(`=================================================`);
});

const ipcApp = express();

ipcApp.get("/check-client", (req, res) => {
  const ip = req.query.ip;
  const id = req.query.id; // Nhan Device ID
  if (!ip || !id) return res.status(400).json({ error: "Missing IP or ID" });

  const cleanIp = ip.includes("::ffff:") ? ip.split("::ffff:")[1] : ip;

  // === FIX 1: Giam thoi gian polling ===
  if (cleanIp === "127.0.0.1") {
    return res.json({ status: "approved", recheck_ms: 5000 }); // 5s
  }
  // === FIX 3: Kiem tra bang Device ID ===
  if (clientLists.approved.has(id)) {
    return res.json({ status: "approved", recheck_ms: 5000 }); // 5s
  }
  if (clientLists.rejected.has(id)) {
    return res.json({ status: "rejected" });
  }

  const now = new Date();
  const data = clientLists.pending.get(id) || { firstSeen: now };
  data.ip = cleanIp; // Luu lai IP
  clientLists.pending.set(id, data);

  if (now - data.firstSeen < 10000) {
    log("AdminPanel", `Client MOI (ID: ${id}) dang cho duyet: ${cleanIp}`);
    broadcastClientListUpdate();
  }

  return res.json({ status: "pending", recheck_ms: 5000 }); // 5s
});

ipcApp.get("/report-status", (req, res) => {
  const ip = req.query.ip;
  const id = req.query.id; // Nhan Device ID
  const status = req.query.status;
  if (!id || !status)
    return res.status(400).json({ error: "Missing ID/Status" });

  if (status === "online") {
    onlineClients.add(id);
  } else {
    onlineClients.delete(id);
  }
  broadcastClientListUpdate();
  return res.json({ ok: true });
});

ipcApp.listen(IPC_PORT, () => {
  console.log(`IPC Server (cho Gateway) dang chay tren cong ${IPC_PORT}`);
});
