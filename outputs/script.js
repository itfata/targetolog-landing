const CONFIG = {
  ctaTimeSeconds: 1035,
  webhookUrl: "/api/lead",
  videoMode: "local",
  localVideoUrl: "./video.mp4"
};

const previewParams = new URLSearchParams(window.location.search);
const previewForm = previewParams.has("form") || previewParams.has("preview");
const useLocalVideo = CONFIG.videoMode === "local" || previewParams.has("local");

let player;
let duration = 0;
let maxWatchedSeconds = 0;
let lastSafeSeconds = 0;
let progressTimer = null;
let ctaShown = false;
let internalSeek = false;
let pendingPlay = false;

const playCover = document.querySelector("#playCover");
const localVideo = document.querySelector("#localVideo");
const youtubeFrame = document.querySelector("#youtubeFrame");
const playButton = document.querySelector("#playButton");
const playButtonIcon = document.querySelector("#playButtonIcon");
const rewindButton = document.querySelector("#rewindButton");
const speedSelect = document.querySelector("#speedSelect");
const progressRange = document.querySelector("#progressRange");
const progressFill = document.querySelector("#progressFill");
const currentTimeLabel = document.querySelector("#currentTime");
const durationTimeLabel = document.querySelector("#durationTime");
const formTrigger = document.querySelector("#formTrigger");
const leadFormPanel = document.querySelector("#leadFormPanel");
const leadForm = document.querySelector("#leadForm");
const formStatus = document.querySelector("#formStatus");

rewindButton.querySelector("span").textContent = "-10";
playButtonIcon.textContent = "Play";
leadFormPanel.hidden = false;
leadFormPanel.classList.add("is-collapsed");

if (useLocalVideo) {
  initLocalVideo();
}

window.onYouTubeIframeAPIReady = () => {
  if (useLocalVideo) return;

  player = new YT.Player("youtubeFrame", {
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange
    }
  });
};

window.setTimeout(() => {
  if (!useLocalVideo && !player) {
    playCover.querySelector(".cover-copy").textContent = "ÐÐ°Ñ‚Ð¸ÑÐ½Ñ–Ñ‚ÑŒ Ñ‰Ðµ Ñ€Ð°Ð·, ÑÐºÑ‰Ð¾ Ð²Ñ–Ð´ÐµÐ¾ Ð´Ð¾Ð²Ð³Ð¾ Ð·Ð°Ð²Ð°Ð½Ñ‚Ð°Ð¶ÑƒÑ”Ñ‚ÑŒÑÑ";
  }
}, 3500);

function initLocalVideo() {
  youtubeFrame.hidden = true;
  localVideo.hidden = false;
  localVideo.src = CONFIG.localVideoUrl;

  localVideo.addEventListener("loadedmetadata", () => {
    duration = localVideo.duration || 0;
    durationTimeLabel.textContent = formatTime(duration);
    startProgressLoop();
  });

  localVideo.addEventListener("play", () => {
    playCover.classList.add("is-hidden");
    playButtonIcon.textContent = "Pause";
  });

  localVideo.addEventListener("pause", () => {
    playButtonIcon.textContent = "Play";
  });

  localVideo.addEventListener("ended", () => {
    playButtonIcon.textContent = "Play";
  });

  localVideo.addEventListener("error", () => {
    playCover.classList.remove("is-hidden");
    playCover.querySelector(".cover-copy").textContent = "ÐŸÐ¾ÐºÐ»Ð°Ð´Ñ–Ñ‚ÑŒ Ñ„Ð°Ð¹Ð» video.mp4 Ñƒ Ð¿Ð°Ð¿ÐºÑƒ outputs";
  });
}

function videoUrl(autoplay = false) {
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    controls: "0",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3"
  });

  if (autoplay) {
    params.set("autoplay", "1");
  }

  if (window.location.protocol.startsWith("http")) {
    params.set("origin", window.location.origin);
  }

  return `https://www.youtube-nocookie.com/embed/ifgE0bvQkuQ?${params.toString()}`;
}

