// ─── Config tab ───────────────────────────────────────────────────────────────
function loadConfigTab(server, settings) {
  document.getElementById('cfg-name').value = server.name || ''
  document.getElementById('cfg-jar').value = server.jarPath || ''
  document.getElementById('cfg-java').value = server.javaPath || ''
  document.getElementById('cfg-min-ram').value = server.minRam || 1024
  document.getElementById('cfg-max-ram').value = server.maxRam || 4096
  document.getElementById('cfg-extra').value = server.extraArgs || ''
  renderColorOptions('color-options', server.color)
  document.getElementById('btn-pick-jar').onclick = async () => {
    const p = await run(T('run.pickJar'), () => window.api.openJarDialog())
    if (p) document.getElementById('cfg-jar').value = p
  }
  document.getElementById('btn-save-cfg').onclick = async () => {
    const selectedColor = document.querySelector('#color-options .color-opt.selected')
    const data = {
      name: document.getElementById('cfg-name').value.trim() || server.name,
      jarPath: document.getElementById('cfg-jar').value.trim(),
      javaPath: document.getElementById('cfg-java').value.trim() || null,
      minRam: parseInt(document.getElementById('cfg-min-ram').value) || 1024,
      maxRam: parseInt(document.getElementById('cfg-max-ram').value) || 4096,
      extraArgs: document.getElementById('cfg-extra').value.trim(),
      color: selectedColor ? selectedColor.dataset.color : server.color
    }
    let res = null
    try {
      res = await window.api.updateServer({ serverId: server.id, data })
    } catch (err) {
      console.error(`[${T('run.saveConfig')}]`, err)
    }
    if (res && res.ok) {
      document.getElementById('sbar-server-name').textContent = data.name
      document.getElementById('sbar-server-name').style.color = safeColor(data.color)
      appendLog(T('config.saved'), 'success')
      loadPropertiesTab(res.server)
    } else {
      appendLog(T('log.error', { msg: res?.error || T('common.saveSettingsFailed') }), 'error')
    }
  }
  document.getElementById('btn-delete-server').onclick = async () => {
    const status = await run(T('run.serverStatus'), () => window.api.getStatus(server.id), { running: false })
    if (status && status.running) {
      appendLog(T('config.stopBeforeDelete'), 'warn')
      return
    }
    if (confirm(T('config.deleteConfirm', { name: server.name }))) {
      const res = await run(T('run.deleteServer'), () => window.api.deleteServer(server.id))
      if (res && res.ok === false) {
        appendLog(T('log.error', { msg: res.error }), 'error')
        return
      }
      showScreen('servers')
    }
  }
}
