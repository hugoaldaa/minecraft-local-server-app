const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const crypto = require('crypto')
const { getAllServersMap, saveServerMap, settingsStore, saveRunTime } = require('./stores')
const { activeServers, sendToRenderer, writeStdin, serverMapEvents } = require('./state')
const { trackEvent } = require('./analytics')
const { closeServerSessions, deleteServerStats } = require('./estadisticas')
const { getRunTime } = require('./stores')
const { logCrash } = require('./crash')
const {
  isStr, isIntInRange, isValidColor, cleanText, isValidJavaPath, isPlainObject, splitArgs
} = require('./validate')
const { minJavaFor } = require('./versions')
const { readProperties } = require('./properties')
const { parseServerPort, isPortInUse } = require('./net')
const { diagnoseText, recentCrashReport } = require('./diagnose')
const { notify } = require('./notifications')

const JOIN_RE = /(\w+) joined the game/
const LEAVE_RE = /(\w+) left the game/

// Auto-reinicio (2.1): máximo de reintentos consecutivos y espera entre ellos.
// Un arranque manual o una parada voluntary resetean el contador.
const RESTART_LIMIT = 3
const RESTART_DELAY_MS = 4000
const restartAttempts = {}
const restartTimers = {}

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
async function startServer(serverId, acceptEula = false, isRestart = false) {
  if (activeServers[serverId]) return { ok: false, error: 'Ya está en ejecución' }
  // Cancela un reinicio pendiente; un arranque manual reinicia el contador.
  if (restartTimers[serverId]) { clearTimeout(restartTimers[serverId]); delete restartTimers[serverId] }
  if (!isRestart) delete restartAttempts[serverId]
  // La configuración SIEMPRE sale del almacenamiento propio: el renderer no
  // puede inyectar javaPath/extraArgs arbitrarios.
  const config = getAllServersMap()[serverId]
  if (!config) return { ok: false, error: 'Servidor no encontrado' }

  const { jarPath, javaPath, minRam, maxRam, extraArgs, mcVersion } = config
  const isForge = config.startType === 'forge'
  if (!isStr(jarPath)) return { ok: false, error: 'El servidor no tiene un .jar configurado' }
  if (!fs.existsSync(jarPath)) return { ok: false, error: 'No se encontró el archivo .jar' }
  const serverDir = path.dirname(jarPath)

  // Java mínimo requerido por la versión de Minecraft (≤1.16.5 → 8, 1.17–1.20.4 → 17, ≥1.20.5 → 21).
  // Si no se conoce la versión (servidor importado a mano), se conserva el requisito de Java 17+.
  const requiredJava = mcVersion ? minJavaFor(mcVersion) || 17 : 17

  const java = isStr(javaPath) ? javaPath : 'java'
  const ver = await detectJavaVersion(java)
  if (!ver) return { ok: false, error: `No se pudo ejecutar "${java} -version". Instala Java ${requiredJava}+ o corrige la ruta de Java.` }
  if (ver.major < requiredJava) {
    return { ok: false, error: `Minecraft ${mcVersion || 'desconocida'} requiere Java ${requiredJava}+ (detectado Java ${ver.major}). Cambia la ruta de Java en la configuración del servidor.` }
  }

  // Comprobar el puerto antes de arrancar: el 25565 ocupado es el fallo más
  // común. Si no se puede leer server.properties se asume el puerto por defecto.
  try {
    const propsRes = readProperties(serverDir)
    const port = parseServerPort(propsRes.ok ? propsRes.props : null)
    if (await isPortInUse(port)) {
      return { ok: false, error: `El puerto ${port} ya está en uso. Cierra el programa que lo ocupa o cambia «server-port» en server.properties.` }
    }
  } catch (_) { /* si la comprobación falla, se deja arrancar */ }

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
    // Últimas líneas de salida para diagnosticar un crash (2.4) sin guardar logs completos.
    const recentLines = []
    const pushLine = (line) => { recentLines.push(line); if (recentLines.length > 40) recentLines.shift() }
    let notifiedReady = false // una sola notificación de arranque por sesión

    // El stdin puede cerrarse (proceso muerto) y su 'error' es asíncrono:
    // sin este handler sería un uncaughtException.
    if (proc.stdin) proc.stdin.on('error', (err) => logCrash('server_stdin_error', err))

    proc.stdout.on('data', (data) => {
      data.toString().split('\n').filter(l => l.trim()).forEach(line => {
        pushLine(line)
        sendToRenderer('console-line', { serverId, text: line, type: classifyLine(line) })
        if (/Done \([\d.]+s\)!/i.test(line)) {
          trackEvent('server_started', { startupMs: Date.now() - startTime })
          if (!notifiedReady) {
            notifiedReady = true
            notify('server_started', { name: config.name })
          }
        }
        const join = JOIN_RE.exec(line)
        if (join) notify('player_join', { name: join[1] })
        const leave = LEAVE_RE.exec(line)
        if (leave) notify('player_leave', { name: leave[1] })
      })
    })
    proc.stderr.on('data', (data) => {
      data.toString().split('\n').filter(l => l.trim()).forEach(line => {
        pushLine(line)
        sendToRenderer('console-line', { serverId, text: line, type: 'error' })
      })
    })
    const closeRun = (stopTime, code, error) => {
      const running = activeServers[serverId]
      if (running && running.stopTimer) { clearTimeout(running.stopTimer); running.stopTimer = null }
      if (running) running.stopTime = stopTime
      // Acumula el tiempo de esta sesión y guarda la parada (Fase 2).
      const run = getRunTime(serverId)
      const sessionStart = run && run.currentSessionStart ? run.currentSessionStart : stopTime
      const sessionMs = Math.max(0, stopTime - sessionStart)
      saveRunTime(serverId, {
        startedAt: run && run.startedAt ? run.startedAt : (running ? running.startTime : null),
        stoppedAt: stopTime,
        totalMs: Math.max(0, (run && run.totalMs ? run.totalMs : 0) + sessionMs),
        currentSessionStart: null
      })
      delete activeServers[serverId]
      sendToRenderer('server-stopped', { serverId, code, error })
      trackEvent('server_stopped', { code, uptimeMs: sessionMs })
      closeServerSessions(serverId, stopTime)
    }
    proc.on('exit', (code) => {
      const running = activeServers[serverId]
      const voluntary = !!(running && running.stopping)
      closeRun(Date.now(), code, null)

      // Parada voluntaria o salida limpia: nada de reinicios.
      if (voluntary || code === 0) {
        delete restartAttempts[serverId]
        notify('server_stopped', { name: config.name })
        return
      }

      // Crash: diagnóstico (2.4) desde la consola o el crash-report reciente.
      let diag = diagnoseText(recentLines.join('\n'))
      if (!diag) diag = diagnoseText(recentCrashReport(serverDir, startTime - 1000))
      if (diag) {
        sendToRenderer('console-line', { serverId, text: `Diagnóstico: ${diag.message}`, type: 'error' })
        logCrash('server_crash_' + diag.id, new Error(diag.message))
      }
      notify('server_crash', { name: config.name, detail: diag ? diag.message : `código ${code}` })

      // Estos fallos no se arreglan solos: reintentar solo generaría ruido.
      const FATAL_DIAGNOSES = ['java_version', 'eula', 'port_in_use']
      if (diag && FATAL_DIAGNOSES.includes(diag.id)) {
        sendToRenderer('console-line', { serverId, text: 'No se reintentará automáticamente: corrige el problema indicado y arranca el servidor de nuevo.', type: 'error' })
        delete restartAttempts[serverId]
        return
      }

      // Auto-reinicio (2.1) con límite de reintentos consecutivos.
      const attempts = (restartAttempts[serverId] || 0) + 1
      if (attempts > RESTART_LIMIT) {
        sendToRenderer('console-line', { serverId, text: `El servidor se ha caído ${RESTART_LIMIT} veces seguidas. No se reiniciará más automáticamente.`, type: 'error' })
        delete restartAttempts[serverId]
        return
      }
      restartAttempts[serverId] = attempts
      sendToRenderer('console-line', {
        serverId,
        text: `El servidor se ha caído (código ${code}). Reiniciando en ${RESTART_DELAY_MS / 1000}s... (intento ${attempts}/${RESTART_LIMIT})`,
        type: 'warn'
      })
      restartTimers[serverId] = setTimeout(() => {
        delete restartTimers[serverId]
        startServer(serverId, false, true).catch(err => logCrash('server_restart_error', err))
      }, RESTART_DELAY_MS)
    })
    proc.on('error', (err) => {
      closeRun(Date.now(), null, err.message)
      delete restartAttempts[serverId]
      logCrash('server_process_error', err)
    })

    activeServers[serverId] = { process: proc, startTime: Date.now() }
    // Guarda el inicio de la sesión actual sin borrar el tiempo acumulado.
    saveRunTime(serverId, {
      startedAt: Date.now(),
      currentSessionStart: Date.now(),
      totalMs: (getRunTime(serverId) && getRunTime(serverId).totalMs) || 0
    })
    return { ok: true }
  } catch (err) {
    logCrash('server_start_error', err)
    return { ok: false, error: err.message }
  }
}

