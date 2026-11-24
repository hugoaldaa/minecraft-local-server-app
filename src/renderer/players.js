// ─── Players ──────────────────────────────────────────────────────────────────
function initPlayers() {
  document.getElementById('btn-refresh-players').onclick = async () => {
    if (!state.currentServerId) return
    let res = null
    try {
      res = await window.api.sendCommand(state.currentServerId, 'list')
    } catch (e) {
      console.error(`[${T('run.refreshPlayers')}]`, e)
    }
    if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
  }
}

function parsePlayersFromLog(serverId, line) {
  const join = line.match(/(\w+) joined the game/)
  const leave = line.match(/(\w+) left the game/)
  const list = line.match(/There are \d+ of a max of \d+ players online: (.+)/)
  if (!join && !leave && !list) return
  const players = playersOf(serverId)
  if (join) players.add(join[1])
  if (leave) players.delete(leave[1])
  if (list) {
    players.clear()
    list[1].split(',').map(n => n.trim()).filter(Boolean).forEach(n => players.add(n))
  }
  if (state.currentServerId === serverId) renderPlayers()
}

function renderPlayers() {
  const grid = document.getElementById('players-grid')
  if (!grid) return
  const players = state.playersByServer[state.currentServerId]
  if (!players || !players.size) {
    fill(grid, h('div', { class: 'empty-state', text: T('players.none') }))
    return
  }
  fill(grid, ...[...players].map(name => h('div', { class: 'player-card' },
    h('div', { class: 'player-avatar', text: '🧑' }),
    h('div', {},
      h('div', { class: 'player-name', text: name }),
      h('div', { class: 'player-status', text: T('status.online') })
    )
  )))
}

