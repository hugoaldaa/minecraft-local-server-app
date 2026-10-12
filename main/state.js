// Estado compartido del proceso principal
let mainWindow = null
const activeServers = {}

function getMainWindow() { return mainWindow }
function setMainWindow(win) { mainWindow = win }

// Envío seguro al renderer: la ventana puede estar destruida (o su webContents)
// entre que se dispara un evento y llega aquí. Sin estas guardas, Electron lanza
// «Object has been destroyed» y la notificación se pierde como excepción.
function sendToRenderer(channel, payload) {
  const win = mainWindow
  if (!win || win.isDestroyed()) return false
  const wc = win.webContents
  if (!wc || wc.isDestroyed()) return false
  try {
    wc.send(channel, payload)
    return true
  } catch (_) {
    return false
  }
}

// Escritura segura en el stdin de un proceso hijo. Escribir en un stdin ya
// cerrado (el proceso murió) NO lanza de forma síncrona: emite un 'error'
// asíncrono en el stream. Por eso se comprueba `writable` antes y, además, se
// instala un handler de error al arrancar el proceso (ver main/servers.js).
function writeStdin(proc, data) {
  const stdin = proc && proc.stdin
  if (!stdin || stdin.destroyed || stdin.writableEnded || !stdin.writable) return false
  try {
    stdin.write(data)
    return true
  } catch (_) {
    return false
  }
}

module.exports = { getMainWindow, setMainWindow, activeServers, sendToRenderer, writeStdin }
