// ─── State ───────────────────────────────────────────────────────────────────
let clientId = localStorage.getItem('spotify_client_id') || '';
let appInfo = null;
let currentTrack = null;
let isPlaying = false;
let shuffleState = false;
let repeatState = 'off';

let pollInterval = null;
let lyricsEnabled = true; // Always enabled by default
let syncedLyrics = [];
let currentLyricIndex = -1;
let currentProgressMs = 0;
let liquidBg = null;
let bassPulseInterval = null;
let panelOpen = false; // Prevents resize while settings/devices panels are open
let controlCooldownUntil = 0; // Prevents polling from overwriting shuffle/repeat state during cooldown
let lastPollTimestamp = 0;
let isOffline = false;
let pollIntervalMs = 1500; // Adaptive: 1.5s when playing, 5s when paused
let consecutiveErrors = 0; // Track consecutive API failures for offline detection

// ─── LyricsX-style Sync State ───────────────────────────────────────────────
// Instead of polling every 100ms, we store a base timestamp and interpolate.
// A one-shot timer fires exactly when the next lyric line should appear.
let syncBaseTime = 0;         // performance.now() value when progress was 0
let lyricLineTimer = null;    // the scheduled one-shot setTimeout id
const DRIFT_THRESHOLD = 1500; // ms — re-sync only if drift exceeds this

// ─── Elements ────────────────────────────────────────────────────────────────
const setupScreen = document.getElementById('setup-screen');
const playerScreen = document.getElementById('player-screen');
const clientIdInput = document.getElementById('client-id-input');
const connectBtn = document.getElementById('connect-btn');
const helpLink = document.getElementById('help-link');

const albumArt = document.getElementById('album-art');
const noArt = document.getElementById('no-art');
const trackName = document.getElementById('track-name');
const trackArtist = document.getElementById('track-artist');

const btnShuffle = document.getElementById('btn-shuffle');
const btnPrev = document.getElementById('btn-prev');
const btnPlay = document.getElementById('btn-play');
const btnNext = document.getElementById('btn-next');
const btnRepeat = document.getElementById('btn-repeat');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const iconRepeatAll = document.getElementById('icon-repeat-all');
const iconRepeatOne = document.getElementById('icon-repeat-one');

const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');

const btnLyrics = document.getElementById('btn-lyrics');
const btnClose = document.getElementById('btn-close');

const lyricsContainer = document.getElementById('lyrics-container');
const currentLyricEl = document.getElementById('current-lyric');

// ─── Liquid Background ───────────────────────────────────────────────────────
const liquidCanvas = document.getElementById('liquid-bg');

function initLiquidBg() {
  if (!liquidCanvas || !window.LiquidBackground) return;
  try {
    liquidBg = new window.LiquidBackground(liquidCanvas);
    // LiquidBackground auto-starts rendering in its constructor (init → render loop).
    // No .start() call needed.
    window.addEventListener('resize', () => {
      if (liquidBg) liquidBg.resize();
    });
  } catch (err) {
    console.warn('LiquidBackground init failed:', err);
    liquidBg = null;
  }
}

// Start liquid background immediately (even on setup screen)
initLiquidBg();

// Simulate bass pulses when playing (since we can't access actual audio data)
function startBassPulse() {
  if (bassPulseInterval) return;
  bassPulseInterval = setInterval(() => {
    if (isPlaying && liquidBg) {
      if (Math.random() > 0.5) {
        liquidBg.pulse();
      }
    }
  }, 600);
}

function stopBassPulse() {
  if (bassPulseInterval) {
    clearInterval(bassPulseInterval);
    bassPulseInterval = null;
  }
}

// ─── Waveform Visualization (smooth flowing line) ────────────────────────────
const waveformCanvas = document.getElementById('waveform-canvas');
let waveformCtx = null;
let waveformAnimId = null;
let waveformPhase = 0;
let waveformAmplitude = 0;
let waveformTargetAmplitude = 0;

function initWaveform() {
  if (!waveformCanvas) return;
  waveformCtx = waveformCanvas.getContext('2d');
  resizeWaveform();
  window.addEventListener('resize', resizeWaveform);
  drawWaveform();
}

