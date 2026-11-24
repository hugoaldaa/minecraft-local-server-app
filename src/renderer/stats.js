// ─── Estadísticas (Fase 3) ──────────────────────────────────────────────────
let statsRefreshTimer = null

function startStatsRefresh() {
  stopStatsRefresh()
  statsRefreshTimer = setInterval(() => {
    if (document.getElementById('tab-stats').classList.contains('active')) {
      loadServerStats()
    }
  }, 10000)
}

function stopStatsRefresh() {
  if (statsRefreshTimer) {
    clearInterval(statsRefreshTimer)
    statsRefreshTimer = null
  }
}

function initStats() {
  document.getElementById('btn-refresh-stats').onclick = loadServerStats
  document.getElementById('btn-export-stats').onclick = exportServerStats
  document.getElementById('stats-filter-period').addEventListener('change', loadServerStats)
  // Auto-refresco mientras el servidor esté en marcha y se vea la pestaña.
  if (state.isRunning) startStatsRefresh()
}

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h <= 0) return `${m} min`
  return `${h} h ${m} min`
}

function formatDateTime(ts) {
  return new Date(ts).toLocaleString(I18N.locale())
}

function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') el.setAttribute('class', v)
    else if (k === 'text') el.appendChild(document.createTextNode(String(v)))
    else el.setAttribute(k, String(v))
  }
  for (const c of children.flat()) el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)))
  return el
}

// Gráfico de barras sencillo: puntos [{ label, value }] sobre un SVG.
// El ancho crece con la cantidad de puntos para que las barras no se amontonen,
// y el contenedor (.stats-chart-body) permite desplazarse horizontalmente.
function renderBarChart(container, points) {
  container.textContent = ''
  if (!points.length) {
    fill(container, h('div', { class: 'empty-state', text: T('stats.noData') }))
    return
  }
  const minBarWidth = 45
  const height = 160
  const width = Math.max(600, points.length * minBarWidth)
  const max = Math.max(...points.map((p) => p.value), 1)
  const barWidth = width / points.length
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    class: 'chart-svg'
  })
  const axis = svgEl('line', { x1: 0, y1: height, x2: width, y2: height, class: 'chart-axis' })
  svg.appendChild(axis)
  points.forEach((p, i) => {
    const barHeight = (p.value / max) * (height - 24)
    const rect = svgEl('rect', {
      x: i * barWidth + barWidth * 0.15,
      y: height - barHeight - 10,
      width: barWidth * 0.7,
      height: Math.max(barHeight, 1),
      class: 'chart-bar'
    })
    svg.appendChild(rect)
    const label = svgEl('text', {
      x: i * barWidth + barWidth / 2,
      y: height - 2,
      class: 'chart-label',
      text: p.label
    })
    svg.appendChild(label)
  })
  container.appendChild(svg)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function periodMs(period) {
  if (period === '7d') return 7 * MS_PER_DAY
  if (period === '14d') return 14 * MS_PER_DAY
  if (period === '30d') return 30 * MS_PER_DAY
  if (period === '90d') return 90 * MS_PER_DAY
  if (period === '6m') return 180 * MS_PER_DAY
  if (period === '1y') return 365 * MS_PER_DAY
  return null
}

async function loadServerStats() {
  const serverId = state.currentServerId
  if (!serverId) return
  const period = document.getElementById('stats-filter-period')
  const filters = period && period.value !== 'all' ? { desde: Date.now() - periodMs(period.value) } : null
  const summary = await run(T('run.statsResumen'), () => window.api.getEstadisticasResumen(serverId, filters), null)
  const players = await run(T('run.statsJugadores'), () => window.api.getEstadisticasJugadores(serverId, filters), null) || []
  if (summary) renderStatsSummary(summary)
  renderStatsPlayers(players)
}

