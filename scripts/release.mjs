#!/usr/bin/env node
// Release flow: notas por secciones (Añadido/Corregido/Cambios/Otros), propuesta
// automática desde los commits pendientes, CHANGELOG limpio, versionado, tag
// anotado y publicación. Modos auxiliares para GitHub Actions.

import { execFileSync, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { stdin, stdout } from 'node:process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CHANGELOG_FILE = path.join(ROOT, 'CHANGELOG.md')
const BUILD_DIR = path.join(ROOT, 'build')
const NOTES_FILE = path.join(BUILD_DIR, 'release-notes.md')
const COMMIT_FILE = path.join(BUILD_DIR, 'release-commit.txt')
const TAG_FILE = path.join(BUILD_DIR, 'release-tag.txt')
const CHANGELOG_HEADER = '# Changelog'

export const SECTIONS = [
  { id: 'added', label: 'Añadido' },
  { id: 'fixed', label: 'Corregido' },
  { id: 'changed', label: 'Cambios' },
  { id: 'other', label: 'Otros' }
]

const SECTION_ALIASES = {
  añadido: 'added', agregado: 'added', added: 'added', nuevo: 'added', nuevos: 'added',
  corregido: 'fixed', corregidos: 'fixed', fixed: 'fixed', bugfix: 'fixed', arreglado: 'fixed',
  cambios: 'changed', changed: 'changed', mejoras: 'changed', mejorado: 'changed',
  otros: 'other', other: 'other'
}

const VERIFY_NOTE = '**Verificación:** el fichero `SHA256SUMS` de esta release contiene el SHA-256 de los instaladores.'

// ─── Helpers ────────────────────────────────────────────────────────────────

function git(args, opts = {}) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts }).trim()
}

function gitOr(args, fallback = '') {
  try {
    return git(args, { stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return fallback
  }
}

function readPkg() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
}

function bump(version, type) {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function today() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function stripVersionPrefix(text, version = '') {
  let out = String(text || '').trim()
  if (version) {
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`^v?${escaped}\\s*(?:[-–—:]\\s*)?`, 'i'), '')
  } else {
    out = out.replace(/^v?\d+\.\d+\.\d+\s*(?:[-–—:]\s*)?/i, '')
  }
  return out.replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '').trim()
}

// Elimina todas las viñetas iniciales: el CHANGELOG histórico tiene líneas
// mal formadas como "- - Tiempo jugado: ...".
export function stripBullet(line) {
  let out = String(line || '').trim()
  while (/^[-*]\s+/.test(out)) out = out.replace(/^[-*]\s+/, '').trim()
  return out
}

export function emptySections() {
  return { added: [], fixed: [], changed: [], other: [] }
}

function normalizeNotes(data) {
  const sections = emptySections()
  if (Array.isArray(data)) {
    sections.changed = data.map(stripBullet).filter(Boolean)
  } else if (data && data.sections) {
    for (const { id } of SECTIONS) sections[id] = (data.sections[id] || []).map(stripBullet).filter(Boolean)
  } else if (data && typeof data === 'object') {
    for (const { id } of SECTIONS) sections[id] = (data[id] || []).map(stripBullet).filter(Boolean)
  }
  for (const { id } of SECTIONS) sections[id] = [...new Set(sections[id])]
  return sections
}

function hasNotes(sections) {
  return SECTIONS.some(({ id }) => (sections[id] || []).length > 0)
}

// ─── Notas estructuradas ────────────────────────────────────────────────────

export function parseNotes(text, version = '') {
  const result = { title: '', name: '', sections: emptySections() }
  let current = 'changed'
  let foundTitle = false

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || /^---+$/.test(line)) continue

    const heading = line.match(/^#+\s*(.*)$/)
    if (heading) {
      const value = heading[1].trim()
      const section = SECTION_ALIASES[value.toLowerCase()]
      if (!foundTitle && !section) {
        result.title = value
        result.name = stripVersionPrefix(value, version)
        foundTitle = true
      } else {
        current = section || 'other'
      }
      continue
    }

    if (/^[-*]\s+/.test(line)) {
      const bullet = stripBullet(line)
      if (bullet) result.sections[current].push(bullet)
      continue
    }

    if (!foundTitle && !SECTION_ALIASES[line.toLowerCase()]) {
      result.title = line
      result.name = stripVersionPrefix(line, version)
      foundTitle = true
    }
    // El resto (p. ej. la nota de verificación) se ignora al volver a parsear.
  }
  return result
}

