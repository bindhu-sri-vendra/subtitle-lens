// ---------- Grab the parts of the page we need ----------
const form = document.getElementById("url-form");
const input = document.getElementById("url-input");
const message = document.getElementById("message");
const playerSection = document.getElementById("player-section");
const subtitleEl = document.getElementById("subtitle");

let player = null;        // the YouTube player (created later)
let subtitles = [];       // the list of {start, end, korean, english}
let currentIndex = -2;    // which subtitle is on screen (-1 = none, -2 = nothing yet)
const SUBTITLE_OFFSET = -0.8;   // show subtitles this many seconds earlier

// ---------- Find the video ID inside a YouTube link ----------
function extractVideoId(link) {
  try {
    const url = new URL(link.trim());
    const host = url.hostname.replace("www.", "").replace("m.", "");
    let id = null;

    if (host === "youtu.be") {
      id = url.pathname.slice(1);                      // youtu.be/ID
    } else if (host === "youtube.com") {
      if (url.pathname === "/watch") {
        id = url.searchParams.get("v");                // youtube.com/watch?v=ID
      } else {
        const match = url.pathname.match(/^\/(embed|shorts|live)\/([\w-]{11})/);
        if (match) id = match[2];
      }
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch (error) {
    return null;
  }
}

// ---------- Load YouTube's player tool (only once) ----------
function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    window.onYouTubeIframeAPIReady = resolve;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
}

// ---------- Ask for the subtitle file of this video ----------
// Later, this is the one place we change to ask the real backend instead.
async function loadSubtitles(videoId) {
  const response = await fetch(`subtitles/${videoId}.json`);
  if (!response.ok) return null;               // file not found

  const data = await response.json();
  return data.sort((a, b) => a.start - b.start);   // make sure they're in time order
}

// ---------- Show the video ----------
async function showVideo(videoId) {
  await loadYouTubeApi();
  playerSection.classList.remove("hidden");
  resetSubtitle();

  if (player) {
    player.loadVideoById(videoId);     // player exists: swap the video
  } else {
    player = new YT.Player("player", {
      videoId: videoId,
      playerVars: { rel: 0, playsinline: 1 },
    });
  }
}

// ---------- Subtitle syncing ----------

// Which subtitle should be showing at this second? (-1 means none)
function findSubtitleIndex(time) {
  for (let i = 0; i < subtitles.length; i++) {
    if (time >= subtitles[i].start && time < subtitles[i].end) {
      return i;
    }
  }
  return -1;
}

// Change the line on screen, with a quick fade
function setSubtitle(index) {
  if (index === currentIndex) return;          // same line: do nothing
  currentIndex = index;

  subtitleEl.classList.add("fade-out");        // fade out...
  setTimeout(() => {
    if (index !== currentIndex) return;        // a newer change happened, skip this one
    subtitleEl.textContent = index >= 0 ? subtitles[index].english : "";
    subtitleEl.classList.remove("fade-out");   // ...and fade the new line in
  }, 150);
}

function resetSubtitle() {
  currentIndex = -2;
  subtitleEl.textContent = "";
  subtitleEl.classList.remove("fade-out");
}

// Runs 10 times per second: ask the player for its time, show the matching line
function syncSubtitle() {
  // Do nothing until the player is ready and we have subtitles
  if (!player || typeof player.getCurrentTime !== "function" || subtitles.length === 0) return;

  const time = player.getCurrentTime() + SUBTITLE_OFFSET;
  setSubtitle(findSubtitleIndex(time));
}

setInterval(syncSubtitle, 100);   // every 100 milliseconds

// ---------- When the user clicks the button ----------
form.addEventListener("submit", async (event) => {
  event.preventDefault();             // stop the page from reloading
  message.textContent = "";

  const videoId = extractVideoId(input.value);
  if (!videoId) {
    message.textContent = "That doesn't look like a YouTube link. Please check it and try again.";
    return;
  }

  message.textContent = "Reading subtitles…";

  try {
    const loaded = await loadSubtitles(videoId);
    if (!loaded) {
      message.textContent = "No subtitles are ready for this video yet. For now, only videos we have already processed can be shown.";
      return;
    }
    subtitles = loaded;
  } catch (error) {
    message.textContent = "Something went wrong while loading the subtitles. Please try again.";
    return;
  }

  message.textContent = "";
  await showVideo(videoId);
});