function resizeWaveform() {
  if (!waveformCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = waveformCanvas.getBoundingClientRect();
  waveformCanvas.width = rect.width * dpr;
  waveformCanvas.height = rect.height * dpr;
  // Reset transform before applying scale (prevents cumulative scaling on repeated resize)
  waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawWaveform() {
  if (!waveformCtx) return;
  const canvas = waveformCanvas;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  waveformCtx.clearRect(0, 0, w, h);

  // Smooth amplitude transition
  waveformAmplitude += (waveformTargetAmplitude - waveformAmplitude) * 0.05;
  waveformPhase += isPlaying ? 0.03 : 0.005;

  const midY = h / 2;
  const amp = waveformAmplitude * (h * 0.35);

  // Draw a smooth flowing wave - multiple overlapping sine waves
  // Wave 1: main wave
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, midY);
  for (let x = 0; x <= w; x += 2) {
    const t = x / w;
    const y = midY +
      Math.sin(t * Math.PI * 3 + waveformPhase) * amp * 0.6 +
      Math.sin(t * Math.PI * 5 + waveformPhase * 1.3) * amp * 0.3 +
      Math.sin(t * Math.PI * 7 + waveformPhase * 0.7) * amp * 0.1;
    waveformCtx.lineTo(x, y);
  }
  waveformCtx.strokeStyle = 'rgba(160, 100, 200, 0.7)';
  waveformCtx.lineWidth = 2.5;
  waveformCtx.stroke();

  // Wave 2: secondary wave (offset)
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, midY);
  for (let x = 0; x <= w; x += 2) {
    const t = x / w;
    const y = midY +
      Math.sin(t * Math.PI * 2.5 + waveformPhase * 0.8 + 1.0) * amp * 0.5 +
      Math.sin(t * Math.PI * 4.5 + waveformPhase * 1.1 + 2.0) * amp * 0.25;
    waveformCtx.lineTo(x, y);
  }
  waveformCtx.strokeStyle = 'rgba(80, 190, 210, 0.6)';
  waveformCtx.lineWidth = 2;
  waveformCtx.stroke();

  waveformAnimId = requestAnimationFrame(drawWaveform);
}

function setWaveformPlaying(playing) {
  waveformTargetAmplitude = playing ? 1.0 : 0.1;
}

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  appInfo = await window.electronAPI.getAppInfo();
  const tokenData = await window.electronAPI.getToken();
  if (tokenData.accessToken && tokenData.tokenExpiry > Date.now()) {
    await showPlayer();
    startPolling();
  } else if (clientId) {
    clientIdInput.value = clientId;
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────
connectBtn.addEventListener('click', async () => {
  const id = clientIdInput.value.trim();
  if (!id) return;
  clientId = id;
  localStorage.setItem('spotify_client_id', clientId);
  connectBtn.textContent = 'Connecting...';
  connectBtn.disabled = true;

  try {
    await window.electronAPI.spotifyAuth({ clientId });
    connectBtn.textContent = 'Waiting...';
  } catch (err) {
    console.error('Auth failed:', err);
    connectBtn.textContent = 'Connect';
    connectBtn.disabled = false;
  }
});

helpLink.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  console.log('[renderer] Get ID clicked, calling openExternal...');
  window.electronAPI.openExternal('https://developer.spotify.com/dashboard').then(() => {
    console.log('[renderer] openExternal resolved');
  }).catch(err => {
    console.error('[renderer] openExternal error:', err);
  });
});

window.electronAPI.onAuthSuccess((data) => {
  showPlayer();
  startPolling();
});

window.electronAPI.onAuthCodeReceived(async (code) => {
  const result = await window.electronAPI.exchangeCode({
    code,
    clientId,
    redirectUri: appInfo.protocolRedirectUri
  });
  if (result.error) {
    connectBtn.textContent = 'Connect';
    connectBtn.disabled = false;
    return;
  }
  showPlayer();
  startPolling();
});

window.electronAPI.onAuthError(() => {
  connectBtn.textContent = 'Connect';
  connectBtn.disabled = false;
});

async function showPlayer() {
  setupScreen.classList.add('hidden');
  playerScreen.classList.remove('hidden');
  await window.electronAPI.resizeForPlayer();
  startBassPulse();
  initWaveform();
}

