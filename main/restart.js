// Reinicio programado por servidor (Fase 2.2). Complementa los backups
// automáticos: para el servidor, espera a que termine y lo vuelve a arrancar.
'use strict'

const { ipcMain } = require('electron')
const schedule = require('node-schedule')
const { getAllServersMap, settingsStore } = require('./stores')
const { activeServers, sendToRenderer, serverMapEvents } = require('./state')
const { stopServer, startServer } = require('./servers')
const { isStr } = require('./validate')
const { notify } = require('./notifications')
const { logCrash } = require('./crash')

const INTERVALS = { '6h': 6 * 3600e3, '12h': 12 * 3600e3, '24h': 24 * 3600e3 }
const jobs = {}
const pending = {} // evita solapar un reinicio con otro

function cancelAutoRestart(serverId) {
  const job = jobs[serverId]
  if (job) { job.cancel(); delete jobs[serverId] }
}

function cancelAllAutoRestarts() {
  Object.keys(jobs).forEach(id => { jobs[id].cancel(); delete jobs[id] })
  Object.keys(pending).forEach(id => { delete pending[id] })
}

function nextRestartAt(serverId) {
  const job = jobs[serverId]
  if (!job || typeof job.nextInvocation !== 'function') return null
  try {
    const d = job.nextInvocation()
    return d && typeof d.getTime === 'function' ? d.getTime() : null
  } catch (_) {
    return null
  }
}

function scheduleAutoRestart(serverId) {
  cancelAutoRestart(serverId)
  if (!isStr(serverId)) return
  const server = getAllServersMap()[serverId]
  if (!server) return
  const settings = settingsStore.get(`server_${serverId}`) || {}
  if (!settings.autoRestartEnabled) return
  const ms = INTERVALS[settings.autoRestartInterval] || INTERVALS['24h']

  const run = async () => {
    if (pending[serverId]) return
    pending[serverId] = true
    const line = (text, type) => sendToRenderer('console-line', { serverId, text, type })
    line('Reinicio programado: deteniendo el servidor...', 'warn')
    try {
      if (activeServers[serverId]) {
        await stopServer(serverId)
        // stopServer hace kill a los 10 s; esperamos a que el proceso termine.
        const deadline = Date.now() + 12000
        while (activeServers[serverId] && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 200))
        }
      }
      line('Reinicio programado: arrancando de nuevo...', 'info')
      const res = await startServer(serverId)
      if (res && res.ok === false) {
        line(`No se pudo reiniciar: ${res.error}`, 'error')
        notify('server_crash', { name: server.name, detail: res.error })
      } else {
        notify('server_restart', { name: server.name })
      }
    } catch (err) {
      line(`Error en el reinicio programado: ${err.message}`, 'error')
      logCrash('auto_restart_error', err)
    } finally {
      pending[serverId] = false
      scheduleNext()
    }
  }
  const scheduleNext = () => {
    // El usuario pudo desactivar el reinicio mientras se ejecutaba: no volver
    // a programarlo en ese caso.
    const cfg = settingsStore.get(`server_${serverId}`) || {}
    if (!cfg.autoRestartEnabled) return
    jobs[serverId] = schedule.scheduleJob(new Date(Date.now() + ms), run)
  }
  scheduleNext()
}

let listenersAttached = false

function initAutoRestarts() {
  if (!listenersAttached) {
    listenersAttached = true
    serverMapEvents.on('changed', (serverId, action) => {
      if (action === 'delete') cancelAutoRestart(serverId)
      else scheduleAutoRestart(serverId)
    })
  }
  Object.keys(getAllServersMap()).forEach(id => scheduleAutoRestart(id))
}

function registerRestartIpc() {
  ipcMain.handle('restart:status', (_, serverId) => {
    if (!isStr(serverId)) return { enabled: false, nextAt: null }
    const settings = settingsStore.get(`server_${serverId}`) || {}
    return {
      enabled: !!settings.autoRestartEnabled,
      interval: settings.autoRestartInterval || '24h',
      nextAt: nextRestartAt(serverId)
    }
  })
}

module.exports = {
  registerRestartIpc,
  scheduleAutoRestart,
  cancelAutoRestart,
  cancelAllAutoRestarts,
  initAutoRestarts,
  nextRestartAt
}