function onPlayerReady() {
  duration = getDuration() || 0;
  durationTimeLabel.textContent = formatTime(duration);
  startProgressLoop();

  if (pendingPlay) {
    pendingPlay = false;
    playVideo();
  }
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    playCover.classList.add("is-hidden");
    playButtonIcon.textContent = "Pause";
  }

  if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
    playButtonIcon.textContent = "Play";
  }
}

function startProgressLoop() {
  clearInterval(progressTimer);
  progressTimer = window.setInterval(syncProgress, 220);
}

function syncProgress() {
  if (!isPlayerReady()) return;

  const current = getCurrentTime();
  duration = getDuration() || duration;

  if (!internalSeek && current > maxWatchedSeconds + 1.4) {
    seekTo(lastSafeSeconds);
    return;
  }

  if (current > maxWatchedSeconds) {
    maxWatchedSeconds = current;
    lastSafeSeconds = current;
  }

  const visualProgress = timeToVisualProgress(current);
  progressRange.value = String(visualProgress);
  progressFill.style.width = `${visualProgress / 10}%`;
  currentTimeLabel.textContent = formatTime(current);
  durationTimeLabel.textContent = formatTime(duration);

  if (!ctaShown && current >= CONFIG.ctaTimeSeconds) {
    showCta();
  }
}

function timeToVisualProgress(seconds) {
  if (!duration) return 0;
  const linear = Math.min(seconds / duration, 1);
  const stretched = 1 - Math.pow(1 - linear, 2.45);
  return Math.round(stretched * 1000);
}

function visualProgressToTime(progressValue) {
  if (!duration) return 0;
  const visual = Math.min(Number(progressValue) / 1000, 1);
  const linear = 1 - Math.pow(1 - visual, 1 / 2.45);
  return linear * duration;
}

function isPlayerReady() {
  if (useLocalVideo) return !!localVideo && !Number.isNaN(localVideo.duration);
  return player && typeof player.getCurrentTime === "function" && typeof player.playVideo === "function";
}

function getCurrentTime() {
  if (useLocalVideo) return localVideo.currentTime || 0;
  return player.getCurrentTime() || 0;
}

function getDuration() {
  if (useLocalVideo) return localVideo.duration || 0;
  return player.getDuration() || 0;
}

function playVideo() {
  if (useLocalVideo) {
    playCover.classList.add("is-hidden");
    localVideo.play().catch(() => {
      playCover.classList.remove("is-hidden");
      playCover.querySelector(".cover-copy").textContent = "ÐÐ°Ñ‚Ð¸ÑÐ½Ñ–Ñ‚ÑŒ Ñ‰Ðµ Ñ€Ð°Ð· Ð´Ð»Ñ Ð·Ð°Ð¿ÑƒÑÐºÑƒ";
    });
    return;
  }

  if (!isPlayerReady()) {
    pendingPlay = true;
    youtubeFrame.src = videoUrl(true);
    playCover.classList.add("is-hidden");
    playButtonIcon.textContent = "Pause";
    return;
  }

  player.playVideo();
}

function pauseVideo() {
  if (useLocalVideo) {
    localVideo.pause();
    return;
  }

  player.pauseVideo();
}

function seekTo(seconds) {
  if (!isPlayerReady()) return;

  internalSeek = true;
  const safeSeconds = Math.max(0, seconds);

  if (useLocalVideo) {
    localVideo.currentTime = safeSeconds;
  } else {
    player.seekTo(safeSeconds, true);
  }

  window.setTimeout(() => {
    internalSeek = false;
  }, 420);
}

