const { app, ipcMain } = require('electron')
const os = require('os')
const crypto = require('crypto')
const https = require('https')
const { analyticsStore, settingsStore } = require('./stores')

// Genera un ID anónimo único por instalación (nunca contiene datos personales)
function getInstallId() {
  let id = analyticsStore.get('installId')
  if (!id) {
    id = crypto.randomUUID()
    analyticsStore.set('installId', id)
    analyticsStore.set('firstSeen', Date.now())
  }
  return id
}

function trackEvent(event, data = {}) {
  // Sin consentimiento explícito no se registra ni se guarda nada
  if (analyticsStore.get('analyticsEnabled', false) !== true) return
  const payload = {
    installId: getInstallId(),
    appVersion: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    osVersion: os.release(),
    event,
    data,
    timestamp: Date.now()
  }
  const endpoint = settingsStore.get('analyticsEndpoint')
  if (endpoint) {
    sendAnalyticsPayload(endpoint, payload)
  } else {
    // Guarda los últimos 500 eventos localmente para revisión
    const events = analyticsStore.get('events') || []
    events.push(payload)
    if (events.length > 500) events.splice(0, events.length - 500)
    analyticsStore.set('events', events)
  }
}

function sendAnalyticsPayload(endpoint, payload) {
  let url
  try {
    url = new URL(endpoint)
    if (url.protocol !== 'https:') return
  } catch (_) {
    return
  }
  try {
    const body = JSON.stringify(payload)
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      timeout: 5000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }
    const req = https.request(options)
    req.on('timeout', () => req.destroy())
    req.on('error', () => {}) // silencioso
    req.write(body)
    req.end()
  } catch (_) {}
}

function registerAnalyticsIpc() {
  ipcMain.handle('analytics:getConsent', () => analyticsStore.get('analyticsEnabled', null))
  ipcMain.handle('analytics:setConsent', (_, enabled) => {
    analyticsStore.set('analyticsEnabled', !!enabled)
    if (enabled) trackEvent('analytics_enabled')
    else analyticsStore.delete('events') // declinar purga los eventos locales
    return { ok: true }
  })
  // Ajustes → Privacidad y datos: purga los eventos locales guardados
  ipcMain.handle('analytics:clearEvents', () => {
    analyticsStore.delete('events')
    return { ok: true }
  })
}

module.exports = { trackEvent, sendAnalyticsPayload, registerAnalyticsIpc }
