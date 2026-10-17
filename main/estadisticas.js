// Agregación de estadísticas por servidor y por jugador (Fases 1 a 4).
// Fase 1: los eventos de jugadores (joined/left) se agrupan para calcular el
//   tiempo jugado por jugador.
// Fase 2: se añaden las métricas por servidor: horas encendido, picos de
//   CPU/RAM, jugadores por día y momentos con más jugadores.
// Fase 4: los eventos y totales se podan según la retención configurada, y las
//   consultas admiten un rango [desde, hasta] para filtrar por fechas.
const { ipcMain } = require('electron')
const { getSamples, getPlayerEvents, savePlayerTotals, getRunTime, statsStore, settingsStore } = require('./stores')

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_RETENTION_DAYS = 730
const MAX_RETENTION_DAYS = 3650

// Días de retención configurables en Ajustes: cuánto tiempo se conservan los
// eventos de jugadores y los totales por jugador.
function retentionDays() {
  const n = Number(settingsStore.get('retentionEvents'))
  return Number.isInteger(n) && n > 0 && n <= MAX_RETENTION_DAYS ? n : DEFAULT_RETENTION_DAYS
}

// ─── Fase 1: tiempo jugado por jugador ────────────────────────────────────────

// Devuelve el desglose de un período [startTs, endTs] en días (zona UTC):
// [{ day: 'YYYY-MM-DD', ms }]
function splitByDay(startTs, endTs) {
  const parts = []
  let cursor = startTs
  while (cursor < endTs) {
    const d = new Date(cursor)
    const day = d.toISOString().slice(0, 10)
    const nextDay = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
    const stop = Math.min(endTs, nextDay)
    parts.push({ day, ms: stop - cursor })
    cursor = stop
  }
  return parts
}

function addDuration(totals, player, startTs, endTs) {
  if (!(endTs > startTs)) return
  totals[player] = totals[player] || { totalMs: 0, days: {} }
  for (const part of splitByDay(startTs, endTs)) {
    totals[player].totalMs += part.ms
    totals[player].days[part.day] = (totals[player].days[part.day] || 0) + part.ms
  }
}

// Calcula los totales de un servidor a partir de sus eventos. Los eventos se
// ordenan por tiempo; una sesión se abre con 'join' y se cierra con 'leave'.
// Los jugadores que siguen conectados al final se cierran en el momento en que
// se detiene el servidor (parámetro serverEndTs).
function computePlayerTotals(events, serverEndTs) {
  const totals = {}
  const open = new Map() // player -> ts de entrada
  const sorted = [...events].sort((a, b) => a.ts - b.ts)
  for (const event of sorted) {
    if (event.type === 'join') {
      // Si ya estaba abierto (evento duplicado), se ignora.
      if (!open.has(event.player)) open.set(event.player, event.ts)
    } else if (event.type === 'leave') {
      const start = open.get(event.player)
      if (start !== undefined) {
        open.delete(event.player)
        addDuration(totals, event.player, start, event.ts)
      }
    }
  }
  // Sesiones abiertas al detenerse el servidor: se cierran ahí.
  for (const [player, start] of open) {
    addDuration(totals, player, start, serverEndTs)
  }
  return totals
}

// Fase 4: los totales son una caché derivada de los eventos, así que solo se
// conservan los días con actividad reciente y el total se recalcula.
function prunePlayerTotals(totals) {
  const cutoff = Date.now() - retentionDays() * MS_PER_DAY
  for (const player of Object.keys(totals)) {
    const total = totals[player]
    for (const day of Object.keys(total.days)) {
      const ts = new Date(day + 'T00:00:00Z').getTime()
      if (ts < cutoff) delete total.days[day]
    }
    total.totalMs = Object.values(total.days).reduce((sum, ms) => sum + ms, 0)
  }
}

// Cierra las sesiones abiertas de un servidor que deja de ejecutarse. Se llama
// desde el manejador de salida del proceso, cuando se conoce la hora de parada.
function closeServerSessions(serverId, serverEndTs) {
  const events = getPlayerEvents(serverId)
  const totals = computePlayerTotals(events, serverEndTs)
  prunePlayerTotals(totals)
  savePlayerTotals(serverId, totals)
}

