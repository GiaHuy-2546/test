// modules/tab-sys.js
import { sendCommand } from "./socket.js";
import { logActionUI, showConfirm } from "./ui.js";

export function sendPower(act) {
  showConfirm("CHẮC CHẮN " + act.toUpperCase() + " MÁY TÍNH?", () => {
    sendCommand("POWER_CMD", act);
    logActionUI("Lệnh nguồn: " + act, true);
  });
}
