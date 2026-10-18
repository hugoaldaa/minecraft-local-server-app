const { app, Tray, Menu, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const { settingsStore } = require('./stores')
const { getMainWindow } = require('./state')
const { quitWhenServersStopped } = require('./window')

let tray = null

// Los textos salen del main porque el menú de bandeja vive fuera del renderer
const TRAY_TEXT = {
  es: { open: 'Abrir', quit: 'Salir' },
  en: { open: 'Open', quit: 'Quit' }
}

function trayLang() {
  return settingsStore.get('lang') === 'en' ? 'en' : 'es'
}

function showWindow() {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function setContextMenu() {
  if (!tray) return
  const t = TRAY_TEXT[trayLang()]
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.open, click: showWindow },
    { type: 'separator' },
    { label: t.quit, click: () => quitWhenServersStopped() }
  ]))
}

function createTray() {
  if (tray) return
  const iconPath = path.join(__dirname, '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    try {
      image = nativeImage.createFromBuffer(fs.readFileSync(iconPath))
    } catch (_) {
      return
    }
  }
  if (image.isEmpty()) return
  tray = new Tray(image)
  tray.setToolTip(app.getName())
  setContextMenu()
  tray.on('click', showWindow)
}

function destroyTray() {
  if (!tray) return
  tray.destroy()
  tray = null
}

// Crea o elimina la bandeja según la preferencia «Cerrar en vez de minimizar»
function syncTray() {
  if (settingsStore.get('closeToTray') === true) createTray()
  else destroyTray()
}

function updateTrayLang() {
  setContextMenu()
}

module.exports = { syncTray, updateTrayLang }