// Borra todo lo guardado para un servidor (Fase 4: al eliminar el servidor).
function deleteServerStats(serverId) {
  const keys = [`samples_${serverId}`, `playerEvents_${serverId}`, `playerTotals_${serverId}`, `run_${serverId}`]
  for (const key of keys) statsStore.delete(key)
}

// ─── Fase 2: agregación por servidor ──────────────────────────────────────────

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10)
}

// Horas encendido: de la primera vez que arrancó el servidor hasta que paró
// (o hasta ahora si sigue en marcha).
function computeUptimeMs(run) {
  const startedAt = run && run.startedAt
  if (!startedAt) return 0
  const end = run.stoppedAt || Date.now()
  return Math.max(0, end - startedAt)
}

// Picos de CPU/RAM a partir de las muestras guardadas. Devuelve el máximo y el
// momento en que se alcanzó cada uno.
function computeResourcePeaks(samples) {
  let cpuPeak = 0
  let cpuAt = null
  let ramPeak = 0
  let ramAt = null
  for (const sample of samples) {
    if (sample.cpu > cpuPeak) {
      cpuPeak = sample.cpu
      cpuAt = sample.ts
    }
    if (sample.ramUsed > ramPeak) {
      ramPeak = sample.ramUsed
      ramAt = sample.ts
    }
  }
  return { cpuPeak, cpuAt, ramPeak, ramAt, samples: samples.length }
}

// Por cada día (UTC), los jugadores únicos que entraron ese día y el número de
// conexiones por día. Los 'join' ya contabilizan al jugador aunque luego salga.
function computeDailyPlayerActivity(events) {
  const daily = {}
  for (const event of events) {
    const day = dayKey(event.ts)
    if (!daily[day]) daily[day] = { players: {}, joins: 0 }
    if (event.type !== 'join') continue
    daily[day].joins += 1
    daily[day].players[event.player] = true
  }
  return daily
}

// Momentos con más jugadores concurrentes: tras cada evento se recalcula el
// número de jugadores online y se guardan los momentos (ordenados). Se devuelven
// los N momentos con más jugadores a la vez.
function computeConcurrentMoments(events, limit) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts)
  const open = new Map() // player -> ts de entrada
  const moments = []
  let online = 0
  for (const event of sorted) {
    if (event.type === 'join') {
      if (!open.has(event.player)) {
        open.set(event.player, event.ts)
        online += 1
      }
    } else if (event.type === 'leave') {
      if (open.delete(event.player)) online -= 1
    }
    if (online > 0) moments.push({ ts: event.ts, online })
  }
  moments.sort((a, b) => b.online - a.online || a.ts - b.ts)
  return moments.slice(0, limit || 10)
}

// ─── Fase 4: filtros por rango ────────────────────────────────────────────────

function inRange(ts, filters) {
  if (filters.desde !== undefined && ts < filters.desde) return false
  if (filters.hasta !== undefined && ts > filters.hasta) return false
  return true
}

// Aplica el rango [desde, hasta] a los eventos de jugadores.
function filterPlayerEvents(events, filters) {
  if (!filters) return events
  return events.filter(e => inRange(e.ts, filters))
}

// Aplica el rango a las muestras de CPU/RAM.
function filterResourceSamples(samples, filters) {
  if (!filters) return samples
  return samples.filter(s => inRange(s.ts, filters))
}

// ─── Métricas por jugador ─────────────────────────────────────────────────────

function getPlayerList(serverId, filters) {
  const events = filterPlayerEvents(getPlayerEvents(serverId), filters)
  const run = getRunTime(serverId)
  const totals = computePlayerTotals(events, run && (run.stoppedAt || Date.now()))
  const list = Object.keys(totals).map(player => {
    const total = totals[player]
    return {
      player,
      totalMs: total.totalMs,
      daysActive: Object.keys(total.days).length
    }
  })
  list.sort((a, b) => b.totalMs - a.totalMs)
  return list
}

