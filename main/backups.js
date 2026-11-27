const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const archiver = require('archiver')
const AdmZip = require('adm-zip')
const { getAllServersMap, getServerSettings, getGlobalBackupDir, settingsStore } = require('./stores')
const { activeServers, writeStdin } = require('./state')
const { trackEvent } = require('./analytics')
const { logCrash } = require('./crash')
const { notify } = require('./notifications')
const { isStr, isServerDir, isAllowedBackupDir, isAllowedBackupFile, isInsideDir } = require('./validate')

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
      const server = isStr(serverId) ? getAllServersMap()[serverId] : null
      notify('backup_done', { name: server ? server.name : path.basename(srcDir) })
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

// ─── Restaurar backup ────────────────────────────────────────────────────────
// Requiere el servidor parado, hace una copia de seguridad de la carpeta
// actual antes de sobrescribirla, y verifica cada entrada del zip contra
// *zip-slip* (rutas que escapen del directorio de destino).
async function restoreBackup(backupFile, serverDir, serverId) {
  if (isStr(serverId) && activeServers[serverId]) {
    return { ok: false, error: 'Detén el servidor antes de restaurar el backup' }
  }
  if (!isAllowedBackupFile(backupFile)) return { ok: false, error: 'Ruta de backup no permitida' }
  if (!isServerDir(serverDir)) return { ok: false, error: 'Directorio de servidor no válido' }

  const zipPath = path.resolve(backupFile)
  const destDir = path.resolve(serverDir)

  if (!fs.existsSync(zipPath)) return { ok: false, error: 'El archivo de backup no existe' }

  // Copia de seguridad de la carpeta actual antes de restaurar (por si algo falla).
  const safetyDir = path.join(path.dirname(destDir), `.restore-safety-${Date.now()}`)
  try {
    fs.cpSync(destDir, safetyDir, { recursive: true })
  } catch (err) {
    logCrash('backup_restore_safety_error', err)
    return { ok: false, error: 'No se pudo crear la copia de seguridad previa: ' + err.message }
  }

  try {
    const zip = new AdmZip(zipPath)
    const entries = zip.getEntries()
    for (const entry of entries) {
      if (entry.isDirectory) continue
      const entryPath = path.resolve(destDir, entry.entryName)
      if (!isInsideDir(entryPath, destDir)) {
        throw new Error('El backup contiene rutas inseguras (zip-slip) y no se ha extraído')
      }
    }

    zip.extractAllTo(destDir, true)

    // Éxito: descarta la copia de seguridad previa.
    fs.rmSync(safetyDir, { recursive: true, force: true })
    trackEvent('backup_restored', { file: path.basename(zipPath) })
    return { ok: true }
  } catch (err) {
    // Fallo: intentar restaurar la carpeta desde la copia de seguridad previa.
    try {
      fs.rmSync(destDir, { recursive: true, force: true })
      fs.cpSync(safetyDir, destDir, { recursive: true })
    } catch (_) { /* mejor esfuerzo */ }
    try { fs.rmSync(safetyDir, { recursive: true, force: true }) } catch (_) { }
    logCrash('backup_restore_error', err)
    return { ok: false, error: err.message || 'No se pudo restaurar el backup' }
  }
}

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

// ─── IPC ─────────────────────────────────────────────────────────────────────
function registerBackupsIpc() {
  ipcMain.handle('backup:create', (_, { serverDir, backupDir, serverId } = {}) => createBackup(serverDir, backupDir, serverId))
  ipcMain.handle('backup:list', (_, backupDir) => listBackups(backupDir))
  ipcMain.handle('backup:delete', (_, filePath) => deleteBackupFile(filePath))
  ipcMain.handle('backup:dir', (_, serverId) => resolveBackupDir(serverId))
  ipcMain.handle('backup:restore', (_, { backupFile, serverDir, serverId } = {}) => restoreBackup(backupFile, serverDir, serverId))
}

module.exports = { registerBackupsIpc, createBackup, restoreBackup, resolveBackupDir }
