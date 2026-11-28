// Fase 4: la web de descarga debe apuntar a los nombres que realmente genera
// electron-builder y ofrecer el fichero SHA256SUMS publicado por CI.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

test('los enlaces de descarga usan el artifactName configurado', () => {
  const base = pkg.build.artifactName.replace('${ext}', '')
  assert.ok(base, 'artifactName debe definir la base de los instaladores')
  const links = [...html.matchAll(/data-f="([^"]+)"/g)].map(m => m[1])
  const exeVar = html.match(/var EXE="([^"]+)"/)
  if (exeVar) links.push(exeVar[1])
  for (const ext of ['exe', 'AppImage', 'deb']) {
    assert.ok(links.includes(`${base}${ext}`), `falta el enlace a ${base}${ext}`)
  }
  // Nombres con espacios: los generaba la config anterior y rompían las descargas.
  assert.equal(/Minecraft Local Server Manager\.(?:exe|AppImage|deb)/.test(html), false)
})

test('la web ofrece SHA256SUMS y refleja las funciones recientes', () => {
  assert.ok(html.includes('data-f="SHA256SUMS"'), 'debe enlazar el fichero de checksums')
  for (const text of [
    'Reinicios programados',
    'Diagnóstico de errores',
    'Notificaciones',
    'Instalador integrado',
    'Verifica tu descarga:'
  ]) {
    assert.ok(html.includes(text), `falta la sección "${text}"`)
  }
  for (const translation of ['Scheduled restarts', 'Error diagnosis', 'Notifications', 'Built-in installer', 'Verify your download:']) {
    assert.ok(html.includes(translation), `falta la traducción "${translation}"`)
  }
})

test('los scripts en línea de la web son sintácticamente válidos', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1])
  assert.equal(scripts.length, 3)
  scripts.forEach((code, i) => new vm.Script(code, { filename: `web/index.html#script-${i + 1}` }))
})
