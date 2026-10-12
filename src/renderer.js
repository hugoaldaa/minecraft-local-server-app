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

document.addEventListener('DOMContentLoaded', async () => {
  initTitlebar()
  initEvents()
  initDelegates()
  initModal()
  renderColorOptions('ms-color-options', null)
  initUpdates()
  initSettings()

  // First run: check analytics consent
  const consent = await run(T('run.consent'), () => window.api.getAnalyticsConsent(), undefined)
  if (consent === null) showScreen('consent')
  else showScreen('servers')

  // ─── Actualizaciones ────────────────────────────────────────────────────────
  function initUpdates() {
    document.getElementById('btn-check-update').onclick = checkForUpdates
    document.getElementById('btn-update-download').onclick = () => run(T('run.settings'), () => window.api.downloadUpdate())
    document.getElementById('btn-update-install').onclick = () => window.api.installUpdate()
    // El icono ⬇ de la titlebar lleva directo a Ajustes → Actualizaciones
    document.getElementById('btn-update-notify').onclick = () => {
      showScreen('settings')
      setSettingsSection('updates')
    }

    window.api.onUpdateStatus((info) => applyUpdateStatus(info))
  }

})

const UPDATE_STATE_KEYS = {
  idle: 'upd.state.idle',
  checking: 'upd.state.checking',
  latest: 'upd.state.latest',
  available: 'upd.state.available',
  downloading: 'upd.state.downloading',
  ready: 'upd.state.ready',
  error: 'upd.state.error',
  dev: 'upd.state.dev'
}

const UPDATE_STATE_CLASS = {
  idle: 'is-idle',
  checking: 'is-busy',
  latest: 'is-ok',
  available: 'is-warn',
  downloading: 'is-busy',
  ready: 'is-ok',
  error: 'is-err',
  dev: 'is-idle'
}

const UPDATE_PILL_KEYS = {
  available: 'upd.pill.available',
  downloading: 'upd.pill.downloading',
  ready: 'upd.pill.ready',
  error: 'upd.pill.error'
}

let updateCheckTimeout = null

function applyUpdateStatus(info) {
  const u = state.update
  if (info.status === 'available') {
    u.status = 'available'
    u.hasUpdate = true
    u.version = info.version || u.version
    u.notes = info.releaseNotes || u.notes
    u.lastChecked = new Date()
  } else if (info.status === 'latest') {
    u.status = 'latest'
    u.hasUpdate = false
    u.version = info.version || u.version
    u.notes = null
    u.lastChecked = new Date()
  } else if (info.status === 'downloading') {
    u.status = 'downloading'
    u.percent = info.percent || 0
  } else if (info.status === 'ready') {
    u.status = 'ready'
    u.version = info.version || u.version
    u.percent = 100
  } else if (info.status === 'error') {
    // Solo nos interesa el error si había una comprobación o descarga en marcha
    if (u.status === 'checking' || u.status === 'downloading' || u.hasUpdate) u.status = 'error'
  } else {
    u.status = info.status
  }
  renderUpdateState()
}

async function checkForUpdates() {
  clearTimeout(updateCheckTimeout)
  state.update.status = 'checking'
  renderUpdateState()
  const res = await run(T('run.settings'), () => window.api.checkUpdate(), {})
  if (res && res.status === 'dev') {
    state.update.status = 'dev'
    renderUpdateState()
  } else if (res && res.status === 'checking') {
    // Si la comprobación no contesta en 20s, mostramos error
    updateCheckTimeout = setTimeout(() => {
      if (state.update.status === 'checking') applyUpdateStatus({ status: 'error' })
    }, 20000)
  }
}

function renderUpdateState() {
  const u = state.update
  document.getElementById('btn-update-notify').classList.toggle('hidden', !u.hasUpdate)

  const stateEl = document.getElementById('upd-state')
  stateEl.textContent = T(UPDATE_STATE_KEYS[u.status] || UPDATE_STATE_KEYS.idle, { version: u.version || '', percent: u.percent || 0 })
  stateEl.className = 'set-row-hint upd-state ' + (UPDATE_STATE_CLASS[u.status] || '')

  const lastEl = document.getElementById('upd-lastcheck')
  if (u.lastChecked instanceof Date) {
    lastEl.removeAttribute('data-i18n')
    lastEl.textContent = u.lastChecked.toLocaleDateString() + ' ' + u.lastChecked.toLocaleTimeString()
  } else {
    lastEl.setAttribute('data-i18n', 'upd.never')
    lastEl.textContent = T('upd.never')
  }

  const card = document.getElementById('upd-card')
  card.classList.toggle('hidden', !u.hasUpdate)
  if (!u.hasUpdate) return

  document.getElementById('upd-newversion').textContent = T('upd.newVersion', { version: u.version || '?' })

  const pill = document.getElementById('upd-pill')
  pill.className = 'upd-pill ' + (UPDATE_STATE_CLASS[u.status] || 'is-idle')
  pill.textContent = T(UPDATE_PILL_KEYS[u.status] || 'upd.pill.available', { percent: u.percent || 0 })

  document.getElementById('upd-hint').textContent = T('upd.hint.' + (['available', 'downloading', 'ready', 'error'].includes(u.status) ? u.status : 'available'))

  const downloading = u.status === 'downloading'
  const progress = document.getElementById('upd-progress')
  progress.classList.toggle('hidden', !downloading)
  if (downloading) document.getElementById('upd-bar').style.width = (u.percent || 0) + '%'

  document.getElementById('btn-update-download').classList.toggle('hidden', u.status === 'ready' || downloading)
  document.getElementById('btn-update-install').classList.toggle('hidden', u.status !== 'ready')

  renderUpdateNotes(u.notes)
}

