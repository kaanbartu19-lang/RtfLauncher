// Small HTTP layer for the main process. Every request has a timeout, follows
// a bounded number of redirects and rejects non-2xx responses with the real
// status so callers can map it to a meaningful message.
const https = require('https')
const http = require('http')
const fs = require('fs')
const crypto = require('crypto')

const USER_AGENT = `RtfLauncher/${require('../../package.json').version} (rtfsmp.net)`

class HttpError extends Error {
  constructor(status, message, body = '') {
    super(message || `HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.body = body
  }
}

function request(url, { method = 'GET', headers = {}, body = null, timeout = 20000, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let u
    try { u = new URL(url) } catch { return reject(new Error(`Geçersiz adres: ${url}`)) }
    const lib = u.protocol === 'https:' ? https : u.protocol === 'http:' ? http : null
    if (!lib) return reject(new Error(`Desteklenmeyen protokol: ${u.protocol}`))
    const payload = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body))
    const req = lib.request(u, {
      method,
      headers: { 'User-Agent': USER_AGENT, ...headers, ...(payload ? { 'Content-Length': payload.length } : {}) },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        if (maxRedirects <= 0) return reject(new Error('Çok fazla yönlendirme.'))
        const next = new URL(res.headers.location, u).toString()
        const keepMethod = res.statusCode === 307 || res.statusCode === 308
        return request(next, { method: keepMethod ? method : 'GET', headers, body: keepMethod ? body : null, timeout, maxRedirects: maxRedirects - 1 }).then(resolve, reject)
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.setTimeout(timeout, () => req.destroy(new Error('Bağlantı zaman aşımına uğradı.')))
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

async function getText(url, headers = {}, opts = {}) {
  const res = await request(url, { headers, ...opts })
  const text = res.body.toString('utf8')
  if (res.status < 200 || res.status >= 300) throw new HttpError(res.status, `HTTP ${res.status}: ${text.slice(0, 180)}`, text)
  return text
}

async function getJson(url, headers = {}, opts = {}) {
  return JSON.parse(await getText(url, { Accept: 'application/json', ...headers }, opts))
}

async function postJson(url, data, headers = {}) {
  const res = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers }, body: JSON.stringify(data) })
  const text = res.body.toString('utf8')
  if (res.status < 200 || res.status >= 300) {
    let msg = `HTTP ${res.status}`
    try { const x = JSON.parse(text); msg = x.errorMessage || x.error_description || x.error || x.description || msg } catch {}
    throw new HttpError(res.status, msg, text)
  }
  return text
}

async function postForm(url, form) {
  const res = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  return { status: res.status, text: res.body.toString('utf8') }
}

function hashFile(file, algorithm = 'sha1') {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash(algorithm)
    fs.createReadStream(file).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

// Downloads into `<dest>.part`, verifies HTTP status, size and hash, then
// renames into place. A failed download never leaves a file that could be
// mistaken for an installed project.
function downloadFile(url, dest, { sha1, sha512, size, onProgress, allowedHosts, timeout = 30000, maxRedirects = 6 } = {}) {
  const part = `${dest}.part`
  return new Promise((resolve, reject) => {
    const fail = err => { fs.rm(part, { force: true }, () => reject(err)) }
    const follow = (current, left) => {
      let u
      try { u = new URL(current) } catch { return fail(new Error('Geçersiz indirme adresi.')) }
      if (u.protocol !== 'https:') return fail(new Error('Yalnızca HTTPS indirmelerine izin verilir.'))
      if (allowedHosts && !allowedHosts.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) return fail(new Error(`İzin verilmeyen indirme kaynağı: ${u.hostname}`))
      const req = https.get(u, { headers: { 'User-Agent': USER_AGENT } }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          if (left <= 0) return fail(new Error('Çok fazla yönlendirme.'))
          return follow(new URL(res.headers.location, u).toString(), left - 1)
        }
        if (res.statusCode !== 200) { res.resume(); return fail(new HttpError(res.statusCode, `İndirme başarısız (HTTP ${res.statusCode}).`)) }
        const total = Number(res.headers['content-length'] || size || 0)
        let received = 0, lastPct = -1
        const h1 = crypto.createHash('sha1'), h512 = crypto.createHash('sha512')
        const out = fs.createWriteStream(part)
        res.on('data', chunk => {
          received += chunk.length; h1.update(chunk); h512.update(chunk)
          if (total && onProgress) { const pct = Math.min(100, Math.round(received / total * 100)); if (pct !== lastPct) { lastPct = pct; onProgress(pct) } }
        })
        res.on('error', fail)
        out.on('error', fail)
        out.on('finish', () => {
          const got1 = h1.digest('hex'), got512 = h512.digest('hex')
          if (size && received !== Number(size)) return fail(new Error('İndirilen dosyanın boyutu beklenenden farklı.'))
          if (sha512 && got512 !== String(sha512).toLowerCase()) return fail(new Error('Dosya doğrulaması başarısız (sha512).'))
          if (sha1 && got1 !== String(sha1).toLowerCase()) return fail(new Error('Dosya doğrulaması başarısız (sha1).'))
          try { fs.renameSync(part, dest) } catch (e) { return fail(e) }
          resolve({ success: true, sha1: got1, sha512: got512, size: received })
        })
        res.pipe(out)
      })
      req.setTimeout(timeout, () => req.destroy(new Error('İndirme zaman aşımına uğradı.')))
      req.on('error', fail)
    }
    follow(url, maxRedirects)
  })
}

module.exports = { USER_AGENT, HttpError, request, getText, getJson, postJson, postForm, downloadFile, hashFile }
