// ─── Ajustes ─────────────────────────────────────────────────────────────────
function initSettings() {
  document.getElementById('btn-settings-back').onclick = () => showScreen('servers')
  document.getElementById('btn-clear-crashes').onclick = async () => {
    await run(T('run.clearErrors'), () => window.api.clearCrashes())
    loadSettings()
  }
  document.getElementById('btn-clear-events').onclick = async () => {
    await run(T('run.settings'), () => window.api.clearAnalyticsEvents())
    loadSettings()
  }
  document.getElementById('btn-export-data').onclick = () => {
    run(T('settings.exportData'), () => window.api.exportAllDataToFile())
  }
  document.getElementById('btn-import-data').onclick = async () => {
    const res = await run(T('settings.importData'), () => window.api.importAllDataFromFile())
    if (res && res.ok) loadSettings()
  }
  document.getElementById('diag-analytics-toggle').onchange = async e => {
    await run(T('run.consent'), () => window.api.setAnalyticsConsent(e.target.checked))
    loadSettings()
  }
  document.getElementById('btn-set-backup-dir').onclick = async () => {
    const p = await run(T('run.pickDir'), () => window.api.openDirDialog())
    if (!p) return
    const res = await run(T('run.saveBackupSettings'), () => window.api.setPref('backupDir', p))
    if (res && res.ok) document.getElementById('set-backup-dir').value = p
  }
  document.getElementById('btn-set-server-dir').onclick = async () => {
    const p = await run(T('run.pickDir'), () => window.api.openDirDialog())
    if (!p) return
    const res = await run(T('run.settings'), () => window.api.setPref('defaultServerDir', p))
    if (res && res.ok) document.getElementById('set-server-dir').value = p
  }
  document.getElementById('set-close-to-tray').onchange = e => {
    run(T('run.settings'), () => window.api.setPref('closeToTray', e.target.checked))
  }
  document.getElementById('set-start-on-boot').onchange = e => {
    run(T('run.settings'), () => window.api.setPref('startOnBoot', e.target.checked))
  }
  document.getElementById('theme-options').addEventListener('click', e => {
    const opt = e.target.closest('.seg-opt')
    if (opt) setTheme(opt.dataset.themeValue)
  })
  document.getElementById('lang-options').addEventListener('click', e => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    I18N.setLang(opt.dataset.langValue)
    // El idioma también se guarda en main para el menú de la bandeja
    window.api.setPref('lang', opt.dataset.langValue)
  })
  document.getElementById('uiscale-options').addEventListener('click', e => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    selectUiScale(opt.dataset.scaleValue)
    run(T('run.settings'), () => window.api.setPref('uiScale', Number(opt.dataset.scaleValue) / 100))
  })
  document.getElementById('backup-keep-options').addEventListener('click', e => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    selectSegOpt('backup-keep-options', 'keepValue', opt.dataset.keepValue)
    run(T('run.saveBackupSettings'), () => window.api.setPref('backupKeep', Number(opt.dataset.keepValue)))
  })
  document.getElementById('backup-level-options').addEventListener('click', e => {
    const opt = e.target.closest('.seg-opt')
    if (!opt) return
    selectSegOpt('backup-level-options', 'levelValue', opt.dataset.levelValue)
    run(T('run.saveBackupSettings'), () => window.api.setPref('backupLevel', Number(opt.dataset.levelValue)))
  })
  document.getElementById('set-default-ram').addEventListener('change', async e => {
    const ok = await saveSettingsPref('defaultRam', parseInt(e.target.value, 10))
    if (!ok) loadSettings() // valor fuera de rango: recupera el guardado
  })
  document.getElementById('set-default-java').addEventListener('change', e => {
    saveSettingsPref('defaultJava', e.target.value.trim() || null)
  })
  document.getElementById('set-default-jvm').addEventListener('change', e => {
    saveSettingsPref('defaultJvmArgs', e.target.value.trim() || null)
  })
  document.getElementById('set-auto-eula').onchange = async e => {
    const ok = await saveSettingsPref('autoEula', e.target.checked)
    if (!ok) loadSettings()
  }
  // Notificaciones (2.3)
  const notifyToggles = {
    'set-notify-server': 'notifyServer',
    'set-notify-players': 'notifyPlayers',
    'set-notify-backups': 'notifyBackups',
    'set-email-enabled': 'emailEnabled',
    'set-email-secure': 'emailSecure',
    'set-email-notify-server': 'emailNotifyServer',
    'set-email-notify-players': 'emailNotifyPlayers',
    'set-email-notify-backups': 'emailNotifyBackups'
  }
  Object.entries(notifyToggles).forEach(([id, key]) => {
    const el = document.getElementById(id)
    if (!el) return
    el.onchange = e => {
      run(T('run.settings'), () => window.api.setPref(key, e.target.checked))
    }
  })

  const saveEmailBtn = document.getElementById('btn-save-email')
  if (saveEmailBtn) {
    saveEmailBtn.onclick = async () => {
      const portRaw = parseInt(document.getElementById('set-email-port').value, 10)
      const payload = [
        ['emailEnabled', document.getElementById('set-email-enabled').checked === true],
        ['emailHost', document.getElementById('set-email-host').value || ''],
        ['emailPort', Number.isInteger(portRaw) ? portRaw : 587],
        ['emailSecure', document.getElementById('set-email-secure').checked === true],
        ['emailUser', document.getElementById('set-email-user').value || ''],
        ['emailPass', document.getElementById('set-email-pass').value || ''],
        ['emailFrom', document.getElementById('set-email-from').value || ''],
        ['emailTo', document.getElementById('set-email-to').value || ''],
        ['emailNotifyServer', document.getElementById('set-email-notify-server').checked === true],
        ['emailNotifyPlayers', document.getElementById('set-email-notify-players').checked === true],
        ['emailNotifyBackups', document.getElementById('set-email-notify-backups').checked === true]
      ]
      let ok = true
      for (const [key, value] of payload) {
        const res = await run(T('run.settings'), () => window.api.setPref(key, value))
        if (!res || res.ok !== true) {
          ok = false
          break
        }
      }
      if (ok) showToast(T('settings.emailSaveOk'), T('settings.emailSaveOkHint'), 'success')
      else showToast(T('settings.emailSaveFail'), T('settings.emailSaveFailHint'), 'server_crash')
    }
  }

  const emailTestBtn = document.getElementById('btn-test-email')
  if (emailTestBtn) {
    emailTestBtn.onclick = async () => {
      const res = await run(T('run.emailTest'), () => window.api.testEmail())
      if (res && res.ok) showToast(T('settings.emailTestOk'), T('settings.emailTestOkHint'), 'success')
      else if (res && !res.canceled) showToast(T('settings.emailTestFail'), res.error || T('settings.emailTestFailHint'), 'server_crash')
    }
  }
  document.getElementById('set-retention-samples').addEventListener('change', async e => {
    const n = parseInt(e.target.value, 10)
    if (!Number.isInteger(n) || n < 1) return
    await saveSettingsPref('retentionSamples', n)
  })
  document.getElementById('set-retention-events').addEventListener('change', async e => {
    const n = parseInt(e.target.value, 10)
    if (!Number.isInteger(n) || n < 1) return
    await saveSettingsPref('retentionEvents', n)
  })
  // Raíl de secciones: muestra solo el panel elegido
  document.getElementById('set-nav').addEventListener('click', e => {
    const item = e.target.closest('.set-nav-item')
    if (item) setSettingsSection(item.dataset.setSection)
  })
}

