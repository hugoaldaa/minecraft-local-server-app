// Sube a la release de GitHub todos los ficheros generados en dist/.
// Se usa en CI en lugar de `--publish always`: electron-builder publica desde
// los dos jobs del matrix en paralelo y puede crear la release dos veces.
// Aquí la release ya existe (job prepare-release) y `gh upload --clobber`
// sustituye los assets de forma segura en reintentos.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST_DIR = path.join(ROOT, 'dist')
const IGNORED = new Set(['builder-debug.yml', 'builder-effective-config.yaml'])

const tag = process.argv[2]
if (!tag) {
  console.error('Uso: node scripts/upload-release-assets.mjs <tag>')
  process.exit(1)
}
if (!fs.existsSync(DIST_DIR)) {
  console.error(`[upload] No existe ${path.relative(ROOT, DIST_DIR)}`)
  process.exit(1)
}

const files = fs
  .readdirSync(DIST_DIR, { withFileTypes: true })
  .filter(entry => entry.isFile() && !IGNORED.has(entry.name) && !/^SHA256SUMS/.test(entry.name))
  .map(entry => path.join(DIST_DIR, entry.name))
  .sort()

if (!files.length) {
  console.error(`[upload] No hay ficheros para subir en ${path.relative(ROOT, DIST_DIR)}`)
  process.exit(1)
}

console.log(`[upload] Subiendo ${files.length} fichero(s) a la release ${tag}`)
execFileSync('gh', ['release', 'upload', tag, ...files, '--clobber'], {
  cwd: ROOT,
  stdio: 'inherit'
})
