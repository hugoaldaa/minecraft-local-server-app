// Programador unificado de mantenimiento (Fase 2.4): backup automático +
// reinicio programado en un solo trabajo por servidor.
// Cuando ambos están programados a la misma hora, se para el servidor, se
// hace el backup con el servidor apagado y se vuelve a encender.
// Avisos por chat de Minecraft: minutos configurables antes del mantenimiento.
'use strict'

const { ipcMain } = require('electron')
const path = require('path')
const schedule = require('node-schedule')
const { getAllServersMap, settingsStore } = require('./stores')
const { activeServers, sendToRenderer, serverMapEvents, writeStdin } = require('./state')
const { stopServer, startServer } = require('./servers')
const { createBackup, resolveBackupDir } = require('./backups')
const { insertNotificacion } = require('./db')
const { isStr } = require('./validate')
const { notify } = require('./notifications')
const { logCrash } = require('./crash')

const MS = { '1h': 3600e3, '6h': 6 * 3600e3, '12h': 12 * 3600e3 }
const RESTART_MS = { '6h': 6 * 3600e3, '12h': 12 * 3600e3, '24h': 24 * 3600e3 }
const DAY_MS = 24 * 3600e3
const STOP_DEADLINE_MS = 12000
const DUE_TOLERANCE_MS = 60000
const DEFAULT_WARN_MINUTES = [5, 1]
const MAX_WARNINGS = 6
const MIN_WARN_MINUTES = 1
const MAX_WARN_MINUTES = 120

const jobs = {}
const warnJobs = {} // listas de trabajos de avisos por chat
const pending = {} // evita solapar un mantenimiento con otro

// Minutos de aviso configurados por servidor. Se normaliza porque el valor
// viene de un JSON editable por el usuario (y de exportaciones antiguas).
function warningMinutes(settings) {
  const raw = settings && settings.maintenanceWarnMinutes
  if (!Array.isArray(raw)) return [...DEFAULT_WARN_MINUTES]
  const minutes = [...new Set(raw.map(Number))]
    .filter(n => Number.isInteger(n) && n >= MIN_WARN_MINUTES && n <= MAX_WARN_MINUTES)
    .sort((a, b) => a - b)
    .slice(0, MAX_WARNINGS)
    .reverse() // se programan de mayor a menor minutos de antelación
  return minutes.length ? minutes : [...DEFAULT_WARN_MINUTES]
}

function minuteWord(n) {
  return n === 1 ? 'minuto' : 'minutos'
}

function cancelWarnings(serverId) {
  const list = warnJobs[serverId]
  if (!Array.isArray(list)) return
  list.forEach(job => { try { job.cancel() } catch (_) {} })
  delete warnJobs[serverId]
}

function cancelServerMaintenance(serverId) {
  const job = jobs[serverId]
  if (job) { job.cancel(); delete jobs[serverId] }
  cancelWarnings(serverId)
}

function cancelAllServerMaintenance() {
  Object.keys(jobs).forEach(id => { jobs[id].cancel(); delete jobs[id] })
  Object.keys(warnJobs).forEach(id => cancelWarnings(id))
  Object.keys(pending).forEach(id => { delete pending[id] })
}

function nextDailyAt(hhmm) {
  const now = new Date()
  const [h, m] = hhmm.split(':').map(Number)
  const run = new Date(now)
  run.setHours(h, m, 0, 0)
  if (run.getTime() <= now.getTime()) run.setDate(run.getDate() + 1)
  return run.getTime()
}

// Próximo vencimiento del backup automático (null si no está habilitado).
function nextBackupDue(settings) {
  if (!settings.autoBackupEnabled) return null
  const interval = settings.autoBackupInterval || '6h'
  if (interval === '24h') {
    return settings.autoBackupTime ? nextDailyAt(settings.autoBackupTime) : Date.now() + DAY_MS
  }
  return Date.now() + (MS[interval] || MS['6h'])
}

