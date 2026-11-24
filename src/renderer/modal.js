// ─── New server modal ─────────────────────────────────────────────────────────
function closeServerModal() {
  const modal = document.getElementById('modal-server')
  modal.classList.add('hidden')
  const opener = document.getElementById('btn-new-server')
  if (opener && typeof opener.focus === 'function') opener.focus()
}

function initModal() {
  document.getElementById('btn-new-server').onclick = openServerModal
  document.getElementById('ms-cancel').onclick = () => {
    if (state.dl.installing) {
      state.dl.cancelRequested = true
      window.api.cancelDownload(state.dl.token)
      return
    }
    closeServerModal()
  }
  document.getElementById('ms-pick-jar').onclick = async () => {
    const p = await run(T('run.pickJar'), () => window.api.openJarDialog())
    if (p) document.getElementById('ms-jar').value = p
  }
  document.getElementById('ms-save').onclick = () => {
    if (state.dl.source === 'download') saveNewServerDownload()
    else saveNewServer()
  }

  // Pestañas de origen del servidor
  document.querySelectorAll('#ms-source button').forEach(btn => {
    btn.onclick = () => setServerSource(btn.dataset.source)
  })
  document.getElementById('ms-provider').onchange = () => {
    state.dl.provider = document.getElementById('ms-provider').value
    ensureVersions()
  }
  document.getElementById('ms-version').onchange = () => {
    updateJavaWarn()
    updateInstallButton()
  }
  document.getElementById('ms-java').addEventListener('input', updateJavaWarn)
  document.getElementById('ms-name').addEventListener('input', updateInstallHint)
  document.getElementById('ms-pick-dir').onclick = async () => {
    const p = await run(T('run.pickDir'), () => window.api.openDirDialog())
    if (p) {
      document.getElementById('ms-install-root').value = p
      updateInstallHint()
    }
  }
  window.api.onDownloadProgress(p => {
    if (!state.dl.installing || !p || p.token !== state.dl.token) return
    const fill = document.getElementById('ms-progress-fill')
    const label = document.getElementById('ms-progress-label')
    if (p.phase === 'download') {
      if (p.total) {
        const pct = Math.min(100, Math.round((p.received / p.total) * 100))
        fill.style.width = pct + '%'
        label.textContent = T('modal.downloadProgress', { pct })
      } else {
        label.textContent = T('modal.downloading')
      }
    } else if (p.phase === 'verify') {
      label.textContent = T('modal.verifying')
    } else if (p.phase === 'install') {
      fill.style.width = '100%'
      label.textContent = T('modal.installing')
    } else if (p.phase === 'done') {
      fill.style.width = '100%'
      label.textContent = T('modal.done')
    }
  })

  document.getElementById('modal-cancel').onclick = () => {
    document.getElementById('modal-close').classList.add('hidden')
    document.getElementById('modal-close-level1').classList.remove('hidden')
    document.getElementById('modal-close-level2').classList.add('hidden')
  }
  document.getElementById('modal-confirm-proceed').onclick = () => {
    document.getElementById('modal-close-title').textContent = T('close.sure')
    document.getElementById('modal-close-msg').textContent = T('close.warnMsg')
    document.getElementById('modal-close-level1').classList.add('hidden')
    document.getElementById('modal-close-level2').classList.remove('hidden')
  }
  document.getElementById('modal-cancel-2').onclick = () => {
    const count = document.getElementById('modal-close').dataset.serverCount || 0
    document.getElementById('modal-close-title').textContent = T('close.title')
    document.getElementById('modal-close-msg').textContent = T('close.msgWithCount', { count })
    document.getElementById('modal-close-level1').classList.remove('hidden')
    document.getElementById('modal-close-level2').classList.add('hidden')
  }
  document.getElementById('modal-confirm').onclick = () => window.api.close()

  // Accesibilidad: Escape cierra el modal de servidor (salvo si está instalando)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return
    const modal = document.getElementById('modal-server')
    if (modal && !modal.classList.contains('hidden') && !state.dl.installing) closeServerModal()
  })
}

function renderColorOptions(containerId, selectedColor) {
  const container = document.getElementById(containerId)
  const selected = selectedColor || SERVER_COLORS[0]
  fill(container, ...SERVER_COLORS.map(c => {
    const el = h('div', { class: `color-opt ${c === selected ? 'selected' : ''}`, 'data-color': c })
    el.style.background = c
    return el
  }))
}

function selectColor(el, containerId) {
  document.querySelectorAll(`#${containerId} .color-opt`).forEach(o => o.classList.remove('selected'))
  el.classList.add('selected')
}

async function openServerModal() {
  document.getElementById('modal-server-title').textContent = T('servers.add')
  document.getElementById('ms-name').value = ''
  document.getElementById('ms-jar').value = ''
  document.getElementById('ms-java').value = ''
  document.getElementById('ms-min-ram').value = 1024
  document.getElementById('ms-max-ram').value = 4096
  document.getElementById('ms-error').textContent = ''
  state.dl.token = null
  state.dl.cancelRequested = false
  state.dl.provider = document.getElementById('ms-provider').value
  state.dl.shownProvider = null
  renderColorOptions('ms-color-options', null)
  setServerSource('manual')
  document.getElementById('modal-server').classList.remove('hidden')
  const nameInput = document.getElementById('ms-name')
  if (nameInput && typeof nameInput.focus === 'function') nameInput.focus()
  // Valores por defecto de Ajustes → Servidores
  const pref = await run(T('run.settings'), () => Promise.all([
    window.api.getPref('defaultRam'),
    window.api.getPref('defaultJava'),
    window.api.getPref('defaultServerDir')
  ]), [null, null, null])
  const [ram, java, serverDir] = Array.isArray(pref) ? pref : [null, null, null]
  if (Number.isInteger(ram) && ram >= 512 && ram <= 65536) document.getElementById('ms-max-ram').value = ram
  document.getElementById('ms-java').value = java || ''
  const rootInput = document.getElementById('ms-install-root')
  if (!rootInput.value && !serverDir) {
    const d = await run(T('run.settings'), () => window.api.getDefaultServerDir(), null)
    if (d && d.ok && d.dir) rootInput.value = d.dir
  } else if (!rootInput.value && serverDir) {
    rootInput.value = serverDir
  }
}

