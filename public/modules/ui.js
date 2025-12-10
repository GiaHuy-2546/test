// modules/ui.js

// --- 1. LOGIC THEME ---
export function toggleTheme() {
  const body = document.body;
  body.classList.toggle("dark-mode");

  if (body.classList.contains("dark-mode")) {
    localStorage.setItem("theme", "dark");
  } else {
    localStorage.setItem("theme", "light");
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark-mode");
  }
}
initTheme();

// --- 2. LOGIC THANH TRUOT (SLIDER) ---
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

// --- 3. LOG & TAB UTILS ---
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
    moveSlider(btn);
  }

  const tabContent = document.getElementById("tab-" + id);
  if (tabContent) {
    tabContent.classList.add("active");
  }
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

// --- 4. CUSTOM CONFIRM MODAL (MỚI) ---
export function showConfirm(msg, callback) {
  const m = document.getElementById("confirmModal");
  const t = document.getElementById("confirmMsg");
  const b = document.getElementById("btnConfirmYes");

  if (m && t && b) {
    t.textContent = msg;

    // Clone nút Yes để xóa các event listener cũ
    const nb = b.cloneNode(true);
    b.parentNode.replaceChild(nb, b);

    // Gán sự kiện mới
    nb.onclick = () => {
      callback();
      closeConfirm();
    };

    m.style.display = "flex";
  }
}

export function closeConfirm() {
  const m = document.getElementById("confirmModal");
  if (m) m.style.display = "none";
}
