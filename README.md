# Minecraft Local Server Manager

I have build a desktop application for managing local Minecraft servers.  
Compatible with Vanilla, Paper, Spigot, Bukkit, Fabric, and Forge.

## Features

- Start/stop the server.
- Real-time CPU and RAM statistics.
- Real-time console with command history.
- Player management (kick, ban, op, gamemode).
- Whitelist and Banlist with visual editor.
- server.properties editor.
- Manual and automatic world backups.
- Built-in server installer: download and set up **Vanilla**, **Paper**,
  **Fabric** or **Forge** from inside the "Add server" dialog.

## Server installer

The "Add server" dialog has a **Download server** tab that fetches and installs a
server without leaving the app:

| Variant | Source                                                | Notes                                            |
| ------- | ----------------------------------------------------- | ------------------------------------------------ |
| Vanilla | Mojang version manifest                               | Official server JAR                              |
| Paper   | `fill.papermc.io` (v3 API)                            | Stable builds, verified with SHA-256             |
| Fabric  | `meta.fabricmc.net`                                   | Latest stable loader + installer                 |
| Forge   | `files.minecraftforge.net` / Maven                    | 1.17 and newer; runs the installer               |

Downloads show progress and can be cancelled. The installer also warns in
advance when the selected Minecraft version needs a newer Java than the one
configured (Java 8/17/21 depending on the version).


## Requirements

- Java (JRE 17 or newer) installed, to run the Minecraft servers.
- Windows 10+ or a 64-bit Linux distribution.

## Download

