const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');

// Custom protocol scheme
const PROTOCOL_SCHEME = 'spotify-companion';

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow;

// Auth state
let accessToken = null;
let refreshToken = null;
let tokenExpiry = null;
let codeVerifier = null;
let activeRedirectUri = null;

// Window position persistence
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');
let isProgrammaticResize = false; // Prevent saveBounds during programmatic resizes
let isInMiniMode = false;
let preMiniWidth = 520; // Store width before entering mini mode
let preMiniX = undefined; // Store x position before mini mode

function loadSavedBounds() {
  try {
    if (fs.existsSync(BOUNDS_FILE)) {
      const data = JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf-8'));
      if (data.x !== undefined && data.y !== undefined && data.width) {
        return data;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

function saveBounds() {
  if (!mainWindow || isProgrammaticResize || isInMiniMode) return;
  try {
    const bounds = mainWindow.getBounds();
    fs.writeFileSync(BOUNDS_FILE, JSON.stringify({ x: bounds.x, y: bounds.y, width: bounds.width }));
  } catch (e) { /* ignore */ }
}

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function generateCodeChallenge(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

// Register custom protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// Handle protocol URL on macOS
app.on('open-url', (event, urlStr) => {
  event.preventDefault();
  handleProtocolCallback(urlStr);
});

app.on('second-instance', (event, commandLine) => {
  const protocolUrl = commandLine.find(arg => arg.startsWith(`${PROTOCOL_SCHEME}://`));
  if (protocolUrl) {
    handleProtocolCallback(protocolUrl);
  }
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function handleProtocolCallback(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const code = parsed.searchParams.get('code');
    const error = parsed.searchParams.get('error');

    if (error) {
      if (mainWindow) mainWindow.webContents.send('auth-error', error);
      return;
    }

    if (code && mainWindow) {
      mainWindow.webContents.send('auth-code-received', code);
    }
  } catch (err) {
    console.error('Failed to parse protocol URL:', err);
  }
}

function createMainWindow() {
  const saved = loadSavedBounds();

  mainWindow = new BrowserWindow({
    width: saved ? saved.width : 520,
    height: 60,
    x: saved ? saved.x : undefined,
    y: saved ? saved.y : undefined,
    minWidth: 520,
    minHeight: 50,
    maxHeight: 350,
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -20, y: -20 },
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    roundedCorners: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setVisibleOnAllWorkspaces(true);

  // Save position only on user-initiated moves/resizes (not programmatic)
  mainWindow.on('moved', saveBounds);
  mainWindow.on('resized', saveBounds);

  mainWindow.on('closed', () => {
    mainWindow = null;
    app.quit();
  });
}

// Helper: perform a programmatic resize without triggering saveBounds
function programmaticResize(fn) {
  isProgrammaticResize = true;
  fn();
  // Use setTimeout to ensure the 'resized' event fires before we reset the flag
  // (setImmediate is unreliable on macOS Electron — it can fire before the resize event)
  setTimeout(() => { isProgrammaticResize = false; }, 150);
}

// ─── IPC Handlers ───────────────────────────────────────────────────────────

ipcMain.handle('get-app-info', () => {
  return {
    isPackaged: app.isPackaged,
    protocolScheme: PROTOCOL_SCHEME,
    protocolRedirectUri: `${PROTOCOL_SCHEME}://callback`
  };
});

ipcMain.handle('resize-for-player', () => {
  if (mainWindow) {
    programmaticResize(() => {
      const bounds = mainWindow.getBounds();
      const newHeight = 105;
      const deltaH = newHeight - bounds.height;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: bounds.x, y: bounds.y - deltaH, width: bounds.width, height: newHeight });
      mainWindow.setMinimumSize(520, 90);
      mainWindow.setMaximumSize(700, 140);
    });
  }
});

ipcMain.handle('resize-for-lyrics', () => {
  if (mainWindow) {
    programmaticResize(() => {
      const bounds = mainWindow.getBounds();
      const newHeight = 125;
      const deltaH = newHeight - bounds.height;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: bounds.x, y: bounds.y - deltaH, width: bounds.width, height: newHeight });
      mainWindow.setMinimumSize(520, 90);
      mainWindow.setMaximumSize(700, 140);
    });
  }
});

ipcMain.handle('resize-no-lyrics', () => {
  if (mainWindow) {
    programmaticResize(() => {
      const bounds = mainWindow.getBounds();
      const newHeight = 105;
      const deltaH = newHeight - bounds.height;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: bounds.x, y: bounds.y - deltaH, width: bounds.width, height: newHeight });
      mainWindow.setMinimumSize(520, 90);
      mainWindow.setMaximumSize(700, 140);
    });
  }
});

ipcMain.handle('resize-for-setup', () => {
  if (mainWindow) {
    programmaticResize(() => {
      mainWindow.setMinimumSize(380, 50);
      mainWindow.setSize(520, 60, true);
    });
  }
});

ipcMain.handle('resize-for-settings', (event, requestedHeight) => {
  if (mainWindow) {
    programmaticResize(() => {
      const bounds = mainWindow.getBounds();
      const newHeight = requestedHeight || 205;
      const deltaH = newHeight - bounds.height;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: bounds.x, y: bounds.y - deltaH, width: bounds.width, height: newHeight });
      mainWindow.setMinimumSize(520, 90);
      mainWindow.setMaximumSize(700, 400);
    });
  }
});

