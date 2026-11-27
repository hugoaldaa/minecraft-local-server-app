// ─── Server list ──────────────────────────────────────────────────────────────
async function refreshServersGrid() {
  const servers = await run(T('run.loadServers'), () => window.api.listServers(), [])
  const statusAll = await run(T('run.serversStatus'), () => window.api.getStatusAll(), {}) || {}
  state.servers = servers
  const grid = document.getElementById('servers-grid')
  const active = Object.keys(statusAll).length
  const externalCount = Object.values(statusAll).filter(s => s && s.external).length
  const banner = document.getElementById('servers-banner')
  banner.classList.toggle('hidden', externalCount === 0)
  banner.textContent = T('servers.externalNote', { count: externalCount })
  document.getElementById('servers-title').textContent = T('servers.title')
  document.getElementById('servers-sub').textContent = T('servers.sub', { count: state.servers.length, active })

  if (!state.servers.length) {
    fill(grid,
      h('div', { class: 'server-empty' },
        h('div', { class: 'big-icon', text: '🗂️' }),
        h('p', { text: T('servers.empty') }),
        h('p', { class: 'server-empty-sub', text: T('servers.emptyHint') })
      )
    )
    return
  }
  fill(grid, ...state.servers.map(s => {
    const st = statusAll[s.id]
    const running = !!st
    const external = !!(st && st.external)
    const statusAttrs = { class: `server-card-status${external ? ' is-external' : ''}` }
    if (external) statusAttrs.title = T('status.externalHint', { pid: st.pid || '?' })
    return h('div', { class: 'server-card', 'data-server-id': s.id, 'data-color': s.color || SERVER_COLORS[0] },
      h('div', { class: 'server-card-header' },
        h('div', { class: 'server-card-name', text: s.name }),
        h('div', statusAttrs,
          h('span', { class: `dot ${external ? 'external' : (running ? 'on' : 'off')}` }),
          h('span', { text: external ? T('status.external') : (running ? T('status.online') : T('status.stopped')) })
        )
      )
    )
  }))
  grid.querySelectorAll('.server-card').forEach(card => {
    card.style.setProperty('--card-color', safeColor(card.dataset.color))
  })
}

async function openServer(serverId) {
  state.currentServerId = serverId
  const server = state.servers.find(s => s.id === serverId) || await run(T('run.openServer'), () => window.api.getServer(serverId))
  if (!server) return
  state.currentServerDir = serverDirOf(server)
  state.currentServer = server

  document.getElementById('sbar-server-name').textContent = server.name
  document.getElementById('sbar-server-name').style.color = safeColor(server.color)

  const console_ = document.getElementById('console')
  console_.textContent = ''
  state.consoleLines = 0
    ; (state.consoleLogs[serverId] || []).slice(-MAX_LINES).forEach(l => appendLog(l.text, l.type))

  const status = await run(T('run.serverStatus'), () => window.api.getStatus(serverId), { running: false })
  const external = !!(status && status.external)
  state.isRunning = !!(status && status.running && !external)
  updateDetailBar(state.isRunning, false, external)
  if (external) appendLog(T('status.externalHint', { pid: (status && status.pid) || '?' }), 'warn')

  const settings = await run(T('run.settings'), () => window.api.getSettings(serverId), {})
  loadConfigTab(server, settings || {})
  loadPropertiesTab(server)
  loadListsTab(server)
  loadBackupsTab(server, settings || {})
  loadNotificacionesTab()
  renderPlayers()
  loadServerStats()

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelector('.nav-item[data-tab="console"]').classList.add('active')
  document.getElementById('tab-console').classList.add('active')

  showScreen('detail')
  initDetailNav()
  initConsole()
  initStats()
  initPlayers()
  initLists(server)
}

