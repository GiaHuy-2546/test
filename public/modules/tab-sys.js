// modules/tab-sys.js
import { sendCommand } from "./socket.js";
import { logActionUI } from "./ui.js";

export function sendPower(act) {
  if (confirm("CHẮC CHẮN " + act.toUpperCase() + " MÁY TÍNH?")) {
    sendCommand("POWER_CMD", act); // Gui lenh
    logActionUI("Lệnh nguồn: " + act, true);
  }
}
