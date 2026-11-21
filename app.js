const PLAYLIST_URL = "https://iptv-org.github.io/iptv/categories/sports.m3u";
const CACHE_KEY = "cricket_tv_playlist_cache_v1";
const LAST_CHANNEL_KEY = "cricket_tv_last_channel_v1";

const CRICKET_MATCHERS = [
  /\bcricket\b/i,
  /\bwillow\b/i,
  /\bstar\s*sports\b/i,
  /\bsony\s*sports\s*ten\b/i,
  /\bdd\s*sports\b/i,
  /\bptv\s*sports\b/i,
  /\bten\s*sports\s*pakistan\b/i,
  /\bpk\s*sports\b/i,
  /\bsky\s*sports\s*cricket\b/i,
  /\bfox\s*cricket\b/i,
  /\bsuper\s*sport\s*cricket\b/i,
  /\bt\s*sports\b/i
];

const video = document.getElementById("player");
const grid = document.getElementById("channels-grid");
const nowTitle = document.getElementById("now-title");
const nowStatus = document.getElementById("now-status");
const fallbackBanner = document.getElementById("fallback-banner");
const fallbackText = document.getElementById("fallback-text");

const prevBtn = document.getElementById("prev-btn");
const playPauseBtn = document.getElementById("play-pause-btn");
const muteBtn = document.getElementById("mute-btn");
const fullscreenBtn = document.getElementById("fullscreen-btn");
const nextBtn = document.getElementById("next-btn");
const nextWorkingBtn = document.getElementById("next-working-btn");
const refreshBtn = document.getElementById("refresh-btn");

let channels = [];
let currentIndex = -1;
let hls = null;

function attr(line, name) {
  const m = line.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return m ? m[1].trim() : "";
}

function isCricket(ch) {
  return CRICKET_MATCHERS.some((re) =>
    re.test(`${ch.name} ${ch.tvgId} ${ch.group}`)
  );
}

function parseM3U(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items = [];
  let meta = null;

  for (const line of lines) {
    if (line.startsWith("#EXTINF:")) {
      const idx = line.lastIndexOf(",");
      meta = {
        name: idx !== -1 ? line.slice(idx + 1).trim() : "Cricket Channel",
        logo: attr(line, "tvg-logo"),
        tvgId: attr(line, "tvg-id"),
        group: attr(line, "group-title")
      };
    } else if (!line.startsWith("#") && meta && /^https?:\/\//i.test(line)) {
      items.push({ ...meta, url: line });
      meta = null;
    }
  }
  return items.filter(isCricket);
}

function destroyPlayer() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
}

function showFallback(msg) {
  fallbackText.textContent = msg;
  fallbackBanner.classList.remove("hidden");
  nowStatus.textContent = "Offline";
}

function hideFallback() {
  fallbackBanner.classList.add("hidden");
}

function playAt(index) {
  if (!channels.length) return;
  currentIndex = ((index % channels.length) + channels.length) % channels.length;
  const ch = channels[currentIndex];

  localStorage.setItem(LAST_CHANNEL_KEY, ch.url);
  nowTitle.textContent = ch.name;
  nowStatus.textContent = "Loading...";
  hideFallback();
  renderGrid();

  destroyPlayer();
  video.pause();
  video.removeAttribute("src");
  video.load();

  if (window.location.protocol === "https:" && ch.url.startsWith("http://")) {
    showFallback("This stream uses HTTP and is blocked on HTTPS. Try another channel.");
    return;
  }

  if (window.Hls && window.Hls.isSupported()) {
    hls = new window.Hls({ enableWorker: true });
    hls.loadSource(ch.url);
    hls.attachMedia(video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
      nowStatus.textContent = "Live";
      video.play().catch(() => {});
    });
    hls.on(window.Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        destroyPlayer();
        showFallback("Channel stream is unavailable right now.");
      }
    });
  } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = ch.url;
    video.addEventListener("loadedmetadata", () => {
      nowStatus.textContent = "Live";
      video.play().catch(() => {});
    }, { once: true });
    video.addEventListener("error", () => {
      showFallback("Channel stream is unavailable right now.");
    }, { once: true });
  } else {
    showFallback("Your browser does not support HLS video.");
  }
}

function renderGrid() {
  grid.innerHTML = "";
  channels.forEach((ch, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `channel-card${idx === currentIndex ? " active" : ""}`;
    btn.addEventListener("click", () => playAt(idx));

    if (ch.logo) {
      const img = document.createElement("img");
      img.src = ch.logo;
      img.alt = ch.name;
      img.loading = "lazy";
      img.onerror = () => { img.style.display = "none"; };
      btn.appendChild(img);
    }

    const span = document.createElement("span");
    span.textContent = ch.name;
    btn.appendChild(span);
    grid.appendChild(btn);
  });
}

function applyPlaylist(rawText) {
  channels = parseM3U(rawText);
  if (!channels.length) {
    nowTitle.textContent = "No cricket channels found";
    nowStatus.textContent = "";
    return;
  }

  const savedUrl = localStorage.getItem(LAST_CHANNEL_KEY);
  const savedIdx = channels.findIndex((c) => c.url === savedUrl);
  const startIdx = savedIdx !== -1 ? savedIdx : 0;

  if (currentIndex === -1) {
    playAt(startIdx);
  } else {
    renderGrid();
  }
}

async function loadChannels(force = false) {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached && !force) {
    applyPlaylist(cached);
  }

  try {
    const res = await fetch(`${PLAYLIST_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    localStorage.setItem(CACHE_KEY, text);
    applyPlaylist(text);
  } catch {
    if (!cached) {
      nowTitle.textContent = "Could not load channels";
      nowStatus.textContent = "Check internet connection";
    }
  }
}

prevBtn.addEventListener("click", () => playAt(currentIndex - 1));
nextBtn.addEventListener("click", () => playAt(currentIndex + 1));
nextWorkingBtn.addEventListener("click", () => playAt(currentIndex + 1));
refreshBtn.addEventListener("click", () => loadChannels(true));

playPauseBtn.addEventListener("click", () => {
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
});

muteBtn.addEventListener("click", () => {
  video.muted = !video.muted;
  muteBtn.textContent = video.muted ? "🔊 Unmute" : "🔇 Mute";
});

fullscreenBtn.addEventListener("click", () => {
  const el = video.parentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

loadChannels(false);