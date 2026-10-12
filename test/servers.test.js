const { test } = require('node:test')
const assert = require('node:assert/strict')
const { classifyLine } = require('../main/servers')

test('classifyLine clasifica avisos, errores y jugadores', () => {
  assert.equal(classifyLine('[Server thread/WARN]: Ownership is over'), 'warn')
  assert.equal(classifyLine('[Server thread/ERROR]: Exception during world load'), 'error')
  assert.equal(classifyLine('java.lang.NullPointerException at ...'), 'error')
  assert.equal(classifyLine('Steve joined the game'), 'player')
  assert.equal(classifyLine('Steve left the game'), 'player')
  assert.equal(classifyLine('Done (11.2s)! For help, type "help"'), 'success')
  assert.equal(classifyLine('Starting minecraft server version 1.20'), 'info')
})