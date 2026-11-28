'use strict'

const nodemailer = require('nodemailer')
const { settingsStore } = require('./stores')

const EMAIL_PREF_KEYS = [
  'emailEnabled', 'emailHost', 'emailPort', 'emailSecure',
  'emailUser', 'emailPass', 'emailFrom', 'emailTo',
  'emailNotifyServer', 'emailNotifyBackups', 'emailNotifyPlayers'
]

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getEmailConfig() {
  return {
    enabled: settingsStore.get('emailEnabled') === true,
    host: asText(settingsStore.get('emailHost')),
    port: Number.parseInt(settingsStore.get('emailPort'), 10) || 587,
    secure: settingsStore.get('emailSecure') === true,
    user: asText(settingsStore.get('emailUser')),
    pass: typeof settingsStore.get('emailPass') === 'string' ? settingsStore.get('emailPass') : '',
    from: asText(settingsStore.get('emailFrom')),
    to: asText(settingsStore.get('emailTo'))
  }
}

function isEmailConfigReady(config = getEmailConfig()) {
  return !!(config.host && config.port && config.to && config.from)
}

function createTransport(config = getEmailConfig()) {
  const opts = {
    host: config.host,
    port: config.port,
    secure: config.secure
  }
  if (config.user || config.pass) {
    opts.auth = { user: config.user, pass: config.pass }
  }
  return nodemailer.createTransport(opts)
}

function buildEmailContent(payload, data = {}) {
  const when = new Date().toLocaleString('es-ES')
  const server = data && data.name ? String(data.name) : ''
  const detail = data && data.detail ? String(data.detail) : ''
  const subject = `[Minecraft Manager] ${payload.title}${server ? ` - ${server}` : ''}`
  const lines = [
    payload.title,
    '',
    payload.body || '',
    server ? `Servidor: ${server}` : '',
    detail ? `Detalle: ${detail}` : '',
    `Fecha: ${when}`
  ].filter(Boolean)
  const text = lines.join('\n')
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5;">
    <h2 style="margin:0 0 12px;">${escapeHtml(payload.title)}</h2>
    <p style="margin:0 0 16px;">${escapeHtml(payload.body || '')}</p>
    <table style="border-collapse:collapse;">
      ${server ? row('Servidor', server) : ''}
      ${detail ? row('Detalle', detail) : ''}
      ${row('Fecha', when)}
    </table>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;">Minecraft Local Server Manager</p>
  </body></html>`
  return { subject, text, html }
}

function row(label, value) {
  return `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;">${escapeHtml(label)}</td><td style="padding:4px 0;">${escapeHtml(String(value))}</td></tr>`
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

async function sendNotificationEmail(payload, data = {}) {
  const config = getEmailConfig()
  if (!config.enabled || !isEmailConfigReady(config)) return { ok: false, skipped: true }
  const transport = createTransport(config)
  const content = buildEmailContent(payload, data)
  await transport.sendMail({
    from: config.from,
    to: config.to,
    subject: content.subject,
    text: content.text,
    html: content.html
  })
  return { ok: true }
}

async function sendTestEmail() {
  const config = getEmailConfig()
  if (!isEmailConfigReady(config)) return { ok: false, error: 'Configuración de correo incompleta' }
  const transport = createTransport(config)
  const payload = {
    title: 'Prueba de correo',
    body: 'Esta es una notificación de prueba de Minecraft Local Server Manager.'
  }
  const content = buildEmailContent(payload, { name: 'Servidor de prueba', detail: 'Test' })
  await transport.sendMail({
    from: config.from,
    to: config.to,
    subject: content.subject,
    text: content.text,
    html: content.html
  })
  return { ok: true }
}

module.exports = {
  EMAIL_PREF_KEYS,
  getEmailConfig,
  isEmailConfigReady,
  buildEmailContent,
  sendNotificationEmail,
  sendTestEmail
}
