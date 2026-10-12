const { ipcMain, app } = require('electron')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { fetchText, fetchJson, sha256File, downloadToFile } = require('./http')
const { sendToRenderer } = require('./state')
const { getAllServersMap, saveServerMap, settingsStore } = require('./stores')
const { trackEvent } = require('./analytics')
const { buildServerRecord, detectJavaVersion } = require('./servers')
const { isPlainObject, isStr, isValidJavaPath, cleanText, isInsideDir, isIntInRange, splitArgs } = require('./validate')
const {
  minJavaFor, slugify,
  parseVersionManifest, parseVersionJsonServer, parsePaperProjects, parsePaperBuilds, parseFabricGameVersions,
  parseForgePromotions, forgeArgsRelPath, normalizeVersions
} = require('./versions')

const MOJANG_MANIFEST = 'https://launchermeta.mojang.com/mc/game/version_manifest_v2.json'
const PAPER_API = 'https://fill.papermc.io/v3/projects/paper'
const FABRIC_GAME = 'https://meta.fabricmc.net/v2/versions/game'
const FABRIC_LOADER = 'https://meta.fabricmc.net/v2/versions/loader'
const FABRIC_INSTALLER = 'https://meta.fabricmc.net/v2/versions/installer'
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'

const activeDownloads = new Map()

// ─── Proveedores ─────────────────────────────────────────────────────────────

async function listVanillaVersions() {
  const json = await fetchJson(MOJANG_MANIFEST)
  const { latest, releases } = parseVersionManifest(json)
  return { latest, versions: releases }
}

async function getVanillaServerUrl(versionId) {
  const manifest = JSON.parse(await fetchText(MOJANG_MANIFEST))
  const version = (manifest.versions || []).find(v => v.id === versionId && v.type === 'release')
  if (!version || !isStr(version.url)) throw new Error('Versión Vanilla no encontrada')
  const vjson = JSON.parse(await fetchText(version.url))
  const url = parseVersionJsonServer(vjson)
  if (!url) throw new Error('El servidor no está disponible para esta versión')
  return url
}

async function listPaperVersions() {
  const json = await fetchJson(PAPER_API)
  return { versions: parsePaperProjects(json) }
}

async function getPaperBuild(versionId) {
  const json = JSON.parse(await fetchText(`${PAPER_API}/versions/${encodeURIComponent(versionId)}/builds`))
  const build = parsePaperBuilds(json)
  if (!build) throw new Error('No hay builds estables para esa versión')
  return build
}

async function listFabricVersions() {
  const json = await fetchJson(FABRIC_GAME)
  return { versions: parseFabricGameVersions(json) }
}

// El endpoint «server/jar» de Fabric genera al vuelo un lanzador ejecutable
// (java -jar). Usa el loader y el installer estables más recientes.
async function getFabricServerUrl(versionId) {
  const [loaders, installers] = await Promise.all([
    fetchText(FABRIC_LOADER).then(JSON.parse),
    fetchText(FABRIC_INSTALLER).then(JSON.parse)
  ])
  const loader = (Array.isArray(loaders) ? loaders : []).find(l => l && l.stable) || (Array.isArray(loaders) ? loaders[0] : null)
  const installer = (Array.isArray(installers) ? installers : []).find(i => i && i.stable) || (Array.isArray(installers) ? installers[0] : null)
  if (!loader || !installer) throw new Error('No se pudo resolver Fabric')
  return `${FABRIC_GAME.replace('/game', '')}/loader/${encodeURIComponent(versionId)}/${encodeURIComponent(loader.version)}/${encodeURIComponent(installer.version)}/server/jar`
}

async function listForgeVersions() {
  const json = await fetchJson(FORGE_PROMOS)
  return { versions: parseForgePromotions(json) }
}

// Ejecuta un proceso hijo y resuelve con su código de salida. Drena stdout/stderr
// (evita que el pipe se llene) y mata el proceso si la descarga se cancela.
function runProcess(cmd, args, cwd, signal, onLine) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(cmd, args, { cwd, shell: false })
    } catch (err) {
      return reject(err)
    }
    const drain = (data) => {
      if (!onLine) return
      data.toString().split('\n').forEach(l => { if (l.trim()) onLine(l.trim()) })
    }
    if (child.stdout) child.stdout.on('data', drain)
    if (child.stderr) child.stderr.on('data', drain)
    const onAbort = () => { try { child.kill() } catch (_) { } }
    if (signal) {
      if (signal.aborted) { onAbort(); return reject(new Error('Descarga cancelada')) }
      signal.addEventListener('abort', onAbort, { once: true })
    }
    child.on('error', reject)
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort)
      if (signal && signal.aborted) return reject(new Error('Descarga cancelada'))
      resolve(code)
    })
  })
}

