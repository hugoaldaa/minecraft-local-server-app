// ─── Analytics consent ────────────────────────────────────────────────────────
document.getElementById('btn-consent-yes').onclick = async () => {
  await run(T('run.consent'), () => window.api.setAnalyticsConsent(true))
  showScreen('servers')
}
document.getElementById('btn-consent-no').onclick = async () => {
  await run(T('run.consent'), () => window.api.setAnalyticsConsent(false))
  showScreen('servers')
}
