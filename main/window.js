const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')
const { activeServers, setMainWindow, getMainWindow, sendToRenderer } = require('./state')
const { stopAllServers } = require('./servers')
const { canOpenPath, rememberPickedDir, isStr } = require('./validate')
const { settingsStore } = require('./stores')

// Fondo nativo según el tema elegido en Ajustes (evita el flash blanco/negro)
const THEME_BG = { dark: '#141815', light: '#efe8d2' }
function currentBackgroundColor() {
  return THEME_BG[settingsStore.get('theme')] || THEME_BG.dark
}
function applyWindowTheme() {
  getMainWindow()?.setBackgroundColor(currentBackgroundColor())
}

let forceClosing = false

// Carga el icono de la app de forma robusta. En el build de Linux empaquetado
// los recursos viven dentro de app.asar y nativeImage.createFromPath puede no
// poder leer la ruta del archivo directamente; de fallar, se lee el buffer y
// se crea la imagen desde él (fs.readFileSync sí resuelve rutas asar).
function loadAppIcon() {
  const iconPath = path.join(
    __dirname,
    '..',
    'assets',
    process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  )
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    try {
      image = nativeImage.createFromBuffer(fs.readFileSync(iconPath))
    } catch (_) {
      // icono no disponible
    }
  }
  return image
}

// Espera a que todos los servidores se detengan (o al timeout) antes de salir.
// Sin esto, app.quit() queda cancelado por el guard de 'close' y la app no cierra.
function quitWhenServersStopped(timeoutMs = 15000) {
  if (Object.keys(activeServers).length === 0) {
    forceClosing = true
    app.quit()
    return
  }
  forceClosing = true
  stopAllServers()
  const start = Date.now()
  const iv = setInterval(() => {
    if (Object.keys(activeServers).length === 0 || Date.now() - start > timeoutMs) {
      clearInterval(iv)
      app.quit()
    }
  }, 200)
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 1024, minHeight: 640,
    title: 'Minecraft Manager',
    icon: loadAppIcon(),
    backgroundColor: currentBackgroundColor(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    },
    frame: false
  })
  setMainWindow(mainWindow)
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'))
  mainWindow.on('close', (e) => {
    if (forceClosing) return
    // «Cerrar en vez de minimizar»: la ✕ oculta la ventana en la bandeja y
    // los servidores siguen corriendo; se sale desde el menú de bandeja.
    if (settingsStore.get('closeToTray') === true) {
      e.preventDefault()
      mainWindow.hide()
      return
    }
    const running = Object.keys(activeServers)
    if (running.length > 0) {
      e.preventDefault()
      sendToRenderer('confirm-close', { count: running.length })
    }
  })
  mainWindow.on('closed', () => setMainWindow(null))
  mainWindow.on('maximize', () => { sendToRenderer('window:maximized', true) })
  mainWindow.on('unmaximize', () => { sendToRenderer('window:maximized', false) })
  mainWindow.webContents.on('did-finish-load', () => {
    sendToRenderer('window:maximized', mainWindow.isMaximized())
    // Tamaño de la interfaz guardado en Ajustes → Apariencia
    const zoom = settingsStore.get('uiScale')
    if ([1, 1.25, 1.5].includes(zoom)) mainWindow.webContents.setZoomFactor(zoom)
  })
  // Guardas de navegación: nada fuera del bundle de la app
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  return mainWindow
}

function registerWindowIpc() {
  ipcMain.handle('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize(); else win.maximize()
  })
  // La ✕ de la titlebar: con «Cerrar en vez de minimizar» la ventana se
  // oculta en la bandeja (los servidores siguen corriendo); si no, se sale.
  ipcMain.handle('window:close', () => {
    const win = getMainWindow()
    if (settingsStore.get('closeToTray') === true && win) {
      win.hide()
      return
    }
    quitWhenServersStopped()
  })

  ipcMain.handle('dialog:openJar', async () => {
    // Carpeta por defecto configurada en Ajustes → General
    const startDir = settingsStore.get('defaultServerDir')
    const r = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Selecciona el .jar',
      filters: [{ name: 'JAR', extensions: ['jar'] }],
      properties: ['openFile'],
      ...(isStr(startDir) && startDir ? { defaultPath: startDir } : {})
    })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:openDir', async () => {
    const r = await dialog.showOpenDialog(getMainWindow(), { title: 'Selecciona carpeta', properties: ['openDirectory'] })
    if (r.canceled) return null
    rememberPickedDir(r.filePaths[0])
    return r.filePaths[0]
  })
  ipcMain.handle('shell:openPath', (_, p) => {
    if (!canOpenPath(p)) return { ok: false, error: 'Ruta no permitida' }
    return new Promise((resolve) => {
      shell.openPath(p).then((errMsg) => {
        resolve(errMsg ? { ok: false, error: errMsg } : { ok: true })
      }).catch((err) => resolve({ ok: false, error: err.message }))
    })
  })
}

module.exports = { createWindow, registerWindowIpc, quitWhenServersStopped, applyWindowTheme }