// Próximo vencimiento del reinicio programado (null si no está habilitado).
function nextRestartDue(settings) {
  if (!settings.autoRestartEnabled) return null
  const interval = settings.autoRestartInterval || '24h'
  if (interval === '24h') {
    return settings.autoRestartTime ? nextDailyAt(settings.autoRestartTime) : Date.now() + DAY_MS
  }
  return Date.now() + (RESTART_MS[interval] || RESTART_MS['24h'])
}

function nextMaintenanceAt(serverId) {
  const settings = settingsStore.get(`server_${serverId}`) || {}
  const b = nextBackupDue(settings)
  const r = nextRestartDue(settings)
  if (b === null && r === null) return null
  if (b === null) return r
  if (r === null) return b
  return Math.min(b, r)
}

function line(serverId, text, type) {
  sendToRenderer('console-line', { serverId, text, type })
}

function waitUntilStopped(serverId) {
  const deadline = Date.now() + STOP_DEADLINE_MS
  return new Promise((resolve) => {
    const check = () => {
      if (!activeServers[serverId]) return resolve()
      if (Date.now() >= deadline) return resolve()
      setTimeout(check, 200)
    }
    check()
  })
}

function chatSay(serverId, message) {
  const s = activeServers[serverId]
  if (!s) return false
  return writeStdin(s.process, `say ${message}\n`)
}

// Avisos en el chat del servidor en los minutos configurados antes del
// mantenimiento (por defecto 5 y 1).
function scheduleWarnings(serverId, dueAt, { stop, backup, restart }, minutes) {
  const now = Date.now()
  cancelWarnings(serverId)

  const phrase = stop
    ? (backup && restart ? 'El servidor se apagará para backup y reinicio' : 'El servidor se apagará para el reinicio programado')
    : 'Se creará una copia de seguridad del mundo (el servidor seguirá en línea)'
  const short = stop ? 'apagado' : 'backup'
  const list = []
  const last = minutes[minutes.length - 1]

  for (const min of minutes) {
    const at = dueAt - min * 60000
    if (at <= now) continue
    const word = minuteWord(min)
    const job = schedule.scheduleJob(new Date(at), () => {
      const reminder = min === last ? ' ¡Guardad vuestro progreso!' : ''
      const sent = chatSay(serverId, `§e[Mantenimiento] ${phrase} en ${min} ${word}.${reminder}`)
      line(serverId, sent
        ? `Aviso enviado al chat: ${short} en ${min} ${word}`
        : `No se pudo enviar el aviso de ${min} ${word} (servidor apagado)`,
        sent ? 'info' : 'warn')
    })
    if (job) list.push(job)
  }
  if (list.length) warnJobs[serverId] = list
}

