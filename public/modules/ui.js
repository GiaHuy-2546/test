// modules/ui.js
// (Khong import cac module tab de tranh loi phu thuoc vong)

// --- LOGIC THANH TRUOT (SLIDER) ---
function moveSlider(targetButton) {
  const slider = document.getElementById("tab-slider");
  if (!slider || !targetButton) return;
  const left = targetButton.offsetLeft;
  const width = targetButton.offsetWidth;
  slider.style.left = `${left}px`;
  slider.style.width = `${width}px`;
}
export function handleTabHover(targetButton) {
  moveSlider(targetButton);
}
export function handleTabLeave() {
  const activeButton = document.querySelector(".tab-btn.active");
  if (activeButton) {
    moveSlider(activeButton);
  }
}
// --- KET THUC LOGIC SLIDER ---

export function logActionUI(msg, success) {
  const list = document.getElementById("actionLogList");
  if (list) {
    const i = document.createElement("div");
    i.className = "log-item " + (success ? "success" : "error");
    i.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    list.insertBefore(i, list.firstChild);
  }
}

export function toggleActionLog() {
  const l = document.getElementById("actionLogList");
  if (l) {
    l.classList.toggle("minimized");
  }
}

/**
 * @brief Ham chinh de chuyen doi giao dien tab (CHI GIAO DIEN)
 */
export function showTab(id) {
  document
    .querySelectorAll(".tab-content")
    .forEach((el) => el.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((el) => el.classList.remove("active"));

  const btn = document.querySelector(`button[onclick="showTab('${id}')"]`);
  if (btn) {
    btn.classList.add("active");
    moveSlider(btn); // Di chuyen slider den nut vua click
  }

  const tabContent = document.getElementById("tab-" + id);
  if (tabContent) {
    tabContent.classList.add("active");
  }
  // (app.js se chiu trach nhiem tai du lieu)
}

export function filterTable(tid, col, txt) {
  document
    .querySelectorAll(`#${tid} tbody tr`)
    .forEach(
      (tr) =>
        (tr.style.display = tr.innerText
          .toLowerCase()
          .includes(txt.toLowerCase())
          ? ""
          : "none")
    );
}