// Muestra una sección de Ajustes (la usan el raíl y el icono ⬇ de la titlebar)
function setSettingsSection(section) {
  document.querySelectorAll('#set-nav .set-nav-item').forEach(b => b.classList.toggle('active', b.dataset.setSection === section))
  document.querySelectorAll('.set-panel').forEach(p => p.classList.toggle('active', p.dataset.setPanel === section))
  const panels = document.querySelector('.set-panels')
  if (panels) panels.scrollTop = 0
  if (section === 'updates') renderUpdateState()
}

function setTheme(theme) {
  if (theme !== 'light' && theme !== 'dark') return
  if (currentTheme() === theme) return
  applyTheme(theme)
  updateSettingsSeg()
  run(T('run.settings'), () => window.api.setPref('theme', theme))
}

function updateSettingsSeg() {
  const theme = currentTheme()
  document.querySelectorAll('#theme-options .seg-opt').forEach(b => b.classList.toggle('selected', b.dataset.themeValue === theme))
  const lang = I18N.getLang()
  document.querySelectorAll('#lang-options .seg-opt').forEach(b => b.classList.toggle('selected', b.dataset.langValue === lang))
}

// Marca la escala activa en el segmento de Tamaño de la interfaz (en %)
function selectUiScale(pct) {
  selectSegOpt('uiscale-options', 'scaleValue', String(pct))
}

