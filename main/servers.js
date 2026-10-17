const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const crypto = require('crypto')
const { getAllServersMap, saveServerMap, settingsStore, saveRunTime } = require('./stores')
const { activeServers, sendToRenderer, writeStdin } = require('./state')
const { trackEvent } = require('./analytics')
const { closeServerSessions, deleteServerStats } = require('./estadisticas')
const { getRunTime } = require('./stores')
const { logCrash } = require('./crash')
const { cancelAutoBackup } = require('./backups')
const {
  isStr, isIntInRange, isValidColor, cleanText, isValidJavaPath, isPlainObject, splitArgs
} = require('./validate')

// ─── External process detection ───────────────────────────────────────────────
// Detecta si un proceso Java está ejecutando un JAR específico (puede haber sido
// iniciado fuera de la app o antes de reiniciarla)
function isJarRunning(jarPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(jarPath)) return resolve(false)
    const absPath = path.resolve(jarPath)
    const isWindows = process.platform === 'win32'
    // Windows: PowerShell + CIM (wmic desaparece en Windows 11 24H2).
    // Linux/macOS: pgrep busca el jar en la linea de comandos.
    const cmd = isWindows ? 'powershell.exe' : 'pgrep'
    const args = isWindows
      ? ['-NoProfile', '-NonInteractive', '-Command',
        `(Get-CimInstance Win32_Process -Filter "Name='java.exe'") | Where-Object { $_.CommandLine -and $_.CommandLine.Contains('${absPath.replace(/'/g, "''")}') } | Select-Object -First 1 -ExpandProperty ProcessId`]
      : ['-f', absPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')]
    const child = spawn(cmd, args, { shell: false })
    let output = ''
    child.stdout.on('data', (d) => { output += d })
    child.on('close', () => {
      const pid = output.split('\n').map(l => l.trim()).find(l => /^\d+$/.test(l))
      resolve(pid || false)
    })
    child.on('error', () => resolve(false))
  })
}

// ─── Java version detection ───────────────────────────────────────────────────
// java -version escribe por stderr. Solo se cachean los resultados válidos para
// no penalizar una instalación que se arregle en caliente.
const javaVersionCache = new Map()

function detectJavaVersion(javaPath) {
  return new Promise((resolve) => {
    if (javaVersionCache.has(javaPath)) return resolve(javaVersionCache.get(javaPath))
    let out = ''
    let child
    try {
      child = spawn(javaPath, ['-version'], { shell: false })
    } catch (_) {
      return resolve(null)
    }
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('error', () => resolve(null))
    child.on('close', () => {
      let major = null
      const quoted = out.match(/version\s+"([^"]+)"/)
      if (quoted) {
        const parts = quoted[1].split('.')
        major = Number(parts[0]) === 1 ? Number(parts[1]) : Number(parts[0])
      } else {
        const m = out.match(/(?:openjdk|java)\s+(\d+)/i)
        if (m) major = Number(m[1])
      }
      if (!Number.isFinite(major) || major <= 0) return resolve(null)
      const ver = { major, raw: (out.trim().split('\n')[0] || '').slice(0, 120) }
      javaVersionCache.set(javaPath, ver)
      resolve(ver)
    })
  })
}

