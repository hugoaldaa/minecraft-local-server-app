// ─── Detail nav & bar ─────────────────────────────────────────────────────────
function initDetailNav() {
  document.querySelectorAll('#detail-nav .nav-item').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('#detail-nav .nav-item').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      btn.classList.add('active')
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')
      if (btn.dataset.tab === 'stats') {
        loadServerStats()
        if (state.isRunning) startStatsRefresh()
      } else {
        stopStatsRefresh()
      }
    }
  })
}

function updateDetailBar(running, starting = false, external = false) {
  state.detailBar = [running, starting, external]
  const dot = document.getElementById('sbar-dot-status')
  const text = document.getElementById('sbar-status-text')
  const start = document.getElementById('detail-btn-start')
  const stop = document.getElementById('detail-btn-stop')
  if (starting) { dot.className = 'dot starting'; text.textContent = T('status.starting'); start.disabled = true; stop.disabled = true }
  else if (external) { dot.className = 'dot external'; text.textContent = T('status.external'); start.disabled = true; stop.disabled = true }
  else if (running) { dot.className = 'dot on'; text.textContent = T('status.online'); start.disabled = true; stop.disabled = false }
  else { dot.className = 'dot off'; text.textContent = T('status.stopped'); start.disabled = false; stop.disabled = true }
}

document.getElementById('detail-btn-start').onclick = async () => {
  const id = state.currentServerId
  if (!id) return
  const server = await run(T('run.startServer'), () => window.api.getServer(id))
  if (!server) { appendLog(T('log.serverNotFound'), 'error'); return }
  updateDetailBar(false, true)
  appendLog(T('log.startingServer'), 'info')
  let res = null
  try {
    res = await window.api.startServer(id)
  } catch (e) {
    console.error(`[${T('run.startServer')}]`, e)
  }
  if (res && res.code === 'eula') {
    // #32: primer arranque requiere aceptar la EULA
    const ok = confirm(T('log.eulaConfirm'))
    if (ok) {
      appendLog(T('log.acceptingEula'), 'info')
      try { res = await window.api.startServer(id, true) } catch (e) { console.error(`[${T('run.startServer')}]`, e) }
    } else {
      appendLog(T('log.eulaCancelled'), 'warn')
      updateDetailBar(false)
      return
    }
  }
  if (res && res.ok) { state.isRunning = true; updateDetailBar(true); refreshServersGrid() }
  else { appendLog(T('log.error', { msg: res?.error || T('log.startFailed') }), 'error'); updateDetailBar(false) }
}

document.getElementById('detail-btn-stop').onclick = async () => {
  const id = state.currentServerId
  if (!id) return
  let res = null
  try {
    res = await window.api.stopServer(id)
  } catch (e) {
    console.error(`[${T('run.stopServer')}]`, e)
  }
  if (res && res.ok) {
    appendLog(T('log.stoppingServer'), 'warn')
  } else {
    appendLog(T('log.error', { msg: res?.error || T('log.stopFailed') }), 'error')
  }
}