function renderUpdateNotes(raw) {
  const wrap = document.getElementById('upd-notes')
  const box = document.getElementById('update-notes')
  box.textContent = ''

  let lines = []
  if (Array.isArray(raw)) {
    // electron-updater puede devolver [{ version, note }]
    raw.forEach((r, i) => {
      if (typeof r === 'string') lines.push(...r.split('\n'))
      else if (r && r.note) {
        if (raw.length > 1 && r.version) lines.push(`## ${r.version}`)
        lines.push(...String(r.note).split('\n'))
      }
      if (i === 0 && !lines.length) lines.push('')
    })
  } else if (raw) {
    lines = String(raw).split('\n')
  }
  lines = lines.map(l => l.trim()).filter(Boolean)

  const heading = lines.find(l => l.startsWith('#'))
  const items = lines.filter(l => !l.startsWith('#')).map(l => l.replace(/^[-*]\s*/, ''))

  if (!heading && !items.length) {
    box.textContent = T('upd.noNotes')
  } else {
    if (heading) {
      const title = document.createElement('div')
      title.className = 'update-notes-title'
      title.textContent = heading.replace(/^#+\s*/, '')
      box.appendChild(title)
    }
    if (items.length) {
      const ul = document.createElement('ul')
      items.forEach(item => {
        const li = document.createElement('li')
        li.textContent = item
        ul.appendChild(li)
      })
      box.appendChild(ul)
    }
  }
  wrap.classList.remove('hidden')
}

// ─── Titlebar ─────────────────────────────────────────────────────────────────
function initTitlebar() {
  document.getElementById('btn-min').onclick = () => window.api.minimize()
  document.getElementById('btn-max').onclick = () => window.api.maximize()
  document.getElementById('btn-close').onclick = () => window.api.close()
  // Al abrir Ajustes siempre se empieza en General, no en la última sección usada
  document.getElementById('btn-settings').onclick = () => {
    showScreen('settings')
    setSettingsSection('general')
  }
  document.getElementById('btn-back-servers').onclick = () => showScreen('servers')
  window.api.onMaximized((isMaximized) => {
    state.maximized = isMaximized
    document.getElementById('btn-max').textContent = isMaximized ? '🗗' : '☐'
    updateMaxTitle()
  })
  updateMaxTitle()
}

function updateMaxTitle() {
  document.getElementById('btn-max').title = state.maximized ? T('win.restore') : T('win.maximize')
}

// ─── Delegación de eventos (sin onclick inline: requerido por la CSP) ────────
function initDelegates() {
  document.querySelectorAll('.color-options').forEach(container => {
    container.addEventListener('click', (e) => {
      const opt = e.target.closest('.color-opt')
      if (opt) selectColor(opt, container.id)
    })
  })

  document.getElementById('servers-grid').addEventListener('click', (e) => {
    const card = e.target.closest('.server-card')
    if (card) openServer(card.dataset.serverId)
  })

  document.getElementById('whitelist-ul').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove')
    if (btn) removeFromList('whitelist', btn.dataset.name, btn.dataset.uuid)
  })
  document.getElementById('banlist-ul').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove')
    if (btn) removeFromList('banlist', btn.dataset.name, btn.dataset.uuid)
  })

  document.getElementById('backups-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-icon')
    if (!btn || !btn.dataset.path) return
    if (btn.classList.contains('danger')) deleteBackup(btn.dataset.path)
    else openBackupPath(btn.dataset.path)
  })

  document.querySelector('.action-row').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]')
    if (btn) playerAction(btn.dataset.action)
  })
}

// ─── Analytics consent ────────────────────────────────────────────────────────
document.getElementById('btn-consent-yes').onclick = async () => {
  await run(T('run.consent'), () => window.api.setAnalyticsConsent(true))
  showScreen('servers')
}
document.getElementById('btn-consent-no').onclick = async () => {
  await run(T('run.consent'), () => window.api.setAnalyticsConsent(false))
  showScreen('servers')
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────
function initSettings() {
  document.getElementById('btn-settings-back').onclick = () => showScreen('servers')
  document.getElementById('btn-clear-crashes').onclick = async () => {
    await run(T('run.clearErrors'), () => window.api.clearCrashes())
    loadSettings()
  }
  document.getElementById('btn-clear-events').onclick = async () => {
    await run(T('run.settings'), () => window.api.clearAnalyticsEvents())
    loadSettings()
  }
  document.getElementById('diag-analytics-toggle').onchange = async (e) => {
    await run(T('run.consent'), () => window.api.setAnalyticsConsent(e.target.checked))
    loadSettings()
  }
  document.getElementById('btn-set-backup-dir').onclick = async () => {
    const p = await run(T('run.pickDir'), () => window.api.openDirDialog())
    if (!p) return
    const res = await run(T('run.saveBackupSettings'), () => window.api.setPref('backupDir', p))
    if (res && res.ok) document.getElementById('set-backup-dir').value = p
  }
  document.getElementById('btn-set-server-dir').onclick = async () => {
    const p = await run(T('run.pickDir'), () => window.api.openDirDialog())
    if (!p) return
    const res = await run(T('run.settings'), () => window.api.setPref('defaultServerDir', p))
    if (res && res.ok) document.getElementById('set-server-dir').value = p
  }
  document.getElementById('set-close-to-tray').onchange = (e) => {
    run(T('run.settings'), () => window.api.setPref('closeToTray', e.target.checked))
  }
  document.getElementById('set-start-on-boot').onchange = (e) => {
    run(T('run.settings'), () => window.api.setPref('startOnBoot', e.target.checked))
  }
  document.getElementById('theme-options').addEventListener('click', (e) => {
    const opt = e.target.closest('.seg-opt')
    if (opt) setTheme(opt.dataset.themeValue)
  })
  document.getElementById('lang-options').addEventListener('click', (e) => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    I18N.setLang(opt.dataset.langValue)
    // El idioma también se guarda en main para el menú de la bandeja
    window.api.setPref('lang', opt.dataset.langValue)
  })
  document.getElementById('uiscale-options').addEventListener('click', (e) => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    selectUiScale(opt.dataset.scaleValue)
    run(T('run.settings'), () => window.api.setPref('uiScale', Number(opt.dataset.scaleValue) / 100))
  })
  document.getElementById('backup-keep-options').addEventListener('click', (e) => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    selectSegOpt('backup-keep-options', 'keepValue', opt.dataset.keepValue)
    run(T('run.saveBackupSettings'), () => window.api.setPref('backupKeep', Number(opt.dataset.keepValue)))
  })
  document.getElementById('backup-level-options').addEventListener('click', (e) => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    selectSegOpt('backup-level-options', 'levelValue', opt.dataset.levelValue)
    run(T('run.saveBackupSettings'), () => window.api.setPref('backupLevel', Number(opt.dataset.levelValue)))
  })
  document.getElementById('set-default-ram').addEventListener('change', async (e) => {
    const ok = await saveSettingsPref('defaultRam', parseInt(e.target.value, 10))
    if (!ok) loadSettings() // valor fuera de rango: recupera el guardado
  })
  document.getElementById('set-default-java').addEventListener('change', (e) => {
    saveSettingsPref('defaultJava', e.target.value.trim() || null)
  })
  document.getElementById('set-default-jvm').addEventListener('change', (e) => {
    saveSettingsPref('defaultJvmArgs', e.target.value.trim() || null)
  })
  document.getElementById('set-auto-eula').onchange = async (e) => {
    const ok = await saveSettingsPref('autoEula', e.target.checked)
    if (!ok) loadSettings()
  }
  // Raíl de secciones: muestra solo el panel elegido
  document.getElementById('set-nav').addEventListener('click', (e) => {
    const item = e.target.closest('.set-nav-item')
    if (item) setSettingsSection(item.dataset.setSection)
  })
}

// Muestra una sección de Ajustes (la usan el raíl y el icono ⬇ de la titlebar)
function setSettingsSection(section) {
  document.querySelectorAll('#set-nav .set-nav-item').forEach(b => b.classList.toggle('active', b.dataset.setSection === section))
  document.querySelectorAll('.set-panel').forEach(p => p.classList.toggle('active', p.dataset.setPanel === section))
  const panels = document.querySelector('.set-panels')
  if (panels) panels.scrollTop = 0
  if (section === 'updates') renderUpdateState()
}

function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return
  if (currentTheme() === theme) return
  applyTheme(theme)
  updateSettingsSeg()
  run(T('run.settings'), () => window.api.setPref('theme', theme))
}

function updateSettingsSeg() {
  const theme = currentTheme()
  document.querySelectorAll('#theme-options .seg-opt').forEach(b => b.classList.toggle('selected', b.dataset.themeValue === theme))
  const lang = I18N.getLang()
  document.querySelectorAll('#lang-options .seg-opt').forEach(b => b.classList.toggle('selected', b.dataset.langValue === lang))
}

// Marca la escala activa en el segmento de Tamaño de la interfaz (en %)
function selectUiScale(pct) {
  selectSegOpt('uiscale-options', 'scaleValue', String(pct))
}

