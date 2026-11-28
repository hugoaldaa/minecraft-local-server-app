const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { initDb, closeDb } = require('../../main/db')

let dir = null

// Prepara una BD SQLite aislada para los tests (nunca toca userData).
function setupTestDb(label) {
  if (dir) return dir
  dir = fs.mkdtempSync(path.join(os.tmpdir(), `mc-db-${label || 'test'}-`))
  process.env.MCLSM_TEST_DATA_DIR = dir
  initDb()
  return dir
}

function teardownTestDb() {
  closeDb()
  if (dir) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (_) {}
    dir = null
  }
}

module.exports = { setupTestDb, teardownTestDb }
