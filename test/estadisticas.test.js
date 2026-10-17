const test = require('node:test')
const assert = require('node:assert')
const logs = require('../main/logs')
const estadisticas = require('../main/estadisticas')

// ─── parseLogLine ──────────────────────────────────────────────────────────
test('detecta join y leave con el timestamp del log', () => {
  const join = logs.parseLogLine('[10:15:30] [Server thread/INFO]: Steve joined the game')
  assert.ok(join)
  assert.equal(join.type, 'join')
  assert.equal(join.player, 'Steve')
  assert.ok(join.ts > 0)

  const leave = logs.parseLogLine('[10:16:05] [Server thread/INFO]: Alex left the game')
  assert.ok(leave)
  assert.equal(leave.type, 'leave')
  assert.equal(leave.player, 'Alex')
  assert.ok(leave.ts > 0)
})

test('ignora líneas que no son eventos de jugadores', () => {
  assert.equal(logs.parseLogLine('Done (5.0s)! For help, type "help"'), null)
  assert.equal(logs.parseLogLine(''), null)
})

// ─── computePlayerTotals ──────────────────────────────────────────────────
test('acumula el tiempo jugado entre join y leave', () => {
  const now = Date.now()
  const hace = minutos => now - minutos * 60000
  const events = [
    { ts: hace(60), type: 'join', player: 'Steve' },
    { ts: hace(50), type: 'join', player: 'Alex' },
    { ts: hace(40), type: 'leave', player: 'Steve' },
    { ts: hace(30), type: 'leave', player: 'Alex' }
  ]
  const totals = estadisticas.computePlayerTotals(events, hace(20))
  // Steve: de hace(40) a hace(20) = 20 minutos. Alex: de hace(50) a hace(30) = 20.
  assert.equal(totals['Steve'].totalMs, 20 * 60000)
  assert.equal(totals['Alex'].totalMs, 20 * 60000)
})

test('cierra las sesiones abiertas al parar el servidor', () => {
  const now = Date.now()
  const hace = minutos => now - minutos * 60000
  const events = [
    { ts: hace(50), type: 'join', player: 'Notch' },
    { ts: hace(10), type: 'join', player: 'Steve' },
    { ts: hace(5), type: 'leave', player: 'Steve' }
  ]
  const totals = estadisticas.computePlayerTotals(events, hace(15))
  // Notch sigue conectado al parar: se cierra en ese momento (35 minutos).
  assert.equal(totals['Notch'].totalMs, 35 * 60000)
  assert.equal(totals['Steve'].totalMs, 5 * 60000)
})

test('desglosa el tiempo por día (UTC)', () => {
  const inicio = Date.UTC(2026, 9, 16, 23, 0, 0) // 16 de octubre a las 23:00
  const fin = Date.UTC(2026, 9, 17, 1, 0, 0) // 17 de octubre a las 01:00
  const partes = estadisticas.splitByDay(inicio, fin)
  assert.equal(partes.length, 2)
  assert.equal(partes[0].day, '2026-10-16')
  assert.equal(partes[0].ms, 60 * 60000)
  assert.equal(partes[1].day, '2026-10-17')
  assert.equal(partes[1].ms, 3600000)
})

test('ignora leaves sin sesión abierta', () => {
  const events = [{ ts: Date.now(), type: 'leave', player: 'Ghost' }]
  const totals = estadisticas.computePlayerTotals(events, Date.now())
  assert.equal(totals['Ghost'], undefined)
})

// ─── Fase 2: métricas por servidor ──────────────────────────────────────────

test('computeUptimeMs calcula las horas encendido', () => {
  const inicio = Date.now() - 60 * 60000
  const fin = inicio + 30 * 60000
  const run = { startedAt: inicio, stoppedAt: fin }
  assert.equal(estadisticas.computeUptimeMs(run), 30 * 60000)

  // Si sigue en marcha, se mide hasta ahora.
  const corriendo = { startedAt: Date.now() - 10 * 60000 }
  assert.ok(estadisticas.computeUptimeMs(corriendo) >= 10 * 60000)

  // Sin hora de inicio registrada no hay horas encendido.
  assert.equal(estadisticas.computeUptimeMs(null), 0)
})