// Marca la opción activa de cualquier segmento de Ajustes
function selectSegOpt(id, datasetKey, value) {
  document.querySelectorAll(`#${id} .seg-opt`).forEach(b => b.classList.toggle('selected', b.dataset[datasetKey] === value))
}

// Guarda una preferencia y devuelve si el main la aceptó
async function saveSettingsPref(key, value) {
  const res = await run(T('run.settings'), () => window.api.setPref(key, value))
  return !!(res && res.ok)
}

async function loadSettings() {
  updateSettingsSeg()

  const prefDir = await run(T('run.settings'), () => window.api.getPref('backupDir'), '')
  document.getElementById('set-backup-dir').value = prefDir || ''

  const prefServerDir = await run(T('run.settings'), () => window.api.getPref('defaultServerDir'), '')
  const closeToTray = await run(T('run.settings'), () => window.api.getPref('closeToTray'), false)
  const startOnBoot = await run(T('run.settings'), () => window.api.getPref('startOnBoot'), false)
  const uiScale = await run(T('run.settings'), () => window.api.getPref('uiScale'), 1)
  const backupKeep = await run(T('run.saveBackupSettings'), () => window.api.getPref('backupKeep'), 0)
  const backupLevel = await run(T('run.saveBackupSettings'), () => window.api.getPref('backupLevel'), 6)
  const defaultRam = await run(T('run.settings'), () => window.api.getPref('defaultRam'), null)
  const defaultJava = await run(T('run.settings'), () => window.api.getPref('defaultJava'), '')
  const defaultJvmArgs = await run(T('run.settings'), () => window.api.getPref('defaultJvmArgs'), '')
  const autoEula = await run(T('run.settings'), () => window.api.getPref('autoEula'), false)
  document.getElementById('set-server-dir').value = prefServerDir || ''
  document.getElementById('set-close-to-tray').checked = closeToTray === true
  document.getElementById('set-start-on-boot').checked = startOnBoot === true
  document.getElementById('set-default-ram').value = Number.isInteger(defaultRam) ? defaultRam : ''
  document.getElementById('set-default-java').value = defaultJava || ''
  document.getElementById('set-default-jvm').value = defaultJvmArgs || ''
  document.getElementById('set-auto-eula').checked = autoEula === true
  selectUiScale(Math.round((typeof uiScale === 'number' && uiScale > 0 ? uiScale : 1) * 100))
  selectSegOpt('backup-keep-options', 'keepValue', String([0, 5, 10, 20, 50].includes(backupKeep) ? backupKeep : 0))
  selectSegOpt('backup-level-options', 'levelValue', String(Number.isInteger(backupLevel) && backupLevel >= 1 && backupLevel <= 9 ? backupLevel : 6))

  const crashes = await run(T('run.diagnostics'), () => window.api.getCrashes(), [])
  const version = await run(T('run.diagnostics'), () => window.api.getVersion(), '')
  const consent = await run(T('run.diagnostics'), () => window.api.getAnalyticsConsent(), null)
  const java = await run(T('run.diagnostics'), () => window.api.javaCheck(), null)

  document.getElementById('diag-analytics-toggle').checked = !!consent
  document.getElementById('upd-installed').textContent = version ? `v${version}` : '—'

  const diagRow = (label, value) => h('div', { class: 'diag-row' },
    h('span', { class: 'diag-row-label', text: label }),
    h('span', { class: 'diag-row-val', text: String(value) })
  )

  // Información: solo datos del equipo instalado (sin analytics)
  const infoRows = [
    [T('diag.version'), `v${version}`],
    ['Java', java && java.ok ? (java.raw || `Java ${java.major}`) : T('diag.javaNotDetected')],
    [T('diag.platform'), navigator.platform]
  ]
  fill(document.getElementById('diag-info'), ...infoRows.map(([l, v]) => diagRow(l, v)))

  // Crashes panel
  const crashesEl = document.getElementById('diag-crashes')
  if (!crashes.length) {
    fill(crashesEl, h('div', { class: 'crash-empty', text: T('diag.noErrors') }))
  } else {
    fill(crashesEl, ...crashes.slice(0, 20).map(c => h('div', { class: 'crash-item' },
      h('div', { class: 'crash-type', text: c.type }),
      h('div', { class: 'crash-msg', text: c.message }),
      h('div', { class: 'crash-meta', text: `v${c.appVersion} · ${new Date(c.timestamp).toLocaleString(I18N.locale())}` })
      )))
  }

  renderUpdateState()
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(`screen-${name}`).classList.add('active')

  const stats = document.getElementById('titlebar-stats')
  if (name === 'consent' || name === 'settings') stats.classList.add('hidden')
  else stats.classList.remove('hidden')

  if (name === 'servers' || name === 'settings') state.currentServerId = null
  if (name === 'servers') refreshServersGrid()
  if (name === 'settings') loadSettings()
}

// ─── Events from main ─────────────────────────────────────────────────────────
function initEvents() {
  window.api.onConsoleLine(({ serverId, text, type }) => {
    if (!state.consoleLogs[serverId]) state.consoleLogs[serverId] = []
    const logs = state.consoleLogs[serverId]
    logs.push({ text, type })
    if (logs.length > MAX_LINES) logs.splice(0, logs.length - MAX_LINES)
    if (state.currentServerId === serverId) appendLog(text, type)
    parsePlayersFromLog(serverId, text)
  })

  window.api.onServerStopped(({ serverId, code, error }) => {
    const msg = error ? T('log.serverStoppedError', { error }) : T('log.serverStopped', { code: code ?? 0 })
    if (state.currentServerId === serverId) { appendLog(msg, 'warn'); updateDetailBar(false); state.isRunning = false }
    // Solo se limpian los jugadores del servidor que se detuvo
    delete state.playersByServer[serverId]
    if (state.currentServerId === serverId) renderPlayers()
    refreshServersGrid()
  })

  window.api.onStatsUpdate(({ cpu, ramUsed, ramTotal, activeServers }) => {
    document.getElementById('tstat-cpu').textContent = `${cpu}%`
    document.getElementById('tstat-ram').textContent = `${ramUsed}/${ramTotal}MB`
    const badge = document.getElementById('tstat-active')
    badge.classList.toggle('hidden', activeServers.length === 0)
    if (activeServers.length > 0) document.getElementById('tstat-count').textContent = activeServers.length
  })

  window.api.onConfirmClose(({ count }) => {
    document.getElementById('modal-close').dataset.serverCount = count
    document.getElementById('modal-close-title').textContent = T('close.title')
    document.getElementById('modal-close-msg').textContent = T('close.msgWithCount', { count })
    document.getElementById('modal-close-level1').classList.remove('hidden')
    document.getElementById('modal-close-level2').classList.add('hidden')
    document.getElementById('modal-close').classList.remove('hidden')
  })

  window.api.onCrashLogged((crash) => {
    console.error('Crash logged:', crash)
  })
}

