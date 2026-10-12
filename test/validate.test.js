const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const {
  isStr, isIntInRange, isValidColor, cleanText, isValidJavaPath, isInsideDir, splitArgs
} = require('../main/validate')

test('isStr rechaza vacíos, no strings y NUL', () => {
  assert.equal(isStr(''), false)
  assert.equal(isStr('a'), true)
  assert.equal(isStr('a\u0000b'), false)
  assert.equal(isStr(5), false)
  assert.equal(isStr(null), false)
})

test('isIntInRange recorta y aplica fallback', () => {
  assert.equal(isIntInRange(10, 20, 30, 25), 20) // por debajo → mínimo
  assert.equal(isIntInRange('abc', 20, 30, 25), 25) // no numérico → fallback
  assert.equal(isIntInRange(5, 20, 30, 25), 20) // por debajo → mínimo
  assert.equal(isIntInRange(50, 20, 30, 25), 30) // por encima → máximo
  assert.equal(isIntInRange(22, 20, 30, 25), 22)
})

test('isValidColor acepta hex cortos y largos', () => {
  assert.equal(isValidColor('#4ade80'), true)
  assert.equal(isValidColor('#FFF'), true)
  assert.equal(isValidColor('#66ccffaa'), true)
  assert.equal(isValidColor('red'), false)
  assert.equal(isValidColor('#ggg'), false)
  assert.equal(isValidColor(''), false)
})

test('cleanText elimina control, recorta', () => {
  assert.equal(cleanText(' hola\u0001mundo ', 20), 'holamundo')
  assert.equal(cleanText('abcdefgh', 4), 'abcd')
  assert.equal(cleanText(123, 10), '')
})

test('isValidJavaPath distingue comando, ruta absoluta y relativa', () => {
  assert.equal(isValidJavaPath(''), true)
  assert.equal(isValidJavaPath(null), true)
  assert.equal(isValidJavaPath('java'), true)
  assert.equal(isValidJavaPath('java.exe'), true)
  assert.equal(isValidJavaPath('bin/java'), false) // relativa con separador
  const abs = path.resolve('java')
  assert.equal(isValidJavaPath(abs), true) // absoluta
})

test('isInsideDir evita escapes fuera del padre', () => {
  assert.equal(isInsideDir(path.resolve('a/b'), path.resolve('a')), true)
  assert.equal(isInsideDir(path.resolve('a'), path.resolve('a')), true) // el propio padre
  assert.equal(isInsideDir(path.resolve('a/c'), path.resolve('a/b')), false)
  assert.equal(isInsideDir(path.resolve('a/../b'), path.resolve('a')), false)
})

test('splitArgs respeta comillas y quita espacios sobrantes', () => {
  assert.deepEqual(splitArgs('-Xmx2G -Dfoo="bar baz" "C:/My Servers/one"'), ['-Xmx2G', '-Dfoo=bar baz', 'C:/My Servers/one'])
  assert.deepEqual(splitArgs("-Dflag='with space' -Dp"), ['-Dflag=with space', '-Dp'])
  assert.deepEqual(splitArgs(''), [])
  assert.deepEqual(splitArgs('   '), [])
  assert.deepEqual(splitArgs('-Dempty=""'), ['-Dempty='])
  assert.deepEqual(splitArgs(undefined), [])
})