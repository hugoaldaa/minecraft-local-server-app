// ─── Titlebar ─────────────────────────────────────────────────────────────────
function initTitlebar() {
  document.getElementById('btn-min').onclick = () => window.api.minimize()
  document.getElementById('btn-max').onclick = () => window.api.maximize()
  document.getElementById('btn-close').onclick = () => window.api.close()
  // Al abrir Ajustes siempre se empieza en General, no en la última sección usada
  document.getElementById('btn-settings').onclick = () => {
    showScreen('settings')
    setSettingsSection('general')
  }
  document.getElementById('btn-back-servers').onclick = () => showScreen('servers')
  window.api.onMaximized((isMaximized) => {
    state.maximized = isMaximized
    document.getElementById('btn-max').textContent = isMaximized ? '🗗' : '☐'
    updateMaxTitle()
  })
  updateMaxTitle()
}

function updateMaxTitle() {
  document.getElementById('btn-max').title = state.maximized ? T('win.restore') : T('win.maximize')
}