// ─── Server list ──────────────────────────────────────────────────────────────
async function refreshServersGrid() {
  const servers = await run(T('run.loadServers'), () => window.api.listServers(), [])
  const statusAll = await run(T('run.serversStatus'), () => window.api.getStatusAll(), {}) || {}
  state.servers = servers
  const grid = document.getElementById('servers-grid')
  const active = Object.keys(statusAll).length
  const externalCount = Object.values(statusAll).filter(s => s && s.external).length
  const banner = document.getElementById('servers-banner')
  banner.classList.toggle('hidden', externalCount === 0)
  banner.textContent = T('servers.externalNote', { count: externalCount })
  document.getElementById('servers-title').textContent = T('servers.title')
  document.getElementById('servers-sub').textContent = T('servers.sub', { count: state.servers.length, active })

  if (!state.servers.length) {
    fill(grid,
      h('div', { class: 'server-empty' },
        h('div', { class: 'big-icon', text: '🗂️' }),
        h('p', { text: T('servers.empty') }),
        h('p', { class: 'server-empty-sub', text: T('servers.emptyHint') })
      )
    )
    return
  }
  fill(grid, ...state.servers.map(s => {
    const st = statusAll[s.id]
    const running = !!st
    const external = !!(st && st.external)
    const statusAttrs = { class: `server-card-status${external ? ' is-external' : ''}` }
    if (external) statusAttrs.title = T('status.externalHint', { pid: st.pid || '?' })
    return h('div', { class: 'server-card', 'data-server-id': s.id, 'data-color': s.color || SERVER_COLORS[0] },
      h('div', { class: 'server-card-header' },
        h('div', { class: 'server-card-name', text: s.name }),
        h('div', statusAttrs,
          h('span', { class: `dot ${external ? 'external' : (running ? 'on' : 'off')}` }),
          h('span', { text: external ? T('status.external') : (running ? T('status.online') : T('status.stopped')) })
        )
      )
    )
  }))
  grid.querySelectorAll('.server-card').forEach(card => {
    card.style.setProperty('--card-color', safeColor(card.dataset.color))
  })
}

async function openServer(serverId) {
  state.currentServerId = serverId
  const server = state.servers.find(s => s.id === serverId) || await run(T('run.openServer'), () => window.api.getServer(serverId))
  if (!server) return
  state.currentServerDir = serverDirOf(server)
  state.currentServer = server

  document.getElementById('sbar-server-name').textContent = server.name
  document.getElementById('sbar-server-name').style.color = safeColor(server.color)

  const console_ = document.getElementById('console')
  console_.textContent = ''
  state.consoleLines = 0
    ; (state.consoleLogs[serverId] || []).slice(-MAX_LINES).forEach(l => appendLog(l.text, l.type))

  const status = await run(T('run.serverStatus'), () => window.api.getStatus(serverId), { running: false })
  const external = !!(status && status.external)
  state.isRunning = !!(status && status.running && !external)
  updateDetailBar(state.isRunning, false, external)
  if (external) appendLog(T('status.externalHint', { pid: (status && status.pid) || '?' }), 'warn')

  const settings = await run(T('run.settings'), () => window.api.getSettings(serverId), {})
  loadConfigTab(server, settings || {})
  loadPropertiesTab(server)
  loadListsTab(server)
  loadBackupsTab(server, settings || {})
  renderPlayers()

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelector('.nav-item[data-tab="console"]').classList.add('active')
  document.getElementById('tab-console').classList.add('active')

  showScreen('detail')
  initDetailNav()
  initConsole()
  initPlayers()
  initLists(server)
}

// ─── New server modal ─────────────────────────────────────────────────────────
function closeServerModal() {
  const modal = document.getElementById('modal-server')
  modal.classList.add('hidden')
  const opener = document.getElementById('btn-new-server')
  if (opener && typeof opener.focus === 'function') opener.focus()
}

function initModal() {
  document.getElementById('btn-new-server').onclick = openServerModal
  document.getElementById('ms-cancel').onclick = () => {
    if (state.dl.installing) {
      state.dl.cancelRequested = true
      window.api.cancelDownload(state.dl.token)
      return
    }
    closeServerModal()
  }
  document.getElementById('ms-pick-jar').onclick = async () => {
    const p = await run(T('run.pickJar'), () => window.api.openJarDialog())
    if (p) document.getElementById('ms-jar').value = p
  }
  document.getElementById('ms-save').onclick = () => {
    if (state.dl.source === 'download') saveNewServerDownload()
    else saveNewServer()
  }

  // Pestañas de origen del servidor
  document.querySelectorAll('#ms-source button').forEach(btn => {
    btn.onclick = () => setServerSource(btn.dataset.source)
  })
  document.getElementById('ms-provider').onchange = () => {
    state.dl.provider = document.getElementById('ms-provider').value
    ensureVersions()
  }
  document.getElementById('ms-version').onchange = () => {
    updateJavaWarn()
    updateInstallButton()
  }
  document.getElementById('ms-java').addEventListener('input', updateJavaWarn)
  document.getElementById('ms-name').addEventListener('input', updateInstallHint)
  document.getElementById('ms-pick-dir').onclick = async () => {
    const p = await run(T('run.pickDir'), () => window.api.openDirDialog())
    if (p) {
      document.getElementById('ms-install-root').value = p
      updateInstallHint()
    }
  }
  window.api.onDownloadProgress(p => {
    if (!state.dl.installing || !p || p.token !== state.dl.token) return
    const fill = document.getElementById('ms-progress-fill')
    const label = document.getElementById('ms-progress-label')
    if (p.phase === 'download') {
      if (p.total) {
        const pct = Math.min(100, Math.round((p.received / p.total) * 100))
        fill.style.width = pct + '%'
        label.textContent = T('modal.downloadProgress', { pct })
      } else {
        label.textContent = T('modal.downloading')
      }
    } else if (p.phase === 'verify') {
      label.textContent = T('modal.verifying')
    } else if (p.phase === 'install') {
      fill.style.width = '100%'
      label.textContent = T('modal.installing')
    } else if (p.phase === 'done') {
      fill.style.width = '100%'
      label.textContent = T('modal.done')
    }
  })

  document.getElementById('modal-cancel').onclick = () => {
    document.getElementById('modal-close').classList.add('hidden')
    document.getElementById('modal-close-level1').classList.remove('hidden')
    document.getElementById('modal-close-level2').classList.add('hidden')
  }
  document.getElementById('modal-confirm-proceed').onclick = () => {
    document.getElementById('modal-close-title').textContent = T('close.sure')
    document.getElementById('modal-close-msg').textContent = T('close.warnMsg')
    document.getElementById('modal-close-level1').classList.add('hidden')
    document.getElementById('modal-close-level2').classList.remove('hidden')
  }
  document.getElementById('modal-cancel-2').onclick = () => {
    const count = document.getElementById('modal-close').dataset.serverCount || 0
    document.getElementById('modal-close-title').textContent = T('close.title')
    document.getElementById('modal-close-msg').textContent = T('close.msgWithCount', { count })
    document.getElementById('modal-close-level1').classList.remove('hidden')
    document.getElementById('modal-close-level2').classList.add('hidden')
  }
  document.getElementById('modal-confirm').onclick = () => window.api.close()

  // Accesibilidad: Escape cierra el modal de servidor (salvo si está instalando)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const modal = document.getElementById('modal-server')
    if (modal && !modal.classList.contains('hidden') && !state.dl.installing) closeServerModal()
  })
}

function renderColorOptions(containerId, selectedColor) {
  const container = document.getElementById(containerId)
  const selected = selectedColor || SERVER_COLORS[0]
  fill(container, ...SERVER_COLORS.map(c => {
    const el = h('div', { class: `color-opt ${c === selected ? 'selected' : ''}`, 'data-color': c })
    el.style.background = c
    return el
  }))
}

function selectColor(el, containerId) {
  document.querySelectorAll(`#${containerId} .color-opt`).forEach(o => o.classList.remove('selected'))
  el.classList.add('selected')
}

