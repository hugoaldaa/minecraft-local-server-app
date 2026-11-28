const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { diagnoseText, recentCrashReport } = require('../main/diagnose')

test('diagnoseText detecta Java incompatible', () => {
  const r = diagnoseText(
    'Exception in thread "main" java.lang.UnsupportedClassVersionError: net/minecraft/server/Main has been compiled by a more recent version'
  )
  assert.equal(r && r.id, 'java_version')
})

test('diagnoseText detecta puerto ocupado', () => {
  const r = diagnoseText(
    '[23:00:00] [Server thread/ERROR]: ****************************************\njava.net.BindException: Address already in use'
  )
  assert.equal(r && r.id, 'port_in_use')
})

test('diagnoseText detecta falta de memoria', () => {
  const r = diagnoseText('java.lang.OutOfMemoryError: Java heap space')
  assert.equal(r && r.id, 'out_of_memory')
})

test('diagnoseText detecta EULA pendiente', () => {
  const r = diagnoseText('You need to agree to the EULA in order to run the server')
  assert.equal(r && r.id, 'eula')
})

test('diagnoseText devuelve null con salida normal', () => {
  assert.equal(diagnoseText('[23:00:00] [Server thread/INFO]: Done (5.123s)! For help, type "help"'), null)
  assert.equal(diagnoseText(''), null)
  assert.equal(diagnoseText(null), null)
})

test('recentCrashReport devuelve el informe más reciente y respeta afterTs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-diag-'))
  const reports = path.join(dir, 'crash-reports')
  fs.mkdirSync(reports)
  const old = path.join(reports, 'crash-2026-01-01_00.00.00-server.txt')
  const recent = path.join(reports, 'crash-2026-11-23_00.00.00-server.txt')
  fs.writeFileSync(old, 'java.lang.OutOfMemoryError: old', 'utf8')
  fs.writeFileSync(recent, 'java.lang.UnsupportedClassVersionError: recent', 'utf8')
  fs.utimesSync(old, new Date('2026-01-01'), new Date('2026-01-01'))
  fs.utimesSync(recent, new Date('2026-11-23'), new Date('2026-11-23'))

  const after = new Date('2026-06-01').getTime()
  const text = recentCrashReport(dir, after)
  assert.match(text, /UnsupportedClassVersionError: recent/)
  assert.equal(recentCrashReport(dir, Date.now() + 10000), null)
  assert.equal(recentCrashReport(path.join(dir, 'no-existe'), 0), null)
})