ipcMain.handle('resize-for-devices', (event, requestedHeight) => {
  if (mainWindow) {
    programmaticResize(() => {
      const bounds = mainWindow.getBounds();
      const newHeight = requestedHeight || 220;
      const deltaH = newHeight - bounds.height;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: bounds.x, y: bounds.y - deltaH, width: bounds.width, height: newHeight });
      mainWindow.setMinimumSize(520, 90);
      mainWindow.setMaximumSize(700, 400);
    });
  }
});

// Mini mode resize - store current bounds before shrinking
ipcMain.handle('resize-for-mini', () => {
  if (mainWindow) {
    // Save current normal-mode bounds before entering mini
    const bounds = mainWindow.getBounds();
    preMiniWidth = bounds.width;
    preMiniX = bounds.x;
    isInMiniMode = true;

    programmaticResize(() => {
      const newHeight = 60;
      const newWidth = 320;
      const deltaH = newHeight - bounds.height;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: bounds.x, y: bounds.y - deltaH, width: newWidth, height: newHeight });
      mainWindow.setMinimumSize(250, 50);
      mainWindow.setMaximumSize(400, 70);
    });
  }
});

// Restore from mini mode - use stored pre-mini bounds
ipcMain.handle('resize-from-mini', () => {
  if (mainWindow) {
    isInMiniMode = false;

    programmaticResize(() => {
      const bounds = mainWindow.getBounds();
      const newWidth = preMiniWidth || 520;
      const newHeight = 105;
      const deltaH = newHeight - bounds.height;
      // Restore to original x position if available
      const newX = preMiniX !== undefined ? preMiniX : bounds.x;
      mainWindow.setMinimumSize(1, 1);
      mainWindow.setMaximumSize(10000, 10000);
      mainWindow.setBounds({ x: newX, y: bounds.y - deltaH, width: newWidth, height: newHeight });
      mainWindow.setMinimumSize(520, 90);
      mainWindow.setMaximumSize(700, 140);
    });
  }
});

ipcMain.handle('spotify-auth', async (event, { clientId }) => {
  codeVerifier = generateRandomString(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateRandomString(16);

  activeRedirectUri = `${PROTOCOL_SCHEME}://callback`;

  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-library-read',
    'user-library-modify',
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private'
  ].join(' ');

  const authUrl = `https://accounts.spotify.com/authorize?` +
    `client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(activeRedirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${state}` +
    `&code_challenge_method=S256` +
    `&code_challenge=${codeChallenge}`;

  shell.openExternal(authUrl);
  return { method: 'protocol', redirectUri: activeRedirectUri };
});

ipcMain.handle('exchange-code', async (event, { code, clientId, redirectUri }) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri || activeRedirectUri,
      client_id: clientId,
      code_verifier: codeVerifier
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return { accessToken, refreshToken, tokenExpiry };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-token', () => {
  return { accessToken, refreshToken, tokenExpiry };
});

ipcMain.handle('set-token', (event, data) => {
  accessToken = data.accessToken;
  refreshToken = data.refreshToken;
  tokenExpiry = data.tokenExpiry;
});

ipcMain.handle('refresh-spotify-token', async (event, clientId) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);

    const data = await response.json();
    accessToken = data.access_token;
    if (data.refresh_token) refreshToken = data.refresh_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000);
    return { accessToken, refreshToken, tokenExpiry };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-external', async (event, urlStr) => {
  console.log('[main] open-external called with:', urlStr);
  try {
    await shell.openExternal(urlStr);
  } catch (err) {
    console.error('[main] open-external error:', err);
  }
});

ipcMain.handle('quit-app', () => {
  app.quit();
});

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// ─── Update Checker (no code signing required) ──────────────────────────────

const UPDATE_REPO_OWNER = 'yiyefang-manus';
const UPDATE_REPO_NAME = 'spotify-companion';

function checkForUpdates() {
  const currentVersion = app.getVersion();
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`,
    headers: { 'User-Agent': 'spotify-companion' }
  };

  https.get(options, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const release = JSON.parse(data);
        const latestVersion = (release.tag_name || '').replace(/^v/, '');
        if (!latestVersion) return;

        if (isNewerVersion(currentVersion, latestVersion)) {
          console.log(`Update available: v${latestVersion} (current: v${currentVersion})`);
          // Find .dmg asset URL
          const dmgAsset = (release.assets || []).find(a => a.name.endsWith('.dmg'));
          const downloadUrl = dmgAsset
            ? dmgAsset.browser_download_url
            : release.html_url;

          if (mainWindow) {
            mainWindow.webContents.send('update-status', {
              status: 'available',
              version: latestVersion
            });
          }

          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Available',
            message: `A new version (v${latestVersion}) is available.`,
            detail: `You are currently on v${currentVersion}. Would you like to download the update?`,
            buttons: ['Download', 'Later'],
            defaultId: 0
          }).then(({ response }) => {
            if (response === 0) {
              shell.openExternal(downloadUrl);
            }
          });
        } else {
          console.log(`App is up to date (v${currentVersion}).`);
        }
      } catch (err) {
        console.log('Update check parse error:', err.message);
      }
    });
  }).on('error', (err) => {
    console.log('Update check failed:', err.message);
  });
}

function isNewerVersion(current, latest) {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

// Check for updates 5 seconds after app launches
app.whenReady().then(() => {
  setTimeout(() => checkForUpdates(), 5000);
});

// Also check periodically (every 4 hours)
setInterval(() => checkForUpdates(), 4 * 60 * 60 * 1000);

// IPC handler for manual update check from renderer
ipcMain.handle('check-for-updates', async () => {
  try {
    checkForUpdates();
    return { checked: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