// ─── Server process ──────────────────────────────────────────────────────────
async function startServer(serverId, acceptEula = false) {
  if (activeServers[serverId]) return { ok: false, error: 'Ya está en ejecución' }
  // La configuración SIEMPRE sale del almacenamiento propio: el renderer no
  // puede inyectar javaPath/extraArgs arbitrarios.
  const config = getAllServersMap()[serverId]
  if (!config) return { ok: false, error: 'Servidor no encontrado' }

  const { jarPath, javaPath, minRam, maxRam, extraArgs } = config
  const isForge = config.startType === 'forge'
  if (!isStr(jarPath)) return { ok: false, error: 'El servidor no tiene un .jar configurado' }
  if (!fs.existsSync(jarPath)) return { ok: false, error: 'No se encontró el archivo .jar' }
  const serverDir = path.dirname(jarPath)

  const java = isStr(javaPath) ? javaPath : 'java'
  // Requisito del README: Java 17+ (las versiones 1.x se leen como 8, 11…)
  const ver = await detectJavaVersion(java)
  if (!ver) return { ok: false, error: `No se pudo ejecutar "${java} -version". Instala Java 17+ o corrige la ruta de Java.` }
  if (ver.major < 17) return { ok: false, error: `Se requiere Java 17+ (detectado Java ${ver.major}). Cambia la ruta de Java en la configuración del servidor.` }

  // eula.txt: el primer arranque necesita aceptación explícita del usuario,
  // salvo que «Aceptar la EULA automáticamente» esté activo en Ajustes.
  const eulaFile = path.join(serverDir, 'eula.txt')
  if (!fs.existsSync(eulaFile)) {
    const autoEula = settingsStore.get('autoEula') === true
    if (!acceptEula && !autoEula) return { ok: false, code: 'eula', error: 'Falta aceptar la EULA de Minecraft (eula.txt)' }
    try {
      fs.writeFileSync(eulaFile, '# Aceptación de la EULA de Minecraft (https://aka.ms/MinecraftEULA)\n# Generado por Minecraft Local Server Manager\neula=true\n', 'utf8')
    } catch (err) {
      logCrash('eula_write_error', err)
      return { ok: false, error: 'No se pudo crear eula.txt: ' + err.message }
    }
  }
  const extra = splitArgs(isStr(extraArgs) ? extraArgs : '')
  const minR = isIntInRange(minRam, 256, 65536, 1024)
  const maxR = isIntInRange(maxRam, 256, 131072, 4096)

  let args
  if (isForge) {
    const forgeArgs = isStr(config.forgeArgs) ? config.forgeArgs : null
    if (!forgeArgs || !fs.existsSync(forgeArgs)) return { ok: false, error: 'No se encontró la configuración de Forge (args)' }
    const userJvm = path.join(serverDir, 'user_jvm_args.txt')
    try {
      fs.writeFileSync(userJvm, `-Xms${minR}M\n-Xmx${maxR}M\n${extra.length ? extra.join('\n') + '\n' : ''}`, 'utf8')
    } catch (err) {
      logCrash('forge_jvmargs_error', err)
      return { ok: false, error: 'No se pudo escribir user_jvm_args.txt: ' + err.message }
    }
    args = ['@' + userJvm, '@' + forgeArgs, 'nogui']
  } else {
    args = [`-Xms${minR}M`, `-Xmx${maxR}M`, ...extra, '-jar', jarPath, '--nogui']
  }

  try {
    const proc = spawn(java, args, { cwd: serverDir, shell: false })
    const startTime = Date.now()

    // El stdin puede cerrarse (proceso muerto) y su 'error' es asíncrono:
    // sin este handler sería un uncaughtException.
    if (proc.stdin) proc.stdin.on('error', (err) => logCrash('server_stdin_error', err))

    proc.stdout.on('data', (data) => {
      data.toString().split('\n').filter(l => l.trim()).forEach(line => {
        sendToRenderer('console-line', { serverId, text: line, type: classifyLine(line) })
        if (/Done \([\d.]+s\)!/i.test(line)) {
          trackEvent('server_started', { startupMs: Date.now() - startTime })
        }
      })
    })
    proc.stderr.on('data', (data) => {
      data.toString().split('\n').filter(l => l.trim()).forEach(line => {
        sendToRenderer('console-line', { serverId, text: line, type: 'error' })
      })
    })
    proc.on('exit', (code) => {
      const running = activeServers[serverId]
      const stopTime = Date.now()
      const uptime = running ? stopTime - running.startTime : 0
      // Hora de parada para calcular las horas encendido y cerrar las
      // sesiones de jugadores que estaban conectados (Fase 1).
      if (running) running.stopTime = stopTime
      // Guarda la hora de parada para calcular las horas encendido (Fase 2).
      const run = getRunTime(serverId)
      saveRunTime(serverId, {
        startedAt: running ? running.startTime : run ? run.startedAt : null,
        stoppedAt: stopTime
      })
      delete activeServers[serverId]
      sendToRenderer('server-stopped', { serverId, code })
      trackEvent('server_stopped', { code, uptimeMs: uptime })
      closeServerSessions(serverId, stopTime)
    })
    proc.on('error', (err) => {
      delete activeServers[serverId]
      sendToRenderer('server-stopped', { serverId, error: err.message })
      logCrash('server_process_error', err)
    })

    activeServers[serverId] = { process: proc, startTime: Date.now() }
    // Guarda la hora de inicio para calcular las horas encendido (Fase 2).
    saveRunTime(serverId, { startedAt: Date.now() })
    return { ok: true }
  } catch (err) {
    logCrash('server_start_error', err)
    return { ok: false, error: err.message }
  }
}