// ─── Instalación ─────────────────────────────────────────────────────────────

function defaultServersRoot() {
  const pref = settingsStore.get('defaultServerDir')
  if (isStr(pref) && pref.trim()) return path.resolve(pref.trim())
  return path.join(app.getPath('documents'), 'Minecraft Servers')
}

function resolveJava(cfg) {
  if (isStr(cfg.javaPath) && cfg.javaPath) return cfg.javaPath
  const pref = settingsStore.get('defaultJava')
  return isStr(pref) && pref ? pref : 'java'
}

async function installForge(cfg, versionId, finalDir, emit, ctrl) {
  const entry = parseForgePromotions(JSON.parse(await fetchText(FORGE_PROMOS))).find(v => v.id === versionId)
  if (!entry) throw new Error('No hay Forge para esa versión (se soporta 1.17 o superior)')
  const forgeVersion = String(cfg.forgeVersion || entry.forge || '')
  if (!forgeVersion) throw new Error('No se pudo resolver la versión de Forge')

  const argsFile = path.join(finalDir, forgeArgsRelPath(versionId, forgeVersion, process.platform))
  if (fs.existsSync(argsFile)) throw new Error('Forge ya está instalado en esa carpeta')

  const java = resolveJava(cfg)
  const ver = await detectJavaVersion(java)
  if (!ver) throw new Error(`No se pudo ejecutar "${java} -version". Instala Java 17+ o indica la ruta de Java.`)
  if (ver.major < 17) throw new Error(`Forge requiere Java 17+ (detectado Java ${ver.major})`)

  const installerUrl = `${FORGE_MAVEN}/${versionId}-${forgeVersion}/forge-${versionId}-${forgeVersion}-installer.jar`
  const installerPath = path.join(finalDir, `.forge-installer-${forgeVersion}.jar`)
  try {
    emit('download', { provider: 'forge' })
    await downloadToFile(installerUrl, installerPath, {
      signal: ctrl.signal,
      onProgress: ({ received, total }) => emit('download', { received, total })
    })

    emit('install', { provider: 'forge' })
    const code = await runProcess(java, ['-jar', installerPath, '--installServer'], finalDir, ctrl.signal)
    if (code !== 0) throw new Error('El instalador de Forge falló (código ' + code + ')')
    if (!fs.existsSync(argsFile)) throw new Error('Forge se instaló pero no se encontró su fichero de configuración')

    // user_jvm_args.txt centraliza memoria y argumentos JVM del usuario: Forge
    // arranca con «java @user_jvm_args.txt @<args> nogui».
    const userJvm = path.join(finalDir, 'user_jvm_args.txt')
    const minR = isIntInRange(cfg.minRam, 256, 65536, 1024)
    const maxR = isIntInRange(cfg.maxRam, 256, 131072, 4096)
    const extra = splitArgs(isStr(cfg.extraArgs) ? cfg.extraArgs : '')
    fs.writeFileSync(userJvm, `-Xms${minR}M\n-Xmx${maxR}M\n${extra.length ? extra.join('\n') + '\n' : ''}`, 'utf8')

    const runScript = path.join(finalDir, process.platform === 'win32' ? 'run.bat' : 'run.sh')
    const jarPath = fs.existsSync(runScript) ? runScript : userJvm

    const map = getAllServersMap()
    const server = buildServerRecord({
      name: cfg.name,
      jarPath,
      javaPath: cfg.javaPath,
      minRam: cfg.minRam,
      maxRam: cfg.maxRam,
      extraArgs: cfg.extraArgs,
      color: cfg.color,
      startType: 'forge',
      forgeArgs: argsFile
    })
    map[server.id] = server
    saveServerMap(map)
    trackEvent('server_downloaded', { provider: 'forge', version: versionId })
    emit('done', { serverId: server.id })
    return { ok: true, server, dir: finalDir }
  } finally {
    fs.rm(installerPath, { force: true }, () => {})
  }
}