// ─── Spotify API ─────────────────────────────────────────────────────────────
async function spotifyFetch(endpoint, options = {}) {
  let tokenData = await window.electronAPI.getToken();
  if (!tokenData.accessToken || tokenData.tokenExpiry < Date.now() + 60000) {
    const refreshed = await window.electronAPI.refreshToken(clientId);
    if (refreshed.error) return null;
    tokenData = refreshed;
  }

  const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${tokenData.accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (response.status === 204 || (response.status === 200 && response.headers.get('content-length') === '0')) return { _success: true };
  if (response.status === 401) {
    const refreshed = await window.electronAPI.refreshToken(clientId);
    if (!refreshed.error) {
      const retry = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${refreshed.accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      if (retry.status === 204) return { _success: true };
      if (retry.ok) return retry.json();
    }
    return null;
  }
  if (!response.ok) return null;
  return response.json();
}

// ─── Polling ─────────────────────────────────────────────────────────────────
function startPolling() {
  fetchCurrentPlayback();
  schedulePoll();
}

function schedulePoll() {
  if (pollInterval) clearTimeout(pollInterval);
  pollInterval = setTimeout(() => {
    fetchCurrentPlayback();
    schedulePoll();
  }, pollIntervalMs);
}

function updatePollRate() {
  const newRate = isPlaying ? 1500 : 5000;
  if (newRate !== pollIntervalMs) {
    pollIntervalMs = newRate;
    // Reschedule with new rate
    schedulePoll();
  }
}

async function fetchCurrentPlayback() {
  const data = await spotifyFetch('/me/player');
  if (!data) {
    consecutiveErrors++;
    if (consecutiveErrors >= 3 && !isOffline) {
      isOffline = true;
      showOfflineStatus();
    }
    updateUI(null);
    return;
  }
  // Connection restored
  if (isOffline) {
    isOffline = false;
    hideOfflineStatus();
  }
  consecutiveErrors = 0;

  const wasPlaying = isPlaying;
  isPlaying = data.is_playing;
  updatePollRate(); // Adaptive polling: 1.5s playing, 5s paused
  // Only update shuffle/repeat from API if not in cooldown (prevents overwriting optimistic UI)
  if (Date.now() > controlCooldownUntil) {
    shuffleState = data.shuffle_state;
    repeatState = data.repeat_state;
  }
  const apiProgressMs = data.progress_ms || 0;
  lastPollTimestamp = Date.now();

  // Update liquid background energy
  if (liquidBg) {
    liquidBg.setPlaying(isPlaying);
  }
  // Update waveform
  setWaveformPlaying(isPlaying);

  // ─── LyricsX-style drift correction ───────────────────────────────────
  // Only re-sync the base time if:
  //   a) This is the first poll (syncBaseTime === 0)
  //   b) Playback state changed (play/pause toggle)
  //   c) The interpolated progress drifted more than DRIFT_THRESHOLD from API
  const interpolated = getInterpolatedProgress();
  const drift = Math.abs(interpolated - apiProgressMs);
  const stateChanged = wasPlaying !== isPlaying;

  if (syncBaseTime === 0 || stateChanged || drift > DRIFT_THRESHOLD) {
    updateSyncBase(apiProgressMs);
    currentProgressMs = apiProgressMs;
    // Re-trigger the lyric schedule chain from the corrected position
    scheduleNextLineChange();
  } else {
    // No significant drift — keep the smooth interpolation running
    currentProgressMs = apiProgressMs;
  }

  // On pause, cancel the lyric timer; on resume, restart the chain
  if (!isPlaying) {
    cancelLyricSchedule();
  } else if (stateChanged && isPlaying) {
    // Just resumed — ensure the schedule chain is running
    scheduleNextLineChange();
  }

  const track = data.item;
  if (track) {
    const trackChanged = !currentTrack || currentTrack.id !== track.id;
    const isFirstTrack = !currentTrack;
    currentTrack = track;
    updateUI(data);

    // Pulse on track change
    if (trackChanged) {
      if (liquidBg) liquidBg.pulse();
      if (lyricsEnabled) {
        fetchSyncedLyrics(track);
      }
    } else if (isFirstTrack && lyricsEnabled) {
      // First load - fetch lyrics immediately
      fetchSyncedLyrics(track);
    }

    if (lyricsEnabled && syncedLyrics.length > 0) {
      scheduleNextLineChange();
    }
  }
}

function updateUI(data) {
  if (!data || !data.item) {
    trackName.textContent = 'Not Playing';
    trackArtist.textContent = '—';
    albumArt.classList.add('hidden');
    noArt.classList.remove('hidden');
    progressFill.style.width = '0%';
    timeCurrent.textContent = '0:00';
    timeTotal.textContent = '0:00';
    currentLyricEl.classList.remove('visible');
    return;
  }

  const track = data.item;
  trackName.textContent = track.name;
  trackArtist.textContent = track.artists.map(a => a.name).join(', ');

  if (track.album && track.album.images && track.album.images.length > 0) {
    const img = track.album.images.find(i => i.width <= 300) || track.album.images[0];
    albumArt.src = img.url;
    albumArt.classList.remove('hidden');
    noArt.classList.add('hidden');
  } else {
    albumArt.classList.add('hidden');
    noArt.classList.remove('hidden');
  }

  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }

  updateShuffleUI();
  updateRepeatUI();

  const progress = getInterpolatedProgress();
  const duration = track.duration_ms || 1;
  progressFill.style.width = `${(progress / duration) * 100}%`;
  timeCurrent.textContent = formatTime(progress);
  timeTotal.textContent = formatTime(duration);
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── LyricsX-style Sync Engine ──────────────────────────────────────────────
// Architecture inspired by ddddxxx/LyricsX:
//   1. Store a "base time" = performance.now() - progress_ms
//   2. Interpolate current position as: performance.now() - syncBaseTime
//   3. Use a ONE-SHOT setTimeout to fire exactly when the next line should appear
//   4. On fire → update UI, schedule the next line (recursive chain)
//   5. Re-sync base time only when API drift > DRIFT_THRESHOLD (1.5s)

/**
 * Update the sync base time. Called when we receive authoritative progress
 * from the Spotify API, or when the user seeks.
 */
function updateSyncBase(progressMs) {
  syncBaseTime = performance.now() - progressMs;
}

/**
 * Get the current interpolated playback position (ms).
 * Accurate to sub-millisecond between API polls.
 */
function getInterpolatedProgress() {
  if (!isPlaying) return currentProgressMs;
  return performance.now() - syncBaseTime;
}

/**
 * Binary search for the current lyric line index at a given time.
 * Returns the index of the last line whose timestamp <= progressMs,
 * or -1 if before the first line.
 */
function findLyricIndex(progressMs) {
  if (syncedLyrics.length === 0) return -1;
  let lo = 0;
  let hi = syncedLyrics.length - 1;
  if (progressMs < syncedLyrics[0].time) return -1;
  if (progressMs >= syncedLyrics[hi].time) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (syncedLyrics[mid].time <= progressMs) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return hi;
}

/**
 * Core scheduling function (analogous to LyricsX's scheduleCurrentLineCheck).
 * 1. Compute interpolated progress
 * 2. Find current line via binary search
 * 3. Update UI if line changed
 * 4. Calculate exact ms until the NEXT line
 * 5. Set a one-shot setTimeout for that duration
 */
function scheduleNextLineChange() {
  // Cancel any previously scheduled timer
  if (lyricLineTimer !== null) {
    clearTimeout(lyricLineTimer);
    lyricLineTimer = null;
  }

  if (!lyricsEnabled || syncedLyrics.length === 0 || !currentTrack) return;

  const progress = getInterpolatedProgress();
  const idx = findLyricIndex(progress);

  // Update UI if line changed
  if (idx !== currentLyricIndex) {
    currentLyricIndex = idx;
    if (idx >= 0) {
      currentLyricEl.textContent = syncedLyrics[idx].text;
      currentLyricEl.classList.add('visible');
      if (lyricsContainer && !lyricsContainer.classList.contains('has-lyrics')) {
        lyricsContainer.classList.add('has-lyrics');
        document.querySelector('.player-content').classList.add('has-lyrics');
        if (!panelOpen) window.electronAPI.resizeForLyrics();
      }
    } else {
      currentLyricEl.classList.remove('visible');
      currentLyricEl.textContent = '';
      if (lyricsContainer && lyricsContainer.classList.contains('has-lyrics')) {
        lyricsContainer.classList.remove('has-lyrics');
        document.querySelector('.player-content').classList.remove('has-lyrics');
        if (!panelOpen) window.electronAPI.resizeNoLyrics();
      }
    }
  }

  // Schedule the next line change (only if playing)
  if (!isPlaying) return;

  const nextIdx = idx + 1;
  if (nextIdx < syncedLyrics.length) {
    const dt = syncedLyrics[nextIdx].time - progress;
    if (dt > 0) {
      lyricLineTimer = setTimeout(() => {
        lyricLineTimer = null;
        scheduleNextLineChange(); // recursive: schedule the line after that
      }, dt);
    } else {
      // We're already past the next line (shouldn't happen normally),
      // re-schedule immediately to catch up
      lyricLineTimer = setTimeout(() => {
        lyricLineTimer = null;
        scheduleNextLineChange();
      }, 0);
    }
  }
  // If nextIdx >= syncedLyrics.length, we're on the last line — no more scheduling needed
}

/**
 * Cancel the lyric line timer (e.g., on pause or track change).
 */
function cancelLyricSchedule() {
  if (lyricLineTimer !== null) {
    clearTimeout(lyricLineTimer);
    lyricLineTimer = null;
  }
}

// ─── Synced Lyrics ──────────────────────────────────────────────────────────
async function fetchSyncedLyrics(track) {
  syncedLyrics = [];
  currentLyricIndex = -1;
  cancelLyricSchedule(); // Cancel any pending line timer from previous track
  currentLyricEl.classList.remove('visible');
  currentLyricEl.textContent = '';

  try {
    const artist = track.artists[0].name;
    const title = track.name;
    const duration = Math.round(track.duration_ms / 1000);

    // Strategy 1: Exact match with duration
    let data = await tryLrclib(
      `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}&duration=${duration}`
    );

    // Strategy 2: Exact match without duration (more lenient, but validate duration)
    if (!data || !data.syncedLyrics) {
      data = await tryLrclib(
        `https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`
      );
      // Validate duration: reject if off by more than 3 seconds
      if (data && data.duration && Math.abs(data.duration - duration) > 3) {
        data = null;
      }
    }

    // Strategy 3: Search by title + artist (with duration validation)
    if (!data || !data.syncedLyrics) {
      data = await searchLrclib(`${title} ${artist}`, duration, artist);
    }

    // Strategy 4: Search by title only (with duration validation)
    if (!data || !data.syncedLyrics) {
      data = await searchLrclib(title, duration, artist);
    }

    // Strategy 5: Clean title (remove feat., brackets, etc.) and search
    if (!data || !data.syncedLyrics) {
      const cleanTitle = title.replace(/\s*[\(\[].*?[\)\]]/g, '').replace(/\s*[-–]\s*.*$/, '').trim();
      if (cleanTitle !== title && cleanTitle.length > 2) {
        data = await searchLrclib(`${cleanTitle} ${artist}`, duration, artist);
      }
    }

    if (data && data.syncedLyrics) {
      syncedLyrics = parseLRC(data.syncedLyrics);
      console.log(`Lyrics loaded: ${syncedLyrics.length} lines`);
      // Kick off the LyricsX-style schedule chain
      scheduleNextLineChange();
    } else {
      console.log(`No synced lyrics found for: ${title} - ${artist}`);
      // Hide lyrics area when no lyrics available
      if (lyricsContainer) {
        lyricsContainer.classList.remove('has-lyrics');
      }
    }
  } catch (err) {
    console.error('Lyrics fetch error:', err);
  }
}

async function tryLrclib(url) {
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.syncedLyrics) return data;
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function searchLrclib(query, trackDuration, artistHint) {
  try {
    const resp = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
    if (resp.ok) {
      const results = await resp.json();
      if (results && results.length > 0) {
        // Only accept results with synced lyrics AND matching duration (±3s)
        const synced = results.filter(r => r.syncedLyrics);
        if (synced.length > 0 && trackDuration) {
          // Prefer results that match both duration and artist
          const durationMatched = synced.filter(r => Math.abs(r.duration - trackDuration) <= 3);
          if (durationMatched.length > 0) {
            // If we have an artist hint, prefer the one matching artist
            if (artistHint) {
              const artistLower = artistHint.toLowerCase();
              const artistMatch = durationMatched.find(r => 
                r.artistName && r.artistName.toLowerCase().includes(artistLower)
              );
              if (artistMatch) return artistMatch;
            }
            return durationMatched[0];
          }
        }
        // If no duration match, return first synced result only if no duration info available
        if (synced.length > 0 && !trackDuration) return synced[0];
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function parseLRC(lrcText) {
  const lines = lrcText.split('\n');
  const parsed = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (match) {
      const mins = parseInt(match[1]);
      const secs = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, '0'));
      const time = mins * 60000 + secs * 1000 + ms;
      const text = match[4].trim();
      if (text) {
        parsed.push({ time, text });
      }
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}

// updateCurrentLyric has been replaced by the LyricsX-style scheduleNextLineChange().
// The old linear-scan + polling approach is no longer used.

// ─── Controls ───────────────────────────────────────────────────────────────
btnPlay.addEventListener('click', async () => {
  // Optimistic UI update immediately
  isPlaying = !isPlaying;
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
    if (liquidBg) liquidBg.setPlaying(true);
    setWaveformPlaying(true);
    // Resume: re-anchor base time from last known progress and restart chain
    updateSyncBase(currentProgressMs);
    scheduleNextLineChange();
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    if (liquidBg) liquidBg.setPlaying(false);
    setWaveformPlaying(false);
    // Pause: snapshot current progress and cancel scheduled timer
    currentProgressMs = getInterpolatedProgress();
    cancelLyricSchedule();
  }

  // Send API request
  if (!isPlaying) {
    await spotifyFetch('/me/player/pause', { method: 'PUT' });
  } else {
    await spotifyFetch('/me/player/play', { method: 'PUT' });
  }
  // Confirm with server after a short delay
  setTimeout(fetchCurrentPlayback, 500);
});

btnNext.addEventListener('click', async () => {
  await spotifyFetch('/me/player/next', { method: 'POST' });
  if (liquidBg) liquidBg.pulse();
  setTimeout(fetchCurrentPlayback, 500);
});

btnPrev.addEventListener('click', async () => {
  await spotifyFetch('/me/player/previous', { method: 'POST' });
  if (liquidBg) liquidBg.pulse();
  setTimeout(fetchCurrentPlayback, 500);
});

btnShuffle.addEventListener('click', async () => {
  // Optimistic update with cooldown to prevent polling from reverting
  shuffleState = !shuffleState;
  controlCooldownUntil = Date.now() + 3000; // 3s cooldown
  updateShuffleUI();
  // Send API request
  const result = await spotifyFetch(`/me/player/shuffle?state=${shuffleState}`, { method: 'PUT' });
  if (!result) {
    // Revert on failure
    shuffleState = !shuffleState;
    updateShuffleUI();
    controlCooldownUntil = 0;
  } else {
    // Confirm with server after delay
    setTimeout(() => {
      controlCooldownUntil = 0;
      fetchCurrentPlayback();
    }, 2000);
  }
});

btnRepeat.addEventListener('click', async () => {
  const states = ['off', 'context', 'track'];
  const currentIndex = states.indexOf(repeatState);
  const newState = states[(currentIndex + 1) % states.length];
  const oldState = repeatState;
  // Optimistic update with cooldown
  repeatState = newState;
  controlCooldownUntil = Date.now() + 3000;
  updateRepeatUI();
  // Send API request
  const result = await spotifyFetch(`/me/player/repeat?state=${newState}`, { method: 'PUT' });
  if (!result) {
    // Revert on failure
    repeatState = oldState;
    updateRepeatUI();
    controlCooldownUntil = 0;
  } else {
    // Confirm with server after delay
    setTimeout(() => {
      controlCooldownUntil = 0;
      fetchCurrentPlayback();
    }, 2000);
  }
});

function updateShuffleUI() {
  btnShuffle.classList.toggle('active', shuffleState);
  btnShuffle.title = shuffleState ? 'Shuffle On' : 'Shuffle Off';
}

function updateRepeatUI() {
  btnRepeat.classList.remove('active', 'repeat-one');
  if (repeatState === 'off') {
    btnRepeat.title = 'Repeat Off';
    iconRepeatAll.classList.remove('hidden');
    iconRepeatOne.classList.add('hidden');
  } else if (repeatState === 'context') {
    btnRepeat.classList.add('active');
    btnRepeat.title = 'Repeat All';
    iconRepeatAll.classList.remove('hidden');
    iconRepeatOne.classList.add('hidden');
  } else if (repeatState === 'track') {
    btnRepeat.classList.add('active', 'repeat-one');
    btnRepeat.title = 'Repeat One';
    iconRepeatAll.classList.add('hidden');
    iconRepeatOne.classList.remove('hidden');
  }
}

// ─── Draggable Progress Bar ─────────────────────────────────────────────────
let isDraggingProgress = false;

function handleProgressSeek(e) {
  if (!currentTrack) return;
  const rect = progressBar.getBoundingClientRect();
  let ratio = (e.clientX - rect.left) / rect.width;
  ratio = Math.max(0, Math.min(1, ratio));
  progressFill.style.width = `${ratio * 100}%`;
  progressFill.style.transition = 'none';
  const seekMs = Math.floor(ratio * currentTrack.duration_ms);
  timeCurrent.textContent = formatTime(seekMs);
  return seekMs;
}

progressBar.addEventListener('mousedown', (e) => {
  if (!currentTrack) return;
  isDraggingProgress = true;
  progressBar.classList.add('dragging');
  handleProgressSeek(e);
  e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
  if (isDraggingProgress) {
    handleProgressSeek(e);
  }
});

document.addEventListener('mouseup', async (e) => {
  if (isDraggingProgress) {
    isDraggingProgress = false;
    progressBar.dataset.justDragged = '1'; // Prevent subsequent click from double-seeking
    progressBar.classList.remove('dragging');
    progressFill.style.transition = '';
    const seekMs = handleProgressSeek(e);
    if (seekMs !== undefined) {
      // Immediately re-anchor sync base to the seek position
      currentProgressMs = seekMs;
      updateSyncBase(seekMs);
      scheduleNextLineChange();
      await spotifyFetch(`/me/player/seek?position_ms=${seekMs}`, { method: 'PUT' });
      setTimeout(fetchCurrentPlayback, 300);
    }
  }
});

progressBar.addEventListener('click', async (e) => {
  if (!currentTrack) return;
  // Skip click if it was triggered by a drag release (mousedown+mouseup = click)
  if (e.detail === 0) return; // synthetic click
  if (progressBar.dataset.justDragged) {
    delete progressBar.dataset.justDragged;
    return;
  }
  const rect = progressBar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const seekMs = Math.floor(ratio * currentTrack.duration_ms);
  // Immediately re-anchor sync base to the seek position
  currentProgressMs = seekMs;
  updateSyncBase(seekMs);
  scheduleNextLineChange();
  await spotifyFetch(`/me/player/seek?position_ms=${seekMs}`, { method: 'PUT' });
  setTimeout(fetchCurrentPlayback, 300);
});

// Lyrics toggle
btnLyrics.classList.add('active'); // Active by default
lyricsContainer.style.display = 'block'; // Visible by default

btnLyrics.addEventListener('click', () => {
  lyricsEnabled = !lyricsEnabled;
  btnLyrics.classList.toggle('active', lyricsEnabled);

  if (lyricsEnabled) {
    lyricsContainer.style.display = 'block';
    if (currentTrack) {
      fetchSyncedLyrics(currentTrack);
    }
    // Kick off the lyric schedule chain
    if (syncedLyrics.length > 0) {
      scheduleNextLineChange();
    }
  } else {
    lyricsContainer.style.display = 'none';
    currentLyricEl.classList.remove('visible');
    currentLyricEl.textContent = '';
    syncedLyrics = [];
    cancelLyricSchedule();
    document.querySelector('.player-content').classList.remove('has-lyrics');
    window.electronAPI.resizeNoLyrics();
  }
});


function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Close
btnClose.addEventListener('click', () => {
  window.electronAPI.quitApp();
});

// ─── Settings Panel ─────────────────────────────────────────────────────────────────
const btnSettings = document.getElementById('btn-settings');
const settingsPanel = document.getElementById('settings-panel');
const settingsCloseBtn = document.getElementById('settings-close');
const themeLightBtn = document.getElementById('theme-light');
const themeDarkBtn = document.getElementById('theme-dark');
const lyricsSizeSlider = document.getElementById('lyrics-size-slider');
const sizePreview = document.getElementById('size-preview');

// Load saved settings
let currentTheme = localStorage.getItem('spotify_theme') || 'light';
let currentLyricsSize = parseInt(localStorage.getItem('spotify_lyrics_size') || '11', 10);

function applyTheme(theme) {
  currentTheme = theme;
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeDarkBtn.classList.add('active');
    themeLightBtn.classList.remove('active');
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeLightBtn.classList.add('active');
    themeDarkBtn.classList.remove('active');
  }
  localStorage.setItem('spotify_theme', theme);
}

function applyLyricsSize(size) {
  currentLyricsSize = size;
  document.documentElement.style.setProperty('--lyrics-size', `${size}px`);
  sizePreview.textContent = `${size}px`;
  lyricsSizeSlider.value = size;
  localStorage.setItem('spotify_lyrics_size', size.toString());
}

// Apply saved settings on load
applyTheme(currentTheme);
applyLyricsSize(currentLyricsSize);

btnSettings.addEventListener('click', async () => {
  if (settingsPanel.classList.contains('hidden')) {
    panelOpen = true;
    settingsPanel.classList.remove('hidden');
    // Expand window upward for settings panel
    const hasLyrics = lyricsEnabled && syncedLyrics.length > 0;
    const baseHeight = hasLyrics ? 125 : 105;
    const totalHeight = baseHeight + 80; // settings panel height
    await window.electronAPI.resizeForSettings(totalHeight);
  } else {
    closeSettingsPanel();
  }
});

settingsCloseBtn.addEventListener('click', () => {
  closeSettingsPanel();
});

async function closeSettingsPanel() {
  settingsPanel.classList.add('hidden');
  panelOpen = false;
  if (lyricsEnabled && syncedLyrics.length > 0) {
    await window.electronAPI.resizeForLyrics();
  } else {
    await window.electronAPI.resizeForPlayer();
  }
}

themeLightBtn.addEventListener('click', () => applyTheme('light'));
themeDarkBtn.addEventListener('click', () => applyTheme('dark'));

lyricsSizeSlider.addEventListener('input', (e) => {
  applyLyricsSize(parseInt(e.target.value, 10));
});

// Close settings when clicking outside
document.addEventListener('click', (e) => {
  if (!settingsPanel.classList.contains('hidden') &&
      !settingsPanel.contains(e.target) &&
      e.target !== btnSettings &&
      !btnSettings.contains(e.target)) {
    closeSettingsPanel();
  }
});

// ─── Offline Status ─────────────────────────────────────────────────────────
function showOfflineStatus() {
  let banner = document.getElementById('offline-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'offline-banner';
    banner.textContent = 'No connection — retrying...';
    document.body.appendChild(banner);
  }
  banner.classList.add('visible');
}

function hideOfflineStatus() {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.classList.remove('visible');
}

// Listen for browser online/offline events
window.addEventListener('offline', () => {
  isOffline = true;
  showOfflineStatus();
});
window.addEventListener('online', () => {
  isOffline = false;
  hideOfflineStatus();
  fetchCurrentPlayback(); // Immediately try to reconnect
});

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Don't handle shortcuts when typing in input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  switch (e.code) {
    case 'Space':
      e.preventDefault();
      btnPlay.click();
      break;
    case 'ArrowRight':
      e.preventDefault();
      btnNext.click();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      btnPrev.click();
      break;
    case 'ArrowUp':
      e.preventDefault();
      adjustVolume(10);
      break;
    case 'ArrowDown':
      e.preventDefault();
      adjustVolume(-10);
      break;
  }
});

