// ─── Backups ──────────────────────────────────────────────────────────────────
async function loadBackupsTab(server, settings) {
  const serverDir = serverDirOf(server)
  if (settings.autoBackupInterval) document.getElementById('auto-backup-interval').value = settings.autoBackupInterval
  document.getElementById('auto-backup-enabled').checked = !!settings.autoBackupEnabled
  document.getElementById('auto-restart-enabled').checked = !!settings.autoRestartEnabled
  document.getElementById('auto-restart-interval').value = settings.autoRestartInterval || '24h'

  // Selectores de hora (solo se usan con "Una vez al día")
  const backupTimeEl = document.getElementById('auto-backup-time')
  const restartTimeEl = document.getElementById('auto-restart-time')
  const backupIntervalEl = document.getElementById('auto-backup-interval')
  const restartIntervalEl = document.getElementById('auto-restart-interval')
  if (backupTimeEl) backupTimeEl.value = settings.autoBackupTime || ''
  if (restartTimeEl) restartTimeEl.value = settings.autoRestartTime || ''
  const showTime = (intervalEl, timeEl) => {
    const label = timeEl && timeEl.previousElementSibling
    const daily = intervalEl.value === '24h'
    if (timeEl) timeEl.hidden = !daily
    if (label) label.hidden = !daily
  }
  showTime(backupIntervalEl, backupTimeEl)
  showTime(restartIntervalEl, restartTimeEl)
  backupIntervalEl.addEventListener('change', () => showTime(backupIntervalEl, backupTimeEl))
  restartIntervalEl.addEventListener('change', () => showTime(restartIntervalEl, restartTimeEl))

  const showRestartStatus = async () => {
    const el = document.getElementById('auto-restart-next')
    if (!el) return
    const st = await run(T('run.settings'), () => window.api.getRestartStatus(state.currentServerId), null)
    if (!st || !st.enabled || !st.nextAt) { el.textContent = T('backups.restartNone'); return }
    el.textContent = T('backups.restartNext', { at: new Date(st.nextAt).toLocaleString(I18N.locale()) })
  }

  // Carpeta resuelta por main: preferencia global (Ajustes) o <servidor>/backups
  const dir = await run(T('run.settings'), () => window.api.getBackupDir(state.currentServerId), '') || (serverDir ? serverDir + '/backups' : '')

  const refreshList = async () => {
    if (!dir) return
    const res = await run(T('run.listBackups'), () => window.api.listBackups(dir), { backups: [] })
    const backups = (res && res.backups) || []
    const list = document.getElementById('backups-list')
    if (!res || res.ok === false) {
      fill(list, h('div', { class: 'empty-state', text: res?.error || T('backups.listFailed') }))
      return
    }
    if (!backups.length) { fill(list, h('div', { class: 'empty-state', text: T('backups.empty') })); return }
    fill(list, ...backups.map(b => h('div', { class: 'backup-item' },
      h('div', { class: 'backup-info' },
        h('div', { class: 'bname', text: b.name }),
        h('div', {
          class: 'bmeta',
          text: `${new Date(b.date).toLocaleString(I18N.locale())} · ${(b.size / 1024 / 1024).toFixed(1)} MB`
        })
      ),
      h('div', { class: 'backup-actions' },
        h('button', { class: 'btn-icon', 'data-path': b.path, title: T('backups.openFolder'), text: '📁' }),
        h('button', { class: 'btn-icon restore', 'data-path': b.path, title: T('backups.restoreBackup'), text: '↩️' }),
        h('button', { class: 'btn-icon danger', 'data-path': b.path, title: T('backups.deleteBackup'), text: '🗑' })
      )
    )))
  }

  document.getElementById('btn-backup-now').onclick = async () => {
    if (!serverDir || !dir) return
    appendLog(T('backups.creating'), 'info')
    let res = null
    try {
      res = await window.api.createBackup(serverDir, dir, state.currentServerId)
    } catch (err) {
      console.error(`[${T('run.createBackup')}]`, err)
    }
    if (res && res.ok) { appendLog(T('backups.done'), 'success'); refreshList() }
    else appendLog(T('log.error', { msg: res?.error || T('backups.createFailed') }), 'error')
  }
  document.getElementById('btn-save-auto').onclick = async () => {
    const data = {
      autoBackupEnabled: document.getElementById('auto-backup-enabled').checked,
      autoBackupInterval: document.getElementById('auto-backup-interval').value,
      autoBackupTime: document.getElementById('auto-backup-time').value,
      autoRestartEnabled: document.getElementById('auto-restart-enabled').checked,
      autoRestartInterval: document.getElementById('auto-restart-interval').value,
      autoRestartTime: document.getElementById('auto-restart-time').value
    }
    const res = await run(T('run.saveBackupSettings'), () => window.api.saveSettings(state.currentServerId, { ...settings, ...data }))
    if (res && res.ok) {
      appendLog(T('backups.settingsSaved'), 'success')
      showRestartStatus()
    } else appendLog(T('log.error', { msg: res?.error || T('common.saveSettingsFailed') }), 'error')
  }

  // Restaura un backup seleccionado: servidor parado, copia de seguridad previa y
  // verificación de rutas (zip-slip) se encargan en el proceso principal.
  window.__onRestoreBackup = async (backupPath) => {
    if (!serverDir || !dir || !state.currentServerId) return
    const name = backupPath.split(/[/\\]/).pop()
    if (!confirm(T('backups.restoreConfirm', { name }))) return
    appendLog(T('backups.restoring'), 'info')
    const res = await window.api.restoreBackup(backupPath, serverDir, state.currentServerId)
    if (res && res.ok) { appendLog(T('backups.restored'), 'success'); refreshList() }
    else appendLog(T('log.error', { msg: res?.error || T('backups.restoreFailed') }), 'error')
  }

  refreshList()
  showRestartStatus()
}

async function openBackupPath(filePath) {
  const res = await run(T('run.openBackup'), () => window.api.openPath(filePath))
  if (res && res.ok === false) appendLog(T('log.error', { msg: res.error }), 'error')
}

async function deleteBackup(filePath) {
  const res = await run(T('run.deleteBackup'), () => window.api.deleteBackup(filePath))
  if (res && res.ok === false) { appendLog(T('log.error', { msg: res.error }), 'error'); return }
  const server = await run(T('run.reloadBackups'), () => window.api.getServer(state.currentServerId))
  if (server) {
    const settings = await run(T('run.settings'), () => window.api.getSettings(state.currentServerId), {})
    loadBackupsTab(server, settings || {})
  }
}