async function openServerModal() {
  document.getElementById('modal-server-title').textContent = T('servers.add')
  document.getElementById('ms-name').value = ''
  document.getElementById('ms-jar').value = ''
  document.getElementById('ms-java').value = ''
  document.getElementById('ms-min-ram').value = 1024
  document.getElementById('ms-max-ram').value = 4096
  document.getElementById('ms-error').textContent = ''
  state.dl.token = null
  state.dl.cancelRequested = false
  state.dl.provider = document.getElementById('ms-provider').value
  state.dl.shownProvider = null
  renderColorOptions('ms-color-options', null)
  setServerSource('manual')
  document.getElementById('modal-server').classList.remove('hidden')
  const nameInput = document.getElementById('ms-name')
  if (nameInput && typeof nameInput.focus === 'function') nameInput.focus()
  // Valores por defecto de Ajustes → Servidores
  const pref = await run(T('run.settings'), () => Promise.all([
    window.api.getPref('defaultRam'),
    window.api.getPref('defaultJava'),
    window.api.getPref('defaultServerDir')
  ]), [null, null, null])
  const [ram, java, serverDir] = Array.isArray(pref) ? pref : [null, null, null]
  if (Number.isInteger(ram) && ram >= 512 && ram <= 65536) document.getElementById('ms-max-ram').value = ram
  document.getElementById('ms-java').value = java || ''
  const rootInput = document.getElementById('ms-install-root')
  if (!rootInput.value && !serverDir) {
    const d = await run(T('run.settings'), () => window.api.getDefaultServerDir(), null)
    if (d && d.ok && d.dir) rootInput.value = d.dir
  } else if (!rootInput.value && serverDir) {
    rootInput.value = serverDir
  }
}

// ─── Wizard de descarga ─────────────────────────────────────────────────────
function updateInstallButton() {
  const save = document.getElementById('ms-save')
  if (state.dl.source !== 'download') {
    save.disabled = state.dl.installing
    return
  }
  const hasVersion = !!document.getElementById('ms-version').value
  save.disabled = state.dl.installing || !hasVersion
}

function setServerSource(source) {
  state.dl.source = source
  document.querySelectorAll('#ms-source button').forEach(b => {
    const active = b.dataset.source === source
    b.classList.toggle('active', active)
    b.setAttribute('aria-selected', active ? 'true' : 'false')
  })
  document.getElementById('ms-manual-fields').classList.toggle('hidden', source === 'download')
  document.getElementById('ms-download-fields').classList.toggle('hidden', source !== 'download')
  document.getElementById('ms-error').textContent = ''
  const save = document.getElementById('ms-save')
  if (source === 'download') {
    save.textContent = T('modal.installAction')
    ensureVersions()
    updateInstallHint()
  } else {
    save.textContent = T('common.save')
  }
  updateInstallButton()
}

function renderVersionOptions(sel, versions) {
  fill(sel, ...versions.map(v => {
    const id = typeof v === 'string' ? v : v.id
    const suffix = v && v.forge ? ` (Forge ${v.forge})` : (v && v.release === false ? ' (pre)' : '')
    return h('option', { value: id }, `${id}${suffix}`)
  }))
  if (versions.length) sel.selectedIndex = 0
}

async function ensureVersions() {
  const sel = document.getElementById('ms-version')
  const provider = state.dl.provider
  if (state.dl.versions[provider] && state.dl.shownProvider === provider) return
  // Ya cargado antes: se reutiliza sin volver a pedirlo al main.
  if (state.dl.versions[provider]) {
    renderVersionOptions(sel, state.dl.versions[provider])
    state.dl.shownProvider = provider
    updateJavaWarn()
    updateInstallButton()
    return
  }
  sel.disabled = true
  fill(sel, h('option', { value: '' }, T('common.loading')))
  const res = await run(T('run.loadVersions'), () => window.api.listDownloadVersions(state.dl.provider), null)
  const versions = (res && res.ok && Array.isArray(res.versions)) ? res.versions : []
  if (res && !res.ok) document.getElementById('ms-error').textContent = res.error || T('servers.createError')
  state.dl.versions[provider] = versions
  state.dl.shownProvider = provider
  sel.disabled = false
  renderVersionOptions(sel, versions)
  updateJavaWarn()
  updateInstallButton()
}

function folderPreview() {
  const name = document.getElementById('ms-name').value.trim() || 'server'
  return name.replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').trim().slice(0, 60) || 'server'
}

function updateInstallHint() {
  const root = document.getElementById('ms-install-root').value.trim()
  const hint = document.getElementById('ms-install-hint')
  hint.textContent = root ? T('modal.installHint', { dir: root.replace(/[\\/]+$/, '') + '\\' + folderPreview() }) : ''
}

async function updateJavaWarn() {
  const version = document.getElementById('ms-version').value
  const warn = document.getElementById('ms-java-warn')
  if (!version) { warn.classList.add('hidden'); return }
  const need = await run(T('run.checkJava'), () => window.api.minJavaFor(version), { ok: false })
  if (!need || !need.ok || !need.major) { warn.classList.add('hidden'); return }
  const javaPath = document.getElementById('ms-java').value.trim() || 'java'
  const check = await run(T('run.checkJava'), () => window.api.javaCheck(javaPath), { ok: false })
  const have = check && check.ok ? check.major : null
  warn.classList.remove('hidden')
  if (have === null) warn.textContent = T('modal.javaUnknown', { need: need.major })
  else if (have < need.major) warn.textContent = T('modal.javaWarn', { need: need.major, have })
  else warn.textContent = T('modal.javaOk', { need: need.major, have })
}

function setInstallingUI(active) {
  state.dl.installing = active
  const progress = document.getElementById('ms-progress')
  const fill = document.getElementById('ms-progress-fill')
  const save = document.getElementById('ms-save')
  const cancel = document.getElementById('ms-cancel')
  const err = document.getElementById('ms-error')
  save.disabled = active
  cancel.disabled = false
  if (active) {
    fill.style.width = '0%'
    document.getElementById('ms-progress-label').textContent = ''
    progress.classList.remove('hidden')
    err.textContent = ''
  } else {
    progress.classList.add('hidden')
    cancel.textContent = T('common.cancel')
    if (state.dl.token) {
      window.api.cancelDownload(state.dl.token)
      state.dl.token = null
    }
  }
}

async function saveNewServerDownload() {
  const err = document.getElementById('ms-error')
  const name = document.getElementById('ms-name').value.trim()
  const root = document.getElementById('ms-install-root').value.trim()
  const version = document.getElementById('ms-version').value
  if (!name) { err.textContent = T('modal.nameRequired'); return }
  if (!version) { err.textContent = T('modal.selectVersion'); return }
  if (!root) { err.textContent = T('modal.selectInstallRoot'); return }
  const selectedColor = document.querySelector('#ms-color-options .color-opt.selected')
  const payload = {
    provider: state.dl.provider,
    version,
    name,
    installRoot: root,
    color: selectedColor ? selectedColor.dataset.color : SERVER_COLORS[0],
    minRam: parseInt(document.getElementById('ms-min-ram').value, 10) || 1024,
    maxRam: parseInt(document.getElementById('ms-max-ram').value, 10) || 4096,
    javaPath: document.getElementById('ms-java').value.trim() || null
  }
  setInstallingUI(true)
  state.dl.cancelRequested = false
  try {
    const res = await window.api.installServer(payload)
    if (state.dl.cancelRequested) return
    if (res && res.ok) {
      document.getElementById('modal-server').classList.add('hidden')
      refreshServersGrid()
    } else {
      err.textContent = (res && res.error) || T('servers.createError')
    }
  } catch (e) {
    if (!state.dl.cancelRequested) {
      console.error(`[${T('run.installServer')}]`, e)
      err.textContent = T('servers.createError')
    }
  } finally {
    setInstallingUI(false)
  }
}

