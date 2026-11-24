/* global I18N */
'use strict'

const T = (k, v) => I18N.t(k, v)

const state = {
  currentServerId: null,
  currentServerDir: null,
  servers: [],
  playersByServer: {},
  consoleLogs: {},
  consoleLines: 0,
  isRunning: false,
  update: { status: 'idle', hasUpdate: false, version: null, notes: null, percent: 0, lastChecked: null },
  detailBar: [false, false],
  maximized: false,
  dl: { source: 'manual', provider: 'paper', version: '', versions: {}, shownProvider: null, installRoot: '', token: null, installing: false, cancelRequested: false }
}

const MAX_LINES = 2000
const SERVER_COLORS = ['#6cb43f', '#8fd14f', '#e5c454', '#e2685c', '#8fd1ff', '#3f7d24', '#cfc6a8', '#97a48f']
const IMPORTANT_PROPS = ['server-port', 'max-players', 'level-name', 'gamemode', 'difficulty', 'pvp', 'online-mode', 'white-list', 'motd', 'view-distance', 'simulation-distance', 'allow-flight', 'enable-command-block', 'level-seed', 'spawn-protection', 'level-type', 'op-permission-level']

function safeColor(c) {
  return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : SERVER_COLORS[0]
}

// Constructor DOM seguro: sin innerHTML no hay riesgo de inyección (#15/#31).
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'text') node.textContent = String(v)
    else node.setAttribute(k, String(v))
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue
    node.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)))
  }
  return node
}

function fill(container, ...children) {
  container.textContent = ''
  children.flat().forEach(c => { if (c) container.appendChild(c) })
  return container
}

function serverDirOf(server) {
  return server && server.jarPath ? server.jarPath.replace(/[/\\][^/\\]+$/, '') : ''
}

function playersOf(serverId) {
  if (!state.playersByServer[serverId]) state.playersByServer[serverId] = new Set()
  return state.playersByServer[serverId]
}

// Envuelve llamadas IPC: cualquier rechazo se registra y devuelve un fallback.
async function run(label, fn, fallback = null) {
  try {
    return await fn()
  } catch (err) {
    console.error(`[${label}]`, err)
    if (state.currentServerId) appendLog(T('log.runError', { label, msg: err?.message || err }), 'error')
    return fallback
  }
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(T('log.unhandledRejection'), e.reason)
})

// ─── Tema (claro/oscuro): se aplica antes del primer pintado ─────────────────
const THEME_KEY = 'app-theme'
function currentTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  return saved === 'light' ? 'light' : 'dark'
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_KEY, theme)
}
applyTheme(currentTheme())

