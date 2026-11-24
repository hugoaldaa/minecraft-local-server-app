// Fase 4: el fichero SHA256SUMS debe ser verificable con `sha256sum -c`.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const checksumsPromise = import('../scripts/checksums.mjs')

function hashOf(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

test('formatChecksum usa el formato de dos espacios de sha256sum', async () => {
  const { formatChecksum } = await checksumsPromise
  assert.equal(formatChecksum('a'.repeat(64), 'App.exe'), `${'a'.repeat(64)}  App.exe`)
})

test('generateChecksums calcula el hash real y filtra por plataforma', async () => {
  const { generateChecksums } = await checksumsPromise
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sums-'))
  const exe = 'Minecraft-Local-Server-Manager.exe'
  const appimage = 'Minecraft-Local-Server-Manager.AppImage'
  fs.writeFileSync(path.join(dir, exe), 'instalador', 'utf8')
  fs.writeFileSync(path.join(dir, appimage), 'appimage', 'utf8')
  // Un archivo auxiliar no debe acabar en SHA256SUMS.
  fs.writeFileSync(path.join(dir, 'latest.yml'), 'version: 1.2.3\n', 'utf8')

  try {
    const win = await generateChecksums({ dir, platform: 'win' })
    assert.deepEqual(win.entries, [{ file: exe, hash: hashOf('instalador') }])
    assert.match(win.out, /SHA256SUMS-win\.txt$/)
    assert.equal(fs.readFileSync(win.out, 'utf8'), `${hashOf('instalador')}  ${exe}\n`)

    const all = await generateChecksums({ dir })
    assert.deepEqual(all.entries.map(e => e.file), [appimage, exe])
    assert.equal(fs.readFileSync(all.out, 'utf8'),
      `${hashOf('appimage')}  ${appimage}\n${hashOf('instalador')}  ${exe}\n`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('combineChecksums une los parciales sin duplicados y ordenado', async () => {
  const { combineChecksums } = await checksumsPromise
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sums-'))
  const exe = 'Minecraft-Local-Server-Manager.exe'
  const deb = 'Minecraft-Local-Server-Manager.deb'
  fs.writeFileSync(path.join(dir, 'SHA256SUMS-win.txt'), `${hashOf('exe')}  ${exe}\n`)
  fs.writeFileSync(path.join(dir, 'SHA256SUMS-linux.txt'), `${hashOf('deb')}  ${deb}\n`)
  try {
    const { entries } = combineChecksums(dir)
    assert.deepEqual(entries.map(e => e.file), [deb, exe])
    assert.equal(fs.readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8'),
      `${hashOf('deb')}  ${deb}\n${hashOf('exe')}  ${exe}\n`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('generateChecksums falla con claridad si no hay artefactos', async () => {
  const { generateChecksums } = await checksumsPromise
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sums-'))
  try {
    await assert.rejects(() => generateChecksums({ dir }), /No hay artefactos/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
