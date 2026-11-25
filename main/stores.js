// Fachada de persistencia. Toda la API es síncrona e idéntica a la que antes
// ofrecía electron-store, pero los datos viven exclusivamente en SQLite.
const { getDb, metaGet, metaSet } = require('./db')

function jsonGet(table, keyColumn, key, fallback) {
  const row = getDb().prepare(`SELECT value FROM ${table} WHERE ${keyColumn} = ?`).get(key)
  if (!row || row.value === null || row.value === undefined) return fallback
  try { return JSON.parse(row.value) } catch (_) { return fallback }
}

function jsonSet(table, keyColumn, key, value) {
  getDb().prepare(`INSERT INTO ${table}(${keyColumn}, value) VALUES (?, ?) ON CONFLICT(${keyColumn}) DO UPDATE SET value = excluded.value`)
    .run(key, JSON.stringify(value === undefined ? null : value))
}

function jsonDelete(table, keyColumn, key) {
  getDb().prepare(`DELETE FROM ${table} WHERE ${keyColumn} = ?`).run(key)
}

// ─── Servidores ──────────────────────────────────────────────────────────────
function getAllServersMap() {
  const rows = getDb().prepare('SELECT id, data FROM servers').all()
  const map = {}
  for (const row of rows) {
    try { map[row.id] = JSON.parse(row.data) } catch (_) {}
  }
  return map
}

function saveServerMap(map) {
  const db = getDb()
  const insert = db.prepare('INSERT OR REPLACE INTO servers(id, data, created_at) VALUES (?, ?, ?)')
  db.transaction(() => {
    const ids = Object.keys(map)
    if (ids.length === 0) {
      db.prepare('DELETE FROM servers').run()
    } else {
      const placeholders = ids.map(() => '?').join(', ')
      db.prepare(`DELETE FROM servers WHERE id NOT IN (${placeholders})`).run(...ids)
    }
    for (const [id, server] of Object.entries(map)) insert.run(id, JSON.stringify(server), server.createdAt || null)
  })()
}

// ─── Ajustes ─────────────────────────────────────────────────────────────────
function getServerSettings(serverId) { return jsonGet('settings', 'key', `server_${serverId}`, {}) }
function setServerSettings(serverId, data) { jsonSet('settings', 'key', `server_${serverId}`, data) }
function getGlobalBackupDir() { return jsonGet('settings', 'key', 'backupDir', '') }

// Compatibilidad con el código que usa settingsStore.get/set/delete directamente.
const settingsStore = {
  get: (key, fallback) => jsonGet('settings', 'key', key, fallback),
  set: (key, value) => { jsonSet('settings', 'key', key, value); return settingsStore },
  delete: (key) => jsonDelete('settings', 'key', key),
  has: (key) => !!getDb().prepare('SELECT 1 FROM settings WHERE key = ?').get(key)
}

const analyticsStore = {
  get: (key, fallback) => {
    if (key === 'events') {
      const rows = getDb().prepare('SELECT payload FROM analytics_events ORDER BY id').all()
      return rows.length ? rows.map(r => JSON.parse(r.payload)) : fallback
    }
    const value = metaGet(key)
    return value === undefined ? fallback : value
  },
  set: (key, value) => {
    if (key === 'events') {
      const insert = getDb().prepare('INSERT INTO analytics_events(payload, ts) VALUES (?, ?)')
      getDb().transaction(() => {
        getDb().prepare('DELETE FROM analytics_events').run()
        for (const event of value || []) insert.run(JSON.stringify(event), event.timestamp || Date.now())
      })()
    } else metaSet(key, value)
    return analyticsStore
  },
  delete: (key) => {
    if (key === 'events') getDb().prepare('DELETE FROM analytics_events').run()
    else getDb().prepare('DELETE FROM meta WHERE key = ?').run(key)
    return analyticsStore
  }
}

