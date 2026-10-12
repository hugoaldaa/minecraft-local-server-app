const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// i18n.js es un script de navegador: se cargan sus dependencias y se captura
// MESSAGES desde window.I18N, tal y como lo hará en el renderer.
global.window = {}
global.document = { readyState: 'complete', addEventListener() {}, querySelectorAll() { return [] }, documentElement: {} }
global.navigator = { language: 'es' }
global.localStorage = { getItem() { return null }, setItem() {} }

require('../src/i18n')
const MESSAGES = global.window.I18N.MESSAGES
const es = MESSAGES.es
const en = MESSAGES.en

function usedKeys() {
  const keys = new Set()
  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer.js'), 'utf8')
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8')

  // T('clave') en el renderer
  for (const m of renderer.matchAll(/T\('([\w.]+)'/g)) { if (!m[1].endsWith('.')) keys.add(m[1]) }
  // Claves 'upd.*' literales que alimentan mapas dinámicos (UPDATE_STATE_KEYS…)
  for (const m of renderer.matchAll(/'(upd\.[\w.]+)'/g)) { if (!m[1].endsWith('.')) keys.add(m[1]) }
  // Construcción dinámica "upd.hint." + estado
  if (renderer.includes("'upd.hint.'")) {
    for (const s of ['available', 'downloading', 'ready', 'error']) keys.add(`upd.hint.${s}`)
  }
  // data-i18n* del HTML
  for (const m of html.matchAll(/data-i18n[a-z-]*="([\w.]+)"/g)) keys.add(m[1])
  return keys
}

const used = usedKeys()

test('es y en tienen exactamente las mismas claves', () => {
  const esKeys = Object.keys(es).sort()
  const enKeys = Object.keys(en).sort()
  assert.deepEqual(enKeys, esKeys)
})

test('toda clave usada existe en es y en en', () => {
  const missing = []
  for (const k of used) {
    if (es[k] === undefined || en[k] === undefined) missing.push(k)
  }
  assert.deepEqual(missing, [])
})

test('el conjunto de claves usadas no está vacío y cubre los nuevos estados', () => {
  assert.ok(used.size > 100)
  for (const k of ['status.external', 'status.externalHint', 'servers.externalNote']) assert.ok(used.has(k), `${k} debería usarse`)
})