async function adjustVolume(delta) {
  const data = await spotifyFetch('/me/player');
  if (data && data.device) {
    let newVol = Math.max(0, Math.min(100, data.device.volume_percent + delta));
    await spotifyFetch(`/me/player/volume?volume_percent=${newVol}`, { method: 'PUT' });
  }
}

// ─── Double-click Album Art → Open in Spotify ───────────────────────────────
albumArt.addEventListener('dblclick', (e) => {
  if (isMiniMode) return; // Let mini mode exit handler handle it
  if (currentTrack && currentTrack.external_urls && currentTrack.external_urls.spotify) {
    window.electronAPI.openExternal(currentTrack.external_urls.spotify);
  }
});

// ─── Hover Tooltip for Song Name ────────────────────────────────────────────
trackName.addEventListener('mouseenter', () => {
  if (trackName.scrollWidth > trackName.clientWidth) {
    trackName.title = trackName.textContent;
  } else {
    trackName.title = '';
  }
});
trackArtist.addEventListener('mouseenter', () => {
  if (trackArtist.scrollWidth > trackArtist.clientWidth) {
    trackArtist.title = trackArtist.textContent;
  } else {
    trackArtist.title = '';
  }
});

// ─── Lyrics Copy (Right-click) ──────────────────────────────────────────────
currentLyricEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const text = currentLyricEl.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      // Brief visual feedback
      currentLyricEl.classList.add('copied');
      setTimeout(() => currentLyricEl.classList.remove('copied'), 800);
    }).catch(() => {});
  }
});

