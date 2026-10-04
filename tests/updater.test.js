// Behavioural tests for electron/updater/updater.js.
// electron and electron-updater are replaced with controllable fakes, so every
// state transition, error classification and IPC guard of the REAL updater
// module is exercised. This does not replace testing against a real GitHub
// release (see README) — it proves the module's own logic.
const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert/strict')
const { EventEmitter } = require('events')

const UPDATER_PATH = require.resolve('../electron/updater/updater')
const results = []
async function test(name, fn) {
  try { await fn(); results.push([true, name]) } catch (e) { results.push([false, name, e]) }
}

class FakeCancellationToken {
  constructor() { this.cancelled = false; this._cbs = [] }
  cancel() { this.cancelled = true; this._cbs.forEach(f => f()) }
  onCancel(f) { this._cbs.push(f) }
}

// Fresh updater module + fresh fakes for every test (the module keeps state).
function load({ packaged = true } = {}) {
  const logsDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rtf-upd-')), 'logs') // deliberately NOT created
  const sent = []
  const win = { isDestroyed: () => false, webContents: { send: (ch, p) => sent.push([ch, p]) } }
  const au = new EventEmitter()
  Object.assign(au, {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true, allowDowngrade: true, updateInfo: null,
    calls: { check: 0, download: 0, install: [] },
    checkImpl: async () => ({ updateInfo: { version: '8.0.0' } }),
    downloadImpl: async () => {},
    async checkForUpdates() { au.calls.check++; return au.checkImpl() },
    async downloadUpdate(token) { au.calls.download++; au.lastToken = token; return au.downloadImpl(token) },
    quitAndInstall(...a) { au.calls.install.push(a) },
  })
  const fakeElectron = { app: { isPackaged: packaged, getVersion: () => '8.0.0', getPath: n => (n === 'logs' ? logsDir : os.tmpdir()) } }
  const set = (id, exports) => { require.cache[require.resolve(id)] = { id, filename: require.resolve(id), loaded: true, exports, children: [], paths: [] } }
  set('electron', fakeElectron)
  set('electron-updater', { autoUpdater: au, CancellationToken: FakeCancellationToken })
  delete require.cache[UPDATER_PATH]
  const updater = require(UPDATER_PATH)
  updater.initUpdater(win)
  const states = () => sent.filter(([c]) => c === 'updates:status').map(([, p]) => p)
  const readLog = () => { try { return fs.readFileSync(path.join(logsDir, 'updater.log'), 'utf8') } catch { return null } }
  return { updater, au, sent, states, readLog, logsDir }
}
const errWith = (message, code) => Object.assign(new Error(message), code ? { code } : {})
// Real electron-updater emits 'error' AND rejects; mimic both.
const failing = (au, err) => async () => { au.emit('error', err); throw err }

