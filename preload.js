const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Servers CRUD
  listServers: () => ipcRenderer.invoke('servers:list'),
  createServer: (d) => ipcRenderer.invoke('servers:create', d),
  updateServer: (d) => ipcRenderer.invoke('servers:update', d),
  deleteServer: (id) => ipcRenderer.invoke('servers:delete', id),
  getServer: (id) => ipcRenderer.invoke('servers:get', id),

  // Server process
  startServer: (serverId, acceptEula) => ipcRenderer.invoke('server:start', { serverId, acceptEula }),
  stopServer: (serverId) => ipcRenderer.invoke('server:stop', serverId),
  sendCommand: (serverId, cmd) => ipcRenderer.invoke('server:command', { serverId, cmd }),
  getStatus: (serverId) => ipcRenderer.invoke('server:status', serverId),
  getStatusAll: () => ipcRenderer.invoke('server:statusAll'),
  javaCheck: (p) => ipcRenderer.invoke('java:check', p),

  // Properties / Lists / Backups
  readProperties: (dir) => ipcRenderer.invoke('props:read', dir),
  writeProperties: (dir, props) => ipcRenderer.invoke('props:write', { serverDir: dir, props }),
  readWhitelist: (dir) => ipcRenderer.invoke('whitelist:read', dir),
  writeWhitelist: (dir, list) => ipcRenderer.invoke('whitelist:write', { serverDir: dir, list }),
  readBanlist: (dir) => ipcRenderer.invoke('banlist:read', dir),
  writeBanlist: (dir, list) => ipcRenderer.invoke('banlist:write', { serverDir: dir, list }),
  createBackup: (sd, bd, sid) => ipcRenderer.invoke('backup:create', { serverDir: sd, backupDir: bd, serverId: sid }),
  listBackups: (bd) => ipcRenderer.invoke('backup:list', bd),
  deleteBackup: (p) => ipcRenderer.invoke('backup:delete', p),
  getBackupDir: (serverId) => ipcRenderer.invoke('backup:dir', serverId),

  // Settings
  getSettings: (serverId) => ipcRenderer.invoke('settings:get', serverId),
  saveSettings: (serverId, data) => ipcRenderer.invoke('settings:set', { serverId, data }),

  // Preferencias globales (Ajustes)
  getPref: (key) => ipcRenderer.invoke('prefs:get', key),
  setPref: (key, value) => ipcRenderer.invoke('prefs:set', { key, value }),

  // Auto-updater
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_, d) => cb(d)),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-status', (_, d) => { if (d.status === 'available') cb(d) }),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-status', (_, d) => { if (d.status === 'ready') cb(d) }),

  // Descarga/instalación de servidores
  listDownloadVersions: (provider) => ipcRenderer.invoke('downloads:versions', provider),
  minJavaFor: (versionId) => ipcRenderer.invoke('downloads:java', versionId),
  getDefaultServerDir: () => ipcRenderer.invoke('downloads:defaultDir'),
  installServer: (d) => ipcRenderer.invoke('downloads:install', d),
  cancelDownload: (token) => ipcRenderer.invoke('downloads:cancel', token),
  onDownloadProgress: (cb) => {
    const l = (_e, p) => cb(p)
    ipcRenderer.on('downloads:progress', l)
    return () => ipcRenderer.removeListener('downloads:progress', l)
  },

  // Analytics
  getAnalyticsConsent: () => ipcRenderer.invoke('analytics:getConsent'),
  setAnalyticsConsent: (enabled) => ipcRenderer.invoke('analytics:setConsent', enabled),
  clearAnalyticsEvents: () => ipcRenderer.invoke('analytics:clearEvents'),

  // Crash reports
  getCrashes: () => ipcRenderer.invoke('crashes:list'),
  clearCrashes: () => ipcRenderer.invoke('crashes:clear'),
  getLastCrash: () => ipcRenderer.invoke('crashes:getLast'),

  // Estadísticas por servidor (Fase 2). El segundo parámetro es opcional y
  // permite filtrar por un rango [desde, hasta].
  getEstadisticasResumen: (serverId, filters) => ipcRenderer.invoke('estadisticas:resumen', serverId, filters),
  getEstadisticasJugadores: (serverId, filters) => ipcRenderer.invoke('estadisticas:jugadores', serverId, filters),

  // Exportar estadísticas a CSV (Fase 4)
  exportEstadisticas: (serverId) => ipcRenderer.invoke('estadisticas:export', serverId),

  // Dialogs
  openJarDialog: () => ipcRenderer.invoke('dialog:openJar'),
  openDirDialog: () => ipcRenderer.invoke('dialog:openDir'),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),

  // Window
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  onMaximized: (cb) => ipcRenderer.on('window:maximized', (_, isMaximized) => cb(isMaximized)),

  // Events
  onConsoleLine: (cb) => ipcRenderer.on('console-line', (_, d) => cb(d)),
  onServerStopped: (cb) => ipcRenderer.on('server-stopped', (_, d) => cb(d)),
  onStatsUpdate: (cb) => ipcRenderer.on('stats-update', (_, d) => cb(d)),
  onConfirmClose: (cb) => ipcRenderer.on('confirm-close', (_, d) => cb(d)),
  onCrashLogged: (cb) => ipcRenderer.on('crash-logged', (_, d) => cb(d)),
  removeAllListeners: (ch) => ipcRenderer.removeAllListeners(ch)
})
