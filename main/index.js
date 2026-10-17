const { app, ipcMain } = require('electron')
const { settingsStore, getAllServersMap } = require('./stores')
const { getMainWindow } = require('./state')
const { trackEvent, registerAnalyticsIpc } = require('./analytics')
const { setupCrashReporter, registerCrashIpc } = require('./crash')
const { createWindow, registerWindowIpc, applyWindowTheme } = require('./window')
const { syncTray, updateTrayLang } = require('./tray')
const { registerServersIpc, stopAllServers } = require('./servers')
const { registerPropertiesIpc } = require('./properties')
const { registerBackupsIpc, scheduleAutoBackup, initAutoBackups } = require('./backups')
const { setupAutoUpdater, stopUpdater, registerUpdaterIpc } = require('./updater')
const { registerDownloadsIpc } = require('./downloader')
const { startStatsPolling, stopStatsPolling } = require('./stats')
const { startLogPolling, stopLogPolling } = require('./logs')
const { registerEstadisticasIpc } = require('./estadisticas')
const { isPlainObject, isStr, cleanText } = require('./validate')

// ─── Registro de IPC ────────────────────────────────────────────────────────
registerServersIpc()
registerPropertiesIpc()
registerBackupsIpc()
registerAnalyticsIpc()
registerCrashIpc()
registerWindowIpc()
registerUpdaterIpc()
registerDownloadsIpc()
registerEstadisticasIpc()

ipcMain.handle('app:version', () => app.getVersion())

// ─── Preferencias globales (Ajustes) ────────────────────────────────────────
const PREF_KEYS = ['backupDir', 'backupKeep', 'backupLevel', 'theme', 'lang', 'defaultServerDir', 'closeToTray', 'startOnBoot', 'uiScale',
  'defaultRam', 'defaultJava', 'defaultJvmArgs', 'autoEula', 'retentionSamples', 'retentionEvents']

ipcMain.handle('prefs:get', (_, key) => (PREF_KEYS.includes(key) ? settingsStore.get(key, null) : null))
ipcMain.handle('prefs:set', (_, { key, value } = {}) => {
  if (!PREF_KEYS.includes(key)) return { ok: false, error: 'Preferencia no permitida' }
  if (key === 'theme') {
    if (value !== 'dark' && value !== 'light') return { ok: false, error: 'Tema no válido' }
    settingsStore.set('theme', value)
    applyWindowTheme()
    return { ok: true }
  }
  if (key === 'lang') {
    if (value !== 'es' && value !== 'en') return { ok: false, error: 'Idioma no válido' }
    settingsStore.set('lang', value)
    updateTrayLang() // el menú de bandeja se traduce con el idioma guardado
    return { ok: true }
  }
  if (key === 'closeToTray' || key === 'startOnBoot') {
    if (typeof value !== 'boolean') return { ok: false, error: 'Valor no válido' }
    settingsStore.set(key, value)
    if (key === 'closeToTray') syncTray() // crea o elimina el icono de bandeja
    else if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: value, path: process.execPath })
    // En desarrollo el ejecutable es electron.exe: no se registra nada
    return { ok: true, ...(key === 'startOnBoot' ? { applied: app.isPackaged } : {}) }
  }
  if (key === 'backupKeep') {
    // 0 = sin límite
    if (![0, 5, 10, 20, 50].includes(value)) return { ok: false, error: 'Valor no válido' }
    settingsStore.set('backupKeep', value)
    return { ok: true }
  }
  if (key === 'backupLevel') {
    if (!Number.isInteger(value) || value < 1 || value > 9) return { ok: false, error: 'Nivel no válido' }
    settingsStore.set('backupLevel', value)
    return { ok: true }
  }
  if (key === 'defaultRam') {
    const n = Number.parseInt(value, 10)
    if (!Number.isFinite(n) || n < 512 || n > 65536) return { ok: false, error: 'RAM no válida' }
    settingsStore.set('defaultRam', n)
    return { ok: true }
  }
  if (key === 'defaultJava') {
    if (value !== null && !isStr(value)) return { ok: false, error: 'Ruta no válida' }
    settingsStore.set('defaultJava', value || '')
    return { ok: true }
  }
  if (key === 'defaultJvmArgs') {
    if (value !== null && !isStr(value)) return { ok: false, error: 'Argumentos no válidos' }
    settingsStore.set('defaultJvmArgs', cleanText(value || '', 512))
    return { ok: true }
  }
  if (key === 'autoEula') {
    if (typeof value !== 'boolean') return { ok: false, error: 'Valor no válido' }
    settingsStore.set('autoEula', value)
    return { ok: true }
  }
  if (key === 'retentionSamples' || key === 'retentionEvents') {
    // Días con retención: cuánto tiempo se conservan muestras/eventos.
    const maxDays = key === 'retentionSamples' ? 365 : 3650
    const n = Number.parseInt(value, 10)
    if (!Number.isInteger(n) || n < 1 || n > maxDays) return { ok: false, error: 'Periodo no válido' }
    settingsStore.set(key, n)
    return { ok: true }
  }
  if (key === 'uiScale') {
    if (![1, 1.25, 1.5].includes(value)) return { ok: false, error: 'Escala no válida' }
    settingsStore.set('uiScale', value)
    getMainWindow()?.webContents.setZoomFactor(value)
    return { ok: true }
  }
  if (key === 'defaultServerDir') {
    // backupDir y defaultServerDir solo admiten texto (o vacío)
    if (value !== null && !isStr(value)) return { ok: false, error: 'Ruta no válida' }
    settingsStore.set('defaultServerDir', value || '')
    return { ok: true }
  }
  // backupDir
  if (value !== null && !isStr(value)) return { ok: false, error: 'Ruta no válida' }
  settingsStore.set('backupDir', value || '')
  // La carpeta cambia para todos: se reprograman todos los backups automáticos
  Object.keys(getAllServersMap()).forEach(id => scheduleAutoBackup(id))
  return { ok: true }
})

