// Fase 4: las notas de release deben conservar sus secciones desde el tag
// anotado/CHANGELOG hasta GitHub y el banner de actualización de la app.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const releasePromise = import('../scripts/release.mjs')

test('parseNotes acepta el formato plano histórico y limpia viñetas anidadas', async () => {
  const { parseNotes } = await releasePromise
  const parsed = parseNotes('v1.9.5 - Statistics patch\n\n- Cambio uno\n- - Subpunto mal formado', '1.9.5')
  assert.equal(parsed.name, 'Statistics patch')
  assert.deepEqual(parsed.sections.changed, ['Cambio uno', 'Subpunto mal formado'])
  assert.deepEqual(parsed.sections.added, [])
})

test('parseNotes reconoce las secciones de las notas nuevas', async () => {
  const { parseNotes } = await releasePromise
  const notes = [
    '## v1.10.0 - Mejoras de release (2026-11-24)',
    '',
    '### Añadido',
    '',
    '- Gestor de mods',
    '',
    '### Corregido',
    '',
    '- Arreglo del puerto',
    '',
    '---',
    '',
    '**Verificación:** el fichero `SHA256SUMS` de esta release contiene el SHA-256 de los instaladores.'
  ].join('\n')
  const parsed = parseNotes(notes, '1.10.0')
  assert.equal(parsed.name, 'Mejoras de release')
  assert.deepEqual(parsed.sections.added, ['Gestor de mods'])
  assert.deepEqual(parsed.sections.fixed, ['Arreglo del puerto'])
  assert.deepEqual(parsed.sections.changed, [])
  assert.deepEqual(parsed.sections.other, [])
})

test('notesMarkdown genera secciones, omite las vacías y añade la verificación', async () => {
  const { notesMarkdown } = await releasePromise
  const data = { added: ['Nueva opción'], fixed: [], changed: ['Ajuste visual'], other: [] }
  const notes = notesMarkdown('1.10.0', 'Mejoras', data)
  assert.match(notes, /^## v1\.10\.0 - Mejoras\n/)
  assert.match(notes, /### Añadido\n\n- Nueva opción/)
  assert.equal(notes.includes('### Corregido'), false)
  assert.match(notes, /### Cambios\n\n- Ajuste visual/)
  assert.match(notes, /SHA256SUMS/)

  const tagBody = notesMarkdown('1.10.0', 'Mejoras', data, { footer: false })
  assert.equal(tagBody.includes('SHA256SUMS'), false)
  assert.equal(tagBody.includes('### Añadido'), true)
})

test('changelogMarkdown usa cabecera con fecha y sin pie de verificación', async () => {
  const { changelogMarkdown } = await releasePromise
  const entry = changelogMarkdown('1.10.0', 'Mejoras', { fixed: ['Fix'] }, '2026-11-24')
  assert.match(entry, /^## v1\.10\.0 - Mejoras \(2026-11-24\)/)
  assert.equal(entry.includes('SHA256SUMS'), false)
})

test('classifyCommit y proposeSections agrupan los commits por tipo', async () => {
  const { classifyCommit, proposeSections } = await releasePromise
  assert.equal(classifyCommit('fix: puerto ocupado'), 'fixed')
  assert.equal(classifyCommit('Añadir gestor de mods'), 'added')
  assert.equal(classifyCommit('Actualizar Electron'), 'changed')
  assert.equal(classifyCommit('Revisar documentación interna'), 'other')
  const grouped = proposeSections(['fix: crash', 'Añadir backup', 'Miscelánea'])
  assert.deepEqual(grouped.fixed, ['fix: crash'])
  assert.deepEqual(grouped.added, ['Añadir backup'])
  assert.deepEqual(grouped.other, ['Miscelánea'])
})

test('cleanChangelog normaliza cabeceras y viñetas sin perder contenido', async () => {
  const { cleanChangelog } = await releasePromise
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-changelog-'))
  const file = path.join(dir, 'CHANGELOG.md')
  fs.writeFileSync(file, [
    '# Changelog',
    '',
    'Historial del proyecto.',
    '',
    '## v1.9.7 - Statistics patch v3 (2026-11-10)',
    '',
    '- Statistics patch v3',
    '',
    '## 1.9.6 - Fix cosa (2026-11-09)',
    '',
    '- - arreglo uno',
    '- arreglo uno',
    '- otra cosa'
  ].join('\n'), 'utf8')

  try {
    const count = cleanChangelog(file)
    assert.equal(count, 2)
    const out = fs.readFileSync(file, 'utf8')
    assert.match(out, /## v1\.9\.7 - Statistics patch v3 \(2026-11-10\)/)
    assert.match(out, /## v1\.9\.6 - Fix cosa \(2026-11-09\)/)
    assert.equal(out.includes('- - '), false)
    assert.equal(out.split('- arreglo uno').length - 1, 1, 'no debe duplicar viñetas')
    assert.match(out, /- otra cosa/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
