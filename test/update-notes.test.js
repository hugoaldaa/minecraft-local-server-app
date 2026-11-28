// Fase 4: el banner de actualización debe entender las notas con secciones y
// markdown inline sin ejecutar HTML (el texto viene de latest.yml/GitHub).
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const code = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'updates.js'), 'utf8')
const context = vm.createContext({})
vm.runInContext(code, context, { filename: 'src/renderer/updates.js' })

// Los objetos creados dentro de vm tienen otro realm: los comparamos por valor.
const plain = value => JSON.parse(JSON.stringify(value))

test('tokenizeInline separa enlaces, código, negritas y texto', () => {
  const tokens = plain(context.tokenizeInline('Ver **SHA256SUMS** en `latest.yml`: [ayuda](https://example.com/guia)'))
  assert.deepEqual(
    tokens.map(t => t.type),
    ['text', 'strong', 'text', 'code', 'text', 'link']
  )
  assert.equal(tokens[1].text, 'SHA256SUMS')
  assert.equal(tokens[3].text, 'latest.yml')
  assert.deepEqual(tokens[5], { type: 'link', text: 'ayuda', href: 'https://example.com/guia' })
})

test('parseUpdateNotes conserva título, secciones, listas y verificación', () => {
  const notes = [
    '## v1.10.0 - Mejoras de release',
    '',
    '### Añadido',
    '',
    '- Gestor de mods',
    '- **Notificaciones** configurables',
    '',
    '### Corregido',
    '',
    '- Arreglo del puerto',
    '',
    '---',
    '',
    '**Verificación:** usa `SHA256SUMS` de esta release.'
  ].join('\n')
  const blocks = plain(context.parseUpdateNotes(notes))
  assert.deepEqual(blocks[0], { type: 'title', text: 'v1.10.0 - Mejoras de release' })
  assert.deepEqual(blocks[1], { type: 'section', text: 'Añadido' })
  assert.deepEqual(blocks[2], { type: 'list', items: ['Gestor de mods', '**Notificaciones** configurables'] })
  assert.deepEqual(blocks[3], { type: 'section', text: 'Corregido' })
  assert.deepEqual(blocks[4], { type: 'list', items: ['Arreglo del puerto'] })
  assert.deepEqual(blocks[5], { type: 'rule' })
  assert.deepEqual(blocks[6], { type: 'text', text: '**Verificación:** usa `SHA256SUMS` de esta release.' })
})

test('parseUpdateNotes admite el array que devuelve electron-updater', () => {
  const blocks = plain(context.parseUpdateNotes([{ version: '1.9.7', note: '## v1.9.7\n\n- Fix' }]))
  assert.equal(blocks[0].type, 'title')
  assert.deepEqual(blocks[1], { type: 'list', items: ['Fix'] })
  assert.deepEqual(plain(context.parseUpdateNotes('')), [])
})