async function stopServer(serverId) {
  const s = activeServers[serverId]
  if (!s) {
    // ¿Está corriendo fuera de la app? Entonces no podemos detenerlo.
    const server = getAllServersMap()[serverId]
    if (server && isStr(launchFingerprint(server))) {
      const pid = await isJarRunning(launchFingerprint(server))
      if (pid) return { ok: false, error: 'Servidor iniciado fuera de la app: no se puede detener desde aquí' }
    }
    return { ok: false, error: 'No está en ejecución' }
  }
  try {
    writeStdin(s.process, 'stop\n')
  } catch (err) {
    logCrash('server_stdin_error', err)
  }
  setTimeout(() => {
    if (activeServers[serverId]) {
      try { activeServers[serverId].process.kill() } catch (_) { }
      delete activeServers[serverId]
    }
  }, 10000)
  return { ok: true }
}

function stopAllServers() { Object.keys(activeServers).forEach(id => { stopServer(id) }) }

async function sendCommand(serverId, cmd) {
  const s = activeServers[serverId]
  if (!s) {
    const server = getAllServersMap()[serverId]
    if (server && isStr(launchFingerprint(server))) {
      const pid = await isJarRunning(launchFingerprint(server))
      if (pid) return { ok: false, error: 'Servidor iniciado fuera de la app: la consola no está conectada' }
    }
    return { ok: false, error: 'El servidor no está en ejecución' }
  }
  try {
    if (!writeStdin(s.process, cmd + '\n')) return { ok: false, error: 'La consola del servidor no está disponible' }
    return { ok: true }
  } catch (err) {
    logCrash('server_stdin_error', err)
    return { ok: false, error: 'No se pudo enviar el comando' }
  }
}

function classifyLine(line) {
  if (/WARN|WARNING/i.test(line)) return 'warn'
  if (/ERROR|FATAL|Exception/i.test(line)) return 'error'
  if (/joined the game|left the game/i.test(line)) return 'player'
  if (/Done \([\d.]+s\)!/i.test(line)) return 'success'
  return 'info'
}

// ─── IPC ─────────────────────────────────────────────────────────────────────
function sanitizeServerFields(input) {
  const out = {}
  if (isStr(input.name)) out.name = cleanText(input.name, 40) || 'Servidor'
  if (isStr(input.jarPath)) out.jarPath = path.resolve(input.jarPath)
  if (isValidJavaPath(input.javaPath)) out.javaPath = input.javaPath ? input.javaPath : null
  if (input.minRam !== undefined) out.minRam = isIntInRange(input.minRam, 256, 65536, 1024)
  if (input.maxRam !== undefined) out.maxRam = isIntInRange(input.maxRam, 256, 131072, 4096)
  if (input.extraArgs !== undefined) out.extraArgs = cleanText(String(input.extraArgs), 512)
  if (input.color !== undefined) out.color = isValidColor(input.color) ? input.color : '#4ade80'
  if (out.minRam !== undefined && out.maxRam !== undefined && out.maxRam < out.minRam) {
    out.maxRam = out.minRam
  }
  return out
}

// Crea el registro de un servidor mezclando el formulario con los valores por
// defecto de Ajustes. Lo usa tanto 'servers:create' como el descargador.
function buildServerRecord(input) {
  const fields = sanitizeServerFields(input)
  const prefRam = Number(settingsStore.get('defaultRam'))
  const prefJava = settingsStore.get('defaultJava')
  const prefJvmArgs = settingsStore.get('defaultJvmArgs')
  const record = {
    id: crypto.randomUUID(),
    name: fields.name || 'Servidor',
    jarPath: fields.jarPath,
    javaPath: fields.javaPath ?? (isValidJavaPath(prefJava) ? prefJava || null : null),
    minRam: fields.minRam ?? 1024,
    maxRam: fields.maxRam ?? (Number.isInteger(prefRam) && prefRam >= 256 && prefRam <= 131072 ? prefRam : 4096),
    extraArgs: fields.extraArgs ?? cleanText(String(prefJvmArgs || ''), 512),
    color: fields.color || '#4ade80',
    createdAt: Date.now()
  }
  // Servidores Forge (1.17+): arrancan vía @args en lugar de «-jar».
  if (input.startType === 'forge' && isStr(input.forgeArgs)) {
    record.startType = 'forge'
    record.forgeArgs = path.resolve(input.forgeArgs)
  }
  return record
}

// Ruta con la que identificar un servidor externo: el JAR o, en Forge, el
// fichero de argumentos (aparece en la línea de comandos del proceso java).
function launchFingerprint(server) {
  if (server && server.startType === 'forge' && isStr(server.forgeArgs)) return server.forgeArgs
  return server && server.jarPath
}