async function saveNewServer() {
  const name = document.getElementById('ms-name').value.trim()
  const jarPath = document.getElementById('ms-jar').value.trim()
  const err = document.getElementById('ms-error')
  if (!name) { err.textContent = T('modal.nameRequired'); return }
  if (!jarPath) { err.textContent = T('modal.selectJar'); return }
  const selectedColor = document.querySelector('#ms-color-options .color-opt.selected')
  let res = null
  try {
    res = await window.api.createServer({
      name, jarPath,
      javaPath: document.getElementById('ms-java').value.trim() || null,
      minRam: parseInt(document.getElementById('ms-min-ram').value) || 1024,
      maxRam: parseInt(document.getElementById('ms-max-ram').value) || 4096,
      color: selectedColor ? selectedColor.dataset.color : SERVER_COLORS[0]
    })
  } catch (e) {
    console.error(`[${T('run.createServer')}]`, e)
  }
  if (!res) { err.textContent = T('servers.createError'); return }
  if (!res.ok) { err.textContent = res.error; return }
  document.getElementById('modal-server').classList.add('hidden')
  refreshServersGrid()
}

// ─── Detail nav & bar ─────────────────────────────────────────────────────────
function initDetailNav() {
  document.querySelectorAll('#detail-nav .nav-item').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#detail-nav .nav-item').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')
    }
  })
}

function updateDetailBar(running, starting = false, external = false) {
  state.detailBar = [running, starting, external]
  const dot = document.getElementById('sbar-dot-status')
  const text = document.getElementById('sbar-status-text')
  const start = document.getElementById('detail-btn-start')
  const stop = document.getElementById('detail-btn-stop')
  if (starting) { dot.className = 'dot starting'; text.textContent = T('status.starting'); start.disabled = true; stop.disabled = true }
  else if (external) { dot.className = 'dot external'; text.textContent = T('status.external'); start.disabled = true; stop.disabled = true }
  else if (running) { dot.className = 'dot on'; text.textContent = T('status.online'); start.disabled = true; stop.disabled = false }
  else { dot.className = 'dot off'; text.textContent = T('status.stopped'); start.disabled = false; stop.disabled = true }
}

document.getElementById('detail-btn-start').onclick = async () => {
  const id = state.currentServerId
  if (!id) return
  const server = await run(T('run.startServer'), () => window.api.getServer(id))
  if (!server) { appendLog(T('log.serverNotFound'), 'error'); return }
  updateDetailBar(false, true)
  appendLog(T('log.startingServer'), 'info')
  let res = null
  try {
    res = await window.api.startServer(id)
  } catch (e) {
    console.error(`[${T('run.startServer')}]`, e)
  }
  if (res && res.code === 'eula') {
    // #32: primer arranque requiere aceptar la EULA
    const ok = confirm(T('log.eulaConfirm'))
    if (ok) {
      appendLog(T('log.acceptingEula'), 'info')
      try { res = await window.api.startServer(id, true) } catch (e) { console.error(`[${T('run.startServer')}]`, e) }
    } else {
      appendLog(T('log.eulaCancelled'), 'warn')
      updateDetailBar(false)
      return
    }
  }
  if (res && res.ok) { state.isRunning = true; updateDetailBar(true); refreshServersGrid() }
  else { appendLog(T('log.error', { msg: res?.error || T('log.startFailed') }), 'error'); updateDetailBar(false) }
}

document.getElementById('detail-btn-stop').onclick = async () => {
  const id = state.currentServerId
  if (!id) return
  let res = null
  try {
    res = await window.api.stopServer(id)
  } catch (e) {
    console.error(`[${T('run.stopServer')}]`, e)
  }
  if (res && res.ok) {
    appendLog(T('log.stoppingServer'), 'warn')
  } else {
    appendLog(T('log.error', { msg: res?.error || T('log.stopFailed') }), 'error')
  }
}

// ─── Console ──────────────────────────────────────────────────────────────────
function initConsole() {
  const input = document.getElementById('cmd-input')
  const send = document.getElementById('cmd-send')
  const history = []; let histIdx = -1
  const doSend = async () => {
    const val = input.value.trim()
    if (!val || !state.currentServerId) return
    history.unshift(val); histIdx = -1; input.value = ''
    let res = null
    try {
      res = await window.api.sendCommand(state.currentServerId, val)
    } catch (e) {
      console.error(`[${T('run.sendCommand')}]`, e)
    }
    if (res && res.ok === false) {
      appendLog(T('log.error', { msg: res.error || T('log.sendFailed') }), 'error')
      return
    }
    if (res) appendLog(`> ${val}`, 'info')
  }
  send.onclick = doSend
  input.onkeydown = (e) => {
    if (e.key === 'Enter') { doSend(); return }
    if (e.key === 'ArrowUp') { histIdx = Math.min(histIdx + 1, history.length - 1); input.value = history[histIdx] || '' }
    if (e.key === 'ArrowDown') { histIdx = Math.max(histIdx - 1, -1); input.value = histIdx < 0 ? '' : history[histIdx] }
  }
}

function appendLog(text, type = 'info') {
  const c = document.getElementById('console')
  const div = document.createElement('div')
  div.className = `log-line ${type}`
  div.textContent = text
  c.appendChild(div)
  state.consoleLines++
  if (state.consoleLines > MAX_LINES) { c.removeChild(c.firstChild); state.consoleLines-- }
  c.scrollTop = c.scrollHeight
}

// ─── Players ──────────────────────────────────────────────────────────────────
function initPlayers() {
  document.getElementById('btn-refresh-players').onclick = async () => {
    if (!state.currentServerId) return
    let res = null
    try {
      res = await window.api.sendCommand(state.currentServerId, 'list')
    } catch (e) {
      console.error(`[${T('run.refreshPlayers')}]`, e)
    }
    if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
  }
}

function parsePlayersFromLog(serverId, line) {
  const join = line.match(/(\w+) joined the game/)
  const leave = line.match(/(\w+) left the game/)
  const list = line.match(/There are \d+ of a max of \d+ players online: (.+)/)
  if (!join && !leave && !list) return
  const players = playersOf(serverId)
  if (join) players.add(join[1])
  if (leave) players.delete(leave[1])
  if (list) {
    players.clear()
    list[1].split(',').map(n => n.trim()).filter(Boolean).forEach(n => players.add(n))
  }
  if (state.currentServerId === serverId) renderPlayers()
}

function renderPlayers() {
  const grid = document.getElementById('players-grid')
  if (!grid) return
  const players = state.playersByServer[state.currentServerId]
  if (!players || !players.size) {
    fill(grid, h('div', { class: 'empty-state', text: T('players.none') }))
    return
  }
  fill(grid, ...[...players].map(name => h('div', { class: 'player-card' },
    h('div', { class: 'player-avatar', text: '🧑' }),
    h('div', {},
      h('div', { class: 'player-name', text: name }),
      h('div', { class: 'player-status', text: T('status.online') })
    )
  )))
}

