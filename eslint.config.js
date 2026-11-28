'use strict'

const fs = require('fs')
const path = require('path')

// Los archivos del renderer son scripts clásicos: comparten un único ámbito
// global. Declaramos sus nombres de primer nivel como globales de solo lectura
// para que `no-undef` siga detectando erratas y referencias reales.
function sharedRendererGlobals() {
  const files = ['src/renderer.js', 'src/i18n.js']
  const dir = 'src/renderer'
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.js'))
      .forEach(f => files.push(path.join(dir, f)))
  }
  const names = new Set()
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/) || line.match(/^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/)
      if (m) names.add(m[1])
    }
  }
  const globals = {}
  names.forEach(n => {
    globals[n] = 'readonly'
  })
  return globals
}

const nodeGlobals = {
  require: 'readonly',
  module: 'readonly',
  exports: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  global: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  queueMicrotask: 'readonly',
  URL: 'readonly',
  fetch: 'readonly',
  AbortController: 'readonly'
}

const browserGlobals = {
  ...nodeGlobals,
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  confirm: 'readonly',
  alert: 'readonly',
  localStorage: 'readonly',
  getComputedStyle: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  matchMedia: 'readonly',
  Blob: 'readonly',
  URLSearchParams: 'readonly',
  I18N: 'readonly'
}

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-constant-condition': ['warn', { checkLoops: false }],
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-redeclare': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error'
}

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'web/**', 'assets/**']
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: nodeGlobals
    },
    rules
  },
  {
    files: ['src/renderer.js', 'src/i18n.js', 'src/renderer/**/*.js', 'src/index.html/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...browserGlobals, ...sharedRendererGlobals() }
    },
    // Los scripts comparten ámbito global: una declaración en un archivo se
    // usa en otros, por lo que no-redeclare/no-unused-vars darían falsos
    // positivos. no-undef se mantiene activo para detectar erratas.
    rules: { ...rules, 'no-redeclare': 'off', 'no-unused-vars': 'off' }
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals
    },
    rules
  }
]