function renderSections(version, name, data, { footer, date = null } = {}) {
  const sections = normalizeNotes(data)
  const heading = `## v${version} - ${name}${date ? ` (${date})` : ''}`
  const lines = [heading, '']
  let count = 0
  for (const { id, label } of SECTIONS) {
    const items = sections[id]
    if (!items.length) continue
    count++
    lines.push(`### ${label}`, '', ...items.map(item => `- ${item}`), '')
  }
  if (!count) lines.push('- Sin descripción', '')
  if (footer) lines.push('---', '', VERIFY_NOTE, '')
  return lines.join('\n').trimEnd() + '\n'
}

export function notesMarkdown(version, name, data, { footer = true } = {}) {
  return renderSections(version, name, data, { footer })
}

export function changelogMarkdown(version, name, data, date = today()) {
  return renderSections(version, name, data, { footer: false, date })
}

function writeBuildFiles(version, name, data) {
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  const safeName = (name || '').trim() || 'Actualizaciones'
  const notes = notesMarkdown(version, safeName, data)
  const tagBody = notesMarkdown(version, safeName, data, { footer: false })
  fs.writeFileSync(NOTES_FILE, notes, 'utf8')
  return { title: `v${version} - ${safeName}`, notes, tagBody }
}

// ─── Propuesta desde commits ────────────────────────────────────────────────

export function classifyCommit(subject) {
  const text = String(subject || '').toLowerCase()
  if (/fix|bugfix|correg|arregl|solucion|hotfix|error/.test(text)) return 'fixed'
  if (/add|añad|agreg|nuev|implement|soporte|support|feature/.test(text)) return 'added'
  if (/camb|mejor|refactor|actualiz|update|remove|elimin|ajust|re-styl/.test(text)) return 'changed'
  return 'other'
}

export function proposeSections(subjects) {
  const sections = emptySections()
  for (const subject of subjects || []) {
    const clean = stripBullet(subject)
    if (clean) sections[classifyCommit(clean)].push(clean)
  }
  return sections
}

export function commitSubjects(since) {
  const range = since ? [`${since}..HEAD`] : []
  const subjects = gitOr(['log', '--no-merges', '--pretty=format:%s', ...range])
    .split('\n').map(s => s.trim()).filter(Boolean)
  return subjects.filter(s => !/^v?\d+\.\d+\.\d+$/.test(s))
}

// ─── CHANGELOG ──────────────────────────────────────────────────────────────

