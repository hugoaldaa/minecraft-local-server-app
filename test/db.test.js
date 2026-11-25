const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const dbModule = require('../main/db')

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mc-db-migration-'))
}

test('migra los 5 JSON legacy a SQLite y los elimina tras verificar', () => {
  const dir = tempDir()
  const oldEnv = process.env.MCLSM_TEST_DATA_DIR
  try {
    process.env.MCLSM_TEST_DATA_DIR = dir
    dbModule.resetDbForTests()
    const server = { id: 'srv-1', name: 'Mundo', jarPath: 'D:\\mc\\server.jar', createdAt: 1234 }
    fs.writeFileSync(path.join(dir, 'servers.json'), JSON.stringify({ servers: { 'srv-1': server } }))
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'light', server_srv1: { autoBackup: true } }))
    fs.writeFileSync(path.join(dir, 'serverStats.json'), JSON.stringify({
      samples_srv1: [{ ts: 1000, cpu: 10, ramUsed: 512 }],
      playerEvents_srv1: [{ ts: 1000, type: 'join', player: 'Steve' }],
      playerTotals_srv1: { Steve: { totalMs: 60000, days: { '2026-01-01': 60000 } } },
      run_srv1: { startedAt: 1000, totalMs: 60000 }
    }))
    fs.writeFileSync(path.join(dir, 'analytics.json'), JSON.stringify({
      installId: 'abc', events: [{ event: 'app_launch', timestamp: 1000 }]
    }))
    fs.writeFileSync(path.join(dir, 'crashes.json'), JSON.stringify({
      crashes: [{ id: 'c1', type: 'test', message: 'boom', timestamp: 1000 }],
      lastCrash: { id: 'c1', message: 'boom' }
    }))

    const db = dbModule.initDb()
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM servers').get().n, 1)
    assert.equal(db.prepare('SELECT data FROM servers WHERE id = ?').get('srv-1').data, JSON.stringify(server))
    assert.equal(db.prepare('SELECT value FROM settings WHERE key = ?').get('theme').value, '"light"')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM samples').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_events').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM player_totals').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM server_runs').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM crashes').get().n, 1)
    assert.equal(dbModule.metaGet('installId'), 'abc')
    assert.equal(dbModule.metaGet('schemaVersion'), dbModule.SCHEMA_VERSION)
    assert.ok(fs.existsSync(path.join(dir, 'app.db.bak')), 'debe quedar copia SQLite de seguridad')
    for (const name of ['servers', 'settings', 'serverStats', 'analytics', 'crashes']) {
      assert.equal(fs.existsSync(path.join(dir, `${name}.json`)), false, `${name}.json debe borrarse`)
    }
  } finally {
    dbModule.resetDbForTests()
    if (oldEnv === undefined) delete process.env.MCLSM_TEST_DATA_DIR
    else process.env.MCLSM_TEST_DATA_DIR = oldEnv
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('exportAll e importAll conservan los datos y rechazan formatos ajenos', () => {
  const dir = tempDir()
  const oldEnv = process.env.MCLSM_TEST_DATA_DIR
  try {
    process.env.MCLSM_TEST_DATA_DIR = dir
    dbModule.resetDbForTests()
    const db = dbModule.initDb()
    db.prepare('INSERT INTO servers(id, data, created_at) VALUES (?, ?, ?)').run('a', '{"name":"A"}', 1)
    db.prepare('INSERT INTO samples(server_id, ts, cpu, ram_used_mb) VALUES (?, ?, ?, ?)').run('a', 1000, 5, 128)
    const dump = dbModule.exportAll()
    assert.equal(dump.format, 'minecraft-local-server-app')
    assert.equal(dump.servers.length, 1)
    assert.equal(dump.samples.length, 1)

    db.prepare('DELETE FROM servers').run()
    db.prepare('DELETE FROM samples').run()
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM servers').get().n, 0)

    assert.throws(() => dbModule.importAll({ format: 'otro', schemaVersion: 1 }), /no compatible/)
    dbModule.importAll(dump)
    const reopened = dbModule.getDb()
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM servers').get().n, 1)
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM samples').get().n, 1)
    assert.equal(fs.existsSync(path.join(dir, 'app.db.import-backup')), false)
  } finally {
    dbModule.resetDbForTests()
    if (oldEnv === undefined) delete process.env.MCLSM_TEST_DATA_DIR
    else process.env.MCLSM_TEST_DATA_DIR = oldEnv
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('si la migración falla, descarta la BD y conserva los JSON intactos', () => {
  const dir = tempDir()
  const oldEnv = process.env.MCLSM_TEST_DATA_DIR
  try {
    process.env.MCLSM_TEST_DATA_DIR = dir
    dbModule.resetDbForTests()
    const legacy = path.join(dir, 'serverStats.json')
    fs.writeFileSync(legacy, JSON.stringify({ samples_srv1: [{ cpu: 10, ramUsed: 128 }] }))

    assert.throws(() => dbModule.initDb(), /No se pudo migrar/)
    assert.equal(fs.existsSync(legacy), true, 'el JSON debe conservarse')
    assert.equal(fs.existsSync(path.join(dir, 'app.db')), false, 'no debe quedar una BD a medias')
  } finally {
    dbModule.resetDbForTests()
    if (oldEnv === undefined) delete process.env.MCLSM_TEST_DATA_DIR
    else process.env.MCLSM_TEST_DATA_DIR = oldEnv
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
