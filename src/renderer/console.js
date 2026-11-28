// ─── Console ──────────────────────────────────────────────────────────────────
function initConsole() {
  const input = document.getElementById('cmd-input')
  const send = document.getElementById('cmd-send')
  const history = []
  let histIdx = -1
  const doSend = async () => {
    const val = input.value.trim()
    if (!val || !state.currentServerId) return
    history.unshift(val)
    histIdx = -1
    input.value = ''
    let res = null
    try {
      res = await window.api.sendCommand(state.currentServerId, val)
    } catch (e) {
      console.error(`[${T('run.sendCommand')}]`, e)
    }
    if (res && res.ok === false) {
      appendLog(T('log.error', { msg: res.error || T('log.sendFailed') }), 'error')
      return
    }
    if (res) appendLog(`> ${val}`, 'info')
  }
  send.onclick = doSend
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      doSend()
      return
    }
    if (e.key === 'ArrowUp') {
      histIdx = Math.min(histIdx + 1, history.length - 1)
      input.value = history[histIdx] || ''
    }
    if (e.key === 'ArrowDown') {
      histIdx = Math.max(histIdx - 1, -1)
      input.value = histIdx < 0 ? '' : history[histIdx]
    }
  }
}

function appendLog(text, type = 'info') {
  const c = document.getElementById('console')
  const div = document.createElement('div')
  div.className = `log-line ${type}`
  div.textContent = text
  c.appendChild(div)
  state.consoleLines++
  if (state.consoleLines > MAX_LINES) {
    c.removeChild(c.firstChild)
    state.consoleLines--
  }
  c.scrollTop = c.scrollHeight
}
