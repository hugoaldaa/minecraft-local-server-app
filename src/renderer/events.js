// ─── Events from main ─────────────────────────────────────────────────────────
function initEvents() {
  window.api.onConsoleLine(({ serverId, text, type }) => {
    if (!state.consoleLogs[serverId]) state.consoleLogs[serverId] = []
    const logs = state.consoleLogs[serverId]
    logs.push({ text, type })
    if (logs.length > MAX_LINES) logs.splice(0, logs.length - MAX_LINES)
    if (state.currentServerId === serverId) appendLog(text, type)
    parsePlayersFromLog(serverId, text)
  })

  window.api.onServerStopped(({ serverId, code, error }) => {
    const msg = error ? T('log.serverStoppedError', { error }) : T('log.serverStopped', { code: code ?? 0 })
    if (state.currentServerId === serverId) { appendLog(msg, 'warn'); updateDetailBar(false); state.isRunning = false }
    // Solo se limpian los jugadores del servidor que se detuvo
    delete state.playersByServer[serverId]
    if (state.currentServerId === serverId) renderPlayers()
    refreshServersGrid()
  })

  window.api.onStatsUpdate(({ cpu, ramUsed, ramTotal, activeServers }) => {
    document.getElementById('tstat-cpu').textContent = `${cpu}%`
    document.getElementById('tstat-ram').textContent = `${ramUsed}/${ramTotal}MB`
    const badge = document.getElementById('tstat-active')
    badge.classList.toggle('hidden', activeServers.length === 0)
    if (activeServers.length > 0) document.getElementById('tstat-count').textContent = activeServers.length
  })

  window.api.onConfirmClose(({ count }) => {
    document.getElementById('modal-close').dataset.serverCount = count
    document.getElementById('modal-close-title').textContent = T('close.title')
    document.getElementById('modal-close-msg').textContent = T('close.msgWithCount', { count })
    document.getElementById('modal-close-level1').classList.remove('hidden')
    document.getElementById('modal-close-level2').classList.add('hidden')
    document.getElementById('modal-close').classList.remove('hidden')
  })

  window.api.onCrashLogged((crash) => {
    console.error('Crash logged:', crash)
  })

  window.api.onAppNotification(({ title, body, type }) => showToast(title, body, type))
}

// Notificación visual dentro de la app (además del aviso nativo del SO).
function showToast(title, body, type = 'info') {
  const container = document.getElementById('toast-container')
  if (!container || !title) return
  const toast = h('div', { class: 'toast', 'data-type': type },
    h('div', { class: 'toast-title', text: title }),
    body ? h('div', { class: 'toast-body', text: body }) : null
  )
  container.appendChild(toast)
  setTimeout(() => toast.remove(), 5000)
}

