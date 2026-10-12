const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { logCrash } = require('./crash')
const { isStr, isServerDir, isPlainObject } = require('./validate')

const MAX_LIST_ENTRIES = 10000
const MAX_PROP_VALUE = 4096

function readProperties(serverDir) {
  if (!isServerDir(serverDir)) return { ok: false, error: 'Directorio de servidor no válido' }
  const file = path.join(path.resolve(serverDir), 'server.properties')
  try {
    if (!fs.existsSync(file)) return { ok: false, error: 'No se encontró server.properties' }
    const props = {}
    fs.readFileSync(file, 'utf8').split('\n').forEach(line => {
      if (line.startsWith('#') || !line.includes('=')) return
      const [key, ...rest] = line.split('=')
      props[key.trim()] = rest.join('=').trim()
    })
    return { ok: true, props }
  } catch (err) {
    logCrash('props_read_error', err)
    return { ok: false, error: err.message }
  }
}

function propValue(v) {
  return String(v).replace(/[\r\n]/g, '').slice(0, MAX_PROP_VALUE)
}

// Conserva comentarios, líneas en blanco, orden y claves no editadas del archivo
// original; solo sustituye los valores que llegan del renderer.
function writeProperties(serverDir, props) {
  if (!isServerDir(serverDir)) return { ok: false, error: 'Directorio de servidor no válido' }
  if (!isPlainObject(props)) return { ok: false, error: 'Propiedades inválidas' }
  const file = path.join(path.resolve(serverDir), 'server.properties')
  try {
    let content = ''
    if (fs.existsSync(file)) {
      const original = fs.readFileSync(file, 'utf8').split('\n')
      const lastLine = original[original.length - 1] === '' ? original.length - 1 : original.length
      for (let i = 0; i < lastLine; i++) {
        const line = original[i]
        const eq = line.indexOf('=')
        if (eq === -1 || line.trimStart().startsWith('#')) {
          content += line + '\n'
          continue
        }
        const key = line.slice(0, eq).trim()
        if (Object.prototype.hasOwnProperty.call(props, key)) {
          content += `${key}=${propValue(props[key])}\n`
        } else {
          content += line + '\n' // clave ajena al editor: se conserva tal cual
        }
      }
    } else {
      content = '# Minecraft server properties\n# Managed by Minecraft Manager\n'
    }
    // Claves nuevas que no estaban en el archivo
    for (const [k, v] of Object.entries(props)) {
      if (!/^[A-Za-z0-9_.-]+$/.test(k)) continue
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue
      if (content.split('\n').some(l => l.startsWith(k + '='))) continue
      content += `${k}=${propValue(v)}\n`
    }
    fs.writeFileSync(file, content, 'utf8')
    return { ok: true }
  } catch (err) {
    logCrash('props_write_error', err)
    return { ok: false, error: err.message }
  }
}

function readJsonList(serverDir, filename) {
  if (!isServerDir(serverDir)) return { ok: false, error: 'Directorio de servidor no válido', list: [] }
  const file = path.join(path.resolve(serverDir), filename)
  try {
    if (!fs.existsSync(file)) return { ok: true, list: [] }
    return { ok: true, list: JSON.parse(fs.readFileSync(file, 'utf8')) || [] }
  } catch {
    return { ok: true, list: [] }
  }
}

// UUID offline de Minecraft (mismo algoritmo que NameUUIDFromBytes("OfflinePlayer:"+name))
function offlineUuid(name) {
  const h = crypto.createHash('md5').update('OfflinePlayer:' + name, 'utf8').digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

function sanitizeList(list) {
  if (!Array.isArray(list)) return null
  if (list.length > MAX_LIST_ENTRIES) return null
  return list.slice(0, MAX_LIST_ENTRIES).map(entry => {
    if (typeof entry === 'string') return entry.slice(0, 64)
    if (!isPlainObject(entry)) return null
    const out = {}
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === 'string') out[k] = v.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 256)
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
    }
    // Las entradas de whitelist/banlist con uuid vacío no son válidas para
    // vanilla: se completa con el UUID offline del nombre.
    if (typeof out.name === 'string' && out.name && (!isStr(out.uuid) || out.uuid === '')) {
      out.uuid = offlineUuid(out.name)
    }
    return out
  }).filter(Boolean)
}

function writeJsonList(serverDir, filename, list) {
  if (!isServerDir(serverDir)) return { ok: false, error: 'Directorio de servidor no válido' }
  const clean = sanitizeList(list)
  if (!clean) return { ok: false, error: 'Lista inválida' }
  try {
    fs.writeFileSync(path.join(path.resolve(serverDir), filename), JSON.stringify(clean, null, 2), 'utf8')
    return { ok: true }
  } catch (err) {
    logCrash('list_write_error', err)
    return { ok: false, error: err.message }
  }
}

function registerPropertiesIpc() {
  ipcMain.handle('props:read', (_, serverDir) => readProperties(serverDir))
  ipcMain.handle('props:write', (_, { serverDir, props } = {}) => writeProperties(serverDir, props))

  ipcMain.handle('whitelist:read', (_, serverDir) => readJsonList(serverDir, 'whitelist.json'))
  ipcMain.handle('whitelist:write', (_, { serverDir, list } = {}) => writeJsonList(serverDir, 'whitelist.json', list))
  ipcMain.handle('banlist:read', (_, serverDir) => readJsonList(serverDir, 'banned-players.json'))
  ipcMain.handle('banlist:write', (_, { serverDir, list } = {}) => writeJsonList(serverDir, 'banned-players.json', list))
}

module.exports = { registerPropertiesIpc, readProperties, writeProperties, readJsonList, writeJsonList, offlineUuid, sanitizeList }
