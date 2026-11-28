// ─── Properties ───────────────────────────────────────────────────────────────
async function loadPropertiesTab(server) {
  const serverDir = serverDirOf(server)
  if (!serverDir) return
  const res = await run(T('run.readProperties'), () => window.api.readProperties(serverDir))
  if (!res || !res.ok) return
  const allKeys = [...new Set([...IMPORTANT_PROPS, ...Object.keys(res.props)])]
  fill(
    document.getElementById('props-grid'),
    ...allKeys.map(key => {
      const val = res.props[key] ?? ''
      const isBool = val === 'true' || val === 'false'
      const input = isBool
        ? h('select', { 'data-key': key }, h('option', { value: 'true', text: 'true' }), h('option', { value: 'false', text: 'false' }))
        : h('input', { type: 'text', 'data-key': key, value: val })
      if (isBool) input.value = val === 'false' ? 'false' : 'true'
      return h('div', { class: 'prop-item' }, h('label', { text: key }), input)
    })
  )
  document.getElementById('btn-save-props').onclick = async () => {
    const props = {}
    document.querySelectorAll('#props-grid [data-key]').forEach(el => {
      props[el.dataset.key] = el.value
    })
    let out = null
    try {
      out = await window.api.writeProperties(serverDir, props)
    } catch (err) {
      console.error(`[${T('run.saveProperties')}]`, err)
    }
    if (out && out.ok) appendLog(T('properties.saved'), 'success')
    else appendLog(T('log.error', { msg: out?.error || T('properties.saveFailed') }), 'error')
  }
}
