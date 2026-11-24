// Diagnóstico de fallos típicos de Minecraft a partir de la salida del proceso
// o de los crash-reports. Funciones puras (salvo la lectura de ficheros) para
// poder testearlas con node:test.
'use strict'

const fs = require('fs')
const path = require('path')

const DIAGNOSIS_PATTERNS = [
  {
    id: 'java_version',
    re: /UnsupportedClassVersionError|class file version .{0,40}(?:not supported|unsupported)|Unsupported major\.minor version/i,
    message: 'Java incompatible: el servidor necesita una versión de Java distinta (revisa la versión de Minecraft y la ruta de Java en la configuración).'
  },
  {
    id: 'port_in_use',
    re: /Address already in use|BindException|EADDRINUSE|Failed to bind/i,
    message: 'Puerto ocupado: otro programa está usando el puerto del servidor. Ciérralo o cambia «server-port» en server.properties.'
  },
  {
    id: 'out_of_memory',
    re: /OutOfMemoryError|Java heap space|GC overhead limit exceeded/i,
    message: 'Memoria insuficiente: aumenta la RAM máxima del servidor en la configuración o reduce los mods/plugins.'
  },
  {
    id: 'eula',
    re: /You need to agree to the EULA|eula\s*=\s*true|EULA must be accepted/i,
    message: 'Falta aceptar la EULA: abre la configuración del servidor y acepta la EULA en el primer arranque.'
  }
]

// Analiza un texto (salida de consola o contenido de crash-report) y devuelve
// el primer diagnóstico que coincida, o null si no se reconoce el patrón.
function diagnoseText(text) {
  if (typeof text !== 'string' || !text) return null
  for (const p of DIAGNOSIS_PATTERNS) {
    if (p.re.test(text)) return { id: p.id, message: p.message }
  }
  return null
}

// Lee el crash-report más reciente del servidor, siempre que sea más nuevo que
// `afterTs` (para no diagnosticar un crash antiguo al reiniciar). Devuelve su
// contenido o null.
function recentCrashReport(serverDir, afterTs) {
  if (typeof serverDir !== 'string' || !serverDir) return null
  const dir = path.join(path.resolve(serverDir), 'crash-reports')
  let files
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'))
      .map(f => ({ name: f, full: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .filter(f => f.mtime >= (afterTs || 0))
      .sort((a, b) => b.mtime - a.mtime)
  } catch (_) {
    return null
  }
  for (const f of files) {
    try { return fs.readFileSync(f.full, 'utf8') } catch (_) { /* sigue con el siguiente */ }
  }
  return null
}

module.exports = { diagnoseText, recentCrashReport, DIAGNOSIS_PATTERNS }