// Auto-hide controls removed (not suitable for small companion window)

// ─── Multi-device Switching ─────────────────────────────────────────────────
const btnDevices = document.getElementById('btn-devices');
const devicesPanel = document.getElementById('devices-panel');
const devicesCloseBtn = document.getElementById('devices-close');
const devicesList = document.getElementById('devices-list');

if (btnDevices) {
  btnDevices.addEventListener('click', async () => {
    if (devicesPanel.classList.contains('hidden')) {
      panelOpen = true;
      devicesPanel.classList.remove('hidden');
      await loadDevices();
      const hasLyrics = lyricsEnabled && syncedLyrics.length > 0;
      const baseHeight = hasLyrics ? 125 : 105;
      const totalHeight = baseHeight + 120;
      await window.electronAPI.resizeForDevices(totalHeight);
    } else {
      closeDevicesPanel();
    }
  });
}

if (devicesCloseBtn) {
  devicesCloseBtn.addEventListener('click', () => closeDevicesPanel());
}

async function closeDevicesPanel() {
  devicesPanel.classList.add('hidden');
  panelOpen = false;
  if (lyricsEnabled && syncedLyrics.length > 0) {
    await window.electronAPI.resizeForLyrics();
  } else {
    await window.electronAPI.resizeForPlayer();
  }
}

