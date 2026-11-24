// ─── Actualizaciones (registro tardío, fuera del banner) ─────────────────────
window.api.onUpdateAvailable(() => {
  if (state.currentServerId) appendLog(T('update.availableLog'), 'info')
})

window.api.onUpdateDownloaded(() => {
  if (state.currentServerId) appendLog(T('update.downloadedLog'), 'success')
})

// ─── Idioma (ES/EN): repinta lo dinámico al cambiar ──────────────────────────
I18N.onLangChange(() => {
  updateMaxTitle()
  updateDetailBar(state.detailBar[0], state.detailBar[1], state.detailBar[2])
  if (document.getElementById('screen-servers').classList.contains('active')) refreshServersGrid()
  renderUpdateState()
  if (document.getElementById('screen-settings').classList.contains('active')) loadSettings()
  if (state.currentServerId) {
    renderPlayers()
    if (state.currentServer) loadListsTab(state.currentServer)
  }
  const count = document.getElementById('modal-close').dataset.serverCount || 0
  document.getElementById('modal-close-title').textContent = T('close.title')
  document.getElementById('modal-close-msg').textContent = T('close.msgWithCount', { count })
})

