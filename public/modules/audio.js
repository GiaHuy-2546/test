// modules/audio.js

let audioCtx = null;
let audioDest = null;
let audioGain = null;
let nextAudioTime = 0;
let isMuted = false;

// Khởi tạo Audio Context (cần tương tác người dùng để chạy)
export function initAudio() {
  if (audioCtx) return;

  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;

  audioCtx = new Ctor();
  audioDest = audioCtx.createMediaStreamDestination();
  audioGain = audioCtx.createGain();

  // Kết nối: Nguồn -> Gain -> Destination (để ghi âm vào video)
  audioGain.connect(audioDest);

  // Kết nối: Nguồn -> Gain -> Loa (để nghe trực tiếp)
  audioGain.connect(audioCtx.destination);

  console.log("[AUDIO] Ready");
}

// Phát gói tin PCM nhận được từ Server
export function playPcmData(arrayBuffer) {
  if (!audioCtx || isMuted) return;
  if (audioCtx.state === "suspended") audioCtx.resume();

  // Xử lý buffer lẻ byte
  let buf = arrayBuffer;
  if (buf.byteLength % 2 !== 0) buf = buf.slice(0, buf.byteLength - 1);

  const pcm = new Int16Array(buf);
  const float = audioCtx.createBuffer(1, pcm.length, 16000);
  const ch = float.getChannelData(0);

  for (let i = 0; i < pcm.length; i++) {
    ch[i] = pcm[i] / 32768.0;
  }

  const src = audioCtx.createBufferSource();
  src.buffer = float;
  src.connect(audioGain);

  const now = audioCtx.currentTime;
  if (nextAudioTime < now) nextAudioTime = now;
  src.start(nextAudioTime);
  nextAudioTime += src.buffer.duration;
}

// Bật/Tắt tiếng
export function toggleMute(btn) {
  isMuted = !isMuted;
  if (audioGain) audioGain.gain.value = isMuted ? 0 : 1;

  if (btn) {
    if (isMuted) {
      btn.textContent = "🔇 OFF";
      btn.classList.add("muted");
      btn.classList.remove("btn-warning");
    } else {
      btn.textContent = "🔊 ON";
      btn.classList.add("btn-warning");
      btn.classList.remove("muted");
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    }
  }
}

// Lấy stream âm thanh để trộn vào Video Recorder
export function getAudioStream() {
  return audioDest ? audioDest.stream : null;
}

// Resume nếu bị treo
export function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
    nextAudioTime = audioCtx.currentTime;
  }
}
