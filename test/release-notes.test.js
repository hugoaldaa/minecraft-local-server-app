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

test('bilingualNotesMarkdown intercala cada sección en español e inglés', async () => {
  const { bilingualNotesMarkdown } = await releasePromise
  const es = { added: ['Migración a SQLite'], fixed: [], changed: ['Actualizar Electron'], other: [] }
  const en = { added: ['SQLite migration'], changed: ['Update Electron'] }
  const notes = bilingualNotesMarkdown('2.3.0', 'Migración', es, en)
  assert.match(notes, /^## v2\.3\.0 - Migración\n/)
  assert.match(notes, /### Añadido\n\n- Migración a SQLite\n\n### Added\n\n- SQLite migration/)
  assert.match(notes, /### Cambios\n\n- Actualizar Electron\n\n### Changed\n\n- Update Electron/)
  assert.equal(notes.includes('### Corregido'), false)
  assert.match(notes, /\*\*Verificación:\*\*[\s\S]*\*\*Verification:\*\*/)

  const tagBody = bilingualNotesMarkdown('2.3.0', 'Migración', es, en, { footer: false })
  assert.equal(tagBody.includes('SHA256SUMS'), false)
})

test('translationRequest y parseTranslation conservan el orden de las viñetas', async () => {
  const { translationRequest, parseTranslation } = await releasePromise
  const request = translationRequest({ added: ['Uno', 'Dos'], changed: ['Tres'] })
  assert.deepEqual(request.items, ['Uno', 'Dos', 'Tres'])
  assert.equal(JSON.parse(request.user).items.length, 3)
  assert.match(request.system, /SQLite/)
  assert.throws(() => parseTranslation('{"items":["One","Two"]}', request.items), /conserva el número/)
  assert.deepEqual(parseTranslation('{"items":["One","Two","Three"]}', request.items), ['One', 'Two', 'Three'])
})

test('translateSections traduce las viñetas con Gemini y reconstruye las secciones', async () => {
  const { translateSections } = await releasePromise
  const originalFetch = globalThis.fetch
  const originalKey = process.env.GEMINI_API_KEY
  let captured = null
  globalThis.fetch = async (url, options) => {
    captured = { url, options }
    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: { parts: [{ text: JSON.stringify({ items: ['Added one', 'Fixed one'] }) }] }
          }
        ]
      })
    }
  }
  process.env.GEMINI_API_KEY = 'test-key'
  try {
    const out = await translateSections({ added: ['Añadir uno'], fixed: ['Arreglar uno'] })
    assert.deepEqual(out, { added: ['Added one'], fixed: ['Fixed one'], changed: [], other: [] })
    assert.match(captured.url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash-lite:generateContent$/)
    assert.equal(captured.options.headers['x-goog-api-key'], 'test-key')
    const body = JSON.parse(captured.options.body)
    assert.equal(body.generationConfig.responseMimeType, 'application/json')
    assert.match(body.systemInstruction.parts[0].text, /Spanish to English/)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
  }
})

test('translateSections falla con claridad si no hay GEMINI_API_KEY', async () => {
  const { translateSections } = await releasePromise
  const originalKey = process.env.GEMINI_API_KEY
  delete process.env.GEMINI_API_KEY
  try {
    await assert.rejects(() => translateSections({ added: ['Cambio'] }), /GEMINI_API_KEY/)
  } finally {
    if (originalKey !== undefined) process.env.GEMINI_API_KEY = originalKey
  }
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
  fs.writeFileSync(
    file,
    [
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
    ].join('\n'),
    'utf8'
  )

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
