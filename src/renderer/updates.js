const UPDATE_STATE_KEYS = {
  idle: 'upd.state.idle',
  checking: 'upd.state.checking',
  latest: 'upd.state.latest',
  available: 'upd.state.available',
  downloading: 'upd.state.downloading',
  ready: 'upd.state.ready',
  error: 'upd.state.error',
  dev: 'upd.state.dev'
}

const UPDATE_STATE_CLASS = {
  idle: 'is-idle',
  checking: 'is-busy',
  latest: 'is-ok',
  available: 'is-warn',
  downloading: 'is-busy',
  ready: 'is-ok',
  error: 'is-err',
  dev: 'is-idle'
}

const UPDATE_PILL_KEYS = {
  available: 'upd.pill.available',
  downloading: 'upd.pill.downloading',
  ready: 'upd.pill.ready',
  error: 'upd.pill.error'
}

let updateCheckTimeout = null

function applyUpdateStatus(info) {
  const u = state.update
  if (info.status === 'available') {
    u.status = 'available'
    u.hasUpdate = true
    u.version = info.version || u.version
    u.notes = info.releaseNotes || u.notes
    u.lastChecked = new Date()
  } else if (info.status === 'latest') {
    u.status = 'latest'
    u.hasUpdate = false
    u.version = info.version || u.version
    u.notes = null
    u.lastChecked = new Date()
  } else if (info.status === 'downloading') {
    u.status = 'downloading'
    u.percent = info.percent || 0
  } else if (info.status === 'ready') {
    u.status = 'ready'
    u.version = info.version || u.version
    u.percent = 100
  } else if (info.status === 'error') {
    // Solo nos interesa el error si había una comprobación o descarga en marcha
    if (u.status === 'checking' || u.status === 'downloading' || u.hasUpdate) u.status = 'error'
  } else {
    u.status = info.status
  }
  renderUpdateState()
}

async function checkForUpdates() {
  clearTimeout(updateCheckTimeout)
  state.update.status = 'checking'
  renderUpdateState()
  const res = await run(T('run.settings'), () => window.api.checkUpdate(), {})
  if (res && res.status === 'dev') {
    state.update.status = 'dev'
    renderUpdateState()
  } else if (res && res.status === 'checking') {
    // Si la comprobación no contesta en 20s, mostramos error
    updateCheckTimeout = setTimeout(() => {
      if (state.update.status === 'checking') applyUpdateStatus({ status: 'error' })
    }, 20000)
  }
}

function renderUpdateState() {
  const u = state.update
  document.getElementById('btn-update-notify').classList.toggle('hidden', !u.hasUpdate)

  const stateEl = document.getElementById('upd-state')
  stateEl.textContent = T(UPDATE_STATE_KEYS[u.status] || UPDATE_STATE_KEYS.idle, { version: u.version || '', percent: u.percent || 0 })
  stateEl.className = 'set-row-hint upd-state ' + (UPDATE_STATE_CLASS[u.status] || '')

  const lastEl = document.getElementById('upd-lastcheck')
  if (u.lastChecked instanceof Date) {
    lastEl.removeAttribute('data-i18n')
    lastEl.textContent = u.lastChecked.toLocaleDateString() + ' ' + u.lastChecked.toLocaleTimeString()
  } else {
    lastEl.setAttribute('data-i18n', 'upd.never')
    lastEl.textContent = T('upd.never')
  }

  const card = document.getElementById('upd-card')
  card.classList.toggle('hidden', !u.hasUpdate)
  if (!u.hasUpdate) return

  document.getElementById('upd-newversion').textContent = T('upd.newVersion', { version: u.version || '?' })

  const pill = document.getElementById('upd-pill')
  pill.className = 'upd-pill ' + (UPDATE_STATE_CLASS[u.status] || 'is-idle')
  pill.textContent = T(UPDATE_PILL_KEYS[u.status] || 'upd.pill.available', { percent: u.percent || 0 })

  document.getElementById('upd-hint').textContent = T(
    'upd.hint.' + (['available', 'downloading', 'ready', 'error'].includes(u.status) ? u.status : 'available')
  )

  const downloading = u.status === 'downloading'
  const progress = document.getElementById('upd-progress')
  progress.classList.toggle('hidden', !downloading)
  if (downloading) document.getElementById('upd-bar').style.width = (u.percent || 0) + '%'

  document.getElementById('btn-update-download').classList.toggle('hidden', u.status === 'ready' || downloading)
  document.getElementById('btn-update-install').classList.toggle('hidden', u.status !== 'ready')

  renderUpdateNotes(u.notes)
}

