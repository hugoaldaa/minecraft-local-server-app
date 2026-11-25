const si = require('systeminformation')
const os = require('os')
const { getMainWindow, activeServers, sendToRenderer } = require('./state')
const { insertSamples, pruneSamples, settingsStore } = require('./stores')

let statsInterval = null
let flushInterval = null

// Cada 2 s se toman muestras para la barra de título; el historial se guarda
// cada 15 s para no escribir en disco en cada muestra.
const SAMPLE_INTERVAL_MS = 2000
const FLUSH_INTERVAL_MS = 15000
const MAX_SAMPLES_PER_SERVER = 100000
const MS_PER_DAY = 24 * 60 * 60 * 1000
// Por defecto se conservan 30 días de muestras (lo que ya se usaba).
const DEFAULT_SAMPLES_RETENTION_DAYS = 30
const MAX_RETENTION_DAYS = 365

// Muestras pendientes de guardar, por servidorId: [{ ts, cpu, ramUsed }]
const pendingSamples = new Map()

// memRss puede venir en KB o bytes según plataforma: se toma la lectura en MB
// que siga siendo plausible frente a la RAM total del sistema.
function rssToMB(v, totalMB) {
  if (!v || v <= 0) return 0
  const asKB = v / 1024
  if (asKB <= totalMB) return Math.round(asKB)
  return Math.round(v / 1048576)
}

function totalMemoryMB() {
  return Math.round(os.totalmem() / 1048576)
}

// Días de retención configurables en Ajustes: cuánto tiempo se conserva el
// historial de CPU/RAM por servidor.
function retentionSamplesDays() {
  const n = Number(settingsStore.get('retentionSamples'))
  return Number.isInteger(n) && n > 0 && n <= MAX_RETENTION_DAYS ? n : DEFAULT_SAMPLES_RETENTION_DAYS
}

function pushPending(sample) {
  let buf = pendingSamples.get(sample.serverId)
  if (!buf) {
    buf = []
    pendingSamples.set(sample.serverId, buf)
  }
  buf.push(sample)
  if (buf.length > 5000) flushSamples(true).catch(() => {})
}

// Guarda los acumulados y limpia la memoria pendiente.
async function flushSamples(force) {
  for (const [serverId, buf] of pendingSamples) {
    if (buf.length === 0) {
      pendingSamples.delete(serverId)
      continue
    }
    insertSamples(serverId, buf)
    pruneSamples(serverId, Date.now() - retentionSamplesDays() * MS_PER_DAY, MAX_SAMPLES_PER_SERVER)
    pendingSamples.delete(serverId)
    buf.length = 0
  }
}

// Toma una sola lectura de procesos, envía el estado al renderer y guarda la
// muestra en el historial. Se usa una sola llamada a si.processes() por ciclo
// en vez de dos (una para la UI y otra para el historial).
async function collectOnce() {
  const totalMB = totalMemoryMB()
  const activeIds = Object.keys(activeServers)
  const ts = Date.now()

  let statsForRenderer = null
  const samples = []

  if (activeIds.length) {
    const procs = await si.processes().catch(() => ({ list: [] }))
    // Un proceso por servidor: su uso de CPU/RAM pertenece a ese servidor.
    for (const serverId of activeIds) {
      const proc = activeServers[serverId].process
      const pid = proc && proc.pid
      if (!pid) continue
      let cpu = 0
      let rss = 0
      for (const p of procs.list) {
        if (p.pid === pid) {
          cpu += p.cpu || 0
          rss += p.memRss || 0
        }
      }
      const ramUsed = rssToMB(rss, totalMB)
      samples.push({ serverId, ts, cpu: Math.round(cpu), ramUsed })
      // Primera muestra de servidor activo se usa para la barra de título.
      if (!statsForRenderer) {
        statsForRenderer = { cpu: Math.round(cpu), ramUsed, ramTotal: totalMB, scope: 'server' }
      }
    }
  } else {
    // Sin servidores: las métricas del sistema completo.
    const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
    const cpu = Math.round(load.currentLoad)
    const ramUsed = Math.round((mem.total - mem.available) / 1048576)
    samples.push({ serverId: 'system', ts, cpu, ramUsed })
    statsForRenderer = { cpu, ramUsed, ramTotal: totalMB, scope: 'system' }
  }

  for (const sample of samples) pushPending(sample)

  if (statsForRenderer) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      sendToRenderer('stats-update', {
        cpu: statsForRenderer.cpu,
        ramUsed: statsForRenderer.ramUsed,
        ramTotal: statsForRenderer.ramTotal,
        scope: statsForRenderer.scope,
        activeServers: activeIds
      })
    }
  }
}

function startStatsPolling() {
  stopStatsPolling()
  flushInterval = setInterval(() => {
    flushSamples(true).catch(() => {})
  }, FLUSH_INTERVAL_MS)
  statsInterval = setInterval(async () => {
    try {
      await collectOnce()
    } catch (_) {}
  }, SAMPLE_INTERVAL_MS)
}

async function stopStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
  }
  // Guarda las muestras pendientes al detenerse para no perder hasta 15 s de
  // historial de CPU/RAM.
  await flushSamples(true).catch(() => {})
}

module.exports = { startStatsPolling, stopStatsPolling }
