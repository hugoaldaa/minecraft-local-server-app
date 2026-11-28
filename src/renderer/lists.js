// ─── Lists ────────────────────────────────────────────────────────────────────
function initLists(server) {
  const serverDir = serverDirOf(server)
  document.getElementById('wl-add').onclick = () => addToList('whitelist', serverDir)
  document.getElementById('wl-input').onkeydown = e => {
    if (e.key === 'Enter') addToList('whitelist', serverDir)
  }
  document.getElementById('bl-add').onclick = () => addToList('banlist', serverDir)
  document.getElementById('bl-input').onkeydown = e => {
    if (e.key === 'Enter') addToList('banlist', serverDir)
  }
  document.getElementById('whitelist-toggle').onchange = async e => {
    if (!state.currentServerId) return
    const cmd = e.target.checked ? 'whitelist on' : 'whitelist off'
    let res = null
    try {
      res = await window.api.sendCommand(state.currentServerId, cmd)
    } catch (err) {
      console.error('[whitelist]', err)
      appendLog(T('log.error', { msg: err?.message || err }), 'error')
      e.target.checked = !e.target.checked
      return
    }
    if (res && res.ok === false) {
      // Servidor parado (o consola sin conectar): persistir en server.properties
      // para que la whitelist quede activada al arrancar y el check se quede.
      if (state.currentServerDir) {
        try {
          await window.api.writeProperties(state.currentServerDir, {
            'white-list': e.target.checked ? 'true' : 'false'
          })
        } catch (err2) {
          console.error('[whitelist] props write', err2)
          appendLog(T('log.error', { msg: err2?.message || err2 }), 'error')
          e.target.checked = !e.target.checked
        }
      } else {
        e.target.checked = !e.target.checked
        appendLog(T('log.error', { msg: res.error }), 'error')
      }
    }
  }
  loadListsTab(server)
}

async function reloadLists() {
  const serverDir = state.currentServerDir
  if (!serverDir) return
  const wl = await run(T('run.readWhitelist'), () => window.api.readWhitelist(serverDir), { list: [] })
  const bl = await run(T('run.readBanlist'), () => window.api.readBanlist(serverDir), { list: [] })
  renderList('whitelist-ul', (wl && wl.list) || [], 'whitelist')
  renderList('banlist-ul', (bl && bl.list) || [], 'banlist', true)
  try {
    const props = await window.api.readProperties(serverDir)
    if (props && typeof props === 'object') {
      const toggle = document.getElementById('whitelist-toggle')
      if (toggle) toggle.checked = String(props['white-list'] || 'false') === 'true'
    }
  } catch (_) {}
}

async function loadListsTab(server) {
  const serverDir = serverDirOf(server)
  if (!serverDir) return
  state.currentServerDir = serverDir
  await reloadLists()
}

function renderList(id, list, type, showReason = false) {
  const ul = document.getElementById(id)
  if (!ul) return
  if (!list.length) {
    fill(ul, h('li', { class: 'list-empty', text: T('lists.empty') }))
    return
  }
  fill(
    ul,
    ...list.map(entry => {
      const name = entry.name || entry
      const reason = entry.reason || ''
      return h(
        'li',
        {},
        h(
          'div',
          {},
          h('div', { class: 'list-name', text: name }),
          showReason && reason ? h('div', { class: 'list-sub', text: reason }) : null
        ),
        h('button', {
          class: 'btn-remove',
          'data-list-type': type,
          'data-name': String(name),
          'data-uuid': entry.uuid || '',
          text: '✕'
        })
      )
    })
  )
}

// Vía única de escritura (#8): si el servidor está en marcha manda el comando
// (vanilla resuelve UUID y persiste); si no, se escribe solo el archivo (el
// main completa el UUID offline). Nunca ambas a la vez.
async function listWrite(type, serverDir, list, cmd) {
  if (state.isRunning && state.currentServerId && cmd) {
    const res = await run(T('run.list'), () => window.api.sendCommand(state.currentServerId, cmd))
    if (res && res.ok === false) return res
    return { ok: true }
  }
  return type === 'whitelist' ? window.api.writeWhitelist(serverDir, list) : window.api.writeBanlist(serverDir, list)
}

async function addToList(type, serverDir) {
  const inputId = type === 'whitelist' ? 'wl-input' : 'bl-input'
  const val = document.getElementById(inputId).value.trim()
  if (!val || !serverDir) return
  try {
    if (type === 'whitelist') {
      const { list } = await window.api.readWhitelist(serverDir)
      if (list.find(e => (e.name || e) === val)) {
        document.getElementById(inputId).value = ''
        return
      }
      list.push({ uuid: '', name: val })
      const res = await listWrite('whitelist', serverDir, list, `whitelist add ${val}`)
      if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
    } else {
      const reason = document.getElementById('bl-reason').value.trim() || 'Banned by admin'
      const { list } = await window.api.readBanlist(serverDir)
      if (list.find(e => (e.name || e) === val)) {
        document.getElementById(inputId).value = ''
        return
      }
      list.push({ uuid: '', name: val, reason, created: new Date().toISOString(), source: 'Minecraft Manager', expires: 'forever' })
      const res = await listWrite('banlist', serverDir, list, `ban ${val} ${reason}`)
      if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
      document.getElementById('bl-reason').value = ''
    }
    document.getElementById(inputId).value = ''
  } catch (err) {
    console.error(`[${T('run.addToList')}]`, err)
    appendLog(T('log.error', { msg: err?.message || err }), 'error')
    return
  }
  const server = await run(T('run.reloadLists'), () => window.api.getServer(state.currentServerId))
  if (server) loadListsTab(server)
}

// Identidad por nombre/uuid, nunca por índice de render (#9)
async function removeFromList(type, name, uuid) {
  const serverDir = state.currentServerDir
  if (!serverDir || !name) return
  try {
    const read = type === 'whitelist' ? window.api.readWhitelist : window.api.readBanlist
    const { list } = await read(serverDir)
    let idx = -1
    if (uuid) idx = list.findIndex(e => e.uuid && e.uuid === uuid)
    if (idx === -1) idx = list.findIndex(e => (e.name || e) === name)
    if (idx === -1) {
      appendLog(T('lists.entryGone'), 'warn')
      reloadLists()
      return
    }
    list.splice(idx, 1)
    const cmd = type === 'whitelist' ? `whitelist remove ${name}` : `pardon ${name}`
    const res = await listWrite(type, serverDir, list, cmd)
    if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
  } catch (err) {
    console.error(`[${T('run.removeFromList')}]`, err)
    appendLog(T('log.error', { msg: err?.message || err }), 'error')
    return
  }
  const server = await run(T('run.reloadLists'), () => window.api.getServer(state.currentServerId))
  if (server) loadListsTab(server)
}
