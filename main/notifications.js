// Notificaciones del sistema (Fase 2.3). Se envían al renderer como «toast»
// y, si el sistema lo permite, como notificación nativa de Windows/Linux.
// También pueden enviarse por correo si el usuario lo configura.
// Los helpers son puros para poder testearlos sin Electron.
'use strict'

const { settingsStore } = require('./stores')
const { sendToRenderer } = require('./state')

const PREF_BY_TYPE = {
  server_started: 'notifyServer',
  server_stopped: 'notifyServer',
  server_crash: 'notifyServer',
  server_restart: 'notifyServer',
  backup_done: 'notifyBackups',
  player_join: 'notifyPlayers',
  player_leave: 'notifyPlayers'
}

const EMAIL_PREF_BY_TYPE = {
  server_started: 'emailNotifyServer',
  server_stopped: 'emailNotifyServer',
  server_crash: 'emailNotifyServer',
  server_restart: 'emailNotifyServer',
  backup_done: 'emailNotifyBackups',
  player_join: 'emailNotifyPlayers',
  player_leave: 'emailNotifyPlayers'
}

const TEXTS = {
  es: {
    server_started: ['Servidor iniciado', '{{name}} ya está en línea.'],
    server_stopped: ['Servidor detenido', '{{name}} se ha detenido.'],
    server_crash: ['Servidor caído', '{{name}} se ha caído. {{detail}}'],
    server_restart: ['Servidor reiniciado', '{{name}} se ha reiniciado correctamente.'],
    backup_done: ['Backup creado', 'Copia de seguridad de {{name}} completada.'],
    player_join: ['Jugador conectado', '{{name}} se ha unido al servidor.'],
    player_leave: ['Jugador desconectado', '{{name}} ha salido del servidor.']
  },
  en: {
    server_started: ['Server started', '{{name}} is online now.'],
    server_stopped: ['Server stopped', '{{name}} has stopped.'],
    server_crash: ['Server crashed', '{{name}} crashed. {{detail}}'],
    server_restart: ['Server restarted', '{{name}} restarted successfully.'],
    backup_done: ['Backup created', 'Backup of {{name}} completed.'],
    player_join: ['Player joined', '{{name}} joined the server.'],
    player_leave: ['Player left', '{{name}} left the server.']
  }
}

function interpolate(text, data) {
  return String(text)
    .replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = data && data[key]
      return v === undefined || v === null || v === '' ? '' : String(v)
    })
    .trim()
}

// Devuelve { title, body } o null si el tipo es desconocido.
function buildNotification(type, data, lang) {
  const dict = TEXTS[lang] || TEXTS.es
  const entry = dict[type]
  if (!Array.isArray(entry)) return null
  return {
    type,
    title: interpolate(entry[0], data),
    body: interpolate(entry[1], data)
  }
}

function currentLang() {
  return settingsStore.get('lang') === 'en' ? 'en' : 'es'
}

function shouldNotify(type, prefs) {
  const pref = PREF_BY_TYPE[type]
  if (!pref) return false
  return prefs ? prefs[pref] === true : settingsStore.get(pref) === true
}

function shouldEmailNotify(type, prefs) {
  const pref = EMAIL_PREF_BY_TYPE[type]
  if (!pref) return false
  return prefs ? prefs[pref] === true : settingsStore.get(pref) === true
}

function canSendEmail() {
  return settingsStore.get('emailEnabled') === true
}

// Envía el «toast» al renderer y, además, una notificación nativa si está
// disponible. Si el correo está configurado, también lo envía en segundo plano.
// Nunca lanza: una notificación no debe romper el arranque.
function notify(type, data = {}) {
  const inApp = shouldNotify(type)
  const byEmail = canSendEmail() && shouldEmailNotify(type)
  if (!inApp && !byEmail) return false

  const payload = buildNotification(type, data, currentLang())
  if (!payload) return false

  if (inApp) {
    sendToRenderer('app-notification', payload)
    try {
      // Requerimiento diferido: en Node (tests) require('electron') devuelve una
      // ruta, no el módulo. Así los helpers de arriba siguen siendo testeables.
      const electron = require('electron')
      if (electron && typeof electron.Notification === 'function' && electron.Notification.isSupported()) {
        const native = new electron.Notification({ title: payload.title, body: payload.body })
        native.show()
      }
    } catch (_) {
      /* sin soporte nativo: el toast del renderer es suficiente */
    }
  }

  if (byEmail) {
    try {
      const { sendNotificationEmail } = require('./email')
      Promise.resolve(sendNotificationEmail(payload, data)).catch(() => {})
    } catch (_) {
      /* email no disponible: no romper notificación */
    }
  }

  return true
}

module.exports = { notify, buildNotification, shouldNotify, shouldEmailNotify, canSendEmail, PREF_BY_TYPE, EMAIL_PREF_BY_TYPE }
