// ─── Notificaciones por servidor ──────────────────────────────────────────────
const NOTIFICACION_ICONS = { start: '▶️', stop: '⏹️', restart: '🔄', backup: '💾' }

async function loadNotificacionesTab() {
  const serverId = state.currentServerId
  const list = document.getElementById('notificaciones-list')
  if (!serverId || !list) return

  const clearBtn = document.getElementById('btn-notificaciones-clear')
  if (clearBtn) {
    clearBtn.onclick = async () => {
      if (!confirm(T('notificaciones.clearConfirm'))) return
      const cleared = await run(T('run.clearNotifications'), () => window.api.clearNotificaciones(serverId))
      if (cleared && cleared.ok) {
        appendLog(T('notificaciones.cleared'), 'success')
        loadNotificacionesTab()
      } else {
        appendLog(T('log.error', { msg: cleared?.error || T('notificaciones.clearFailed') }), 'error')
      }
    }
  }
  const refreshBtn = document.getElementById('btn-notificaciones-refresh')
  if (refreshBtn) refreshBtn.onclick = () => loadNotificacionesTab()

  const res = await run(T('run.listNotifications'), () => window.api.listNotificaciones(serverId), { notificaciones: [] })
  const items = (res && res.notificaciones) || []
  if (!res || res.ok === false) {
    fill(list, h('div', { class: 'empty-state', text: res?.error || T('notificaciones.listFailed') }))
    return
  }
  if (!items.length) {
    fill(list, h('div', { class: 'empty-state', text: T('notificaciones.empty') }))
    return
  }

  fill(
    list,
    ...items.map(n =>
      h(
        'div',
        { class: `notificacion-item notificacion-${n.tipo}` },
        h('span', { class: 'notificacion-icon', text: NOTIFICACION_ICONS[n.tipo] || '🔔' }),
        h(
          'div',
          { class: 'notificacion-info' },
          h('div', { class: 'notificacion-title', text: T(`notificaciones.type.${n.tipo}`) }),
          h('div', { class: 'notificacion-msg', text: n.mensaje || '' })
        ),
        h('time', { class: 'notificacion-time', text: new Date(n.ts).toLocaleString(I18N.locale()) })
      )
    )
  )
}