function registerServersIpc() {
  ipcMain.handle('servers:list', () => Object.values(getAllServersMap()))

  ipcMain.handle('servers:create', (_, input) => {
    if (!isPlainObject(input)) return { ok: false, error: 'Datos inválidos' }
    const fields = sanitizeServerFields(input)
    if (!isStr(fields.jarPath)) return { ok: false, error: 'Selecciona el archivo .jar' }
    const map = getAllServersMap()
    const server = buildServerRecord(fields)
    map[server.id] = server
    saveServerMap(map)
    trackEvent('server_created')
    return { ok: true, server }
  })

  ipcMain.handle('servers:update', (_, { serverId, data } = {}) => {
    if (!isStr(serverId) || !isPlainObject(data)) return { ok: false, error: 'Datos inválidos' }
    const map = getAllServersMap()
    if (!map[serverId]) return { ok: false, error: 'Servidor no encontrado' }
    // Solo campos editables: id/createdAt no se pueden sobrescribir
    map[serverId] = { ...map[serverId], ...sanitizeServerFields(data) }
    saveServerMap(map)
    return { ok: true, server: map[serverId] }
  })

  ipcMain.handle('servers:delete', (_, serverId) => {
    if (!isStr(serverId)) return { ok: false, error: 'Datos inválidos' }
    const map = getAllServersMap()
    if (activeServers[serverId]) return { ok: false, error: 'Detén el servidor antes de eliminarlo' }
    cancelAutoBackup(serverId)
    delete map[serverId]
    saveServerMap(map)
    // Las estadísticas propias de este servidor también se descartan.
    deleteServerStats(serverId)
    return { ok: true }
  })

  ipcMain.handle('servers:get', (_, serverId) => (isStr(serverId) ? getAllServersMap()[serverId] || null : null))

  ipcMain.handle('server:start', (_, { serverId, acceptEula } = {}) => (
    isStr(serverId) ? startServer(serverId, acceptEula === true) : { ok: false, error: 'Datos inválidos' }
  ))
  ipcMain.handle('server:stop', (_, serverId) => (isStr(serverId) ? stopServer(serverId) : { ok: false, error: 'Datos inválidos' }))
  ipcMain.handle('server:command', (_, { serverId, cmd } = {}) => {
    if (!isStr(serverId) || typeof cmd !== 'string' || !cmd.trim()) return { ok: false, error: 'Comando inválido' }
    return sendCommand(serverId, cmd.trim())
  })
  ipcMain.handle('server:status', async (_, serverId) => {
    if (activeServers[serverId]) return { running: true }
    const server = getAllServersMap()[serverId]
    if (server && isStr(launchFingerprint(server))) {
      const pid = await isJarRunning(launchFingerprint(server))
      if (pid) return { running: true, external: true, pid }
    }
    return { running: false }
  })

  // Validación de Java para la UI (diagnóstico / formulario de servidores)
  ipcMain.handle('java:check', async (_, p) => {
    const target = isStr(p) && p ? p : 'java'
    if (!isValidJavaPath(target)) return { ok: false, error: 'Ruta de Java no válida' }
    const base = path.basename(target).toLowerCase()
    if (base !== 'java' && base !== 'java.exe') return { ok: false, error: 'El ejecutable debe ser java' }
    const ver = await detectJavaVersion(target)
    return ver ? { ok: true, path: target, ...ver } : { ok: false, path: target, error: 'No se pudo detectar la versión' }
  })

  // Caché corta: evita lanzar un proceso PowerShell/pgrep por servidor en
  // cada refresco de la UI.
  let statusAllCache = { at: 0, value: null }
  ipcMain.handle('server:statusAll', async () => {
    if (statusAllCache.value && Date.now() - statusAllCache.at < 3000) return statusAllCache.value
    const r = {}
    Object.keys(activeServers).forEach(id => { r[id] = true })
    try {
      const map = getAllServersMap()
      const ids = Object.keys(map).filter(id => !r[id] && isStr(launchFingerprint(map[id])))
      const results = await Promise.all(ids.map(id => isJarRunning(launchFingerprint(map[id]))))
      ids.forEach((id, i) => { if (results[i]) r[id] = { external: true, pid: results[i] } })
    } catch (_) { }
    statusAllCache = { at: Date.now(), value: r }
    return r
  })
}

// Nota: la validación de rutas compartida vive en validate.js (isServerDir…)
module.exports = { registerServersIpc, stopAllServers, isJarRunning, classifyLine, buildServerRecord, detectJavaVersion }
