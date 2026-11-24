document.addEventListener('DOMContentLoaded', async () => {
  initTitlebar()
  initEvents()
  initDelegates()
  initModal()
  renderColorOptions('ms-color-options', null)
  initUpdates()
  initSettings()

  // First run: check analytics consent
  const consent = await run(T('run.consent'), () => window.api.getAnalyticsConsent(), undefined)
  if (consent === null) showScreen('consent')
  else showScreen('servers')

  // ─── Actualizaciones ────────────────────────────────────────────────────────
  function initUpdates() {
    document.getElementById('btn-check-update').onclick = checkForUpdates
    document.getElementById('btn-update-download').onclick = () => run(T('run.settings'), () => window.api.downloadUpdate())
    document.getElementById('btn-update-install').onclick = () => window.api.installUpdate()
    // El icono ⬇ de la titlebar lleva directo a Ajustes → Actualizaciones
    document.getElementById('btn-update-notify').onclick = () => {
      showScreen('settings')
      setSettingsSection('updates')
    }

    window.api.onUpdateStatus((info) => applyUpdateStatus(info))
  }

})