async function stopServer(serverId) {
  // Una parada manual cancela cualquier reinicio pendiente y resetea reintentos.
  if (restartTimers[serverId]) { clearTimeout(restartTimers[serverId]); delete restartTimers[serverId] }
  delete restartAttempts[serverId]
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
  s.stopping = true
  try {
    writeStdin(s.process, 'stop\n')
  } catch (err) {
    logCrash('server_stdin_error', err)
  }
  s.stopTimer = setTimeout(() => {
    if (activeServers[serverId]) {
      try { activeServers[serverId].process.kill() } catch (_) { }
      delete activeServers[serverId]
    }
  }, 10000)
  return { ok: true }
}

// Cancela todos los reinicios pendientes (p. ej. al cerrar la app).
function cancelAllRestarts() {
  Object.values(restartTimers).forEach(t => clearTimeout(t))
  Object.keys(restartTimers).forEach(k => delete restartTimers[k])
  Object.keys(restartAttempts).forEach(k => delete restartAttempts[k])
}

function stopAllServers() {
  cancelAllRestarts()
  Object.keys(activeServers).forEach(id => { stopServer(id) })
}

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
  if (input.mcVersion !== undefined) {
    const mv = String(input.mcVersion).trim()
    if (mv && /^\d+\.\d+(\.\d+)?$/.test(mv)) out.mcVersion = mv
    else if (!mv) out.mcVersion = null
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
    mcVersion: fields.mcVersion || null,
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
    serverMapEvents.emit('changed', server.id, 'create')
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
    if (restartTimers[serverId]) { clearTimeout(restartTimers[serverId]); delete restartTimers[serverId] }
    delete restartAttempts[serverId]
    delete map[serverId]
    saveServerMap(map)
    serverMapEvents.emit('changed', serverId, 'delete')
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
module.exports = { registerServersIpc, stopAllServers, cancelAllRestarts, stopServer, startServer, isJarRunning, classifyLine, buildServerRecord, detectJavaVersion }