function renderStatsSummary(data) {
  const uptimeEl = document.getElementById('stats-uptime')
  uptimeEl.textContent = data.uptimeMs > 0 ? formatDuration(data.uptimeMs) : '—'

  const hasSamples = data.resources.samples > 0
  const cpuPeak = data.resources.cpuPeak
  const cpuEl = document.getElementById('stats-cpu-peak')
  cpuEl.textContent = hasSamples ? `${cpuPeak}%` : '—'
  const cpuWhenEl = document.getElementById('stats-cpu-peak-at')
  cpuWhenEl.textContent = hasSamples && cpuPeak > 0 ? T('stats.cpuPeakAt', { time: formatDateTime(data.resources.cpuAt) }) : ''

  const ramPeak = data.resources.ramPeak
  const ramEl = document.getElementById('stats-ram-peak')
  ramEl.textContent = hasSamples ? `${ramPeak} MB` : '—'
  const ramWhenEl = document.getElementById('stats-ram-peak-at')
  ramWhenEl.textContent = hasSamples && ramPeak > 0 ? T('stats.ramPeakAt', { time: formatDateTime(data.resources.ramAt) }) : ''

  const daily = data.dailyPlayerActivity
  const points = Object.keys(daily).sort().map((day) => {
    const entry = daily[day]
    return { label: day.slice(5), value: Object.keys(entry.players).length }
  })
  renderBarChart(document.getElementById('stats-chart-players-day'), points)

  renderDaysConnections(daily)
  renderStatsMoments(data.concurrentMoments)

  // Pico máximo de jugadores concurrentes: se destaca sobre el resto.
  const peak = data.concurrentMoments.length ? data.concurrentMoments[0] : null
  const peakEl = document.getElementById('stats-concurrent-peak')
  const peakWhenEl = document.getElementById('stats-concurrent-peak-at')
  if (peak) {
    peakEl.textContent = String(peak.online)
    peakWhenEl.textContent = T('stats.concurrentPeakAt', { time: formatDateTime(peak.ts) })
  } else {
    peakEl.textContent = '—'
    peakWhenEl.textContent = ''
  }
}

// Lista, por día, de conexiones (joins) y jugadores únicos (Fase 4).
function renderDaysConnections(daily) {
  const list = document.getElementById('stats-days')
  fill(list)
  const days = Object.keys(daily).sort()
  if (!days.length) {
    fill(list, h('div', { class: 'empty-state', text: T('stats.noData') }))
    return
  }
  for (const day of days) {
    const entry = daily[day]
    const li = document.createElement('li')
    li.className = 'stats-day'
    li.textContent = T('stats.connectionsPerDay', {
      day: day.slice(5),
      joins: entry.joins,
      players: Object.keys(entry.players).length
    })
    list.appendChild(li)
  }
}

function renderStatsMoments(moments) {
  const list = document.getElementById('stats-moments')
  fill(list)
  if (!moments.length) {
    fill(list, h('div', { class: 'empty-state', text: T('stats.noData') }))
    return
  }
  moments.slice(0, 10).forEach((m) => {
    const li = document.createElement('li')
    li.className = 'stats-moment'
    const line = document.createElement('div')
    line.textContent = T('stats.topMoment', { count: m.online, when: formatDateTime(m.ts) })
    li.appendChild(line)
    list.appendChild(li)
  })
}

async function exportServerStats() {
  const serverId = state.currentServerId
  if (!serverId) return
  const period = document.getElementById('stats-filter-period')
  const filters = period && period.value !== 'all' ? { desde: Date.now() - periodMs(period.value) } : null
  let res = null
  try {
    res = await window.api.exportEstadisticas(serverId, filters)
  } catch (e) {
    console.error(`[${T('run.exportStats')}]`, e)
    return
  }
  if (!res || !res.ok || (!res.csv && !res.json)) {
    appendLog(T('log.exportFailed'), 'error')
    return
  }
  const format = document.getElementById('stats-export-format').value
  if (format === 'json') {
    downloadFile(res.json, 'estadisticas.json', 'application/json')
  } else {
    downloadFile(res.csv, 'estadisticas.csv', 'text/csv')
  }
}

// Crea un enlace de descarga para un contenido generado en el cliente.
function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function renderStatsPlayers(players) {
  const body = document.getElementById('stats-players-body')
  fill(body)
  if (!players.length) {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.colSpan = 4
    td.className = 'stats-empty'
    td.textContent = T('stats.noData')
    tr.appendChild(td)
    body.appendChild(tr)
    return
  }
  players.forEach((p) => {
    const tr = document.createElement('tr')
    const player = document.createElement('td')
    player.textContent = p.player
    const played = document.createElement('td')
    played.textContent = p.totalMs > 0 ? formatDuration(p.totalMs) : '0 min'
    const days = document.createElement('td')
    days.textContent = String(p.daysActive || 0)
    const lastSeen = document.createElement('td')
    lastSeen.textContent = p.lastSeen ? formatDateTime(p.lastSeen) : '—'
    tr.appendChild(player)
    tr.appendChild(played)
    tr.appendChild(days)
    tr.appendChild(lastSeen)
    body.appendChild(tr)
  })
}

async function playerAction(action) {
  const target = document.getElementById('player-target').value.trim()
  if (!target || !state.currentServerId) return
  let res = null
  try {
    res = await window.api.sendCommand(state.currentServerId, `${action} ${target}`)
  } catch (e) {
    console.error(`[${T('run.playerAction')}]`, e)
  }
  if (res && res.ok === false) {
    appendLog(T('log.error', { msg: res.error }), 'error')
    return
  }
  if (res) appendLog(`> ${action} ${target}`, 'info')
}