async function loadDevices() {
  if (!devicesList) return;
  devicesList.innerHTML = '<div class="device-loading">Loading devices...</div>';
  const data = await spotifyFetch('/me/player/devices');
  if (!data || !data.devices || data.devices.length === 0) {
    devicesList.innerHTML = '<div class="device-loading">No devices found</div>';
    return;
  }
  devicesList.innerHTML = '';
  data.devices.forEach(device => {
    const item = document.createElement('div');
    item.className = 'device-item' + (device.is_active ? ' active' : '');
    const icon = device.type === 'Computer' ? '💻' : device.type === 'Smartphone' ? '📱' : device.type === 'Speaker' ? '🔊' : '🎵';
    item.innerHTML = `<span class="device-icon">${icon}</span><span class="device-name">${device.name}</span>${device.is_active ? '<span class="device-active">●</span>' : ''}`;
    item.addEventListener('click', async () => {
      if (!device.is_active) {
        await spotifyFetch('/me/player', {
          method: 'PUT',
          body: JSON.stringify({ device_ids: [device.id], play: isPlaying })
        });
        setTimeout(() => {
          loadDevices();
          fetchCurrentPlayback();
        }, 500);
      }
    });
    devicesList.appendChild(item);
  });
}

// Close devices panel when clicking outside
document.addEventListener('click', (e) => {
  if (devicesPanel && !devicesPanel.classList.contains('hidden') &&
      !devicesPanel.contains(e.target) &&
      e.target !== btnDevices &&
      !btnDevices.contains(e.target)) {
    closeDevicesPanel();
  }
});