test('computeResourcePeaks devuelve el máximo y el momento', () => {
  const samples = [
    { ts: 1000, cpu: 10, ramUsed: 100 },
    { ts: 2000, cpu: 40, ramUsed: 200 },
    { ts: 3000, cpu: 30, ramUsed: 500 }
  ]
  const peaks = estadisticas.computeResourcePeaks(samples)
  assert.equal(peaks.cpuPeak, 40)
  assert.equal(peaks.cpuAt, 2000)
  assert.equal(peaks.ramPeak, 500)
  assert.equal(peaks.ramAt, 3000)
})

test('computeDailyPlayerActivity agrupa por día', () => {
  const events = [
    { ts: Date.UTC(2026, 9, 16, 10, 0, 0), type: 'join', player: 'Steve' },
    { ts: Date.UTC(2026, 9, 16, 11, 0, 0), type: 'join', player: 'Alex' },
    { ts: Date.UTC(2026, 9, 17, 9, 0, 0), type: 'join', player: 'Steve' }
  ]
  const daily = estadisticas.computeDailyPlayerActivity(events)
  const dia16 = daily['2026-10-16']
  assert.ok(dia16)
  assert.equal(dia16.joins, 2)
  assert.deepEqual(Object.keys(dia16.players).sort(), ['Alex', 'Steve'])
  const dia17 = daily['2026-10-17']
  assert.ok(dia17)
  assert.equal(dia17.joins, 1)
  assert.deepEqual(Object.keys(dia17.players), ['Steve'])
})

test('computeConcurrentMoments devuelve los momentos con más jugadores', () => {
  const events = [
    { ts: 1000, type: 'join', player: 'A' },
    { ts: 2000, type: 'join', player: 'B' },
    { ts: 3000, type: 'join', player: 'C' },
    { ts: 4000, type: 'leave', player: 'A' },
    { ts: 5000, type: 'join', player: 'D' }
  ]
  const moments = estadisticas.computeConcurrentMoments(events, 3)
  assert.equal(moments.length, 3)
  assert.equal(moments[0].online, 3)
  assert.equal(moments[0].ts, 3000)
  assert.equal(moments[1].online, 3)
  assert.equal(moments[1].ts, 5000)
  assert.equal(moments[2].online, 2)
})

// ─── Fase 4: filtros, retención y exportación ───────────────────────────────

test('filterPlayerEvents recorta por el rango [desde, hasta]', () => {
  const events = [
    { ts: 1000, type: 'join', player: 'A' },
    { ts: 5000, type: 'join', player: 'B' },
    { ts: 9000, type: 'leave', player: 'B' }
  ]
  const kept = estadisticas.filterPlayerEvents(events, { desde: 3000 })
  assert.equal(kept.length, 2)
  assert.equal(kept[0].player, 'B')

  const ventana = estadisticas.filterPlayerEvents(events, { desde: 2000, hasta: 6000 })
  assert.equal(ventana.length, 1)
  assert.equal(ventana[0].player, 'B')

  const todo = estadisticas.filterPlayerEvents(events, null)
  assert.equal(todo.length, 3)
})

test('prunePlayerTotals descarta los días antiguos y recalcula el total', () => {
  const hoy = new Date().toISOString().slice(0, 10)
  const totals = {
    Steve: { totalMs: 1000, days: { '2000-01-01': 1000, [hoy]: 500 } }
  }
  estadisticas.prunePlayerTotals(totals)
  assert.deepEqual(Object.keys(totals['Steve'].days), [hoy])
  assert.equal(totals['Steve'].totalMs, 500)
})

test('buildServerJson devuelve el export en formato JSON', () => {
  const json = estadisticas.buildServerJson('srv1')
  assert.equal(json.servidor, 'srv1')
  assert.equal(typeof json.horasEncendidoMs, 'number')
  assert.ok(Array.isArray(json.jugadores))
  assert.equal(json.jugadores.length, 0)
})

test('pruneEvents respeta los días de retención configurados', () => {
  const hace = dias => Date.now() - dias * 24 * 60 * 60 * 1000
  const events = [
    { ts: 1000, type: 'join', player: 'A' },
    { ts: hace(40), type: 'join', player: 'B' },
    { ts: hace(5), type: 'join', player: 'C' },
    { ts: Date.now(), type: 'join', player: 'D' }
  ]
  const kept = logs.pruneEvents(events, 10)
  assert.equal(kept.length, 2)
  assert.ok(kept.some(e => e.player === 'C'))
  assert.ok(kept.some(e => e.player === 'D'))
  assert.equal(
    kept.some(e => e.player === 'A'),
    false
  )
  assert.equal(
    kept.some(e => e.player === 'B'),
    false
  )
})