// Markdown mínimo y seguro para las notas de la release: solo se crean nodos
// del DOM (nunca innerHTML), porque el texto viene de GitHub/latest.yml.
const INLINE_MARKDOWN = /(\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|`[^`]+`|\*\*[^*]+\*\*)/g

function tokenizeInline(text) {
  const source = String(text || '')
  const tokens = []
  const pattern = new RegExp(INLINE_MARKDOWN)
  let last = 0
  let match
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > last) tokens.push({ type: 'text', text: source.slice(last, match.index) })
    const value = match[0]
    if (value.startsWith('[')) {
      const link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      tokens.push({ type: 'link', text: link[1], href: link[2] })
    } else if (value.startsWith('`')) {
      tokens.push({ type: 'code', text: value.slice(1, -1) })
    } else {
      tokens.push({ type: 'strong', text: value.slice(2, -2) })
    }
    last = match.index + value.length
  }
  if (last < source.length) tokens.push({ type: 'text', text: source.slice(last) })
  if (!tokens.length) tokens.push({ type: 'text', text: source })
  return tokens
}

function appendInline(parent, text) {
  tokenizeInline(text).forEach(token => {
    if (token.type === 'link') {
      const a = document.createElement('a')
      a.href = token.href
      a.textContent = token.text
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      parent.appendChild(a)
    } else if (token.type === 'code' || token.type === 'strong') {
      const el = document.createElement(token.type === 'code' ? 'code' : 'strong')
      el.textContent = token.text
      parent.appendChild(el)
    } else {
      parent.appendChild(document.createTextNode(token.text))
    }
  })
}

// Convierte las notas crudas (string o array de electron-updater) en bloques:
// title, section, rule, list y text. Función pura para poder testearla.
function parseUpdateNotes(raw) {
  let lines = []
  if (Array.isArray(raw)) {
    raw.forEach((r, i) => {
      if (typeof r === 'string') lines.push(...r.split('\n'))
      else if (r && r.note) {
        if (raw.length > 1 && r.version) lines.push(`## ${r.version}`)
        lines.push(...String(r.note).split('\n'))
      }
      if (i === 0 && !lines.length) lines.push('')
    })
  } else if (raw) {
    lines = String(raw).split('\n')
  }

  const blocks = []
  let list = null
  const flushList = () => {
    if (list && list.length) blocks.push({ type: 'list', items: list })
    list = null
  }

  for (const rawLine of lines.map(l => l.trim()).filter(Boolean)) {
    if (/^---+$/.test(rawLine)) {
      flushList()
      blocks.push({ type: 'rule' })
      continue
    }
    const heading = rawLine.match(/^(#{2,4})\s+(.*)$/)
    if (heading) {
      flushList()
      blocks.push({ type: heading[1].length <= 2 ? 'title' : 'section', text: heading[2] })
      continue
    }
    const bullet = rawLine.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      if (!list) list = []
      list.push(bullet[1].replace(/^[-*]\s+/, ''))
      continue
    }
    flushList()
    blocks.push({ type: 'text', text: rawLine })
  }
  flushList()
  return blocks
}

function renderUpdateNotes(raw) {
  const wrap = document.getElementById('upd-notes')
  const box = document.getElementById('update-notes')
  box.textContent = ''

  const blocks = parseUpdateNotes(raw)
  if (!blocks.length) {
    box.textContent = T('upd.noNotes')
  } else {
    blocks.forEach(block => {
      if (block.type === 'rule') {
        box.appendChild(document.createElement('hr'))
      } else if (block.type === 'list') {
        const ul = document.createElement('ul')
        block.items.forEach(item => {
          const li = document.createElement('li')
          appendInline(li, item)
          ul.appendChild(li)
        })
        box.appendChild(ul)
      } else {
        const el = document.createElement(block.type === 'text' ? 'p' : 'div')
        el.className = block.type === 'text' ? 'update-notes-text' : `update-notes-${block.type}`
        appendInline(el, block.text)
        box.appendChild(el)
      }
    })
  }
  wrap.classList.remove('hidden')
}