// Marca la opción activa de cualquier segmento de Ajustes
function selectSegOpt(id, datasetKey, value) {
  document.querySelectorAll(`#${id} .seg-opt`).forEach(b => b.classList.toggle('selected', b.dataset[datasetKey] === value))
}

// Guarda una preferencia y devuelve si el main la aceptó
async function saveSettingsPref(key, value) {
  const res = await run(T('run.settings'), () => window.api.setPref(key, value))
  return !!(res && res.ok)
}

async function loadSettings() {
  updateSettingsSeg()

  const prefDir = await run(T('run.settings'), () => window.api.getPref('backupDir'), '')
  document.getElementById('set-backup-dir').value = prefDir || ''

  const prefServerDir = await run(T('run.settings'), () => window.api.getPref('defaultServerDir'), '')
  const closeToTray = await run(T('run.settings'), () => window.api.getPref('closeToTray'), false)
  const startOnBoot = await run(T('run.settings'), () => window.api.getPref('startOnBoot'), false)
  const uiScale = await run(T('run.settings'), () => window.api.getPref('uiScale'), 1)
  const backupKeep = await run(T('run.saveBackupSettings'), () => window.api.getPref('backupKeep'), 0)
  const backupLevel = await run(T('run.saveBackupSettings'), () => window.api.getPref('backupLevel'), 6)
  const defaultRam = await run(T('run.settings'), () => window.api.getPref('defaultRam'), null)
  const defaultJava = await run(T('run.settings'), () => window.api.getPref('defaultJava'), '')
  const defaultJvmArgs = await run(T('run.settings'), () => window.api.getPref('defaultJvmArgs'), '')
  const autoEula = await run(T('run.settings'), () => window.api.getPref('autoEula'), false)
  const notifyServer = await run(T('run.settings'), () => window.api.getPref('notifyServer'), false)
  const notifyPlayers = await run(T('run.settings'), () => window.api.getPref('notifyPlayers'), false)
  const notifyBackups = await run(T('run.settings'), () => window.api.getPref('notifyBackups'), false)
  const emailEnabled = await run(T('run.settings'), () => window.api.getPref('emailEnabled'), false)
  const emailHost = await run(T('run.settings'), () => window.api.getPref('emailHost'), '')
  const emailPort = await run(T('run.settings'), () => window.api.getPref('emailPort'), 587)
  const emailSecure = await run(T('run.settings'), () => window.api.getPref('emailSecure'), false)
  const emailUser = await run(T('run.settings'), () => window.api.getPref('emailUser'), '')
  const emailPass = await run(T('run.settings'), () => window.api.getPref('emailPass'), '')
  const emailFrom = await run(T('run.settings'), () => window.api.getPref('emailFrom'), '')
  const emailTo = await run(T('run.settings'), () => window.api.getPref('emailTo'), '')
  const emailNotifyServer = await run(T('run.settings'), () => window.api.getPref('emailNotifyServer'), false)
  const emailNotifyPlayers = await run(T('run.settings'), () => window.api.getPref('emailNotifyPlayers'), false)
  const emailNotifyBackups = await run(T('run.settings'), () => window.api.getPref('emailNotifyBackups'), false)
  const retentionSamples = (await run(T('run.settings'), () => window.api.getPref('retentionSamples'), 30)) || 30
  const retentionEvents = (await run(T('run.settings'), () => window.api.getPref('retentionEvents'), 730)) || 730
  document.getElementById('set-server-dir').value = prefServerDir || ''
  document.getElementById('set-close-to-tray').checked = closeToTray === true
  document.getElementById('set-start-on-boot').checked = startOnBoot === true
  document.getElementById('set-default-ram').value = Number.isInteger(defaultRam) ? defaultRam : ''
  document.getElementById('set-default-java').value = defaultJava || ''
  document.getElementById('set-default-jvm').value = defaultJvmArgs || ''
  document.getElementById('set-auto-eula').checked = autoEula === true
  document.getElementById('set-notify-server').checked = notifyServer === true
  document.getElementById('set-notify-players').checked = notifyPlayers === true
  document.getElementById('set-notify-backups').checked = notifyBackups === true
  document.getElementById('set-email-enabled').checked = emailEnabled === true
  document.getElementById('set-email-host').value = emailHost || ''
  document.getElementById('set-email-port').value = Number.isInteger(emailPort) ? emailPort : 587
  document.getElementById('set-email-secure').checked = emailSecure === true
  document.getElementById('set-email-user').value = emailUser || ''
  document.getElementById('set-email-pass').value = emailPass || ''
  document.getElementById('set-email-from').value = emailFrom || ''
  document.getElementById('set-email-to').value = emailTo || ''
  document.getElementById('set-email-notify-server').checked = emailNotifyServer === true
  document.getElementById('set-email-notify-players').checked = emailNotifyPlayers === true
  document.getElementById('set-email-notify-backups').checked = emailNotifyBackups === true
  document.getElementById('set-retention-samples').value = retentionSamples
  document.getElementById('set-retention-events').value = retentionEvents
  selectUiScale(Math.round((typeof uiScale === 'number' && uiScale > 0 ? uiScale : 1) * 100))
  selectSegOpt('backup-keep-options', 'keepValue', String([0, 5, 10, 20, 50].includes(backupKeep) ? backupKeep : 0))
  selectSegOpt(
    'backup-level-options',
    'levelValue',
    String(Number.isInteger(backupLevel) && backupLevel >= 1 && backupLevel <= 9 ? backupLevel : 6)
  )

  const crashes = await run(T('run.diagnostics'), () => window.api.getCrashes(), [])
  const version = await run(T('run.diagnostics'), () => window.api.getVersion(), '')
  const consent = await run(T('run.diagnostics'), () => window.api.getAnalyticsConsent(), null)
  const java = await run(T('run.diagnostics'), () => window.api.javaCheck(), null)

  document.getElementById('diag-analytics-toggle').checked = !!consent
  document.getElementById('upd-installed').textContent = version ? `v${version}` : '—'

  const diagRow = (label, value) =>
    h(
      'div',
      { class: 'diag-row' },
      h('span', { class: 'diag-row-label', text: label }),
      h('span', { class: 'diag-row-val', text: String(value) })
    )

  // Información: solo datos del equipo instalado (sin analytics)
  const infoRows = [
    [T('diag.version'), `v${version}`],
    ['Java', java && java.ok ? java.raw || `Java ${java.major}` : T('diag.javaNotDetected')],
    [T('diag.platform'), navigator.platform]
  ]
  fill(document.getElementById('diag-info'), ...infoRows.map(([l, v]) => diagRow(l, v)))

  // Crashes panel
  const crashesEl = document.getElementById('diag-crashes')
  if (!crashes.length) {
    fill(crashesEl, h('div', { class: 'crash-empty', text: T('diag.noErrors') }))
  } else {
    fill(
      crashesEl,
      ...crashes
        .slice(0, 20)
        .map(c =>
          h(
            'div',
            { class: 'crash-item' },
            h('div', { class: 'crash-type', text: c.type }),
            h('div', { class: 'crash-msg', text: c.message }),
            h('div', { class: 'crash-meta', text: `v${c.appVersion} · ${new Date(c.timestamp).toLocaleString(I18N.locale())}` })
          )
        )
    )
  }

  renderUpdateState()
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(`screen-${name}`).classList.add('active')

  const stats = document.getElementById('titlebar-stats')
  if (name === 'consent' || name === 'settings') stats.classList.add('hidden')
  else stats.classList.remove('hidden')

  if (name === 'servers' || name === 'settings') state.currentServerId = null
  if (name === 'servers') refreshServersGrid()
  if (name === 'settings') loadSettings()
}
