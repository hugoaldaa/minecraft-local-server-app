// Helpers puros para versiones/descargas: sin dependencias de Electron, para
// poder ejecutarlos desde los tests con node:test.
'use strict'

// Java mínimo recomendado por versión de Minecraft:
//  ≤1.16.5 → 8 · 1.17–1.20.4 → 17 · ≥1.20.5 → 21
function minJavaFor(mcVersion) {
  const p = String(mcVersion || '').split('.').map(Number)
  const major = p[0]
  const minor = p[1] || 0
  const patch = p[2] || 0
  if (!Number.isFinite(major) || major < 1) return null
  if (major > 1) return 21
  if (minor > 20) return 21
  if (minor === 20 && patch >= 5) return 21
  if (minor >= 17) return 17
  return 8
}

function isPreRelease(version) {
  return /-(?:pre|rc|snapshot)/i.test(String(version))
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(x => parseInt(x, 10) || 0)
  const pb = String(b).split('.').map(x => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x !== y) return x - y
  }
  return isPreRelease(a) === isPreRelease(b) ? 0 : (isPreRelease(a) ? -1 : 1)
}

// Nombre de carpeta seguro: sin caracteres inválidos ni rutas relativas.
function slugify(name) {
  const s = String(name || '').trim().replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_').replace(/\s+/g, ' ').slice(0, 60)
  return s || 'server'
}

function parseVersionManifest(json) {
  const list = (json && Array.isArray(json.versions) ? json.versions : [])
    .filter(v => v && v.type === 'release' && /^\d+\.\d+(\.\d+)?$/.test(String(v.id)))
    .map(v => ({ id: v.id, time: (v.releaseTime || v.time || '') || null }))
  list.sort((a, b) => compareVersions(b.id, a.id))
  const latest = json && json.latest && typeof json.latest.release === 'string'
    ? json.latest.release
    : (list[0] && list[0].id) || null
  return { latest, releases: list }
}

function parseVersionJsonServer(json) {
  const s = json && json.downloads && json.downloads.server
  return s && typeof s.url === 'string' ? s.url : null
}

function parsePaperProjects(json) {
  const set = new Set()
  for (const group of Object.values((json && json.versions) || {})) {
    for (const id of group) set.add(String(id))
  }
  return Array.from(set)
    .filter(id => /^\d+\.\d+(\.\d+)?$/.test(id))
    .sort((a, b) => compareVersions(b, a))
}

function parsePaperBuilds(json) {
  const list = Array.isArray(json) ? json : (json && Array.isArray(json.builds) ? json.builds : [])
  for (const b of list) {
    if (!b || b.channel !== 'STABLE') continue
    const d = b.downloads && b.downloads['server:default']
    if (d && typeof d.url === 'string') {
      return {
        url: d.url,
        name: typeof d.name === 'string' ? d.name : 'server.jar',
        sha256: d.checksums && typeof d.checksums.sha256 === 'string' ? d.checksums.sha256 : null,
        size: Number.isFinite(d.size) ? d.size : null,
        build: b.id,
        time: b.time || null
      }
    }
  }
  return null
}

// Fabric publica todas las versiones (incluidas snapshots); solo interesan las
// estables, ordenadas de más nueva a más antigua. Reutiliza compareVersions.
function parseFabricGameVersions(json) {
  const list = (Array.isArray(json) ? json : [])
    .filter(v => v && v.stable === true && typeof v.version === 'string')
    .map(v => ({ id: v.version, time: null }))
  list.sort((a, b) => compareVersions(b.id, a.id))
  return list
}

// Forge: desde 1.17 el instalador genera scripts run.sh/run.bat y un fichero de
// argumentos bajo libraries/. Solo se ofrecen versiones 1.17+ (1.21+ no existe:
// pasó a NeoForge). Elige «recommended» sobre «latest» y ordena descendente.
function parseForgePromotions(json) {
  const promos = (json && json.promos) || {}
  const byMc = new Map()
  for (const [key, ver] of Object.entries(promos)) {
    const m = /^(\d+\.\d+(?:\.\d+)?)-(recommended|latest)$/.exec(key)
    if (!m || typeof ver !== 'string') continue
    const mc = m[1]
    if (compareVersions(mc, '1.17') < 0) continue
    const cur = byMc.get(mc) || {}
    cur[m[2]] = ver
    byMc.set(mc, cur)
  }
  const list = []
  for (const [mc, v] of byMc) list.push({ id: mc, forge: v.recommended || v.latest, recommended: !!v.recommended })
  list.sort((a, b) => compareVersions(b.id, a.id))
  return list
}

// Ruta relativa del fichero de argumentos que genera el instalador de Forge.
function forgeArgsRelPath(mcVersion, forgeVersion, platform) {
  const file = platform === 'win32' ? 'win_args.txt' : 'unix_args.txt'
  return ['libraries', 'net', 'minecraftforge', 'forge', `${mcVersion}-${forgeVersion}`, file].join('/')
}

// Contrato único para el renderer: toda versión es un objeto con `id`. Algunos
// proveedores (Paper) devuelven solo el string de la versión.
function normalizeVersions(list) {
  return (Array.isArray(list) ? list : []).map(v => (typeof v === 'string' ? { id: v } : v))
}

module.exports = {
  minJavaFor,
  isPreRelease,
  compareVersions,
  slugify,
  parseVersionManifest,
  parseVersionJsonServer,
  parsePaperProjects,
  parsePaperBuilds,
  parseFabricGameVersions,
  parseForgePromotions,
  forgeArgsRelPath,
  normalizeVersions
}
