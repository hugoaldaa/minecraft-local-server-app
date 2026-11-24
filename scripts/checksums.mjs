#!/usr/bin/env node
// Fase 4: genera SHA256SUMS para los instaladores publicados en la release.
// Se usa tanto en local (`npm run checksums`) como en CI (por plataforma y
// combinando los ficheros parciales). Las sumas siguen el formato GNU de
// `sha256sum`, así que `sha256sum -c SHA256SUMS` funciona tal cual.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = path.join(ROOT, 'dist')

// Un único nombre de artefacto para Windows, AppImage y .deb: debe coincidir
// con `build.artifactName` de package.json y con los enlaces de la web.
const ARTIFACTS = [
  { platform: 'win', file: 'Minecraft-Local-Server-Manager.exe' },
  { platform: 'linux', file: 'Minecraft-Local-Server-Manager.AppImage' },
  { platform: 'linux', file: 'Minecraft-Local-Server-Manager.deb' }
]

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = fs.createReadStream(file)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

// Dos espacios entre hash y nombre: formato canónico de `sha256sum`.
export function formatChecksum(hash, filename) {
  return `${hash}  ${filename}`
}

async function entriesFor(dir, platform) {
  const entries = []
  for (const artifact of ARTIFACTS) {
    if (platform && artifact.platform !== platform) continue
    const full = path.join(dir, artifact.file)
    if (!fs.existsSync(full)) continue
    entries.push({ file: artifact.file, hash: await sha256File(full) })
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file))
}

export function renderChecksums(entries) {
  return entries.map(e => formatChecksum(e.hash, e.file)).join('\n') + '\n'
}

export async function generateChecksums({ dir = DIST_DIR, platform = null } = {}) {
  const entries = await entriesFor(dir, platform)
  if (!entries.length) throw new Error(`No hay artefactos de release en ${dir}`)
  const name = platform ? `SHA256SUMS-${platform}.txt` : 'SHA256SUMS'
  const out = path.join(dir, name)
  fs.writeFileSync(out, renderChecksums(entries), 'utf8')
  return { out, entries }
}

// Une los ficheros parciales subidos por cada job de la matriz en uno solo.
export function combineChecksums(dir = DIST_DIR) {
  const parts = fs.readdirSync(dir).filter(f => /^SHA256SUMS-(win|linux)\.txt$/.test(f)).sort()
  if (!parts.length) throw new Error(`No hay ficheros SHA256SUMS parciales en ${dir}`)
  const byFile = new Map()
  for (const part of parts) {
    for (const line of fs.readFileSync(path.join(dir, part), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([a-f0-9]{64})\s{2}(.+)$/)
      if (m) byFile.set(m[2], m[1])
    }
  }
  if (!byFile.size) throw new Error(`Los ficheros SHA256SUMS parciales de ${dir} están vacíos`)
  const entries = [...byFile].map(([file, hash]) => ({ file, hash })).sort((a, b) => a.file.localeCompare(b.file))
  const out = path.join(dir, 'SHA256SUMS')
  fs.writeFileSync(out, renderChecksums(entries), 'utf8')
  return { out, entries }
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--combine') {
    const dir = path.resolve(ROOT, args[1] || '.')
    const { out, entries } = combineChecksums(dir)
    console.log(`[checksums] ${path.relative(ROOT, out)}: ${entries.length} artefactos`)
    return
  }
  const platform = args[0] === '--platform' ? args[1] : null
  if (platform && !['win', 'linux'].includes(platform)) {
    console.error('[checksums] La plataforma debe ser win o linux')
    process.exit(1)
  }
  const { out, entries } = await generateChecksums({ platform })
  console.log(`[checksums] ${path.relative(ROOT, out)}: ${entries.map(e => e.file).join(', ')}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(`[checksums] ${err.message}`)
    process.exit(1)
  })
}
