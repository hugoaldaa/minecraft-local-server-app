// Reinicio programado: el programador vive ahora en maintenance.js (Fase 2.4),
// que unifica backup automático y reinicio en un solo trabajo por servidor.
'use strict'

const { registerRestartIpc } = require('./maintenance')

module.exports = { registerRestartIpc }
