// Capa HTTP reutilizable: peticiones con redirecciones, lectura de texto,
// hashing y descarga a fichero con progreso y cancelación. Sin lógica de
// proveedores ni de IPC, para poder testear/reeutilizar de forma aislada.
'use strict'

const { app } = require('electron')
const https = require('https')
const http = require('http')
const zlib = require('zlib')
const fs = require('fs')
const crypto = require('crypto')

const USER_AGENT = 'minecraft-local-server-app/' + (app && app.getVersion ? app.getVersion() : '1.7.1')
const MAX_REDIRECTS = 5
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024
const PROGRESS_STEP = 262144

function getWithRedirects(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(url, { headers: { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (redirects >= MAX_REDIRECTS) return reject(new Error('Demasiadas redirecciones'))
        const next = new URL(res.headers.location, url).href
        return resolve(getWithRedirects(next, redirects + 1))
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume()
        return reject(new Error('HTTP ' + res.statusCode))
      }
      let stream = res
      if (res.headers['content-encoding'] === 'gzip') stream = res.pipe(zlib.createGunzip())
      else if (res.headers['content-encoding'] === 'deflate') stream = res.pipe(zlib.createInflate())
      resolve({ stream, status: res.statusCode, headers: res.headers })
    })
    req.on('error', reject)
  })
}

async function fetchText(url, maxBytes = MAX_MANIFEST_BYTES) {
  const { stream } = await getWithRedirects(url)
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    stream.on('data', d => {
      size += d.length
      if (size > maxBytes) {
        stream.destroy()
        return reject(new Error('Respuesta demasiado grande'))
      }
      chunks.push(d)
    })
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    stream.on('error', reject)
  })
}

async function fetchJson(url, maxBytes = MAX_MANIFEST_BYTES) {
  return JSON.parse(await fetchText(url, maxBytes))
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', d => hash.update(d))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function downloadToFile(url, destPath, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const tmpPath = destPath + '.part'
    let ws = null
    let received = 0
    let total = null
    let lastReport = 0
    let settled = false

    const fail = (err) => {
      if (settled) return
      settled = true
      if (ws) { try { ws.destroy() } catch (_) { } }
      fs.rm(tmpPath, { force: true }, () => {})
      reject(err)
    }

    const cancel = () => {
      const err = new Error('Descarga cancelada')
      err.code = 'ECANCELED'
      fail(err)
    }

    const report = () => {
      if (!onProgress || received - lastReport < PROGRESS_STEP) return
      lastReport = received
      onProgress({ received, total })
    }

    const start = () => {
      if (signal && signal.aborted) return cancel()
      getWithRedirects(url)
        .then(({ stream, headers }) => {
          if (signal && signal.aborted) return cancel()
          total = Number(headers['content-length']) || null
          ws = fs.createWriteStream(tmpPath, { flags: 'w' })
          ws.on('error', fail)
          ws.on('finish', () => {
            if (settled) return
            settled = true
            fs.rename(tmpPath, destPath, (err) => (err ? fail(err) : resolve({ received, total })))
          })
          stream.on('data', d => { received += d.length; report() })
          stream.on('end', () => { if (ws && !ws.destroyed) ws.end() })
          stream.on('error', fail)
          if (signal) signal.addEventListener('abort', cancel, { once: true })
        })
        .catch(fail)
    }

    start()
  })
}

module.exports = { USER_AGENT, getWithRedirects, fetchText, fetchJson, sha256File, downloadToFile }
