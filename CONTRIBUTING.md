# Contributing to Minecraft Local Server Manager

Thanks for taking the time to contribute. This is an Electron app written in
vanilla JavaScript (no framework, no bundler), so most contributions are bug
fixes, small features and documentation.

## Reporting issues

Open an issue on the [issue tracker](https://github.com/hugoaldaHD/minecraft-local-server-app/issues)
and include:

- App version (shown under **Ajustes** → Información, or in the release tag you use).
- OS and version (Windows 10/11, distro and kernel on Linux) and Java version.
- Steps to reproduce, expected behaviour and actual behaviour.
- Any error text. Crash reports are listed in the app under **Ajustes**
  (Settings) and stored in the `app.db` SQLite database inside the app data
  folder — paste the relevant message or stack trace.

Search the existing issues first, and use the latest release if you can.

## Testing changes locally

You need Node.js 20 or newer and npm.

```bash
git clone https://github.com/hugoaldaHD/minecraft-local-server-app.git
cd minecraft-local-server-app
npm install
npm start        # run the app
npm run dev      # run with the --dev flag
```

`better-sqlite3` is a native module: `npm start`/`npm run dev` rebuild it for
Electron, while `npm test`/`npm run smoke` rebuild it for Node automatically.
Building it from source needs a C++ toolchain (Visual Studio Build Tools on
Windows); electron-builder handles the rebuild when packaging.

Before pushing, run:

```bash
npm run lint          # ESLint
npm run lint:fix      # auto-fix what can be fixed
npm run format        # Prettier, writes the files
npm run format:check  # Prettier, check only
```

CI (`.github/workflows/lint.yml`) runs `npm ci` + `npm run lint` on every push
and pull request, so a PR with lint errors cannot be merged.

To check packaging changes, `npm run build` produces the Windows installer
locally; the Linux targets need Linux tooling and are built by CI. Releases
are cut with `npm run release` — see [RELEASE_GUIDE.md](RELEASE_GUIDE.md).

## Conventions

- **Linting/formatting**: ESLint 9 (flat config in `eslint.config.js`) and
  Prettier (`.prettierrc`: single quotes, no semicolons, print width 140,
  no trailing commas, arrow function params without parentheses). Let the
  tools decide the style instead of hand-formatting.
- **Language**: the app UI and in-app strings are in **Spanish**;
  documentation (`README.md`, this file, guides) is in **English**. Release
  notes and the changelog keep the language they already use.
- **Trust boundary**: the renderer is never trusted. Anything arriving over
  IPC must be validated in the main process (`main/validate.js`), and file
  paths must go through the existing allow-lists instead of being joined
  blindly.
- **CSP**: `src/index.html` sets a strict Content Security Policy, so there
  are no inline `onclick` handlers, no inline `style` attributes and no
  inline `<script>`. Use event delegation (see `initDelegates()` in
  `src/renderer.js`) and classes instead of `.style.*`.
- **Escaping**: build dynamic HTML only with the `esc()`/`safeColor()` helpers
  in `src/renderer.js`, never with raw interpolation into `innerHTML`.
- **Structure**: keep main-process code split across the modules in `main/`
  instead of growing `main/index.js`; expose new renderer APIs from
  `preload.js` only.
- `web/` (landing page) and `assets/` are excluded from ESLint.

## Pull requests

1. Fork and create a branch from `main`.
2. Make one focused change; keep unrelated refactors in separate PRs.
3. Run `npm run lint` and `npm run format` locally.
4. Open a PR describing **what** changed and **why**, plus how you tested it
   (screenshots help for UI changes).
5. Expect review: keep the discussion to the change itself.

## Commit messages

- One line, short and imperative: `fix console log growing without limit`,
  `add scheduled backups`.
- Describe the change, not the file: reviewers read the log without the diff.
- Do not commit build output (`dist/`, `build/`) or `node_modules/` — they are
  gitignored. `package-lock.json` should only change when you actually add or
  update a dependency.
- Do not bump the version or create tags by hand. Versioning, changelog
  entries and tags are handled by `npm run release`.