function canonicalHeading(heading) {
  const clean = heading.replace(/^##\s*/, '').trim()
  const m = clean.match(/^v?(\d+\.\d+\.\d+)\s*(?:[-–—:]\s*)?(.*?)\s*(\(\d{4}-\d{2}-\d{2}\))?$/)
  if (!m) return `## ${clean}`
  const [, version, name, date] = m
  return `## v${version}${name.trim() ? ` - ${name.trim()}` : ''}${date ? ` ${date}` : ''}`
}

// Normaliza el CHANGELOG histórico: viñetas planas, sin duplicados y cabeceras
// uniformes. No regenera el contenido a partir de commits, para no perder las
// descripciones ya escritas a mano.
export function cleanChangelog(file = CHANGELOG_FILE) {
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
  const lines = content.split('\n')
  const firstEntry = lines.findIndex(l => /^##\s+/.test(l))
  const preamble = (firstEntry === -1 ? lines : lines.slice(0, firstEntry)).join('\n').replace(/\s+$/, '')
  const entries = []
  let current = null
  const flush = () => { if (current) entries.push(current); current = null }

  for (const line of firstEntry === -1 ? [] : lines.slice(firstEntry)) {
    if (/^##\s+/.test(line)) {
      flush()
      current = { heading: canonicalHeading(line), bullets: [] }
      continue
    }
    if (!current) continue
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    if (!bullet) continue
    const text = stripBullet(bullet[1])
    if (text && !current.bullets.includes(text)) current.bullets.push(text)
  }
  flush()

  const blocks = [preamble]
  for (const entry of entries) {
    blocks.push([entry.heading, '', ...entry.bullets.map(b => `- ${b}`)].join('\n'))
  }
  fs.writeFileSync(file, blocks.join('\n\n').trimEnd() + '\n', 'utf8')
  return entries.length
}

function changelogSection(version, file = CHANGELOG_FILE) {
  if (!fs.existsSync(file)) return null
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  const idx = lines.findIndex(l => new RegExp(`^##\\s*v?${escaped}\\b`).test(l))
  if (idx === -1) return null
  const body = []
  for (const line of lines.slice(idx + 1)) {
    if (line.startsWith('## ')) break
    body.push(line)
  }
  const parsed = parseNotes([lines[idx], ...body].join('\n'), version)
  if (!parsed.name) return null
  return { name: parsed.name, sections: parsed.sections }
}

// ─── Modos auxiliares (CI) ──────────────────────────────────────────────────

function releaseInfoFromTag(tag) {
  const version = tag.replace(/^v/, '')
  let name = ''
  let sections = emptySections()
  if (gitOr(['cat-file', '-t', tag]) === 'tag') {
    const parsed = parseNotes(gitOr(['tag', '-l', tag, '--format=%(contents)']), version)
    name = parsed.name
    sections = parsed.sections
  }
  const section = changelogSection(version)
  if (!name && !section) return null
  if (!name) name = section.name
  if (!hasNotes(sections) && section) sections = section.sections
  return { version, name, sections }
}

function prepareNotes(tag) {
  const info = releaseInfoFromTag(tag)
  if (!info) {
    console.error(`[release] Sin nombre ni notas para ${tag} (tag sin anotacion y sin entrada en CHANGELOG.md).`)
    return null
  }
  writeBuildFiles(info.version, info.name, info.sections)
  console.log(`[release] Notas preparadas en ${path.relative(ROOT, NOTES_FILE)}`)
  return info
}

function runGh(args) {
  try {
    execFileSync('gh', args, { cwd: ROOT, stdio: 'inherit' })
    return true
  } catch {
    console.warn(`[release] No se pudo ejecutar "gh ${args.join(' ')}". Actualiza el titulo y las notas a mano en GitHub.`)
    return false
  }
}

function applyNotes(tag) {
  const info = prepareNotes(tag)
  if (!info) {
    console.log('[release] Usando notas generadas automaticamente por GitHub.')
    runGh(['release', 'edit', tag, '--generate-notes'])
    return
  }
  const { title } = writeBuildFiles(info.version, info.name, info.sections)
  if (runGh(['release', 'edit', tag, '--title', title, '--notes-file', NOTES_FILE])) {
    console.log(`[release] Release ${tag} actualizada: "${title}"`)
  }
}

function backfill() {
  const tags = git(['tag', '--sort=-creatordate']).split('\n').filter(Boolean)
  if (!tags.length) {
    console.log('[release] No hay tags que convertir.')
    return
  }
  const entries = []
  const ordered = [...tags].reverse()
  ordered.forEach((tag, i) => {
    const previous = ordered[i - 1]
    const range = previous ? [`${previous}..${tag}`] : [tag]
    const subjects = gitOr(['log', '--no-merges', '--pretty=format:%s', ...range])
      .split('\n').map(s => s.trim()).filter(Boolean)
      .filter(s => !/^v?\d+\.\d+\.\d+$/.test(s)).slice(0, 12)
    const date = git(['log', '-1', '--format=%ad', '--date=short', tag])
    const name = stripVersionPrefix(gitOr(['tag', '-l', tag, '--format=%(contents)']).split('\n')[0])
    const version = tag.replace(/^v/, '')
    entries.push(changelogMarkdown(version, name || 'Sin nombre', { other: subjects }, date))
  })
  fs.writeFileSync(CHANGELOG_FILE, `${CHANGELOG_HEADER}\n\n${entries.join('\n')}`, 'utf8')
  console.log(`[release] CHANGELOG.md generado con ${entries.length} releases.`)
}

// ─── Preflight ──────────────────────────────────────────────────────────────

function preflight(newVersion) {
  const dirty = gitOr(['status', '--porcelain'])
  if (dirty) {
    console.error('[release] El working tree tiene cambios sin commitear. Haz commit o stash antes de publicar:\n')
    console.error(dirty)
    process.exit(1)
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  const lastTag = gitOr(['describe', '--tags', '--abbrev=0'])
  execFileSync('git', ['fetch', '--tags', '--quiet'], { cwd: ROOT, stdio: 'ignore' })
  if (gitOr(['tag', '-l', `v${newVersion}`])) {
    console.error(`[release] El tag v${newVersion} ya existe.`)
    process.exit(1)
  }
  const upstream = gitOr(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  if (upstream) {
    const behind = Number(gitOr(['rev-list', '--count', `HEAD..${upstream}`], '0'))
    if (behind > 0) console.warn(`[release] Aviso: el remoto tiene ${behind} commit(s) que no tienes. Haz pull antes de publicar.`)
  }
  return { branch, lastTag }
}

// ─── Release interactiva ────────────────────────────────────────────────────

async function askSection(rl, label) {
  const items = []
  while (true) {
    const line = (await rl.question(`  ${label} (vacío para terminar): `)).trim()
    if (!line) break
    items.push(line)
  }
  return items
}

async function interactiveRelease(argv) {
  const dryRun = argv.includes('--dry-run')
  const push = !argv.includes('--no-push')
  const yes = argv.includes('--yes')
  const fromCommits = argv.includes('--from-commits')
  const argValue = flag => {
    const i = argv.indexOf(flag)
    return i === -1 ? null : argv[i + 1]
  }
  const splitList = value => (value || '').split(';').map(s => s.trim()).filter(Boolean)
  const presetType = argv.find(a => ['patch', 'minor', 'major'].includes(a))
  const presetName = argValue('--name')
  const presetSections = {
    added: splitList(argValue('--added')),
    fixed: splitList(argValue('--fixed')),
    changed: splitList(argValue('--changed')),
    other: splitList(argValue('--other'))
  }
  // --notes sigue funcionando: se considera parte de "Cambios".
  presetSections.changed.push(...splitList(argValue('--notes')))
  const hasPresetSections = hasNotes(presetSections)
  const scripted = !!presetType && !!presetName && (hasPresetSections || fromCommits)

  const pkg = readPkg()
  const currentVersion = pkg.version
  const lastTag = gitOr(['describe', '--tags', '--abbrev=0'], `v${currentVersion}`)
  const pending = commitSubjects(lastTag)

  console.log(`\nRelease actual: v${currentVersion}  (ultimo tag: ${lastTag})`)
  if (pending.length) {
    const proposed = proposeSections(pending)
    console.log(`\nCommits pendientes (${pending.length}), propuesta automática:`)
    for (const { id, label } of SECTIONS) {
      for (const item of proposed[id]) console.log(`  [${label}] ${item}`)
    }
  } else {
    console.log('\nNo hay commits nuevos desde el ultimo tag.')
  }

  if (!stdin.isTTY && !scripted) {
    console.error('\n[release] Se necesita una terminal interactiva para pedir nombre y notas.')
    console.error('[release] Alternativa: npm run release -- patch --name "Titulo" --added "cambio 1;cambio 2" --yes')
    process.exit(1)
  }
  const rl = readline.createInterface({ input: stdin, output: stdout })

  try {
    let type = presetType
    while (!type) {
      const answer = (await rl.question(`\nTipo de release [patch/minor/major] (patch): `)).trim().toLowerCase()
      type = ['patch', 'minor', 'major'].includes(answer) ? answer : 'patch'
    }
    const newVersion = bump(currentVersion, type)

    let name = presetName
    while (!name) {
      name = (await rl.question(`\nNombre de la release v${newVersion} (p. ej. "Backups automaticos"): `)).trim()
      if (!name) console.log('  El nombre es obligatorio.')
    }

    let sections = hasPresetSections ? normalizeNotes(presetSections) : emptySections()
    if (fromCommits && !hasPresetSections) sections = proposeSections(pending)

    if (!hasNotes(sections) && stdin.isTTY) {
      let useProposed = false
      if (pending.length) {
        const answer = (await rl.question('\n¿Usar la propuesta de commits como notas? (s/N): ')).trim().toLowerCase()
        useProposed = ['s', 'si', 'y'].includes(answer)
      }
      if (useProposed) {
        sections = proposeSections(pending)
      } else {
        console.log('\nEscribe las notas por sección:')
        for (const { id, label } of SECTIONS) sections[id] = await askSection(rl, label)
      }
    }
    if (!hasNotes(sections)) {
      console.error('[release] No hay notas: escribe al menos un cambio o usa --from-commits.')
      return
    }

    const { title, notes, tagBody } = writeBuildFiles(newVersion, name, sections)
    fs.writeFileSync(COMMIT_FILE, tagBody, 'utf8')
    fs.writeFileSync(TAG_FILE, tagBody, 'utf8')

    const changelogEntry = changelogMarkdown(newVersion, name, sections)

    console.log('\n── Vista previa ─────────────────────────────────────────')
    console.log(`Titulo:   ${title}`)
    console.log(`Tipo:     ${type}  (${currentVersion} -> ${newVersion})`)
    console.log(`Notas (tal como se verán en GitHub y en la app):\n${notes.split('\n').map(l => '  ' + l).join('\n')}`)
    console.log(`\nCHANGELOG.md:\n${changelogEntry.split('\n').map(l => '  ' + l).join('\n')}`)
    console.log(`Commit:   ${title}`)
    console.log(`Tag:      anotado v${newVersion} con nombre y notas por secciones`)
    console.log(`Push:     ${push ? `origin HEAD y origin v${newVersion}` : 'NO (--no-push)'}`)
    console.log('─────────────────────────────────────────────────────────\n')

    let confirm = ''
    if (yes) confirm = 's'
    else if (stdin.isTTY) confirm = (await rl.question('\nPublicar esta release? (s/N): ')).trim().toLowerCase()
    if (!['s', 'si', 'y'].includes(confirm)) {
      console.log('[release] Cancelado. No se ha modificado nada.')
      return
    }

    if (dryRun) {
      console.log('[release] --dry-run: no se ejecuta ningun comando de git.')
      return
    }

    preflight(newVersion)
    execSync(`npm version ${type} --no-git-tag-version`, { cwd: ROOT, stdio: 'inherit' })
    insertChangelogEntry(changelogEntry)
    git(['add', 'CHANGELOG.md', 'package.json', 'package-lock.json'])
    git(['commit', '-F', COMMIT_FILE])
    git(['tag', '-a', `v${newVersion}`, '--cleanup=verbatim', '-F', TAG_FILE])
    if (push) {
      git(['push', 'origin', 'HEAD'])
      git(['push', 'origin', `v${newVersion}`])
    }

    const remote = gitOr(['remote', 'get-url', 'origin'])
    const repo = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)
    console.log(`\n[release] ${title} ${push ? 'publicada' : 'preparada (sin push)'}.`)
    if (repo) console.log(`[release] Notas de la release: https://github.com/${repo[1]}/releases/tag/v${newVersion}`)
    console.log('[release] CI compilara el .exe y pondra el nombre y las notas en la release de GitHub.')
  } finally {
    rl.close()
  }
}

function insertChangelogEntry(entry) {
  let content = fs.existsSync(CHANGELOG_FILE) ? fs.readFileSync(CHANGELOG_FILE, 'utf8') : ''
  if (!content.trim()) content = `${CHANGELOG_HEADER}\n`
  if (!content.startsWith(CHANGELOG_HEADER)) content = `${CHANGELOG_HEADER}\n\n${content.replace(/^\s+/, '')}`
  const lines = content.replace(/\s+$/, '').split('\n')
  const firstEntry = lines.findIndex(l => l.startsWith('## '))
  const before = firstEntry === -1 ? lines : lines.slice(0, firstEntry)
  const after = firstEntry === -1 ? [] : lines.slice(firstEntry)
  while (before.length && before[before.length - 1] === '') before.pop()
  while (after.length && !after[0].trim()) after.shift()
  fs.writeFileSync(CHANGELOG_FILE, [...before, '', entry.trim(), '', ...after, ''].join('\n'), 'utf8')
}

// ─── Entrada ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const modeIndex = args.findIndex(a => a.startsWith('--'))
  const mode = modeIndex === -1 ? null : args[modeIndex]
  const tag = modeIndex === -1 ? null : args[modeIndex + 1]

  if (mode === '--prepare-notes') {
    if (!tag) { console.error('Uso: node scripts/release.mjs --prepare-notes <tag>'); process.exit(1) }
    prepareNotes(tag)
  } else if (mode === '--apply-notes') {
    if (!tag) { console.error('Uso: node scripts/release.mjs --apply-notes <tag>'); process.exit(1) }
    applyNotes(tag)
  } else if (mode === '--backfill') {
    backfill()
  } else if (mode === '--clean-changelog') {
    console.log(`[release] CHANGELOG.md normalizado (${cleanChangelog()} versiones).`)
  } else {
    await interactiveRelease(args)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main().catch(err => { console.error(`[release] ${err.message}`); process.exit(1) })