// ─── Mini Mode ───────────────────────────────────────────────────────────────
let isMiniMode = false;
const btnMini = document.getElementById('btn-mini');

async function enterMiniMode() {
  isMiniMode = true;
  document.body.classList.add('mini-mode');
  if (btnMini) btnMini.classList.add('active');
  await window.electronAPI.resizeForMini();
}

async function exitMiniMode() {
  isMiniMode = false;
  document.body.classList.remove('mini-mode');
  if (btnMini) btnMini.classList.remove('active');
  // resizeFromMini already restores to 105px with correct width.
  // Then adjust for lyrics if needed (single resize is enough).
  await window.electronAPI.resizeFromMini();
  if (lyricsEnabled && syncedLyrics.length > 0) {
    // Small delay to let the first resize settle before adjusting height for lyrics
    setTimeout(() => window.electronAPI.resizeForLyrics(), 50);
  }
}

if (btnMini) {
  btnMini.addEventListener('click', async () => {
    if (isMiniMode) {
      await exitMiniMode();
    } else {
      await enterMiniMode();
    }
  });
}

// Double-click anywhere on the player to exit mini mode
document.querySelector('.player-content').addEventListener('dblclick', async (e) => {
  if (isMiniMode) {
    e.preventDefault();
    e.stopPropagation();
    await exitMiniMode();
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────────
init();
// Lyrics enabled by default - container stays visible