// Métricas resumidas de un servidor (Fase 2): horas encendido, picos de
// CPU/RAM, jugadores por día y momentos con más jugadores. El filtro, si se
// pasa, recorta los eventos y muestras a [desde, hasta]; las horas encendido
// siempre se calculan desde la hora de arranque del servidor.
function getServerMetrics(serverId, filters) {
  const samples = filterResourceSamples(getSamples(serverId), filters)
  const run = getRunTime(serverId)
  const events = filterPlayerEvents(getPlayerEvents(serverId), filters)
  return {
    uptimeMs: computeUptimeMs(run),
    resources: computeResourcePeaks(samples),
    dailyPlayerActivity: computeDailyPlayerActivity(events),
    concurrentMoments: computeConcurrentMoments(events)
  }
}

// ─── Consultas para la interfaz (Fase 2) ──────────────────────────────────────

function isValidServerId(id) {
  return typeof id === 'string' && id.length > 0
}

// Exportación a CSV (Fase 4). Devuelve el contenido del archivo que se
// descargaría; la UI se encarga de crear el Blob y la descarga.
function csvEscape(value) {
  const str = String(value)
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
  return str
}

function buildServerCsv(serverId) {
  const metrics = getServerMetrics(serverId)
  const players = getPlayerList(serverId)
  const rows = []

  const addRow = cells => rows.push(cells.map(csvEscape).join(','))

  addRow(['servidor', 'horas_encendido_ms', 'pico_cpu_pct', 'pico_ram_mb'])
  addRow([serverId, metrics.uptimeMs, metrics.resources.cpuPeak, metrics.resources.ramPeak])

  addRow(['jugadores_por_dia'])
  const daily = metrics.dailyPlayerActivity
  for (const day of Object.keys(daily).sort()) {
    const entry = daily[day]
    addRow([day, Object.keys(entry.players).length, entry.joins])
  }

  addRow(['jugador', 'tiempo_jugado_ms', 'diasactivos'])
  for (const player of players) {
    addRow([player.player, player.totalMs, player.daysActive])
  }

  return rows.join('\r\n')
}

// Exportación a JSON: mismo contenido estructurado de forma legible. La
// interfaz descarga el que elijas (CSV o JSON).
function buildServerJson(serverId) {
  const metrics = getServerMetrics(serverId)
  const players = getPlayerList(serverId)
  return {
    servidor: serverId,
    horasEncendidoMs: metrics.uptimeMs,
    picoCpuPct: metrics.resources.cpuPeak,
    picoRamMb: metrics.resources.ramPeak,
    jugadoresPorDia: metrics.dailyPlayerActivity,
    momentosConMasJugadores: metrics.concurrentMoments,
    jugadores: players.map(p => ({
      jugador: p.player,
      tiempoJugadoMs: p.totalMs,
      diasActivos: p.daysActive
    }))
  }
}

function registerEstadisticasIpc() {
  ipcMain.handle('estadisticas:resumen', (_, serverId, filters) => {
    if (!isValidServerId(serverId)) return { ok: false, error: 'Datos inválidos' }
    return getServerMetrics(serverId, filters)
  })

  ipcMain.handle('estadisticas:jugadores', (_, serverId, filters) => {
    if (!isValidServerId(serverId)) return { ok: false, error: 'Datos inválidos' }
    return getPlayerList(serverId, filters)
  })

  ipcMain.handle('estadisticas:export', (_, serverId) => {
    if (!isValidServerId(serverId)) return { ok: false, error: 'Datos inválidos' }
    return { ok: true, csv: buildServerCsv(serverId), json: buildServerJson(serverId) }
  })
}

module.exports = {
  splitByDay,
  computePlayerTotals,
  prunePlayerTotals,
  closeServerSessions,
  deleteServerStats,
  computeUptimeMs,
  computeResourcePeaks,
  computeDailyPlayerActivity,
  computeConcurrentMoments,
  filterPlayerEvents,
  getPlayerList,
  getServerMetrics,
  buildServerJson,
  registerEstadisticasIpc
}
