// Parseo del log del servidor (`logs/latest.log`): detecta cuándo los jugadores
// entran y salen y los registra con timestamps, para poder calcular estadísticas
// por servidor y por jugador (Fase 1).
// El log lo escribe el propio servidor, por lo que lleva la marca de tiempo real
// del juego; eso es más fiable que la salida por stdout, que no tiene timestamps.
const fs = require('fs')
const path = require('path')
const { getAllServersMap, getPlayerEvents, savePlayerEvents, settingsStore } = require('./stores')

// Log de actividad actual del servidor (ruta relativa a la carpeta del .jar).
function getLogPath(server) {
  const serverDir = path.dirname(server.jarPath)
  return path.join(serverDir, 'logs', 'latest.log')
}

// Marca de tiempo que escribe Minecraft al inicio de cada línea: [HH:MM:SS]
const LOG_TIME_RE = /^\[(\d{1,2}):(\d{2}):(\d{2})]/

// Mensajes con los que ya se detectan jugadores online (mismo criterio que usa
// el renderer para la consola): «Steve joined the game» / «Steve left the game».
const JOIN_RE = /(\w+) joined the game/
const LEAVE_RE = /(\w+) left the game/

const POLL_INTERVAL_MS = 15000
const TAIL_BYTES = 512 * 1024
const MAX_EVENTS_PER_SERVER = 5000
const MS_PER_DAY = 24 * 60 * 60 * 1000
// Por defecto se conservan dos años de eventos (lo que ya se usaba).
const DEFAULT_EVENTS_RETENTION_DAYS = 730
const MAX_RETENTION_DAYS = 3650

// Días de retención configurables en Ajustes: cuánto tiempo se conservan los
// eventos de jugadores y los totales por jugador.
function retentionEventsDays() {
  const n = Number(settingsStore.get('retentionEvents'))
  return Number.isInteger(n) && n > 0 && n <= MAX_RETENTION_DAYS ? n : DEFAULT_EVENTS_RETENTION_DAYS
}

// Un evento de jugador: { ts, type: 'join' | 'leave', player }
function parseLogLine(line) {
  const time = line.match(LOG_TIME_RE)
  let ts = null
  if (time) {
    const h = Number(time[1])
    const m = Number(time[2])
    const s = Number(time[3])
    if (h >= 0 && h <= 23 && m < 60 && s < 60) {
      const now = new Date()
      ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s).getTime()
    }
  }
  const join = line.match(JOIN_RE)
  const leave = line.match(LEAVE_RE)
  let type = null
  let player = null
  if (join) {
    type = 'join'
    player = join[1]
  } else if (leave) {
    type = 'leave'
    player = leave[1]
  }
  if (!type || !player) return null
  // Si el log no lleva marca de tiempo, se marca con la hora de recepción.
  return { ts: ts || Date.now(), type, player }
}

// Lee el final del log para no cargar todo el histórico en cada pasada. Devuelve
// también si el principio del fragmento está cortado (la primera línea).
function readTail(filePath) {
  return new Promise((resolve, reject) => {
    fs.stat(filePath, (err, stat) => {
      if (err) return reject(err)
      const start = Math.max(0, stat.size - TAIL_BYTES)
      const cutMidLine = stat.size - start > 0
      fs.open(filePath, 'r', (openErr, handle) => {
        if (openErr) return reject(openErr)
        handle.stat((statErr, info) => {
          if (statErr) return reject(statErr)
          handle.seek(start, 'start', seekErr => {
            if (seekErr) return reject(seekErr)
            const length = info.size - start
            const buffer = Buffer.alloc(length)
            handle.read(buffer, 0, length, start, (readErr, read) => {
              handle.close()
              if (readErr) return reject(readErr)
              resolve({ text: buffer.toString('utf8', 0, read), cutMidLine })
            })
          })
        })
      })
    })
  })
}

// Estado en memoria por servidor: la lista de eventos sólo cambia cuando el
// propio proceso las registra, así que se mantiene aquí y se persiste al cambiar.
const state = new Map() // serverId -> { events, lastTs }
const ensureEntry = serverId => {
  let entry = state.get(serverId)
  if (!entry) {
    entry = { events: getPlayerEvents(serverId), lastTs: null }
    state.set(serverId, entry)
  }
  return entry
}

function persistEntry(serverId) {
  const entry = ensureEntry(serverId)
  savePlayerEvents(serverId, pruneEvents(entry.events))
}

// Fase 4: poda los eventos antiguos para no crecer indefinidamente. Se aplican
// también el tope por número de eventos.
function pruneEvents(events, retentionDays) {
  const days = retentionDays || retentionEventsDays()
  const cutoff = Date.now() - days * MS_PER_DAY
  const kept = events.filter(e => e.ts >= cutoff)
  if (kept.length > MAX_EVENTS_PER_SERVER) {
    return kept.slice(-MAX_EVENTS_PER_SERVER)
  }
  return kept
}

async function pollLogs() {
  const map = getAllServersMap()
  const serverIds = map ? Object.keys(map) : []
  for (const serverId of serverIds) {
    const server = map[serverId]
    if (!server || !server.jarPath) continue
    let fragment
    try {
      fragment = await readTail(getLogPath(server))
    } catch (_) {
      // Sin log (o archivo vacío): nada que registrar.
      continue
    }
    const entry = ensureEntry(serverId)
    const lines = fragment.text.split('\n')
    // Si empezamos en medio de línea, el primer fragmento se descarta.
    const first = fragment.cutMidLine ? 1 : 0
    let changed = false
    for (let i = first; i < lines.length; i++) {
      const line = lines[i]
      if (!line.trim()) continue
      const event = parseLogLine(line)
      if (!event) continue
      if (entry.lastTs && event.ts <= entry.lastTs) continue
      const exists = entry.events.some(e => e.player === event.player && e.type === event.type && e.ts === event.ts)
      if (exists) continue
      entry.events.push(event)
      if (event.ts > entry.lastTs) entry.lastTs = event.ts
      changed = true
      if (entry.events.length > MAX_EVENTS_PER_SERVER) {
        entry.events.splice(0, entry.events.length - MAX_EVENTS_PER_SERVER)
      }
    }
    if (changed) persistEntry(serverId)
  }
}

let pollTimer = null

function startLogPolling() {
  stopLogPolling()
  // Comprueba inmediatamente para no esperar al primer intervalo.
  pollLogs().catch(() => {})
  pollTimer = setInterval(() => {
    pollLogs().catch(() => {})
  }, POLL_INTERVAL_MS)
}

function stopLogPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

module.exports = { startLogPolling, stopLogPolling, parseLogLine, pruneEvents }