const crashStore = {
  get: (key, fallback) => {
    if (key === 'crashes') {
      const rows = getDb().prepare('SELECT * FROM crashes ORDER BY ts DESC').all()
      return rows.map(row => ({
        id: row.id, type: row.type, message: row.message, stack: row.stack,
        appVersion: row.app_version, platform: row.platform, osVersion: row.os_version, timestamp: row.ts
      }))
    }
    if (key === 'lastCrash') return metaGet('lastCrash') === undefined ? fallback : metaGet('lastCrash')
    const value = metaGet(`crash_${key}`)
    return value === undefined ? fallback : value
  },
  set: (key, value) => {
    if (key === 'crashes') {
      const insert = getDb().prepare(`INSERT OR REPLACE INTO crashes(id, type, message, stack, app_version, platform, os_version, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      getDb().transaction(() => {
        getDb().prepare('DELETE FROM crashes').run()
        for (const c of value || []) {
          insert.run(c.id, c.type || '', c.message || '', c.stack || '', c.appVersion || '',
            c.platform || '', c.osVersion || '', c.timestamp || Date.now())
        }
      })()
    } else if (key === 'lastCrash') metaSet('lastCrash', value)
    else metaSet(`crash_${key}`, value)
    return crashStore
  },
  delete: (key) => {
    if (key === 'crashes') getDb().prepare('DELETE FROM crashes').run()
    else getDb().prepare('DELETE FROM meta WHERE key = ?').run(`crash_${key}`)
    return crashStore
  }
}

// ─── Estadísticas ────────────────────────────────────────────────────────────
function getSamples(serverId) {
  return getDb().prepare('SELECT ts, cpu, ram_used_mb AS ramUsed FROM samples WHERE server_id = ? ORDER BY ts').all(serverId)
}
function saveSamples(serverId, samples) {
  const insert = getDb().prepare('INSERT INTO samples(server_id, ts, cpu, ram_used_mb) VALUES (?, ?, ?, ?)')
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM samples WHERE server_id = ?').run(serverId)
    for (const s of samples) insert.run(serverId, s.ts, s.cpu || 0, s.ramUsed || 0)
  })()
}
function insertSamples(serverId, samples) {
  if (!samples || samples.length === 0) return
  const insert = getDb().prepare('INSERT INTO samples(server_id, ts, cpu, ram_used_mb) VALUES (?, ?, ?, ?)')
  getDb().transaction(() => {
    for (const s of samples) insert.run(serverId, s.ts, s.cpu || 0, s.ramUsed || 0)
  })()
}
function pruneSamples(serverId, cutoffTs, max) {
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM samples WHERE server_id = ? AND ts < ?').run(serverId, cutoffTs)
    if (max) {
      getDb().prepare(`DELETE FROM samples WHERE id IN (
        SELECT id FROM samples WHERE server_id = ? ORDER BY ts DESC LIMIT -1 OFFSET ?
      )`).run(serverId, max)
    }
  })()
}

function getPlayerEvents(serverId) {
  return getDb().prepare('SELECT ts, type, player FROM player_events WHERE server_id = ? ORDER BY ts').all(serverId)
}
function savePlayerEvents(serverId, events) {
  const insert = getDb().prepare('INSERT INTO player_events(server_id, ts, type, player) VALUES (?, ?, ?, ?)')
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM player_events WHERE server_id = ?').run(serverId)
    for (const e of events) insert.run(serverId, e.ts, e.type, e.player)
  })()
}
function insertPlayerEvents(serverId, events) {
  if (!events || events.length === 0) return
  const insert = getDb().prepare('INSERT INTO player_events(server_id, ts, type, player) VALUES (?, ?, ?, ?)')
  getDb().transaction(() => {
    for (const e of events) insert.run(serverId, e.ts, e.type, e.player)
  })()
}
function prunePlayerEvents(serverId, cutoffTs, max) {
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM player_events WHERE server_id = ? AND ts < ?').run(serverId, cutoffTs)
    if (max) {
      getDb().prepare(`DELETE FROM player_events WHERE id IN (
        SELECT id FROM player_events WHERE server_id = ? ORDER BY ts DESC LIMIT -1 OFFSET ?
      )`).run(serverId, max)
    }
  })()
}

function getPlayerTotals(serverId) {
  const rows = getDb().prepare('SELECT player, total_ms, last_seen, days_json FROM player_totals WHERE server_id = ?').all(serverId)
  const totals = {}
  for (const row of rows) {
    try { totals[row.player] = { totalMs: row.total_ms, lastSeen: row.last_seen, days: JSON.parse(row.days_json) } } catch (_) {}
  }
  return totals
}
function savePlayerTotals(serverId, totals) {
  const insert = getDb().prepare(`INSERT OR REPLACE INTO player_totals(server_id, player, total_ms, last_seen, days_json)
    VALUES (?, ?, ?, ?, ?)`)
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM player_totals WHERE server_id = ?').run(serverId)
    for (const [player, data] of Object.entries(totals || {})) {
      insert.run(serverId, player, data.totalMs || 0, data.lastSeen || null, JSON.stringify(data.days || {}))
    }
  })()
}

function getRunTime(serverId) {
  const row = getDb().prepare('SELECT * FROM server_runs WHERE server_id = ?').get(serverId)
  if (!row) return null
  return {
    startedAt: row.started_at, stoppedAt: row.stopped_at, totalMs: row.total_ms,
    currentSessionStart: row.current_session_start
  }
}
function saveRunTime(serverId, run) {
  getDb().prepare(`INSERT OR REPLACE INTO server_runs(server_id, started_at, stopped_at, total_ms, current_session_start)
    VALUES (?, ?, ?, ?, ?)`).run(serverId, run && run.startedAt || null, run && run.stoppedAt || null,
      (run && run.totalMs) || 0, run && run.currentSessionStart || null)
}

function deleteServerStats(serverId) {
  getDb().transaction(() => {
    getDb().prepare('DELETE FROM samples WHERE server_id = ?').run(serverId)
    getDb().prepare('DELETE FROM player_events WHERE server_id = ?').run(serverId)
    getDb().prepare('DELETE FROM player_totals WHERE server_id = ?').run(serverId)
    getDb().prepare('DELETE FROM server_runs WHERE server_id = ?').run(serverId)
  })()
}

// Lecturas con rango para las consultas de estadísticas.
function getSamplesRange(serverId, from, to) {
  return getDb().prepare(`SELECT ts, cpu, ram_used_mb AS ramUsed FROM samples
    WHERE server_id = ? AND (? IS NULL OR ts >= ?) AND (? IS NULL OR ts <= ?) ORDER BY ts`)
    .all(serverId, from ?? null, from ?? null, to ?? null, to ?? null)
}
function getPlayerEventsRange(serverId, from, to) {
  return getDb().prepare(`SELECT ts, type, player FROM player_events
    WHERE server_id = ? AND (? IS NULL OR ts >= ?) AND (? IS NULL OR ts <= ?) ORDER BY ts`)
    .all(serverId, from ?? null, from ?? null, to ?? null, to ?? null)
}

module.exports = {
  settingsStore, analyticsStore, crashStore,
  getAllServersMap, saveServerMap,
  getServerSettings, setServerSettings, getGlobalBackupDir,
  getSamples, saveSamples, insertSamples, pruneSamples, getSamplesRange,
  getPlayerEvents, savePlayerEvents, insertPlayerEvents, prunePlayerEvents, getPlayerEventsRange,
  getPlayerTotals, savePlayerTotals, getRunTime, saveRunTime, deleteServerStats
}
