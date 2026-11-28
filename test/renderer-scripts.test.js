// Regresión del troceado del renderer (Fase 2.7): carga los scripts clásicos
// en el mismo orden que el HTML, con un DOM simulado, y comprueba que todas
// las funciones compartidas siguen disponibles en el ámbito global.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8')
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1])

// Nodo permissivo: cualquier propiedad devuelve otro nodo, así los handlers
// de arranque se pueden asignar sin necesidad de un DOM real.
function fakeNode() {
  const target = function () {}
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'dataset' || prop === 'style') return {}
      if (prop === 'classList')
        return {
          add() {},
          remove() {},
          toggle() {},
          contains() {
            return false
          }
        }
      if (prop === 'textContent' || prop === 'value' || prop === 'checked') return t[prop] ?? ''
      if (prop === 'length') return 0
      if (prop === 'then' || typeof prop === 'symbol') return undefined
      if (prop in t) return t[prop]
      return fakeNode()
    },
    set(t, prop, value) {
      t[prop] = value
      return true
    },
    apply() {
      return fakeNode()
    },
    construct() {
      return fakeNode()
    }
  })
}

test('los scripts del renderer se cargan en orden y comparten el ámbito global', async () => {
  assert.ok(scripts.length >= 20, 'el HTML debe cargar renderer.js y sus módulos')

  const api = new Proxy({}, { get: () => () => Promise.resolve(null) })
  let onReady = null
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    navigator: { platform: 'test' },
    localStorage: { getItem: () => null, setItem() {} },
    confirm: () => false,
    alert() {},
    Blob: class {},
    window: { api, addEventListener() {} },
    document: new Proxy(fakeNode(), {
      get(t, prop) {
        if (prop === 'addEventListener')
          return (type, cb) => {
            if (type === 'DOMContentLoaded') onReady = cb
          }
        if (prop === 'documentElement') return fakeNode()
        const node = fakeNode()
        return Reflect.get(node, prop, node)
      },
      set(t, prop, value) {
        t[prop] = value
        return true
      }
    }),
    I18N: { t: k => k, onLangChange() {}, setLang() {}, getLang: () => 'es', locale: () => 'es' }
  }
  sandbox.window.window = sandbox.window
  sandbox.globalThis = sandbox
  const context = vm.createContext(sandbox)

  for (const src of scripts) {
    const file = path.join(root, 'src', src)
    assert.ok(fs.existsSync(file), `falta el script ${src}`)
    const code = fs.readFileSync(file, 'utf8')
    vm.runInContext(code, context, { filename: src })
  }

  for (const name of ['initEvents', 'initSettings', 'loadBackupsTab', 'showToast', 'renderUpdateState', 'loadServerStats']) {
    assert.equal(typeof context[name], 'function', `${name} debe estar disponible tras cargar los scripts`)
  }

  // Ejecutar el arranque detecta referencias rotas entre módulos (p. ej. un
  // init* movido al archivo equivocado) que el solo parseo no descubriría.
  assert.equal(typeof onReady, 'function', 'debe registrarse el arranque de la UI')
  await onReady()
})