async function installServer(cfg) {
  const provider = cfg.provider
  const versionId = String(cfg.version || '')
  if (!['vanilla', 'paper', 'fabric', 'forge'].includes(provider)) throw new Error('Proveedor no válido')
  if (!versionId) throw new Error('Selecciona una versión')

  const root = (isStr(cfg.installRoot) && cfg.installRoot.trim() ? path.resolve(cfg.installRoot.trim()) : defaultServersRoot())
  const finalDir = path.join(root, slugify(cfg.folderName || cfg.name))
  if (!isInsideDir(finalDir, root)) throw new Error('Carpeta de destino no válida')

  const map = getAllServersMap()
  for (const s of Object.values(map)) {
    if (s && s.jarPath && path.resolve(path.dirname(s.jarPath)) === finalDir) {
      throw new Error(`Esa carpeta ya la usa '${s.name}'`)
    }
  }
  fs.mkdirSync(finalDir, { recursive: true })

  const token = crypto.randomUUID()
  const ctrl = new AbortController()
  activeDownloads.set(token, ctrl)

  const emit = (phase, extra = {}) => sendToRenderer('downloads:progress', { token, phase, ...extra })

  try {
    if (provider === 'forge') return await installForge(cfg, versionId, finalDir, emit, ctrl)

    const destPath = path.join(finalDir, 'server.jar')
    if (fs.existsSync(destPath)) throw new Error('Ya existe un server.jar en esa carpeta')

    let target
    if (provider === 'vanilla') {
      target = { url: await getVanillaServerUrl(versionId), sha256: null }
    } else if (provider === 'fabric') {
      target = { url: await getFabricServerUrl(versionId), sha256: null }
    } else {
      const build = await getPaperBuild(versionId)
      target = { url: build.url, sha256: build.sha256 }
    }

    try {
      emit('download', { provider })
      const dl = await downloadToFile(target.url, destPath, {
        signal: ctrl.signal,
        onProgress: ({ received, total }) => emit('download', { received, total })
      })
      emit('verify', { received: dl.received, total: dl.total })
      if (target.sha256) {
        const actual = await sha256File(destPath)
        if (actual.toLowerCase() !== target.sha256.toLowerCase()) {
          throw new Error('La descarga no superó la verificación de integridad')
        }
      }
    } catch (err) {
      fs.rm(destPath, { force: true }, () => {})
      throw err
    }

    const server = buildServerRecord({
      name: cfg.name,
      jarPath: destPath,
      javaPath: cfg.javaPath,
      minRam: cfg.minRam,
      maxRam: cfg.maxRam,
      extraArgs: cfg.extraArgs,
      color: cfg.color
    })
    map[server.id] = server
    saveServerMap(map)
    trackEvent('server_downloaded', { provider, version: versionId })
    emit('done', { serverId: server.id })
    return { ok: true, server, dir: finalDir }
  } finally {
    activeDownloads.delete(token)
  }
}

// ─── IPC ─────────────────────────────────────────────────────────────────────

function registerDownloadsIpc() {
  ipcMain.handle('downloads:versions', async (_, provider) => {
    if (!['vanilla', 'paper', 'fabric', 'forge'].includes(provider)) return { ok: false, error: 'Proveedor no válido' }
    try {
      const result = provider === 'vanilla'
        ? await listVanillaVersions()
        : provider === 'fabric'
          ? await listFabricVersions()
          : provider === 'forge'
            ? await listForgeVersions()
            : await listPaperVersions()
      return { ok: true, latest: result.latest || null, versions: normalizeVersions(result.versions) }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('downloads:java', (_, versionId) => ({ ok: true, major: minJavaFor(versionId) }))

  ipcMain.handle('downloads:defaultDir', () => ({ ok: true, dir: defaultServersRoot() }))

  ipcMain.handle('downloads:install', async (_, input) => {
    if (!isPlainObject(input)) return { ok: false, error: 'Datos inválidos' }
    try {
      const cfg = {
        provider: input.provider,
        version: input.version,
        name: cleanText(String(input.name || ''), 40),
        folderName: slugify(input.folderName || input.name),
        installRoot: input.installRoot,
        color: input.color,
        minRam: input.minRam,
        maxRam: input.maxRam,
        javaPath: isValidJavaPath(input.javaPath) && input.javaPath ? input.javaPath : null,
        extraArgs: cleanText(String(input.extraArgs || ''), 512)
      }
      return await installServer(cfg)
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('downloads:cancel', (_, token) => {
    const ctrl = activeDownloads.get(token)
    if (!ctrl) return { ok: false, error: 'No hay descarga activa' }
    ctrl.abort()
    return { ok: true }
  })
}

module.exports = { registerDownloadsIpc }