function togglePlayback() {
  if (useLocalVideo) {
    if (localVideo.paused) {
      playVideo();
    } else {
      pauseVideo();
    }
    return;
  }

  if (!isPlayerReady()) {
    pendingPlay = true;
    youtubeFrame.src = videoUrl(true);
    playCover.classList.add("is-hidden");
    playButtonIcon.textContent = "Pause";
    return;
  }

  const state = player.getPlayerState();

  if (state === YT.PlayerState.PLAYING) {
    pauseVideo();
  } else {
    playVideo();
  }
}

function showCta() {
  ctaShown = true;
  formTrigger.classList.remove("is-hidden");
}

function openForm() {
  leadFormPanel.classList.remove("is-collapsed");
  leadFormPanel.classList.add("is-visible");

  window.setTimeout(() => {
    leadFormPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 180);
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

playCover.addEventListener("click", togglePlayback);
playButton.addEventListener("click", togglePlayback);

rewindButton.addEventListener("click", () => {
  if (!isPlayerReady()) return;
  seekTo(getCurrentTime() - 10);
});

speedSelect.addEventListener("change", () => {
  if (!isPlayerReady()) return;

  if (useLocalVideo) {
    localVideo.playbackRate = Number(speedSelect.value);
    return;
  }

  if (typeof player.setPlaybackRate === "function") {
    player.setPlaybackRate(Number(speedSelect.value));
  }
});

progressRange.addEventListener("input", () => {
  const requestedSeconds = visualProgressToTime(progressRange.value);
  const allowedSeconds = Math.min(requestedSeconds, maxWatchedSeconds);
  seekTo(allowedSeconds);

  const visualProgress = timeToVisualProgress(allowedSeconds);
  progressRange.value = String(visualProgress);
  progressFill.style.width = `${visualProgress / 10}%`;
});

formTrigger.addEventListener("click", openForm);

if (previewForm) {
  showCta();
  openForm();
}

leadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formStatus.textContent = "Ð’Ñ–Ð´Ð¿Ñ€Ð°Ð²Ð»ÑÑ”Ð¼Ð¾ Ð·Ð°ÑÐ²ÐºÑƒ...";

  const formData = new FormData(leadForm);
  const payload = {
    name: formData.get("name"),
    phone: formData.get("phone"),
    telegram: formData.get("telegram"),
    instagram: formData.get("instagram"),
    source: "mini-landing-targetolog-2026",
    createdAt: new Date().toISOString()
  };

  try {
    const response = await fetch(CONFIG.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      throw new Error(errorPayload.message || "Webhook request failed");
    }

    leadForm.reset();
    formStatus.textContent = "Ð”ÑÐºÑƒÑ”Ð¼Ð¾! Ð—Ð°ÑÐ²ÐºÑƒ Ð¿Ñ€Ð¸Ð¹Ð½ÑÑ‚Ð¾.";
  } catch (error) {
    if (error.message === "Telegram is not configured") {
      formStatus.textContent = "Ð¤Ð¾Ñ€Ð¼Ð° Ð¿Ñ€Ð°Ñ†ÑŽÑ”. Ð”Ð¾Ð´Ð°Ð¹Ñ‚Ðµ TELEGRAM_BOT_TOKEN Ñ– TELEGRAM_CHAT_ID Ð½Ð° Render, Ñ‰Ð¾Ð± Ð·Ð°ÑÐ²ÐºÐ¸ Ð¹ÑˆÐ»Ð¸ Ð² Ð±Ð¾Ñ‚.";
      return;
    }

    formStatus.textContent = "ÐÐµ Ð²Ð´Ð°Ð»Ð¾ÑÑ Ð²Ñ–Ð´Ð¿Ñ€Ð°Ð²Ð¸Ñ‚Ð¸. ÐŸÐµÑ€ÐµÐ²Ñ–Ñ€Ñ‚Ðµ Ð´Ð°Ð½Ñ– Ð°Ð±Ð¾ ÑÐ¿Ñ€Ð¾Ð±ÑƒÐ¹Ñ‚Ðµ Ñ‰Ðµ Ñ€Ð°Ð·.";
  }
});

