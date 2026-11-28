// ─── Delegación de eventos (sin onclick inline: requerido por la CSP) ────────
function initDelegates() {
  document.querySelectorAll('.color-options').forEach(container => {
    container.addEventListener('click', e => {
      const opt = e.target.closest('.color-opt')
      if (opt) selectColor(opt, container.id)
    })
  })

  document.getElementById('servers-grid').addEventListener('click', e => {
    const card = e.target.closest('.server-card')
    if (card) openServer(card.dataset.serverId)
  })

  document.getElementById('whitelist-ul').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove')
    if (btn) removeFromList('whitelist', btn.dataset.name, btn.dataset.uuid)
  })
  document.getElementById('banlist-ul').addEventListener('click', e => {
    const btn = e.target.closest('.btn-remove')
    if (btn) removeFromList('banlist', btn.dataset.name, btn.dataset.uuid)
  })

  document.getElementById('backups-list').addEventListener('click', e => {
    const btn = e.target.closest('.btn-icon')
    if (!btn || !btn.dataset.path) return
    if (btn.classList.contains('danger')) deleteBackup(btn.dataset.path)
    else if (btn.classList.contains('restore') && typeof window.__onRestoreBackup === 'function') {
      window.__onRestoreBackup(btn.dataset.path)
    } else openBackupPath(btn.dataset.path)
  })

  document.querySelector('.action-row').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]')
    if (btn) playerAction(btn.dataset.action)
  })
}
