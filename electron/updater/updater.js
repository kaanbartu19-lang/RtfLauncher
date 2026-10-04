const { autoUpdater, CancellationToken } = require('electron-updater')
const { app } = require('electron')
const fs = require('fs')
const path = require('path')

// Kept in sync with the `publish` block of electron-builder.yml (checked by
// `npm run qa`). electron-updater itself reads owner/repo from the
// app-update.yml that electron-builder bakes into the packaged app; these
// constants only feed the manual "open releases page" fallback.
const OWNER = 'kaanbartu19-lang'
const REPO = 'RtfLauncher'
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`

let mainWindow = null
let initialized = false
let lastState = { status: 'idle' }
let currentCheckInteractive = false
let busy = null // 'check' | 'download' | null — one operation at a time
let downloadToken = null

// ── Logging ──────────────────────────────────────────────────────────────────
// Never write secrets: strip anything that looks like a credential before it
// reaches disk, and never log request headers.
function redact(text) {
  return String(text ?? '')
    .replace(/(authorization|bearer|token|password|secret|jwt)(["'\s:=]+)[^\s"',}]+/gi, '$1$2[redacted]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})/g, '[redacted]')
}

function log(event, detail = '') {
  const line = `[${new Date().toISOString()}] ${event}${detail ? `: ${redact(detail)}` : ''}\n`
  try {
    // Electron does not create the logs directory by itself, so without this the
    // appendFileSync below fails (silently) and updater.log is never written.
    const dir = app.getPath('logs')
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'updater.log'), line, 'utf8')
  } catch {}
}

// ── Errors ───────────────────────────────────────────────────────────────────
// electron-updater errors are long and technical (stack traces, response
// headers, JSON dumps). Users get a short classified message; the raw error
// only goes to updater.log.
function classify(error) {
  const raw = `${error?.code || ''} ${error?.message || error || ''}`
  const has = re => re.test(raw)
  if (has(/ERR_UPDATER_NO_PUBLISHED_VERSIONS|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|No published versions|Cannot find latest\.yml|latest\.yml.*(404|not found)|HttpError: 404|status code 404/i)) {
    return { code: 'no-release', message: 'Henüz yayınlanmış bir güncelleme bulunamadı.' }
  }
  if (has(/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ERR_INTERNET_DISCONNECTED|ERR_NETWORK|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|getaddrinfo|socket hang up|net::/i)) {
    return { code: 'offline', message: 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip tekrar dene.' }
  }
  if (has(/rate limit|\b403\b|\b429\b|HttpError: 5\d\d|status code 5\d\d/i)) {
    return { code: 'github-unavailable', message: 'GitHub şu anda yanıt vermiyor. Birkaç dakika sonra tekrar dene.' }
  }
  if (has(/ERR_UPDATER_INVALID_UPDATE_INFO|Cannot parse update info|YAMLException|ERR_UPDATER_NO_FILES_PROVIDED|ERR_UPDATER_ASSET_NOT_FOUND/i)) {
    // The release exists but its latest.yml is unreadable / lists no usable file —
    // a publishing problem, not a bad download.
    return { code: 'bad-release', message: 'Yayınlanan güncelleme bilgisi okunamadı. Birkaç dakika sonra tekrar dene.' }
  }
  if (has(/sha512|sha-512|checksum|ERR_UPDATER_INVALID_SIGNATURE|signature|ERR_UPDATER_INVALID/i)) {
    return { code: 'verification-failed', message: 'İndirilen güncelleme doğrulanamadı. Tekrar indirmeyi dene.' }
  }
  if (has(/ENOENT|No update filepath|installer.*not found|cannot (find|open)/i)) {
    return { code: 'installer-missing', message: 'Güncelleme dosyası bulunamadı. Güncellemeyi yeniden indir.' }
  }
  if (has(/EACCES|EPERM|ENOSPC/i)) {
    return { code: 'disk', message: 'Güncelleme diske yazılamadı. Disk alanını ve izinleri kontrol et.' }
  }
  return { code: 'unknown', message: 'Güncelleme sırasında bir sorun oluştu. Ayrıntılar log dosyasına kaydedildi.' }
}

function send(payload) {
  lastState = { ...payload }
  log(`update ${payload.status}`, payload.errorDetail || payload.error || payload.version || '')
  // errorDetail is for the log only — never forward the raw text to the UI.
  const { errorDetail, ...forRenderer } = lastState
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('updates:status', forRenderer)
  } catch {}
}

// Single funnel for every failure: classifies it, logs the raw detail, and
// emits either a neutral "no release yet" state or a user-facing error.
// electron-updater reports a failure twice (the 'error' event AND the rejected
// promise); the `busy` flag lets the 'error' listener stay quiet while a
// check()/download() call is in flight so only the call's own catch reports it.
function fail(error, { stage, interactive }) {
  const { code, message } = classify(error)
  const detail = error?.stack || error?.message || String(error)
  log(`update ${stage} failed [${code}]`, detail)
  if (code === 'no-release') {
    send({ status: 'no-release', interactive, stage, message, currentVersion: app.getVersion() })
  } else {
    send({ status: 'error', interactive, stage, errorCode: code, error: message, errorDetail: detail, currentVersion: app.getVersion() })
  }
  return { code, message }
}

function normalizeNotes(notes) {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) return notes.map(n => typeof n === 'string' ? n : n?.note || '').filter(Boolean).join('\n')
  return String(notes)
}

function initUpdater(win) {
  if (initialized) return
  initialized = true
  mainWindow = win

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  // Route electron-updater's own diagnostics (URL it fetched, HTTP status, which
  // file it picked) into updater.log so a failed check can be diagnosed later.
  autoUpdater.logger = {
    info: m => log('electron-updater', m),
    warn: m => log('electron-updater warn', m),
    error: m => log('electron-updater error', m),
    debug: () => {},
  }

  autoUpdater.on('checking-for-update', () => send({ status: 'checking', interactive: currentCheckInteractive, currentVersion: app.getVersion() }))
  autoUpdater.on('update-available', info => send({
    status: 'available',
    interactive: currentCheckInteractive,
    version: info.version,
    releaseName: info.releaseName || `RtfLauncher v${info.version}`,
    releaseNotes: normalizeNotes(info.releaseNotes),
    releaseDate: info.releaseDate || null,
    currentVersion: app.getVersion(),
  }))
  autoUpdater.on('update-not-available', info => send({
    status: 'up-to-date',
    interactive: currentCheckInteractive,
    version: info?.version || null,
    currentVersion: app.getVersion(),
  }))
  autoUpdater.on('download-progress', p => send({
    status: 'downloading',
    interactive: true,
    version: autoUpdater.updateInfo?.version || null,
    currentVersion: app.getVersion(),
    percent: Number.isFinite(p.percent) ? Math.round(p.percent * 10) / 10 : 0,
    transferred: p.transferred || 0,
    total: p.total || 0,
    bytesPerSecond: p.bytesPerSecond || 0,
  }))
  autoUpdater.on('update-downloaded', info => send({
    status: 'downloaded',
    interactive: true,
    version: info.version,
    currentVersion: app.getVersion(),
    releaseName: info.releaseName || `RtfLauncher v${info.version}`,
    releaseNotes: normalizeNotes(info.releaseNotes),
  }))
  autoUpdater.on('error', error => {
    // The in-flight check()/download() call reports the same failure through
    // its own catch with the right stage; this only covers errors that arrive
    // outside of one of those calls (e.g. a failure while installing).
    if (!busy) fail(error, { stage: 'update', interactive: Boolean(lastState.interactive) })
  })
}

async function check(interactive = false) {
  if (!app.isPackaged) {
    send({ status: 'idle', dev: true, currentVersion: app.getVersion() })
    return { success: false, skipped: true, error: 'Geliştirme modunda güncelleme kontrolü yapılmaz.' }
  }
  if (busy) return { success: true, inProgress: true }
  busy = 'check'
  try {
    log('update check started', interactive ? 'interactive' : 'startup')
    currentCheckInteractive = interactive
    lastState = { status: 'checking', interactive, currentVersion: app.getVersion() }
    const result = await autoUpdater.checkForUpdates()
    return { success: true, result: result?.updateInfo ? { version: result.updateInfo.version } : null }
  } catch (error) {
    const { message } = fail(error, { stage: 'check', interactive })
    return { success: false, error: message }
  } finally {
    busy = null
  }
}

async function download() {
  // downloadUpdate() throws a cryptic error unless a check found an update first,
  // and a second click while a download runs must not start a second one.
  if (lastState.status === 'downloading' || busy === 'download') return { success: true, inProgress: true }
  if (lastState.status === 'downloaded') return { success: true, alreadyDownloaded: true }
  if (busy) return { success: true, inProgress: true }
  busy = 'download'
  downloadToken = new CancellationToken()
  try {
    log('download started')
    await autoUpdater.downloadUpdate(downloadToken)
    return { success: true }
  } catch (error) {
    if (downloadToken?.cancelled || /cancel/i.test(`${error?.name} ${error?.message}`)) {
      log('download cancelled by user')
      send({ status: 'available', interactive: true, cancelled: true, version: autoUpdater.updateInfo?.version || null, releaseNotes: normalizeNotes(autoUpdater.updateInfo?.releaseNotes), currentVersion: app.getVersion() })
      return { success: false, cancelled: true }
    }
    const { message } = fail(error, { stage: 'download', interactive: true })
    return { success: false, error: message }
  } finally {
    busy = null
    downloadToken = null
  }
}

function cancelDownload() {
  if (!downloadToken) return { success: false, error: 'Devam eden bir indirme yok.' }
  try { downloadToken.cancel() } catch {}
  return { success: true }
}

function install() {
  if (lastState.status !== 'downloaded') {
    const message = 'Kurulacak bir güncelleme hazır değil. Önce güncellemeyi indir.'
    send({ status: 'error', interactive: true, stage: 'install', errorCode: 'installer-missing', error: message, currentVersion: app.getVersion() })
    return { success: false, error: message }
  }
  try {
    const version = autoUpdater.updateInfo?.version || lastState.version || null
    send({ status: 'installing', version, currentVersion: app.getVersion() })
    log('install requested', String(version))
    // isSilent=true runs the NSIS installer with /S (no wizard — the installer is
    // the assisted, non-one-click kind), reusing the existing install directory;
    // isForceRunAfter=true relaunches the launcher when it finishes.
    autoUpdater.quitAndInstall(true, true)
    return { success: true }
  } catch (error) {
    const { message } = fail(error, { stage: 'install', interactive: true })
    return { success: false, error: message }
  }
}

function getState() {
  // Pull-based state (renderer polls updates:state) must never expose the raw
  // errorDetail/stack trace — the same rule the push channel already follows.
  const { errorDetail, ...publicState } = lastState
  return { ...publicState, currentVersion: app.getVersion(), releasesUrl: RELEASES_URL, busy: busy || null }
}

module.exports = { OWNER, REPO, RELEASES_URL, initUpdater, check, download, cancelDownload, install, getState, classify }
