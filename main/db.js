// Persistencia local en SQLite. Toda la estado de la app se guarda en app.db;
// los antiguos JSON de electron-store solo se leen una vez durante la migración.
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const Database = require('better-sqlite3')

const SCHEMA_VERSION = 1
const LEGACY_FILES = ['servers', 'settings', 'serverStats', 'analytics', 'crashes']

let db = null
let dataDir = null

function dataPath() {
  if (dataDir) return dataDir
  if (process.env.MCLSM_TEST_DATA_DIR) {
    dataDir = process.env.MCLSM_TEST_DATA_DIR
    return dataDir
  }
  const appName = 'minecraft-local-server-app'
  // En Electron se usa app.getPath('userData'); en tests (Node) un directorio
  // temporal para no tocar los datos reales del usuario.
  try {
    const electron = require('electron')
    if (electron && electron.app && electron.app.getPath) {
      dataDir = electron.app.getPath('userData')
      return dataDir
    }
  } catch (_) {}
  dataDir = path.join(os.tmpdir(), appName + '-db-test')
  return dataDir
}

function dbPath() {
  return path.join(dataPath(), 'app.db')
}

function legacyPath(name) {
  return path.join(dataPath(), `${name}.json`)
}

function jsonOrNull(name) {
  const file = legacyPath(name)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (_) {
    return null
  }
}

function createSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      cpu REAL NOT NULL,
      ram_used_mb REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_samples_server_ts ON samples(server_id, ts);
    CREATE TABLE IF NOT EXISTS player_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      player TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_server_ts ON player_events(server_id, ts);
    CREATE TABLE IF NOT EXISTS player_totals (
      server_id TEXT NOT NULL,
      player TEXT NOT NULL,
      total_ms INTEGER NOT NULL DEFAULT 0,
      last_seen INTEGER,
      days_json TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (server_id, player)
    );
    CREATE TABLE IF NOT EXISTS server_runs (
      server_id TEXT PRIMARY KEY,
      started_at INTEGER,
      stopped_at INTEGER,
      total_ms INTEGER NOT NULL DEFAULT 0,
      current_session_start INTEGER
    );
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crashes (
      id TEXT PRIMARY KEY,
      type TEXT,
      message TEXT,
      stack TEXT,
      app_version TEXT,
      platform TEXT,
      os_version TEXT,
      ts INTEGER NOT NULL
    );
  `)
}

function metaGet(key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  if (!row) return undefined
  try { return JSON.parse(row.value) } catch (_) { return row.value }
}

function metaSet(key, value) {
  db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value))
}

function countAll() {
  return {
    servers: db.prepare('SELECT COUNT(*) AS n FROM servers').get().n,
    settings: db.prepare('SELECT COUNT(*) AS n FROM settings').get().n,
    samples: db.prepare('SELECT COUNT(*) AS n FROM samples').get().n,
    events: db.prepare('SELECT COUNT(*) AS n FROM player_events').get().n,
    totals: db.prepare('SELECT COUNT(*) AS n FROM player_totals').get().n,
    runs: db.prepare('SELECT COUNT(*) AS n FROM server_runs').get().n,
    analytics: db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n,
    crashes: db.prepare('SELECT COUNT(*) AS n FROM crashes').get().n
  }
}

// Cuenta las entradas de los JSON para poder comprobar que la migración no
// pierde nada antes de borrarlos.
function countLegacy() {
  const servers = jsonOrNull('servers')
  const settings = jsonOrNull('settings')
  const stats = jsonOrNull('serverStats')
  const analytics = jsonOrNull('analytics')
  const crashes = jsonOrNull('crashes')
  const sum = prefix => Object.entries(stats || {}).reduce((n, [key, value]) => {
    if (!key.startsWith(prefix)) return n
    if (Array.isArray(value)) return n + value.length
    if (value && typeof value === 'object') return n + Object.keys(value).length
    return n
  }, 0)
  const runs = Object.keys(stats || {}).filter(key => key.startsWith('run_')).length
  return {
    servers: Object.keys((servers && servers.servers) || {}).length,
    settings: Object.keys(settings || {}).length,
    samples: sum('samples_'),
    events: sum('playerEvents_'),
    totals: sum('playerTotals_'),
    runs,
    analytics: ((analytics && analytics.events) || []).length,
    crashes: ((crashes && crashes.crashes) || []).length
  }
}

function importLegacy() {
  const servers = jsonOrNull('servers')
  const settings = jsonOrNull('settings')
  const stats = jsonOrNull('serverStats')
  const analytics = jsonOrNull('analytics')
  const crashes = jsonOrNull('crashes')
  if (!servers && !settings && !stats && !analytics && !crashes) return countAll()
  const legacyCounts = countLegacy()

  const insertServer = db.prepare('INSERT OR REPLACE INTO servers(id, data, created_at) VALUES (?, ?, ?)')
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)')
  const insertSample = db.prepare('INSERT INTO samples(server_id, ts, cpu, ram_used_mb) VALUES (?, ?, ?, ?)')
  const insertEvent = db.prepare('INSERT INTO player_events(server_id, ts, type, player) VALUES (?, ?, ?, ?)')
  const insertTotal = db.prepare('INSERT OR REPLACE INTO player_totals(server_id, player, total_ms, last_seen, days_json) VALUES (?, ?, ?, ?, ?)')
  const insertRun = db.prepare('INSERT OR REPLACE INTO server_runs(server_id, started_at, stopped_at, total_ms, current_session_start) VALUES (?, ?, ?, ?, ?)')
  const insertAnalytics = db.prepare('INSERT INTO analytics_events(payload, ts) VALUES (?, ?)')
  const insertCrash = db.prepare('INSERT OR REPLACE INTO crashes(id, type, message, stack, app_version, platform, os_version, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')

  const migrate = db.transaction(() => {
    for (const [id, server] of Object.entries(servers && servers.servers ? servers.servers : {})) {
      insertServer.run(id, JSON.stringify(server), server.createdAt || null)
    }
    for (const [key, value] of Object.entries(settings || {})) {
      insertSetting.run(key, JSON.stringify(value))
    }
    for (const [key, value] of Object.entries(stats || {})) {
      if (key.startsWith('samples_')) {
        const id = key.slice('samples_'.length)
        for (const s of value || []) insertSample.run(id, s.ts, s.cpu || 0, s.ramUsed || 0)
      } else if (key.startsWith('playerEvents_')) {
        const id = key.slice('playerEvents_'.length)
        for (const e of value || []) insertEvent.run(id, e.ts, e.type, e.player)
      } else if (key.startsWith('playerTotals_')) {
        const id = key.slice('playerTotals_'.length)
        for (const [player, total] of Object.entries(value || {})) {
          insertTotal.run(id, player, total.totalMs || 0, total.lastSeen || null, JSON.stringify(total.days || {}))
        }
      } else if (key.startsWith('run_')) {
        const id = key.slice('run_'.length)
        insertRun.run(id, value.startedAt || null, value.stoppedAt || null, value.totalMs || 0, value.currentSessionStart || null)
      }
    }
    for (const event of (analytics && analytics.events) || []) {
      insertAnalytics.run(JSON.stringify(event), event.timestamp || Date.now())
    }
    for (const [key, value] of Object.entries(analytics || {})) {
      if (['installId', 'firstSeen', 'analyticsEnabled'].includes(key)) metaSet(key, value)
    }
    for (const crash of (crashes && crashes.crashes) || []) {
      insertCrash.run(crash.id || crypto.randomUUID(), crash.type || '', crash.message || '', crash.stack || '',
        crash.appVersion || '', crash.platform || '', crash.osVersion || '', crash.timestamp || Date.now())
    }
    if (crashes && crashes.lastCrash) metaSet('lastCrash', crashes.lastCrash)
    metaSet('schemaVersion', SCHEMA_VERSION)
  })
  migrate()
  return legacyCounts
}

function verifyMigration(before) {
  const after = countAll()
  for (const key of Object.keys(before)) {
    if (after[key] < before[key]) {
      throw new Error(`Migración incompleta: ${key} (${before[key]} → ${after[key]})`)
    }
  }
}

function removeLegacyFiles() {
  for (const name of LEGACY_FILES) {
    const file = legacyPath(name)
    try { if (fs.existsSync(file)) fs.unlinkSync(file) } catch (_) {}
  }
}

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { if (fs.existsSync(dbPath() + suffix)) fs.unlinkSync(dbPath() + suffix) } catch (_) {}
  }
}

function initDb() {
  if (db) return db
  fs.mkdirSync(dataPath(), { recursive: true })
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  createSchema(db)

  const version = metaGet('schemaVersion')
  if (version !== SCHEMA_VERSION) {
    // Si hay datos legacy, se importan en una transacción; si algo falla se
    // descarta la BD recién creada y los JSON quedan intactos.
    const backupFile = dbPath() + '.bak'
    try {
      const counts = importLegacy()
      verifyMigration(counts)
      if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile)
      db.close()
      db = null
      fs.copyFileSync(dbPath(), backupFile)
      db = new Database(dbPath())
      db.pragma('journal_mode = WAL')
      db.pragma('synchronous = NORMAL')
      removeLegacyFiles()
    } catch (err) {
      if (db) { try { db.close() } catch (_) {}; db = null }
      removeDbFiles()
      throw new Error(`No se pudo migrar la persistencia a SQLite: ${err.message}`)
    }
  }
  return db
}

function getDb() {
  if (!db) throw new Error('La base de datos no está inicializada')
  return db
}

function closeDb() {
  if (!db) return
  try { db.pragma('wal_checkpoint(TRUNCATE)') } catch (_) {}
  db.close()
  db = null
}

function resetDbForTests() {
  closeDb()
  dataDir = null
}

// Volcado completo para el usuario (portabilidad manual). La app nunca lo usa
// para persistir; es solo un archivo que el usuario descarga o importa.
function exportAll() {
  const database = getDb()
  const tables = ['meta', 'servers', 'settings', 'samples', 'player_events', 'player_totals',
    'server_runs', 'analytics_events', 'crashes']
  const result = { format: 'minecraft-local-server-app', schemaVersion: SCHEMA_VERSION, exportedAt: Date.now() }
  for (const table of tables) result[table] = database.prepare(`SELECT * FROM ${table}`).all()
  return result
}

function importAll(payload) {
  if (!payload || payload.format !== 'minecraft-local-server-app' || payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('Archivo de backup no compatible')
  }
  const database = getDb()
  const tables = ['meta', 'servers', 'settings', 'samples', 'player_events', 'player_totals',
    'server_runs', 'analytics_events', 'crashes']
  // Solo columnas conocidas: el payload viene de un archivo y no debe poder
  // construir SQL arbitrario a partir de sus claves.
  const columnsByTable = {
    meta: ['key', 'value'],
    servers: ['id', 'data', 'created_at'],
    settings: ['key', 'value'],
    samples: ['id', 'server_id', 'ts', 'cpu', 'ram_used_mb'],
    player_events: ['id', 'server_id', 'ts', 'type', 'player'],
    player_totals: ['server_id', 'player', 'total_ms', 'last_seen', 'days_json'],
    server_runs: ['server_id', 'started_at', 'stopped_at', 'total_ms', 'current_session_start'],
    analytics_events: ['id', 'payload', 'ts'],
    crashes: ['id', 'type', 'message', 'stack', 'app_version', 'platform', 'os_version', 'ts']
  }
  const backupFile = dbPath() + '.import-backup'
  database.pragma('wal_checkpoint(TRUNCATE)')
  database.close()
  db = null
  fs.copyFileSync(dbPath(), backupFile)
  db = new Database(dbPath())
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  try {
    db.transaction(() => {
      for (const table of tables) db.prepare(`DELETE FROM ${table}`).run()
      for (const table of tables) {
        const rows = Array.isArray(payload[table]) ? payload[table] : []
        if (rows.length === 0) continue
        const columns = Object.keys(rows[0]).filter(c => columnsByTable[table].includes(c))
        if (columns.length === 0) continue
        const sql = `INSERT INTO ${table}(${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
        const insert = db.prepare(sql)
        for (const row of rows) insert.run(...columns.map(c => row[c] === undefined ? null : row[c]))
      }
    })()
    fs.unlinkSync(backupFile)
  } catch (err) {
    db.close()
    db = null
    fs.copyFileSync(backupFile, dbPath())
    fs.unlinkSync(backupFile)
    db = new Database(dbPath())
    db.pragma('journal_mode = WAL')
    throw err
  }
}

module.exports = {
  initDb, getDb, closeDb, metaGet, metaSet, dbPath, exportAll, importAll, resetDbForTests, SCHEMA_VERSION
}
