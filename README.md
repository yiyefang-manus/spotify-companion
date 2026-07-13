# Spotify Companion

A translucent, always-on-top floating bar for macOS that displays your currently playing Spotify track with playback controls, synced lyrics, waveform visualization, and automatic updates.

## Features

- **Now Playing** — album art, track name, and artist in real-time
- **Playback Controls** — play/pause, next, previous, shuffle, repeat
- **Progress Bar** — shows playback progress with drag-to-seek
- **Synced Lyrics** — real-time lyrics from lrclib.net with LyricsX-style sync engine
- **Waveform Visualization** — smooth animated waveform that responds to playback state
- **Mini Mode** — compact 280×60px view, double-click to restore
- **Multi-Device Switching** — switch between Spotify Connect devices
- **Theme Support** — light and dark mode with glassy translucent panels
- **Keyboard Shortcuts** — Space (play/pause), Left/Right arrows (skip), Up/Down arrows (volume)
- **Auto-Updates** — automatically checks for and installs new versions via GitHub Releases
- **Window Position Persistence** — remembers where you placed it
- **Offline Detection** — shows banner when connection is lost
- **Token Auto-Refresh** — proactive refresh + 401 retry

## Installation

### Download (Recommended)

Download the latest `.dmg` from the [Releases](https://github.com/yiyefyy/spotify-companion/releases) page.

### Build from Source

```bash
git clone https://github.com/yiyefyy/spotify-companion.git
cd spotify-companion
npm install
npm start
```

## Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Add `spotify-companion://callback` as a Redirect URI
4. Under "Which API/SDKs are you planning to use?", select **Web API**
5. Save and copy your **Client ID**
6. Paste it into the app's setup screen

## Development

```bash
# Run in development mode
npm run dev

# Build for macOS (ARM64)
npm run build

# Build and publish a release
npm run release
```

## Releasing a New Version

1. Update the version in `package.json`:
   ```bash
   npm version patch  # or minor, or major
   ```

2. Push the tag to GitHub:
   ```bash
   git push origin main --tags
   ```

3. GitHub Actions will automatically:
   - Build the macOS app (DMG + ZIP)
   - Create a GitHub Release
   - Upload the artifacts
   - Generate `latest-mac.yml` for the auto-updater

4. Users running the app will be notified of the update automatically.

## Auto-Update

The app checks for updates:
- 5 seconds after launch
- Every 4 hours while running

When an update is available, it downloads in the background and prompts the user to restart.

## Architecture

```
spotify-companion/
├── main.js              # Electron main process (window, auth, IPC, auto-updater)
├── preload.js           # Context bridge (secure IPC between main & renderer)
├── index.html           # Main horizontal bar UI
├── renderer.js          # Renderer logic (Spotify API, UI, lyrics sync)
├── styles.css           # Glassmorphism styles + themes
├── .github/
│   └── workflows/
│       └── release.yml  # GitHub Actions CI/CD for building releases
├── build/
│   ├── entitlements.mac.plist
│   ├── icon.icns
│   └── gen_icon.py
├── dist/                # Build output (after `npm run build`)
└── package.json         # Dependencies + electron-builder config
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Electron 33 |
| Auth | Spotify Web API (PKCE) + custom URI scheme |
| Lyrics | lrclib.net API (free, no key) |
| Auto-Update | electron-updater + GitHub Releases |
| Packaging | electron-builder |
| UI Effect | CSS glassmorphism + liquid background |

## Requirements

- macOS 11+ (Apple Silicon)
- Spotify Premium (required for playback control via Web API)
- Node.js 18+
- Active Spotify playback on any device

## License

MIT
