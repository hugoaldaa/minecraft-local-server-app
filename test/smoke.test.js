// Smoke tests del proceso principal (Fase 2.5): sin GUI, sin Java real y sin
// red. Verifican el flujo crítico crear → arrancar → parar → eliminar a través
// de los mismos handlers IPC que usa la interfaz.
const test = require('node:test')
const assert = require('node:assert/strict')
const EventEmitter = require('node:events')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const handlers = {}
const rendererEvents = []
const spawnedProcesses = []
const storeData = {}

class FakeStore {
  constructor(opts) {
    this.name = (opts && opts.name) || 'settings'
    if (!storeData[this.name]) storeData[this.name] = new Map()
    this.data = storeData[this.name]
  }
  get(key, fallback) { return this.data.has(key) ? this.data.get(key) : fallback }
  set(key, value) { this.data.set(key, value); return this }
  has(key) { return this.data.has(key) }
  delete(key) { return this.data.delete(key) }
}

const electronMock = {
  app: { getVersion: () => '1.9.7-test', isPackaged: false, setLoginItemSettings: () => {} },
  ipcMain: { handle: (channel, fn) => { handlers[channel] = fn } },
  Notification: class {
    static isSupported() { return false }
    show() {}
  }
}

const scheduleMock = {
  scheduleJob: (date, run) => ({
    nextInvocation: () => date,
    cancel: () => {},
    _run: run
  })
}

function fakeSpawn(command, args) {
  const proc = new EventEmitter()
  proc.stdin = new EventEmitter()
  proc.stdin.writable = true
  proc.stdin.write = () => true
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = () => {}

  if (args && args[0] === '-version') {
    setImmediate(() => {
      proc.stderr.emit('data', 'java version "21.0.1" 2023-10-17\n')
      proc.emit('close', 0)
    })
  } else if (String(command).includes('powershell') || String(command) === 'pgrep') {
    setImmediate(() => { proc.stdout.emit('data', ''); proc.emit('close', 0) })
  } else {
    spawnedProcesses.push(proc)
    setImmediate(() => proc.stdout.emit('data', 'Starting minecraft server version 1.21.1\nDone (0.123s)! For help, type "help"\n'))
  }
  return proc
}

const realChildProcess = require('node:child_process')
const childProcessMock = Object.create(realChildProcess)
childProcessMock.spawn = fakeSpawn

const realLoad = Module._load
Module._load = function (request, parent, isMain) {
  const fromMain = parent && parent.filename && parent.filename.includes(path.sep + 'main' + path.sep)
  if (fromMain) {
    if (request === 'electron') return electronMock
    if (request === 'electron-store') return FakeStore
    if (request === 'node-schedule') return scheduleMock
    if (request === 'child_process') return childProcessMock
  }
  return realLoad.apply(this, arguments)
}

const { setMainWindow } = require('../main/state')
const { registerServersIpc } = require('../main/servers')
const { registerBackupsIpc } = require('../main/backups')
const { registerRestartIpc, scheduleAutoRestart, cancelAutoRestart } = require('../main/restart')
const { buildNotification, shouldNotify } = require('../main/notifications')

setMainWindow({
  isDestroyed: () => false,
  webContents: {
    isDestroyed: () => false,
    send: (channel, payload) => rendererEvents.push({ channel, payload })
  }
})
registerServersIpc()
registerBackupsIpc()
registerRestartIpc()

const tick = () => new Promise(r => setImmediate(r))

function tempServerDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-smoke-'))
  fs.writeFileSync(path.join(dir, 'server.jar'), 'fake jar', 'utf8')
  // Puerto alto para no interferir con un servidor real en 25565.
  fs.writeFileSync(path.join(dir, 'server.properties'), `server-port=${31000 + Math.floor(Math.random() * 1000)}\n`, 'utf8')
  return dir
}

test('smoke: crear, arrancar, parar y eliminar un servidor por IPC', async () => {
  const dir = tempServerDir()
  const created = await handlers['servers:create'](null, { name: 'Smoke', jarPath: path.join(dir, 'server.jar') })
  assert.equal(created.ok, true, created.error)
  const id = created.server.id
  rendererEvents.length = 0

  const started = await handlers['server:start'](null, { serverId: id, acceptEula: true })
  assert.deepEqual(started, { ok: true })
  assert.equal(spawnedProcesses.length, 1, 'debe lanzar un proceso Java')
  await tick()
  assert.ok(rendererEvents.some(e => e.channel === 'console-line' && /Done \(0\.123s\)/.test(e.payload.text)))

  const status = await handlers['server:status'](null, id)
  assert.equal(status.running, true)

  const stopped = await handlers['server:stop'](null, id)
  assert.equal(stopped.ok, true)
  spawnedProcesses[0].emit('exit', 0)
  await tick()
  assert.ok(rendererEvents.some(e => e.channel === 'server-stopped'))
  assert.equal((await handlers['server:status'](null, id)).running, false)

  assert.equal((await handlers['servers:delete'](null, id)).ok, true)
  assert.equal(await handlers['servers:get'](null, id), null)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('smoke: reinicio programado se activa y se cancela', async () => {
  const dir = tempServerDir()
  const created = await handlers['servers:create'](null, { name: 'Smoke restart', jarPath: path.join(dir, 'server.jar') })
  const id = created.server.id
  // settings:set vive en index.js; aquí se simula escribiendo el store que
  // lee scheduleAutoRestart (mismo efecto que la llamada IPC real).
  new FakeStore({ name: 'settings' }).set(`server_${id}`, { autoRestartEnabled: true, autoRestartInterval: '6h' })
  scheduleAutoRestart(id)
  const status = await handlers['restart:status'](null, id)
  assert.equal(status.enabled, true)
  assert.equal(status.interval, '6h')
  assert.ok(status.nextAt, 'debe exponer la próxima ejecución')
  cancelAutoRestart(id)
  await handlers['servers:delete'](null, id)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('smoke: las notificaciones respetan las preferencias', () => {
  assert.equal(shouldNotify('server_started', { notifyServer: true }), true)
  assert.equal(shouldNotify('server_started', { notifyServer: false }), false)
  assert.equal(shouldNotify('unknown', {}), false)
  const n = buildNotification('server_crash', { name: 'Mundo', detail: 'sin memoria' }, 'es')
  assert.equal(n.title, 'Servidor caído')
  assert.equal(n.body, 'Mundo se ha caído. sin memoria')
})
