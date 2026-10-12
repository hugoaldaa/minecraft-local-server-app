const { app, ipcMain } = require('electron')
const os = require('os')
const crypto = require('crypto')
const { crashStore, settingsStore } = require('./stores')
const { sendToRenderer } = require('./state')
const { sendAnalyticsPayload } = require('./analytics')

function setupCrashReporter() {
  process.on('uncaughtException', (err) => {
    logCrash('uncaughtException', err)
  })
  process.on('unhandledRejection', (reason) => {
    logCrash('unhandledRejection', reason)
  })
}

function logCrash(type, err) {
  const crash = {
    id: crypto.randomUUID(),
    type,
    message: err?.message || String(err),
    stack: err?.stack || '',
    appVersion: app.getVersion(),
    platform: process.platform,
    osVersion: os.release(),
    timestamp: Date.now()
  }
  try {
    const crashes = crashStore.get('crashes') || []
    crashes.unshift(crash)
    if (crashes.length > 100) crashes.splice(100)
    crashStore.set('crashes', crashes)
    crashStore.set('lastCrash', crash)
  } catch (_) { }

  // Notifica al renderer si la ventana existe
  sendToRenderer('crash-logged', crash)

  // Envía si hay endpoint configurado
  const endpoint = settingsStore.get('crashEndpoint')
  if (endpoint) sendAnalyticsPayload(endpoint, { type: 'crash', ...crash })
}

function registerCrashIpc() {
  ipcMain.handle('crashes:list', () => crashStore.get('crashes') || [])
  ipcMain.handle('crashes:clear', () => { crashStore.set('crashes', []); return { ok: true } })
  ipcMain.handle('crashes:getLast', () => crashStore.get('lastCrash') || null)
}

module.exports = { setupCrashReporter, logCrash, registerCrashIpc }