function scheduleServerMaintenance(serverId) {
  cancelServerMaintenance(serverId)
  if (!isStr(serverId)) return
  const server = getAllServersMap()[serverId]
  if (!server || !isStr(server.jarPath)) return
  const settings = settingsStore.get(`server_${serverId}`) || {}
  if (!settings.autoBackupEnabled && !settings.autoRestartEnabled) return

  const serverDir = path.dirname(path.resolve(server.jarPath))
  const backupDir = resolveBackupDir(serverId)

  const bDue = nextBackupDue(settings)
  const rDue = nextRestartDue(settings)
  let dueAt = null
  if (bDue !== null && rDue !== null) dueAt = Math.min(bDue, rDue)
  else dueAt = bDue !== null ? bDue : rDue
  if (!dueAt) return

  scheduleWarnings(serverId, dueAt, { stop: rDue !== null, backup: bDue !== null, restart: rDue !== null }, warningMinutes(settings))

  const run = async () => {
    if (pending[serverId]) return
    pending[serverId] = true
    const now = Date.now()
    const dueB = bDue !== null && bDue <= now + DUE_TOLERANCE_MS
    const dueR = rDue !== null && rDue <= now + DUE_TOLERANCE_MS

    try {
      if (dueB && dueR) {
        // Backup y reinicio a la misma hora: servidor parado, backup
        // con el servidor apagado y se vuelve a encender.
        line(serverId, 'Mantenimiento programado: deteniendo el servidor...', 'warn')
        if (activeServers[serverId]) {
          await stopServer(serverId)
          await waitUntilStopped(serverId)
        }
        const res = await createBackup(serverDir, backupDir, serverId)
        line(serverId, res.ok
          ? `Backup automático creado: ${path.basename(res.file)}`
          : `Error en el backup automático: ${res.error}`,
          res.ok ? 'success' : 'error')
        line(serverId, 'Mantenimiento programado: arrancando de nuevo...', 'info')
        const startRes = await startServer(serverId)
        if (startRes && startRes.ok === false) {
          line(serverId, `No se pudo reiniciar: ${startRes.error}`, 'error')
          notify('server_crash', { name: server.name, detail: startRes.error })
          insertNotificacion(serverId, 'restart', `No se pudo reiniciar: ${startRes.error}`)
        } else {
          notify('server_restart', { name: server.name })
          insertNotificacion(serverId, 'restart', 'Reinicio programado completado (backup + reinicio).')
        }
      } else if (dueB) {
        const res = await createBackup(serverDir, backupDir, serverId)
        line(serverId, res.ok
          ? `Backup automático creado: ${path.basename(res.file)}`
          : `Error en backup automático: ${res.error}`,
          res.ok ? 'success' : 'error')
      } else if (dueR) {
        line(serverId, 'Reinicio programado: deteniendo el servidor...', 'warn')
        if (activeServers[serverId]) {
          await stopServer(serverId)
          await waitUntilStopped(serverId)
        }
        line(serverId, 'Reinicio programado: arrancando de nuevo...', 'info')
        const res = await startServer(serverId)
        if (res && res.ok === false) {
          line(serverId, `No se pudo reiniciar: ${res.error}`, 'error')
          notify('server_crash', { name: server.name, detail: res.error })
          insertNotificacion(serverId, 'restart', `No se pudo reiniciar: ${res.error}`)
        } else {
          notify('server_restart', { name: server.name })
          insertNotificacion(serverId, 'restart', 'Reinicio programado completado.')
        }
      }
    } catch (err) {
      line(serverId, `Error en el mantenimiento programado: ${err.message}`, 'error')
      logCrash('maintenance_error', err)
    } finally {
      pending[serverId] = false
      // Recalcula los próximos vencimientos (los intervalos se corren desde ahora).
      scheduleServerMaintenance(serverId)
    }
  }

  jobs[serverId] = schedule.scheduleJob(new Date(dueAt), run)
}

function initMaintenance() {
  serverMapEvents.on('changed', (serverId, action) => {
    if (action === 'delete') cancelServerMaintenance(serverId)
    else scheduleServerMaintenance(serverId)
  })
  Object.keys(getAllServersMap()).forEach((id) => scheduleServerMaintenance(id))
}

// Estado del reinicio programado (usado por la pestaña Backups).
function getRestartStatus(serverId) {
  if (!isStr(serverId)) return { enabled: false, nextAt: null }
  const settings = settingsStore.get(`server_${serverId}`) || {}
  return {
    enabled: !!settings.autoRestartEnabled,
    interval: settings.autoRestartInterval || '24h',
    nextAt: settings.autoRestartEnabled ? nextRestartDue(settings) : null
  }
}

function registerRestartIpc() {
  ipcMain.handle('restart:status', (_, serverId) => getRestartStatus(serverId))
}

module.exports = {
  registerRestartIpc,
  scheduleServerMaintenance,
  cancelServerMaintenance,
  cancelAllServerMaintenance,
  initMaintenance,
  nextMaintenanceAt,
  getRestartStatus,
  warningMinutes
}
