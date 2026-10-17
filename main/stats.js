const si = require('systeminformation')
const os = require('os')
const { getMainWindow, activeServers, sendToRenderer } = require('./state')
const { getSamples, saveSamples, settingsStore } = require('./stores')

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

// Conserva solo las muestas del servidor y un tope por seguridad.
function pruneSamples(samples, retentionDays) {
  const days = retentionDays || retentionSamplesDays()
  const cutoff = Date.now() - days * MS_PER_DAY
  let kept = samples.filter(s => s.ts >= cutoff)
  if (kept.length > MAX_SAMPLES_PER_SERVER) {
    kept = kept.slice(-MAX_SAMPLES_PER_SERVER)
  }
  return kept
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
    const all = getSamples(serverId).concat(buf)
    saveSamples(serverId, pruneSamples(all))
    pendingSamples.delete(serverId)
    buf.length = 0
  }
}

// Unidad mínima de CPU/RAM que se envía al renderer (lo que ya existía).
async function collectCurrentStats() {
  const totalMB = totalMemoryMB()
  const pids = Object.values(activeServers)
    .map(s => s.process && s.process.pid)
    .filter(Boolean)
  if (pids.length) {
    try {
      const procs = await si.processes()
      let cpu = 0
      let rss = 0
      for (const p of procs.list) {
        if (pids.includes(p.pid)) {
          cpu += p.cpu || 0
          rss += p.memRss || 0
        }
      }
      return {
        cpu: Math.round(cpu),
        ramUsed: rssToMB(rss, totalMB),
        ramTotal: totalMB,
        scope: 'server'
      }
    } catch (_) {
      /* cae al sistema */
    }
  }
  const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
  return {
    cpu: Math.round(load.currentLoad),
    ramUsed: Math.round((mem.total - mem.available) / 1048576),
    ramTotal: totalMB,
    scope: 'system'
  }
}

// Toma una muestra por cada servidor activo y una muestra global cuando no hay
// servidores en marcha (picos del sistema). Se guarda en el historial para
// calcular picos, jugadores por día, etc.
async function collectSamplesOnce() {
  const totalMB = totalMemoryMB()
  const procs = await si.processes().catch(() => ({ list: [] }))
  const activeIds = Object.keys(activeServers)
  const samples = []
  if (activeIds.length) {
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
      samples.push({ serverId, ts: Date.now(), cpu: Math.round(cpu), ramUsed: rssToMB(rss, totalMB) })
    }
  } else {
    // Sin servidores: las métricas del sistema completo. Se guarda con una
    // clave reservada para no colisionar con servidores reales.
    const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
    samples.push({
      serverId: 'system',
      ts: Date.now(),
      cpu: Math.round(load.currentLoad),
      ramUsed: Math.round((mem.total - mem.available) / 1048576)
    })
  }
  for (const sample of samples) pushPending(sample)
}

function startStatsPolling() {
  stopStatsPolling()
  flushInterval = setInterval(() => {
    flushSamples(true).catch(() => {})
  }, FLUSH_INTERVAL_MS)
  statsInterval = setInterval(async () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    try {
      const stats = await collectCurrentStats()
      sendToRenderer('stats-update', {
        cpu: stats.cpu,
        ramUsed: stats.ramUsed,
        ramTotal: stats.ramTotal,
        scope: stats.scope,
        activeServers: Object.keys(activeServers)
      })
      await collectSamplesOnce()
    } catch (_) {}
  }, SAMPLE_INTERVAL_MS)
}

function stopStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
  if (flushInterval) {
    clearInterval(flushInterval)
    flushInterval = null
  }
}

module.exports = { startStatsPolling, stopStatsPolling, pruneSamples }
