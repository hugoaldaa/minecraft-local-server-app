const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const archiver = require('archiver')
const schedule = require('node-schedule')
const { getAllServersMap, getServerSettings, getGlobalBackupDir, settingsStore } = require('./stores')
const { activeServers, sendToRenderer, writeStdin } = require('./state')
const { trackEvent } = require('./analytics')
const { logCrash } = require('./crash')
const { isStr, isServerDir, isAllowedBackupDir, isAllowedBackupFile } = require('./validate')

const AUTO_INTERVALS = { '1h': 3600e3, '6h': 6 * 3600e3, '12h': 12 * 3600e3, '24h': 24 * 3600e3 }
const autoBackupJobs = {}

// ─── Backup manual ───────────────────────────────────────────────────────────
// Nivel de compresión guardado en Ajustes → Copias de seguridad (1–9)
function compressionLevel() {
  const level = Number(settingsStore.get('backupLevel'))
  return Number.isInteger(level) && level >= 1 && level <= 9 ? level : 6
}

// «Conservar solo las últimas copias»: borra las más antiguas de la carpeta
// dejando backupKeep. Solo toca los .zip generados por la app (patrón propio).
function pruneOldBackups(outDir) {
  const keep = Number(settingsStore.get('backupKeep'))
  if (!Number.isFinite(keep) || keep <= 0) return
  try {
    const files = fs.readdirSync(outDir)
      .filter(f => /^backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.test(f))
      .sort().reverse() // el nombre lleva la fecha: orden lexicográfico = cronológico
    files.slice(keep).forEach(f => {
      try { fs.unlinkSync(path.join(outDir, f)) } catch (_) { /* sin permisos: se queda */ }
    })
  } catch (_) { /* si falla el listado, no se borra nada */ }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Con el servidor en marcha, el mundo puede cambiar mientras se comprime el
// zip. Se desactiva la escritura a disco (save-off), se fuerza el volcado
// (save-all flush) y se reanuda (save-on) al terminar, para un backup
// consistente sin detener el servidor.
function quiesce(serverId) {
  const s = activeServers[serverId]
  if (!s) return false
  writeStdin(s.process, 'save-off\n')
  writeStdin(s.process, 'save-all flush\n')
  return true
}

function resume(serverId) {
  const s = activeServers[serverId]
  if (s) writeStdin(s.process, 'save-on\n')
}

async function createBackup(serverDir, backupDir, serverId) {
  if (!isServerDir(serverDir)) return { ok: false, error: 'Directorio de servidor no válido' }
  if (!isAllowedBackupDir(backupDir)) return { ok: false, error: 'Carpeta de backups no permitida' }
  const srcDir = path.resolve(serverDir)
  const outDir = path.resolve(backupDir)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outFile = path.join(outDir, `backup-${timestamp}.zip`)
  try {
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  } catch (err) {
    logCrash('backup_mkdir_error', err)
    return { ok: false, error: err.message }
  }
  const live = isStr(serverId) && !!activeServers[serverId]
  if (live) {
    quiesce(serverId)
    await sleep(2000) // margen para que el mundo se vuelque a disco
  }
  return new Promise((resolve) => {
    const output = fs.createWriteStream(outFile)
    const archive = archiver('zip', { zlib: { level: compressionLevel() } })
    const finish = (result) => { if (live) resume(serverId); resolve(result) }
    output.on('close', () => {
      pruneOldBackups(outDir)
      trackEvent('backup_created', { sizeMb: Math.round(archive.pointer() / 1024 / 1024) })
      finish({ ok: true, file: outFile, size: archive.pointer() })
    })
    output.on('error', (err) => { logCrash('backup_write_error', err); finish({ ok: false, error: err.message }) })
    archive.on('error', (err) => { logCrash('backup_error', err); finish({ ok: false, error: err.message }) })
    archive.pipe(output)
    ;['world', 'world_nether', 'world_the_end'].forEach(dir => {
      const full = path.join(srcDir, dir)
      if (fs.existsSync(full)) archive.directory(full, dir)
    })
    archive.finalize()
  })
}

function listBackups(backupDir) {
  if (!isAllowedBackupDir(backupDir)) return { ok: false, error: 'Carpeta de backups no permitida', backups: [] }
  try {
    const dir = path.resolve(backupDir)
    if (!fs.existsSync(dir)) return { ok: true, backups: [] }
    const backups = fs.readdirSync(dir).filter(f => f.endsWith('.zip')).map(f => {
      const full = path.join(dir, f)
      const stats = fs.statSync(full)
      return { name: f, path: full, size: stats.size, date: stats.mtime }
    }).sort((a, b) => new Date(b.date) - new Date(a.date))
    return { ok: true, backups }
  } catch (err) {
    logCrash('backup_list_error', err)
    return { ok: false, error: err.message, backups: [] }
  }
}

function deleteBackupFile(filePath) {
  if (!isAllowedBackupFile(filePath)) return { ok: false, error: 'Ruta no permitida' }
  try {
    fs.unlinkSync(path.resolve(filePath))
    return { ok: true }
  } catch (err) {
    logCrash('backup_delete_error', err)
    return { ok: false, error: err.message }
  }
}

// ─── Backup automático (node-schedule) ───────────────────────────────────────
function intervalToMs(interval) { return AUTO_INTERVALS[interval] || AUTO_INTERVALS['6h'] }

// Carpeta de destino resuelta: preferencia por servidor (legado) → ajuste
// global → <carpeta del servidor>/backups
function resolveBackupDir(serverId) {
  const settings = getServerSettings(serverId)
  if (isStr(settings.autoBackupDir) && settings.autoBackupDir) return settings.autoBackupDir
  const global = getGlobalBackupDir()
  if (global) return global
  const server = getAllServersMap()[serverId]
  if (server && isStr(server.jarPath)) return path.join(path.dirname(path.resolve(server.jarPath)), 'backups')
  return ''
}

function cancelAutoBackup(serverId) {
  const job = autoBackupJobs[serverId]
  if (job) { job.cancel(); delete autoBackupJobs[serverId] }
}

function scheduleAutoBackup(serverId) {
  cancelAutoBackup(serverId)
  if (!isStr(serverId)) return
  const server = getAllServersMap()[serverId]
  if (!server || !isStr(server.jarPath)) return
  const settings = getServerSettings(serverId)
  if (!settings.autoBackupEnabled) return

  const ms = intervalToMs(settings.autoBackupInterval)
  const serverDir = path.dirname(path.resolve(server.jarPath))
  const backupDir = resolveBackupDir(serverId)

  const run = async () => {
    try {
      const res = await createBackup(serverDir, backupDir, serverId)
      sendToRenderer('console-line', {
        serverId,
        text: res.ok ? `Backup automático creado: ${path.basename(res.file)}` : `Error en backup automático: ${res.error}`,
        type: res.ok ? 'success' : 'error'
      })
    } catch (err) {
      logCrash('auto_backup_error', err)
    }
    scheduleNext()
  }
  const scheduleNext = () => {
    autoBackupJobs[serverId] = schedule.scheduleJob(new Date(Date.now() + ms), run)
  }
  scheduleNext()
}

function initAutoBackups() {
  Object.keys(getAllServersMap()).forEach(id => scheduleAutoBackup(id))
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
function registerBackupsIpc() {
  ipcMain.handle('backup:create', (_, { serverDir, backupDir, serverId } = {}) => createBackup(serverDir, backupDir, serverId))
  ipcMain.handle('backup:list', (_, backupDir) => listBackups(backupDir))
  ipcMain.handle('backup:delete', (_, filePath) => deleteBackupFile(filePath))
  ipcMain.handle('backup:dir', (_, serverId) => resolveBackupDir(serverId))
}

module.exports = { registerBackupsIpc, createBackup, scheduleAutoBackup, cancelAutoBackup, initAutoBackups, resolveBackupDir }