async function playerAction(action) {
  const target = document.getElementById('player-target').value.trim()
  if (!target || !state.currentServerId) return
  let res = null
  try {
    res = await window.api.sendCommand(state.currentServerId, `${action} ${target}`)
  } catch (e) {
    console.error(`[${T('run.playerAction')}]`, e)
  }
  if (res && res.ok === false) {
    appendLog(T('log.error', { msg: res.error }), 'error')
    return
  }
  if (res) appendLog(`> ${action} ${target}`, 'info')
}

// ─── Lists ────────────────────────────────────────────────────────────────────
function initLists(server) {
  const serverDir = serverDirOf(server)
  document.getElementById('wl-add').onclick = () => addToList('whitelist', serverDir)
  document.getElementById('wl-input').onkeydown = e => { if (e.key === 'Enter') addToList('whitelist', serverDir) }
  document.getElementById('bl-add').onclick = () => addToList('banlist', serverDir)
  document.getElementById('bl-input').onkeydown = e => { if (e.key === 'Enter') addToList('banlist', serverDir) }
  document.getElementById('whitelist-toggle').onchange = async (e) => {
    if (!state.currentServerId) return
    const cmd = e.target.checked ? 'whitelist on' : 'whitelist off'
    let res = null
    try {
      res = await window.api.sendCommand(state.currentServerId, cmd)
    } catch (err) {
      console.error('[whitelist]', err)
    }
    if (res && res.ok === false) {
      e.target.checked = !e.target.checked
      appendLog(T('log.error', { msg: res.error }), 'error')
    }
  }
  loadListsTab(server)
}

async function reloadLists() {
  const serverDir = state.currentServerDir
  if (!serverDir) return
  const wl = await run(T('run.readWhitelist'), () => window.api.readWhitelist(serverDir), { list: [] })
  const bl = await run(T('run.readBanlist'), () => window.api.readBanlist(serverDir), { list: [] })
  renderList('whitelist-ul', (wl && wl.list) || [], 'whitelist')
  renderList('banlist-ul', (bl && bl.list) || [], 'banlist', true)
}

async function loadListsTab(server) {
  const serverDir = serverDirOf(server)
  if (!serverDir) return
  state.currentServerDir = serverDir
  await reloadLists()
}

function renderList(id, list, type, showReason = false) {
  const ul = document.getElementById(id); if (!ul) return
  if (!list.length) { fill(ul, h('li', { class: 'list-empty', text: T('lists.empty') })); return }
  fill(ul, ...list.map((entry) => {
    const name = entry.name || entry
    const reason = entry.reason || ''
    return h('li', {},
      h('div', {},
        h('div', { class: 'list-name', text: name }),
        showReason && reason ? h('div', { class: 'list-sub', text: reason }) : null
      ),
      h('button', {
        class: 'btn-remove',
        'data-list-type': type,
        'data-name': String(name),
        'data-uuid': entry.uuid || '',
        text: '✕'
      })
    )
  }))
}

// Vía única de escritura (#8): si el servidor está en marcha manda el comando
// (vanilla resuelve UUID y persiste); si no, se escribe solo el archivo (el
// main completa el UUID offline). Nunca ambas a la vez.
async function listWrite(type, serverDir, list, cmd) {
  if (state.isRunning && state.currentServerId && cmd) {
    const res = await run(T('run.list'), () => window.api.sendCommand(state.currentServerId, cmd))
    if (res && res.ok === false) return res
    return { ok: true }
  }
  return type === 'whitelist'
    ? window.api.writeWhitelist(serverDir, list)
    : window.api.writeBanlist(serverDir, list)
}

async function addToList(type, serverDir) {
  const inputId = type === 'whitelist' ? 'wl-input' : 'bl-input'
  const val = document.getElementById(inputId).value.trim()
  if (!val || !serverDir) return
  try {
    if (type === 'whitelist') {
      const { list } = await window.api.readWhitelist(serverDir)
      if (list.find(e => (e.name || e) === val)) { document.getElementById(inputId).value = ''; return }
      list.push({ uuid: '', name: val })
      const res = await listWrite('whitelist', serverDir, list, `whitelist add ${val}`)
      if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
    } else {
      const reason = document.getElementById('bl-reason').value.trim() || 'Banned by admin'
      const { list } = await window.api.readBanlist(serverDir)
      if (list.find(e => (e.name || e) === val)) { document.getElementById(inputId).value = ''; return }
      list.push({ uuid: '', name: val, reason, created: new Date().toISOString(), source: 'Minecraft Manager', expires: 'forever' })
      const res = await listWrite('banlist', serverDir, list, `ban ${val} ${reason}`)
      if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
      document.getElementById('bl-reason').value = ''
    }
    document.getElementById(inputId).value = ''
  } catch (err) {
    console.error(`[${T('run.addToList')}]`, err)
    appendLog(T('log.error', { msg: err?.message || err }), 'error')
    return
  }
  const server = await run(T('run.reloadLists'), () => window.api.getServer(state.currentServerId))
  if (server) loadListsTab(server)
}

// Identidad por nombre/uuid, nunca por índice de render (#9)
async function removeFromList(type, name, uuid) {
  const serverDir = state.currentServerDir
  if (!serverDir || !name) return
  try {
    const read = type === 'whitelist' ? window.api.readWhitelist : window.api.readBanlist
    const { list } = await read(serverDir)
    let idx = -1
    if (uuid) idx = list.findIndex(e => e.uuid && e.uuid === uuid)
    if (idx === -1) idx = list.findIndex(e => (e.name || e) === name)
    if (idx === -1) { appendLog(T('lists.entryGone'), 'warn'); reloadLists(); return }
    list.splice(idx, 1)
    const cmd = type === 'whitelist' ? `whitelist remove ${name}` : `pardon ${name}`
    const res = await listWrite(type, serverDir, list, cmd)
    if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
  } catch (err) {
    console.error(`[${T('run.removeFromList')}]`, err)
    appendLog(T('log.error', { msg: err?.message || err }), 'error')
    return
  }
  const server = await run(T('run.reloadLists'), () => window.api.getServer(state.currentServerId))
  if (server) loadListsTab(server)
}

// ─── Properties ───────────────────────────────────────────────────────────────
async function loadPropertiesTab(server) {
  const serverDir = serverDirOf(server)
  if (!serverDir) return
  const res = await run(T('run.readProperties'), () => window.api.readProperties(serverDir))
  if (!res || !res.ok) return
  const allKeys = [...new Set([...IMPORTANT_PROPS, ...Object.keys(res.props)])]
  fill(document.getElementById('props-grid'), ...allKeys.map(key => {
    const val = res.props[key] ?? ''
    const isBool = val === 'true' || val === 'false'
    const input = isBool
      ? h('select', { 'data-key': key },
          h('option', { value: 'true', text: 'true' }),
          h('option', { value: 'false', text: 'false' })
        )
      : h('input', { type: 'text', 'data-key': key, value: val })
    if (isBool) input.value = val === 'false' ? 'false' : 'true'
    return h('div', { class: 'prop-item' }, h('label', { text: key }), input)
  }))
  document.getElementById('btn-save-props').onclick = async () => {
    const props = {}
    document.querySelectorAll('#props-grid [data-key]').forEach(el => { props[el.dataset.key] = el.value })
    let out = null
    try {
      out = await window.api.writeProperties(serverDir, props)
    } catch (err) {
      console.error(`[${T('run.saveProperties')}]`, err)
    }
    if (out && out.ok) appendLog(T('properties.saved'), 'success')
    else appendLog(T('log.error', { msg: out?.error || T('properties.saveFailed') }), 'error')
  }
}

