// Helpers de red para el arranque de servidores: puerto por defecto y
// comprobación de disponibilidad. Sin dependencias de Electron (testeable).
'use strict'

const net = require('net')

const DEFAULT_PORT = 25565

// Extrae «server-port» de un objeto de propiedades. Valores ausentes o
// inválidos caen al puerto por defecto de Minecraft.
function parseServerPort(props) {
  const raw = props && typeof props === 'object' ? props['server-port'] : undefined
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PORT
  const n = Number.parseInt(String(raw).trim(), 10)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return DEFAULT_PORT
  return n
}

// Intenta escuchar en el puerto: si otro proceso lo tiene enlazado, Node
// emite EADDRINUSE. Otros errores (p. ej. permisos) no se consideran «en uso».
function isPortInUse(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', err => resolve(err && err.code === 'EADDRINUSE'))
    server.once('listening', () => server.close(() => resolve(false)))
    server.listen(port, '0.0.0.0')
  })
}

module.exports = { DEFAULT_PORT, parseServerPort, isPortInUse }
