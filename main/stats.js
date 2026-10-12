const si = require('systeminformation')
const os = require('os')
const { getMainWindow, activeServers, sendToRenderer } = require('./state')

let statsInterval = null

// memRss puede venir en KB o bytes según plataforma: se toma la lectura en MB
// que siga siendo plausible frente a la RAM total del sistema.
function rssToMB(v, totalMB) {
  if (!v || v <= 0) return 0
  const asKB = v / 1024
  if (asKB <= totalMB) return Math.round(asKB)
  return Math.round(v / 1048576)
}

// CPU/RAM de los procesos java propios; si no hay ningún servidor en marcha,
// se cae a las métricas globales del sistema.
async function collectStats() {
  const totalMB = Math.round(os.totalmem() / 1048576)
  const pids = Object.values(activeServers).map(s => s.process && s.process.pid).filter(Boolean)
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
      return { cpu: Math.round(cpu), ramUsed: rssToMB(rss, totalMB), ramTotal: totalMB, scope: 'server' }
    } catch (_) { /* cae al sistema */ }
  }
  const [load, mem] = await Promise.all([si.currentLoad(), si.mem()])
  return {
    cpu: Math.round(load.currentLoad),
    ramUsed: Math.round((mem.total - mem.available) / 1048576),
    ramTotal: totalMB,
    scope: 'system'
  }
}

function startStatsPolling() {
  stopStatsPolling()
  statsInterval = setInterval(async () => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    try {
      const stats = await collectStats()
      sendToRenderer('stats-update', {
        cpu: stats.cpu,
        ramUsed: stats.ramUsed,
        ramTotal: stats.ramTotal,
        scope: stats.scope,
        activeServers: Object.keys(activeServers)
      })
    } catch (_) { }
  }, 2000)
}

function stopStatsPolling() {
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
}

module.exports = { startStatsPolling, stopStatsPolling }
