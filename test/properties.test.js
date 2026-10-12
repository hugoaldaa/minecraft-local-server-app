const { test } = require('node:test')
const assert = require('node:assert/strict')
const { offlineUuid, sanitizeList } = require('../main/properties')

test('offlineUuid usa vectores conocidos de Minecraft', () => {
  // Algoritmo nameUUIDFromBytes("OfflinePlayer:<nombre>") con MD5
  assert.equal(offlineUuid('Notch'), 'b50ad385-829d-a141-a216-7e7d7539ba7f')
  assert.equal(offlineUuid('Steve'), '5627dd98-e6be-bc21-f8a8-e92344183641')
  assert.equal(offlineUuid('Herobrine'), '25966168-dc9c-060c-cf32-ed022bfa1070')
})

test('offlineUuid es determinista', () => {
  assert.equal(offlineUuid('alex'), offlineUuid('alex'))
})

test('sanitizeList rellena uuid vacío con el offline del nombre', () => {
  const out = sanitizeList([{ name: 'Steve', uuid: '' }])
  assert.deepEqual(out, [{ name: 'Steve', uuid: '5627dd98-e6be-bc21-f8a8-e92344183641' }])
})

test('sanitizeList conserva uuid existente y limpia control', () => {
  const out = sanitizeList([{ name: 'A\u0001B', uuid: 'uuid-real' }])
  assert.deepEqual(out, [{ name: 'AB', uuid: 'uuid-real' }])
})

test('sanitizeList descarta entradas inválidas y no arrays', () => {
  assert.equal(sanitizeList('nope'), null)
  assert.deepEqual(sanitizeList([null, 42, { name: 'ok' }]), [{ name: 'ok', uuid: offlineUuid('ok') }])
})

test('sanitizeList limita el tamaño de la lista', () => {
  const big = Array.from({ length: 10001 }, (_, i) => ({ name: `p${i}`, uuid: `u${i}` }))
  assert.equal(sanitizeList(big), null)
  const ok = Array.from({ length: 10000 }, (_, i) => `p${i}`)
  assert.equal(sanitizeList(ok).length, 10000)
})