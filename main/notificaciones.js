const { ipcMain } = require('electron')
const { getDb, insertNotificacion, listNotificaciones } = require('./db')
const { isStr } = require('./validate')

function limitOf(value) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 100
}

function registerNotificacionesIpc() {
  ipcMain.handle('notificaciones:list', (_, { serverId, limit } = {}) => {
    if (!isStr(serverId)) return { ok: false, error: 'Server id inválido' }
    return { ok: true, notificaciones: listNotificaciones(serverId, limitOf(limit)) }
  })

  ipcMain.handle('notificaciones:clear', (_, serverId) => {
    if (!isStr(serverId)) return { ok: false, error: 'Server id inválido' }
    getDb().prepare('DELETE FROM notificaciones WHERE server_id = ?').run(serverId)
    return { ok: true }
  })

  // Útil para diagnóstico y tests; la UI nunca inserta entradas a mano.
  ipcMain.handle('notificaciones:insert', (_, { serverId, tipo, mensaje } = {}) => {
    if (!isStr(serverId) || !isStr(tipo)) return { ok: false, error: 'Datos inválidos' }
    const info = insertNotificacion(serverId, tipo, mensaje || '')
    return { ok: true, id: info.lastInsertRowid }
  })
}

function clearNotificaciones(serverId) {
  if (!isStr(serverId)) return
  getDb().prepare('DELETE FROM notificaciones WHERE server_id = ?').run(serverId)
}

module.exports = { registerNotificacionesIpc, clearNotificaciones }