ipcMain.handle('settings:get', (_, serverId) => {
  if (!isStr(serverId)) return {}
  return settingsStore.get(`server_${serverId}`) || {}
})
ipcMain.handle('settings:set', (_, { serverId, data } = {}) => {
  if (!isStr(serverId) || !isPlainObject(data)) return { ok: false, error: 'Datos inválidos' }
  try {
    // Límite de seguridad: los settings por servidor son objetos pequeños
    if (JSON.stringify(data).length > 100 * 1024) return { ok: false, error: 'Datos demasiado grandes' }
    settingsStore.set(`server_${serverId}`, data)
    scheduleAutoBackup(serverId) // reprograma el backup automático si cambió
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// ─── Migración: carpeta de backups por servidor → global (Ajustes) ──────────
// La primera carpeta personalizada encontrada pasa a ser la global y las
// claves por servidor se retiran, así todos los servidores usan la misma.
function migrateGlobalBackupDir() {
  if (settingsStore.get('backupDir')) return
  let adopted = ''
  Object.keys(getAllServersMap()).forEach(id => {
    const cfg = settingsStore.get(`server_${id}`)
    if (!isPlainObject(cfg) || !('autoBackupDir' in cfg)) return
    if (!adopted && isStr(cfg.autoBackupDir)) adopted = cfg.autoBackupDir
    delete cfg.autoBackupDir
    settingsStore.set(`server_${id}`, cfg)
  })
  if (adopted) settingsStore.set('backupDir', adopted)
}

// ─── App lifecycle ──────────────────────────────────────────────────────────
setupCrashReporter()

app.whenReady().then(() => {
  migrateGlobalBackupDir()
  createWindow()
  syncTray()
  startStatsPolling()
  startLogPolling()
  setupAutoUpdater()
  initAutoBackups()
  trackEvent('app_launch', { version: app.getVersion() })
})

app.on('window-all-closed', () => { app.quit() })

app.on('will-quit', () => {
  stopUpdater()
  stopStatsPolling()
  stopLogPolling()
  stopAllServers()
})
