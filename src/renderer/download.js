// ─── Wizard de descarga ─────────────────────────────────────────────────────
function updateInstallButton() {
  const save = document.getElementById('ms-save')
  if (state.dl.source !== 'download') {
    save.disabled = state.dl.installing
    return
  }
  const hasVersion = !!document.getElementById('ms-version').value
  save.disabled = state.dl.installing || !hasVersion
}

function setServerSource(source) {
  state.dl.source = source
  document.querySelectorAll('#ms-source button').forEach(b => {
    const active = b.dataset.source === source
    b.classList.toggle('active', active)
    b.setAttribute('aria-selected', active ? 'true' : 'false')
  })
  document.getElementById('ms-manual-fields').classList.toggle('hidden', source === 'download')
  document.getElementById('ms-download-fields').classList.toggle('hidden', source !== 'download')
  document.getElementById('ms-error').textContent = ''
  const save = document.getElementById('ms-save')
  if (source === 'download') {
    save.textContent = T('modal.installAction')
    ensureVersions()
    updateInstallHint()
  } else {
    save.textContent = T('common.save')
  }
  updateInstallButton()
}

function renderVersionOptions(sel, versions) {
  fill(
    sel,
    ...versions.map(v => {
      const id = typeof v === 'string' ? v : v.id
      const suffix = v && v.forge ? ` (Forge ${v.forge})` : v && v.release === false ? ' (pre)' : ''
      return h('option', { value: id }, `${id}${suffix}`)
    })
  )
  if (versions.length) sel.selectedIndex = 0
}

async function ensureVersions() {
  const sel = document.getElementById('ms-version')
  const provider = state.dl.provider
  if (state.dl.versions[provider] && state.dl.shownProvider === provider) return
  // Ya cargado antes: se reutiliza sin volver a pedirlo al main.
  if (state.dl.versions[provider]) {
    renderVersionOptions(sel, state.dl.versions[provider])
    state.dl.shownProvider = provider
    updateJavaWarn()
    updateInstallButton()
    return
  }
  sel.disabled = true
  fill(sel, h('option', { value: '' }, T('common.loading')))
  const res = await run(T('run.loadVersions'), () => window.api.listDownloadVersions(state.dl.provider), null)
  const versions = res && res.ok && Array.isArray(res.versions) ? res.versions : []
  if (res && !res.ok) document.getElementById('ms-error').textContent = res.error || T('servers.createError')
  state.dl.versions[provider] = versions
  state.dl.shownProvider = provider
  sel.disabled = false
  renderVersionOptions(sel, versions)
  updateJavaWarn()
  updateInstallButton()
}

function folderPreview() {
  const name = document.getElementById('ms-name').value.trim() || 'server'
  return (
    name
      .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
      .trim()
      .slice(0, 60) || 'server'
  )
}

function updateInstallHint() {
  const root = document.getElementById('ms-install-root').value.trim()
  const hint = document.getElementById('ms-install-hint')
  hint.textContent = root ? T('modal.installHint', { dir: root.replace(/[\\/]+$/, '') + '\\' + folderPreview() }) : ''
}

async function updateJavaWarn() {
  const version = document.getElementById('ms-version').value
  const warn = document.getElementById('ms-java-warn')
  if (!version) {
    warn.classList.add('hidden')
    return
  }
  const need = await run(T('run.checkJava'), () => window.api.minJavaFor(version), { ok: false })
  if (!need || !need.ok || !need.major) {
    warn.classList.add('hidden')
    return
  }
  const javaPath = document.getElementById('ms-java').value.trim() || 'java'
  const check = await run(T('run.checkJava'), () => window.api.javaCheck(javaPath), { ok: false })
  const have = check && check.ok ? check.major : null
  warn.classList.remove('hidden')
  if (have === null) warn.textContent = T('modal.javaUnknown', { need: need.major })
  else if (have < need.major) warn.textContent = T('modal.javaWarn', { need: need.major, have })
  else warn.textContent = T('modal.javaOk', { need: need.major, have })
}

function setInstallingUI(active) {
  state.dl.installing = active
  const progress = document.getElementById('ms-progress')
  const fill = document.getElementById('ms-progress-fill')
  const save = document.getElementById('ms-save')
  const cancel = document.getElementById('ms-cancel')
  const err = document.getElementById('ms-error')
  save.disabled = active
  cancel.disabled = false
  if (active) {
    fill.style.width = '0%'
    document.getElementById('ms-progress-label').textContent = ''
    progress.classList.remove('hidden')
    err.textContent = ''
  } else {
    progress.classList.add('hidden')
    cancel.textContent = T('common.cancel')
    if (state.dl.token) {
      window.api.cancelDownload(state.dl.token)
      state.dl.token = null
    }
  }
}

async function saveNewServerDownload() {
  const err = document.getElementById('ms-error')
  const name = document.getElementById('ms-name').value.trim()
  const root = document.getElementById('ms-install-root').value.trim()
  const version = document.getElementById('ms-version').value
  if (!name) {
    err.textContent = T('modal.nameRequired')
    return
  }
  if (!version) {
    err.textContent = T('modal.selectVersion')
    return
  }
  if (!root) {
    err.textContent = T('modal.selectInstallRoot')
    return
  }
  const selectedColor = document.querySelector('#ms-color-options .color-opt.selected')
  const payload = {
    provider: state.dl.provider,
    version,
    name,
    installRoot: root,
    color: selectedColor ? selectedColor.dataset.color : SERVER_COLORS[0],
    minRam: parseInt(document.getElementById('ms-min-ram').value, 10) || 1024,
    maxRam: parseInt(document.getElementById('ms-max-ram').value, 10) || 4096,
    javaPath: document.getElementById('ms-java').value.trim() || null
  }
  setInstallingUI(true)
  state.dl.cancelRequested = false
  try {
    const res = await window.api.installServer(payload)
    if (state.dl.cancelRequested) return
    if (res && res.ok) {
      document.getElementById('modal-server').classList.add('hidden')
      refreshServersGrid()
    } else {
      err.textContent = (res && res.error) || T('servers.createError')
    }
  } catch (e) {
    if (!state.dl.cancelRequested) {
      console.error(`[${T('run.installServer')}]`, e)
      err.textContent = T('servers.createError')
    }
  } finally {
    setInstallingUI(false)
  }
}

async function saveNewServer() {
  const name = document.getElementById('ms-name').value.trim()
  const jarPath = document.getElementById('ms-jar').value.trim()
  const err = document.getElementById('ms-error')
  if (!name) {
    err.textContent = T('modal.nameRequired')
    return
  }
  if (!jarPath) {
    err.textContent = T('modal.selectJar')
    return
  }
  const selectedColor = document.querySelector('#ms-color-options .color-opt.selected')
  let res = null
  try {
    res = await window.api.createServer({
      name,
      jarPath,
      javaPath: document.getElementById('ms-java').value.trim() || null,
      minRam: parseInt(document.getElementById('ms-min-ram').value) || 1024,
      maxRam: parseInt(document.getElementById('ms-max-ram').value) || 4096,
      color: selectedColor ? selectedColor.dataset.color : SERVER_COLORS[0]
    })
  } catch (e) {
    console.error(`[${T('run.createServer')}]`, e)
  }
  if (!res) {
    err.textContent = T('servers.createError')
    return
  }
  if (!res.ok) {
    err.textContent = res.error
    return
  }
  document.getElementById('modal-server').classList.add('hidden')
  refreshServersGrid()
}
