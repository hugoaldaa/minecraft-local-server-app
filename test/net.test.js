const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('net')
const { DEFAULT_PORT, parseServerPort, isPortInUse } = require('../main/net')

test('parseServerPort usa el puerto por defecto cuando falta o es inválido', () => {
  assert.equal(parseServerPort(null), DEFAULT_PORT)
  assert.equal(parseServerPort({}), DEFAULT_PORT)
  assert.equal(parseServerPort({ 'server-port': '' }), DEFAULT_PORT)
  assert.equal(parseServerPort({ 'server-port': 'abc' }), DEFAULT_PORT)
  assert.equal(parseServerPort({ 'server-port': '0' }), DEFAULT_PORT)
  assert.equal(parseServerPort({ 'server-port': '70000' }), DEFAULT_PORT)
})

test('parseServerPort respeta puertos válidos', () => {
  assert.equal(parseServerPort({ 'server-port': '25565' }), 25565)
  assert.equal(parseServerPort({ 'server-port': ' 25566 ' }), 25566)
  assert.equal(parseServerPort({ 'server-port': '1' }), 1)
  assert.equal(parseServerPort({ 'server-port': '65535' }), 65535)
})

test('isPortInUse detecta un puerto ocupado y libre', async () => {
  const listener = net.createServer()
  await new Promise((resolve) => listener.listen(0, '0.0.0.0', resolve))
  const port = listener.address().port
  assert.equal(await isPortInUse(port), true)
  await new Promise((resolve) => listener.close(resolve))
  assert.equal(await isPortInUse(port), false)
})