;(async () => {
  await test('initUpdater: safe defaults (no auto download/install, stable only, no downgrade, logger wired)', () => {
    const { au } = load()
    assert.equal(au.autoDownload, false)
    assert.equal(au.autoInstallOnAppQuit, false)
    assert.equal(au.allowPrerelease, false)
    assert.equal(au.allowDowngrade, false)
    assert.equal(typeof au.logger.info, 'function')
  })

  await test('dev build: check() is skipped and never touches electron-updater', async () => {
    const { updater, au, states } = load({ packaged: false })
    const r = await updater.check(true)
    assert.equal(r.skipped, true); assert.equal(au.calls.check, 0)
    assert.equal(states().at(-1).dev, true)
  })

  await test('new version found: checking → available with version + normalized notes', async () => {
    const { updater, au, states } = load()
    au.checkImpl = async () => {
      au.emit('checking-for-update')
      au.emit('update-available', { version: '8.1.0', releaseNotes: [{ note: 'Düzeltme A' }, 'Düzeltme B'], releaseDate: '2026-10-01' })
      return { updateInfo: { version: '8.1.0' } }
    }
    const r = await updater.check(true)
    assert.equal(r.success, true)
    const s = states()
    assert.deepEqual(s.map(x => x.status), ['checking', 'available'])
    assert.equal(s[1].version, '8.1.0'); assert.equal(s[1].currentVersion, '8.0.0')
    assert.equal(s[1].releaseNotes, 'Düzeltme A\nDüzeltme B')
  })

  await test('already up to date', async () => {
    const { updater, au, states } = load()
    au.checkImpl = async () => { au.emit('update-not-available', { version: '8.0.0' }); return { updateInfo: { version: '8.0.0' } } }
    await updater.check(true)
    assert.equal(states().at(-1).status, 'up-to-date')
  })

  await test('no release published yet → neutral "no-release" state, not an error, reported once', async () => {
    const { updater, au, states } = load()
    const err = errWith('No published versions on GitHub', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS')
    au.checkImpl = async () => { au.emit('checking-for-update'); au.emit('error', err); throw err } // real order: checking, error event, rejection
    const r = await updater.check(true)
    assert.equal(r.success, false)
    const s = states()
    assert.equal(s.length, 2, 'checking + exactly one result (no duplicate from the error event)')
    assert.equal(s[1].status, 'no-release')
    assert.match(s[1].message, /yayınlanmış/)
  })

  await test('latest.yml missing in release (HTTP 404) → no-release', async () => {
    const { updater, au, states } = load()
    au.checkImpl = failing(au, errWith('Cannot find latest.yml in the latest release artifacts (https://github.com/x/y/releases/download/v1/latest.yml): HttpError: 404\nheaders: {...}', 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'))
    await updater.check(true)
    assert.equal(states().at(-1).status, 'no-release')
  })

  await test('offline → friendly message, stack/raw text never reaches the renderer', async () => {
    const { updater, au, states, readLog } = load()
    au.checkImpl = failing(au, errWith('getaddrinfo ENOTFOUND github.com', 'ENOTFOUND'))
    const r = await updater.check(true)
    const last = states().at(-1)
    assert.equal(last.status, 'error'); assert.equal(last.errorCode, 'offline'); assert.equal(last.stage, 'check')
    assert.match(last.error, /İnternet/)
    assert.equal(r.error, last.error)
    assert.ok(!JSON.stringify(last).includes('ENOTFOUND'), 'raw error not in renderer payload')
    assert.ok(!('errorDetail' in last))
    assert.match(readLog(), /ENOTFOUND github\.com/, 'raw detail is in updater.log for diagnosis')
  })

  await test('GitHub rate limit / 5xx → github-unavailable', async () => {
    for (const msg of ['HttpError: 403 rate limit exceeded', 'HttpError: 503 Service Unavailable']) {
      const { updater, au, states } = load()
      au.checkImpl = failing(au, errWith(msg))
      await updater.check(true)
      assert.equal(states().at(-1).errorCode, 'github-unavailable', msg)
    }
  })

  await test('startup (non-interactive) failure is marked non-interactive so the UI stays quiet', async () => {
    const { updater, au, states } = load()
    au.checkImpl = failing(au, errWith('getaddrinfo ENOTFOUND github.com'))
    await updater.check(false)
    assert.equal(states().at(-1).interactive, false)
  })

  await test('concurrent checks: second call is a no-op while the first is in flight', async () => {
    const { updater, au } = load()
    let release
    au.checkImpl = () => new Promise(res => { release = () => res({ updateInfo: { version: '8.0.0' } }) })
    const first = updater.check(true)
    const second = await updater.check(true)
    assert.equal(second.inProgress, true)
    release(); await first
    assert.equal(au.calls.check, 1)
  })

  await test('retry after an error works (second failure is NOT swallowed, success recovers)', async () => {
    const { updater, au, states } = load()
    au.checkImpl = failing(au, errWith('getaddrinfo ENOTFOUND github.com'))
    await updater.check(true)
    au.checkImpl = failing(au, errWith('getaddrinfo ENOTFOUND github.com'))
    await updater.check(true)
    assert.equal(states().at(-1).status, 'error', 'second consecutive failure still reported')
    au.checkImpl = async () => { au.emit('update-not-available', { version: '8.0.0' }); return {} }
    await updater.check(true)
    assert.equal(states().at(-1).status, 'up-to-date')
  })

  const toAvailable = async ctx => {
    ctx.au.checkImpl = async () => { ctx.au.updateInfo = { version: '8.1.0' }; ctx.au.emit('update-available', { version: '8.1.0' }); return {} }
    await ctx.updater.check(true)
  }

  await test('download: progress is real and rounded, ends in "downloaded"', async () => {
    const ctx = load(); await toAvailable(ctx)
    ctx.au.downloadImpl = async () => {
      ctx.au.emit('download-progress', { percent: 12.3456, transferred: 1000, total: 8000, bytesPerSecond: 500 })
      ctx.au.emit('download-progress', { percent: 100, transferred: 8000, total: 8000, bytesPerSecond: 800 })
      ctx.au.emit('update-downloaded', { version: '8.1.0' })
    }
    const r = await ctx.updater.download()
    assert.equal(r.success, true)
    const s = ctx.states().filter(x => x.status === 'downloading')
    assert.equal(s[0].percent, 12.3); assert.equal(s[0].total, 8000)
    assert.equal(ctx.states().at(-1).status, 'downloaded')
  })

  await test('download: double click while downloading does not start a second download', async () => {
    const ctx = load(); await toAvailable(ctx)
    let finish
    ctx.au.downloadImpl = () => new Promise(res => { finish = () => { ctx.au.emit('update-downloaded', { version: '8.1.0' }); res() } })
    const first = ctx.updater.download()
    const second = await ctx.updater.download()
    assert.equal(second.inProgress, true)
    finish(); await first
    assert.equal(ctx.au.calls.download, 1)
  })

  await test('download: user cancels → back to "available", flagged cancelled, no error shown', async () => {
    const ctx = load(); await toAvailable(ctx)
    ctx.au.downloadImpl = token => new Promise((_, rej) => token.onCancel(() => rej(Object.assign(new Error('cancelled'), { name: 'CancellationError' }))))
    const pending = ctx.updater.download()
    assert.equal(ctx.updater.cancelDownload().success, true)
    const r = await pending
    assert.equal(r.cancelled, true); assert.equal(r.success, false)
    const last = ctx.states().at(-1)
    assert.equal(last.status, 'available'); assert.equal(last.cancelled, true); assert.equal(last.version, '8.1.0')
    assert.equal(ctx.updater.cancelDownload().success, false, 'nothing left to cancel')
  })

  await test('download failure (corrupt file / sha512) → verification-failed at stage "download"', async () => {
    const ctx = load(); await toAvailable(ctx)
    ctx.au.downloadImpl = failing(ctx.au, errWith('sha512 checksum mismatch, expected abc, got def'))
    const r = await ctx.updater.download()
    assert.equal(r.success, false)
    const last = ctx.states().at(-1)
    assert.equal(last.errorCode, 'verification-failed'); assert.equal(last.stage, 'download')
  })

  await test('download failure (connection drops) → offline message, can retry', async () => {
    const ctx = load(); await toAvailable(ctx)
    ctx.au.downloadImpl = failing(ctx.au, errWith('read ECONNRESET', 'ECONNRESET'))
    await ctx.updater.download()
    assert.equal(ctx.states().at(-1).errorCode, 'offline')
    ctx.au.downloadImpl = async () => { ctx.au.emit('update-downloaded', { version: '8.1.0' }) }
    const retry = await ctx.updater.download()
    assert.equal(retry.success, true)
    assert.equal(ctx.states().at(-1).status, 'downloaded')
  })

  await test('install is refused unless an update was actually downloaded', () => {
    const ctx = load()
    const r = ctx.updater.install()
    assert.equal(r.success, false)
    assert.equal(ctx.au.calls.install.length, 0)
    assert.equal(ctx.states().at(-1).errorCode, 'installer-missing')
  })

  await test('install: silent NSIS install + relaunch (quitAndInstall(true, true))', async () => {
    const ctx = load(); await toAvailable(ctx)
    ctx.au.downloadImpl = async () => { ctx.au.emit('update-downloaded', { version: '8.1.0' }) }
    await ctx.updater.download()
    const r = ctx.updater.install()
    assert.equal(r.success, true)
    assert.deepEqual(ctx.au.calls.install, [[true, true]])
    assert.equal(ctx.states().at(-1).status, 'installing')
  })

  await test('install error while quitting is classified (installer missing)', async () => {
    const ctx = load(); await toAvailable(ctx)
    ctx.au.downloadImpl = async () => { ctx.au.emit('update-downloaded', { version: '8.1.0' }) }
    await ctx.updater.download()
    ctx.au.quitAndInstall = () => { throw errWith("No update filepath provided, can't quit and install") }
    const r = ctx.updater.install()
    assert.equal(r.success, false)
    assert.equal(ctx.states().at(-1).errorCode, 'installer-missing'); assert.equal(ctx.states().at(-1).stage, 'install')
  })

  await test('updater.log: directory is created on demand, secrets are redacted', async () => {
    const { updater, au, readLog, logsDir } = load()
    assert.equal(fs.existsSync(logsDir), false, 'precondition: logs dir missing')
    au.checkImpl = failing(au, errWith('request failed Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123456789 token=hunter2 password: s3cret eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop'))
    await updater.check(true)
    const log = readLog()
    assert.ok(log, 'updater.log was written')
    for (const secret of ['ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'hunter2', 's3cret', 'eyJhbGciOiJIUzI1NiJ9']) assert.ok(!log.includes(secret), `${secret} leaked into log`)
    assert.match(log, /\[redacted\]/)
  })

  await test('classify(): table of real-world error texts', () => {
    const { updater } = load()
    const cases = [
      ['Unable to find latest version on GitHub (https://github.com/o/r/releases/latest), please ensure a production release exists: HttpError: 404', 'no-release'],
      ['net::ERR_INTERNET_DISCONNECTED', 'offline'],
      ['connect ETIMEDOUT 140.82.112.3:443', 'offline'],
      ['Cannot parse update info from latest.yml in the latest release artifacts (https://github.com/o/r/releases/download/v1/latest.yml): YAMLException: unexpected', 'bad-release'],
      ['Cannot find channel "latest-linux.yml" update info: HttpError: 404 Not Found', 'no-release'],
      ['net::ERR_CONNECTION_REFUSED', 'offline'],
      ['net::ERR_NAME_NOT_RESOLVED', 'offline'],
      ['ENOSPC: no space left on device', 'disk'],
      ['something nobody anticipated', 'unknown'],
    ]
    for (const [msg, code] of cases) assert.equal(updater.classify(errWith(msg)).code, code, msg)
  })

  let failed = 0
  for (const [ok, name, err] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) { failed++; console.log(`      ${err?.stack?.split('\n').slice(0, 5).join('\n      ')}`) }
  }
  console.log(`\n${results.length - failed}/${results.length} passed (updater)`)
  process.exit(failed ? 1 : 0)
})()