Grab the latest release from the [releases page](https://github.com/hugoaldaHD/minecraft-local-server-app/releases/latest).

### Windows

Download `Minecraft-Local-Server-Manager.exe` and run the installer.

### Linux (x64)

- **AppImage** - `Minecraft-Local-Server-Manager.AppImage`: no installation needed.

  ```bash
  chmod +x Minecraft-Local-Server-Manager.AppImage
  ./Minecraft-Local-Server-Manager.AppImage
  ```

  The app registers itself as an installed app on first run, so it shows up in the
  application menu with its own icon.

- **Debian / Ubuntu** - `Minecraft-Local-Server-Manager.deb`:

  ```bash
  sudo apt install ./Minecraft-Local-Server-Manager.deb
  ```

  Updates for the `.deb` come from your package manager, not from the app.

## Notes

- The AppImage is self-contained and can update itself from inside the app.
- Server files, backups and settings are stored in `%APPDATA%\minecraft-local-server-app`
  on Windows and in `~/.config/minecraft-local-server-app` on Linux.

---

## Development

### Requirements

- Node.js 20 or newer, with npm.
- Java (JRE 17 or newer) if you want to run servers from a dev build.

### Getting started

```bash
git clone https://github.com/hugoaldaHD/minecraft-local-server-app.git
cd minecraft-local-server-app
npm install
npm start        # run the app with Electron
npm run dev      # same, passing the --dev flag
```

### Linting and formatting

```bash
npm run lint          # ESLint (flat config in eslint.config.js)
npm run lint:fix      # auto-fix what can be fixed
npm test              # Node's built-in test runner (test/*.test.js)
npm run format        # Prettier, writes the files
npm run format:check  # Prettier, check only
```

CI runs `npm ci` + `npm run lint` + `npm test` on every push and pull request
(`.github/workflows/lint.yml`).

### Building

```bash
npm run build           # Windows x64 NSIS installer -> dist/
npm run build:portable  # Windows portable build
npm run build:linux     # AppImage + .deb (Linux only)
npm run build:ci        # alias of build:win, used by the release workflow
```

`build:win` and `build:linux` pass `--publish always`, so they are meant for CI.
Releases are cut with `npm run release`; see [RELEASE_GUIDE.md](RELEASE_GUIDE.md).

### Project structure

| Path                | Description                                                                |
| ------------------- | -------------------------------------------------------------------------- |
| `main/index.js`     | Entry point of the main process: IPC registration and app lifecycle        |
| `main/state.js`     | Shared main-process state (window reference, active servers)               |
| `main/stores.js`    | `electron-store` instances: servers, settings, analytics, crashes          |
| `main/validate.js`  | Validation of IPC payloads and allow-lists for paths from the renderer     |
| `main/servers.js`   | Create/start/stop servers, console commands, player management             |
| `main/downloader.js`| Server installer: Vanilla/Paper/Fabric/Forge download, Forge install, IPC  |
| `main/http.js`      | HTTP helpers: redirects, text/JSON fetch, SHA-256, resumable-free download |
| `main/versions.js`  | Pure helpers: Java thresholds, version sorting, provider parsers           |
| `main/properties.js`| `server.properties` and whitelist/banlist/ops editing                      |
| `main/backups.js`   | Manual and scheduled world backups (`archiver`, `node-schedule`)           |
| `main/window.js`    | `BrowserWindow` creation, navigation guards, window IPC                    |
| `main/updater.js`   | Auto-update via `electron-updater` (AppImage only on Linux)                |
| `main/stats.js`     | CPU/RAM polling (`systeminformation`)                                      |
| `main/analytics.js` | Consent-gated anonymous usage events (see [Privacy](#privacy))             |
| `main/crash.js`     | Local log of uncaught errors and unhandled rejections                      |
| `preload.js`        | `contextBridge` API exposed to the renderer as `window.api`                |
| `src/`              | Renderer: `index.html` (strict CSP), `renderer.js`, CSS in `src/css/`      |
| `test/`             | Unit tests run with `node --test` (validate, properties, servers, i18n…)    |
| `assets/`           | App icons and fonts used by the builds                                     |
| `web/`              | Static landing page, deployed separately (not part of the app bundle)      |
| `scripts/`          | `release.mjs`, the release helper                                          |
| `.github/workflows/`| Lint and build/release CI                                                  |

### Architecture notes

- The **main process** owns everything that touches the system: files, child
  processes, windows. The **renderer** only draws the UI and talks over IPC.
- The window is created with `contextIsolation: true` and
  `nodeIntegration: false`; `preload.js` exposes a narrow `window.api` surface,
  so the renderer never gets direct Node.js access.
- Every IPC payload is validated in the main process (`main/validate.js`):
  paths are checked against allow-lists, `..` is rejected, and starting a
  server only uses configuration from the app's own storage.
- A strict Content Security Policy is set in `src/index.html`
  (`default-src 'self'`, no `'unsafe-inline'`), and dynamic HTML is escaped
  with `esc()` in `src/renderer.js`.
- **The renderer is never trusted.** Treat anything coming from it as
  untrusted input and validate it again in `main/`.

## Privacy

The app runs entirely locally: servers, backups, console and settings never
leave your machine. Usage analytics are optional and **off by default**.

### Consent

- No analytics event is recorded, stored or sent until you explicitly opt in.
  The default value is "not consented", and on first run the app shows a
  consent screen before you can continue.
- Declining deletes any locally stored analytics events.
- You can change your choice at any time from the **Ajustes** (Settings)
  screen with the "Envío de datos anónimos" toggle.

### What is collected after you opt in

- An anonymous installation ID: a random UUID generated on first run, with no
  personal data attached.
- App version, platform, architecture and OS release.
- Technical events: `app_launch`, `server_created`, `server_started`,
  `server_stopped`, `backup_created` and `analytics_enabled`.
- Small technical values attached to some events (for example server startup
  time, uptime or backup size in MB).

Server names, IPs, player names, console output and any other personal data
are never collected.

### Where the data goes

- Events are only sent if an HTTPS endpoint has been configured in the
  settings store (`analyticsEndpoint`). The request uses a 5 second timeout
  and failures are ignored silently. The app does not ship with an endpoint,
  so by default nothing is sent anywhere.
- With no endpoint configured, events are kept locally in `analytics.json`
  inside the app data folder, limited to the 500 most recent ones.
- Crash reports are always written locally to `crashes.json` in the same
  folder (last 100 entries) and can be cleared from the Settings screen.
  They are only sent if a separate `crashEndpoint` is configured; the app
  provides no UI for that setting.

Nothing is sold or shared with third parties: no data leaves your computer
unless you configure an endpoint yourself.