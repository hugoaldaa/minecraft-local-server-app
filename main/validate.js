// Validación de payloads y rutas que llegan desde el renderer.
// Toda operación de FS/proc sobre rutas del renderer pasa por aquí.
const path = require('path')
const { getAllServersMap, getServerSettings, getGlobalBackupDir } = require('./stores')

const pickedBackupDirs = new Set()

function isStr(v) { return typeof v === 'string' && v.length > 0 && !v.includes('\0') }

function normalize(p) {
  if (!isStr(p)) return null
  try { return path.normalize(path.resolve(p)) } catch { return null }
}

function samePath(a, b) {
  const na = normalize(a)
  const nb = normalize(b)
  if (!na || !nb) return false
  if (process.platform === 'win32') return na.toLowerCase() === nb.toLowerCase()
  return na === nb
}

// Directorios de trabajo de los servidores registrados (dirname del .jar)
function getServerDirs() {
  const dirs = []
  Object.values(getAllServersMap()).forEach(s => {
    if (s && isStr(s.jarPath)) {
      const d = normalize(path.dirname(s.jarPath))
      if (d) dirs.push(d)
    }
  })
  return dirs
}

function isServerDir(dir) {
  const n = normalize(dir)
  if (!n) return false
  return getServerDirs().some(d => samePath(n, d))
}

// Carpetas de backup permitidas: la carpeta global (Ajustes), las guardadas en
// settings por servidor, <serverDir>/backups y las elegidas explícitamente
// mediante el diálogo en esta sesión.
function getBackupDirs() {
  const dirs = []
  const globalDir = normalize(getGlobalBackupDir())
  if (globalDir) dirs.push(globalDir)
  Object.values(getAllServersMap()).forEach(s => {
    if (!s) return
    const st = getServerSettings(s.id)
    if (isStr(st.autoBackupDir)) {
      const n = normalize(st.autoBackupDir)
      if (n) dirs.push(n)
    }
    if (isStr(s.jarPath)) {
      const def = normalize(path.join(path.dirname(s.jarPath), 'backups'))
      if (def) dirs.push(def)
    }
  })
  pickedBackupDirs.forEach(d => dirs.push(d))
  return dirs
}

function rememberPickedDir(dir) {
  const n = normalize(dir)
  if (n) pickedBackupDirs.add(n)
}

function isAllowedBackupDir(dir) {
  const n = normalize(dir)
  if (!n) return false
  return getBackupDirs().some(d => samePath(n, d))
}

function isInsideDir(child, parent) {
  const nc = normalize(child)
  const np = normalize(parent)
  if (!nc || !np) return false
  const rel = path.relative(np, nc)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function isAllowedBackupFile(file) {
  const n = normalize(file)
  if (!n || !n.toLowerCase().endsWith('.zip')) return false
  return getBackupDirs().some(d => isInsideDir(n, d) && !samePath(n, d))
}

// shell:openPath — solo carpetas de servidor/backup o .zip dentro de una
// carpeta de backup permitida. Nunca ejecutables ni otras rutas.
function canOpenPath(p) {
  const n = normalize(p)
  if (!n) return false
  if (getServerDirs().some(d => samePath(n, d))) return true
  if (getBackupDirs().some(d => samePath(n, d))) return true
  return isAllowedBackupFile(n)
}

function isIntInRange(v, min, max, fallback) {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function isValidColor(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) }

// Divide argumentos de la línea de comandos respetando comillas simples/dobles.
// Evita que `.split(' ')` rompa rutas con espacios: -Ddir="C:\My Servers".
function splitArgs(input) {
  if (typeof input !== 'string' || !input.trim()) return []
  const args = []
  let current = ''
  let quote = null
  let quoted = false
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      quoted = true
    } else if (/\s/.test(ch)) {
      if (current !== '' || quoted) { args.push(current); current = ''; quoted = false }
    } else {
      current += ch
    }
  }
  if (current !== '' || quoted) args.push(current)
  return args
}

function cleanText(v, maxLen) {
  if (typeof v !== 'string') return ''
  return v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen)
}

// javaPath: nombre de comando simple (java) o ruta absoluta válida
function isValidJavaPath(p) {
  if (p === null || p === undefined || p === '') return true
  if (!isStr(p)) return false
  if (p.includes('/') || p.includes('\\')) return path.isAbsolute(p)
  return /^[A-Za-z0-9._-]+$/.test(p)
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

module.exports = {
  isStr,
  normalize,
  samePath,
  isServerDir,
  isAllowedBackupDir,
  isAllowedBackupFile,
  canOpenPath,
  rememberPickedDir,
  isIntInRange,
  isValidColor,
  splitArgs,
  cleanText,
  isValidJavaPath,
  isPlainObject,
  isInsideDir
}
