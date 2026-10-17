const Store = require('electron-store')

const serversStore = new Store({ name: 'servers' })
const settingsStore = new Store({ name: 'settings' })
const analyticsStore = new Store({ name: 'analytics' })
const crashStore = new Store({ name: 'crashes' })
const statsStore = new Store({ name: 'serverStats' })

function getAllServersMap() { return serversStore.get('servers') || {} }
function saveServerMap(map) { serversStore.set('servers', map) }

function getServerSettings(serverId) { return settingsStore.get(`server_${serverId}`) || {} }
function setServerSettings(serverId, data) { settingsStore.set(`server_${serverId}`, data) }

// Carpeta global de backups (configurada en Ajustes, válida para todos)
function getGlobalBackupDir() { return settingsStore.get('backupDir') || '' }

// Historial de muestras de CPU/RAM por servidor (Fase 1: estadísticas por servidor).
// Cada muestra: { ts, cpu, ramUsed }
function getSamples(serverId) { return statsStore.get(`samples_${serverId}`) || [] }
function saveSamples(serverId, samples) { statsStore.set(`samples_${serverId}`, samples) }

// Eventos de jugadores con timestamps (Fase 1: joined/left del log del servidor).
// Cada evento: { ts, type: 'join' | 'leave', player }
function getPlayerEvents(serverId) { return statsStore.get(`playerEvents_${serverId}`) || [] }
function savePlayerEvents(serverId, events) { statsStore.set(`playerEvents_${serverId}`, events) }

// Hora de inicio/parada de un servidor, para calcular las horas encendido
// (Fase 2). startedAt/stoppingAt pueden ser nulos si el servidor sigue en marcha.
function getRunTime(serverId) { return statsStore.get(`run_${serverId}`) || null }
function saveRunTime(serverId, run) { statsStore.set(`run_${serverId}`, run) }

// Totales calculados por jugador (Fase 1): { totalMs, days: { 'YYYY-MM-DD': ms } }
function getPlayerTotals(serverId) { return statsStore.get(`playerTotals_${serverId}`) || {} }
function savePlayerTotals(serverId, totals) { statsStore.set(`playerTotals_${serverId}`, totals) }

module.exports = {
  serversStore,
  settingsStore,
  analyticsStore,
  crashStore,
  statsStore,
  getAllServersMap,
  saveServerMap,
  getServerSettings,
  setServerSettings,
  getGlobalBackupDir,
  getSamples,
  saveSamples,
  getPlayerEvents,
  savePlayerEvents,
  getPlayerTotals,
  savePlayerTotals,
  getRunTime,
  saveRunTime
}
