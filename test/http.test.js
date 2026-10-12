const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const http = require('../main/http')

test('la capa HTTP expone las funciones esperadas', () => {
  for (const fn of ['getWithRedirects', 'fetchText', 'fetchJson', 'sha256File', 'downloadToFile']) {
    assert.equal(typeof http[fn], 'function', `${fn} debería ser una función`)
  }
  assert.equal(typeof http.USER_AGENT, 'string')
})

test('sha256File calcula el hash de un fichero temporal', async () => {
  const file = path.join(os.tmpdir(), `mlsa-http-${Date.now()}.txt`)
  fs.writeFileSync(file, 'hola')
  try {
    const hex = await http.sha256File(file)
    assert.equal(hex, crypto.createHash('sha256').update('hola').digest('hex'))
  } finally {
    fs.rmSync(file, { force: true })
  }
})
