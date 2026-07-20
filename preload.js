const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Auth
  spotifyAuth: (opts) => ipcRenderer.invoke('spotify-auth', opts),
  exchangeCode: (opts) => ipcRenderer.invoke('exchange-code', opts),
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (data) => ipcRenderer.invoke('set-token', data),
  refreshToken: (clientId) => ipcRenderer.invoke('refresh-spotify-token', clientId),
  logout: () => ipcRenderer.invoke('logout'),

  // Auth events
  onAuthSuccess: (callback) => ipcRenderer.on('auth-success', (event, data) => callback(data)),
  onAuthError: (callback) => ipcRenderer.on('auth-error', (event, error) => callback(error)),
  onAuthCodeReceived: (callback) => ipcRenderer.on('auth-code-received', (event, code) => callback(code)),

  // Window
  resizeForPlayer: () => ipcRenderer.invoke('resize-for-player'),
  resizeForLyrics: () => ipcRenderer.invoke('resize-for-lyrics'),
  resizeNoLyrics: () => ipcRenderer.invoke('resize-no-lyrics'),
  resizeForSetup: () => ipcRenderer.invoke('resize-for-setup'),
  resizeForPlaylist: (height) => ipcRenderer.invoke('resize-for-playlist', height),
  resizeForSettings: (height) => ipcRenderer.invoke('resize-for-settings', height),
  resizeForDevices: (height) => ipcRenderer.invoke('resize-for-devices', height),
  resizeForMini: () => ipcRenderer.invoke('resize-for-mini'),
  resizeFromMini: () => ipcRenderer.invoke('resize-from-mini'),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  setVibrancy: (type) => ipcRenderer.invoke('set-vibrancy', type)
});