// ─── Backups ──────────────────────────────────────────────────────────────────
async function loadBackupsTab(server, settings) {
  const serverDir = serverDirOf(server)
  if (settings.autoBackupInterval) document.getElementById('auto-backup-interval').value = settings.autoBackupInterval
  document.getElementById('auto-backup-enabled').checked = !!settings.autoBackupEnabled

  // Carpeta resuelta por main: preferencia global (Ajustes) o <servidor>/backups
  const dir = await run(T('run.settings'), () => window.api.getBackupDir(state.currentServerId), '') || (serverDir ? serverDir + '/backups' : '')

  const refreshList = async () => {
    if (!dir) return
    const res = await run(T('run.listBackups'), () => window.api.listBackups(dir), { backups: [] })
    const backups = (res && res.backups) || []
    const list = document.getElementById('backups-list')
    if (!res || res.ok === false) {
      fill(list, h('div', { class: 'empty-state', text: res?.error || T('backups.listFailed') }))
      return
    }
    if (!backups.length) { fill(list, h('div', { class: 'empty-state', text: T('backups.empty') })); return }
    fill(list, ...backups.map(b => h('div', { class: 'backup-item' },
      h('div', { class: 'backup-info' },
        h('div', { class: 'bname', text: b.name }),
        h('div', {
          class: 'bmeta',
          text: `${new Date(b.date).toLocaleString(I18N.locale())} · ${(b.size / 1024 / 1024).toFixed(1)} MB`
        })
      ),
      h('div', { class: 'backup-actions' },
        h('button', { class: 'btn-icon', 'data-path': b.path, title: T('backups.openFolder'), text: '📁' }),
        h('button', { class: 'btn-icon danger', 'data-path': b.path, title: T('backups.deleteBackup'), text: '🗑' })
      )
    )))
  }

  document.getElementById('btn-backup-now').onclick = async () => {
    if (!serverDir || !dir) return
    appendLog(T('backups.creating'), 'info')
    let res = null
    try {
      res = await window.api.createBackup(serverDir, dir, state.currentServerId)
    } catch (err) {
      console.error(`[${T('run.createBackup')}]`, err)
    }
    if (res && res.ok) { appendLog(T('backups.done'), 'success'); refreshList() }
    else appendLog(T('log.error', { msg: res?.error || T('backups.createFailed') }), 'error')
  }
  document.getElementById('btn-save-auto').onclick = async () => {
    const data = { autoBackupEnabled: document.getElementById('auto-backup-enabled').checked, autoBackupInterval: document.getElementById('auto-backup-interval').value }
    const res = await run(T('run.saveBackupSettings'), () => window.api.saveSettings(state.currentServerId, { ...settings, ...data }))
    if (res && res.ok) appendLog(T('backups.settingsSaved'), 'success')
    else appendLog(T('log.error', { msg: res?.error || T('common.saveSettingsFailed') }), 'error')
  }
  refreshList()
}

async function openBackupPath(filePath) {
  const res = await run(T('run.openBackup'), () => window.api.openPath(filePath))
  if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
}

async function deleteBackup(filePath) {
  const res = await run(T('run.deleteBackup'), () => window.api.deleteBackup(filePath))
  if (res && res.ok === false) { appendLog(T('log.error', { msg: res.error }), 'error'); return }
  const server = await run(T('run.reloadBackups'), () => window.api.getServer(state.currentServerId))
  if (server) {
    const settings = await run(T('run.settings'), () => window.api.getSettings(state.currentServerId), {})
    loadBackupsTab(server, settings || {})
  }
}

// ─── Config tab ───────────────────────────────────────────────────────────────
function loadConfigTab(server, settings) {
  document.getElementById('cfg-name').value = server.name || ''
  document.getElementById('cfg-jar').value = server.jarPath || ''
  document.getElementById('cfg-java').value = server.javaPath || ''
  document.getElementById('cfg-min-ram').value = server.minRam || 1024
  document.getElementById('cfg-max-ram').value = server.maxRam || 4096
  document.getElementById('cfg-extra').value = server.extraArgs || ''
  renderColorOptions('color-options', server.color)
  document.getElementById('btn-pick-jar').onclick = async () => {
    const p = await run(T('run.pickJar'), () => window.api.openJarDialog())
    if (p) document.getElementById('cfg-jar').value = p
  }
  document.getElementById('btn-save-cfg').onclick = async () => {
    const selectedColor = document.querySelector('#color-options .color-opt.selected')
    const data = { name: document.getElementById('cfg-name').value.trim() || server.name, jarPath: document.getElementById('cfg-jar').value.trim(), javaPath: document.getElementById('cfg-java').value.trim() || null, minRam: parseInt(document.getElementById('cfg-min-ram').value) || 1024, maxRam: parseInt(document.getElementById('cfg-max-ram').value) || 4096, extraArgs: document.getElementById('cfg-extra').value.trim(), color: selectedColor ? selectedColor.dataset.color : server.color }
    let res = null
    try {
      res = await window.api.updateServer({ serverId: server.id, data })
    } catch (err) {
      console.error(`[${T('run.saveConfig')}]`, err)
    }
    if (res && res.ok) {
      document.getElementById('sbar-server-name').textContent = data.name
      document.getElementById('sbar-server-name').style.color = safeColor(data.color)
      appendLog(T('config.saved'), 'success')
      loadPropertiesTab(res.server)
    } else {
      appendLog(T('log.error', { msg: res?.error || T('common.saveSettingsFailed') }), 'error')
    }
  }
  document.getElementById('btn-delete-server').onclick = async () => {
    const status = await run(T('run.serverStatus'), () => window.api.getStatus(server.id), { running: false })
    if (status && status.running) { appendLog(T('config.stopBeforeDelete'), 'warn'); return }
    if (confirm(T('config.deleteConfirm', { name: server.name }))) {
      const res = await run(T('run.deleteServer'), () => window.api.deleteServer(server.id))
      if (res && res.ok === false) { appendLog(T('log.error', { msg: res.error }), 'error'); return }
      showScreen('servers')
    }
  }
}

// ─── Actualizaciones (registro tardío, fuera del banner) ─────────────────────
window.api.onUpdateAvailable(() => {
  if (state.currentServerId) appendLog(T('update.availableLog'), 'info')
})

window.api.onUpdateDownloaded(() => {
  if (state.currentServerId) appendLog(T('update.downloadedLog'), 'success')
})

// ─── Idioma (ES/EN): repinta lo dinámico al cambiar ──────────────────────────
I18N.onLangChange(() => {
  updateMaxTitle()
  updateDetailBar(state.detailBar[0], state.detailBar[1], state.detailBar[2])
  if (document.getElementById('screen-servers').classList.contains('active')) refreshServersGrid()
  renderUpdateState()
  if (document.getElementById('screen-settings').classList.contains('active')) loadSettings()
  if (state.currentServerId) {
    renderPlayers()
    if (state.currentServer) loadListsTab(state.currentServer)
  }
  const count = document.getElementById('modal-close').dataset.serverCount || 0
  document.getElementById('modal-close-title').textContent = T('close.title')
  document.getElementById('modal-close-msg').textContent = T('close.msgWithCount', { count })
})
