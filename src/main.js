const { app, BrowserWindow, ipcMain, shell, dialog, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const AdmZip = require('adm-zip')
const { Client } = require('minecraft-launcher-core')
const net = require('./lib/net')
const authLib = require('./lib/auth')
const { ProfileStore, writeJsonAtomic, LOADERS } = require('./lib/profile-store')
const { ContentManager, TYPES: CONTENT_TYPES } = require('./lib/content-manager')
const { GameLauncher, loaderVersions, findJava, javaMajor, defaultFabricLoaderVersion } = require('./lib/game-launcher')
const { ensureRequiredMods, ensureFabricApi, loaderMeetsMinimum } = require('./lib/required-mods')
const { isBuiltinManagedFilename } = require('./lib/builtin-client')
const updater = require('../electron/updater/updater')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const APP_DIR = process.env.RTF_APP_DIR || path.join(os.homedir(), '.rtf-launcher-v2')
const CONFIG_PATH = path.join(APP_DIR, 'config.json')
const BRANDING_PATH = path.join(__dirname, '../branding.json')
// Packaged builds run from a read-only app.asar, so admin-saved branding
// must land in the writable launcher data directory instead of the archive.
const USER_BRANDING_PATH = path.join(APP_DIR, 'branding.json')
const MC_DIR = path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft')
const PROFILES_DIR = path.join(APP_DIR, 'profiles')
// Libraries, assets and version jars are shared by all profiles; each profile
// only owns its game directory (mods, packs, saves, config, logs).
const SHARED_MC_ROOT = path.join(APP_DIR, 'minecraft')
let win

function send(channel, payload) { try { if (win && !win.isDestroyed()) win.webContents.send(channel, payload) } catch {} }

// Wraps an IPC handler so every call resolves to { success, ... } and errors
// carry their message and code instead of rejecting in the renderer.
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const out = await fn(...args)
      if (out && typeof out === 'object' && !Array.isArray(out) && 'success' in out) return out
      return { success: true, ...(out && typeof out === 'object' && !Array.isArray(out) ? out : { data: out }) }
    } catch (e) {
      if (isDev) console.error(`[ipc:${channel}]`, e)
      return { success: false, error: e?.message || String(e), code: e?.code || null, status: e?.status || null }
    }
  })
}

// ── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 780, minWidth: 1000, minHeight: 640,
    frame: false, backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    }
  })
  // Never let the launcher window navigate away or open arbitrary windows.
  win.webContents.setWindowOpenHandler(({ url }) => { openExternalSafe(url); return { action: 'deny' } })
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? url.startsWith('http://localhost:5173') : url.startsWith('file://')
    if (!allowed) { e.preventDefault(); openExternalSafe(url) }
  })
  if (isDev) win.loadURL('http://localhost:5173')
  else win.loadFile(path.join(__dirname, '../renderer/dist/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  updater.initUpdater(win)
  // Update checks are intentionally non-blocking: the launcher UI and local/offline
  // functionality must remain available when the network is unavailable.
  setTimeout(() => updater.check(), 2500)
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.on('win:minimize', () => win?.minimize())
ipcMain.on('win:maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win:close',    () => win?.close())

function openExternalSafe(rawUrl) {
  const url = new URL(rawUrl)
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Geçersiz bağlantı')
  return shell.openExternal(url.toString())
}
ipcMain.handle('external:open', async (_, rawUrl) => {
  try { await openExternalSafe(rawUrl); return { success: true } } catch (e) { return { success: false, error: e.message } }
})

// ── Version / updater ────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => ({ success: true, version: app.getVersion() }))
ipcMain.handle('updates:state', () => updater.getState())
ipcMain.handle('updates:check', (_, interactive = true) => updater.check(Boolean(interactive)))
ipcMain.handle('updates:download', () => updater.download())
ipcMain.handle('updates:install', () => updater.install())
ipcMain.handle('updates:cancel', () => updater.cancelDownload())
ipcMain.handle('updates:releases-url', () => ({ success: true, url: updater.RELEASES_URL }))

// ── Config ───────────────────────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) } catch { return {} }
}
// Tokens never belong in plain config.json — they live in safeStorage.
function sanitizeConfig(cfg) {
  const out = { ...(cfg || {}) }
  if (out.user && typeof out.user === 'object') { const u = { ...out.user }; delete u.auth; delete u.token; out.user = u }
  delete out.modProfiles; delete out.profiles; delete out.activeModProfileId
  return out
}
function writeConfig(cfg) { writeJsonAtomic(CONFIG_PATH, sanitizeConfig(cfg)) }

ipcMain.handle('config:load', () => readConfig())
ipcMain.handle('config:save', (_, cfg) => {
  // Legacy full-replace API. Keys this caller did not send are preserved, so a
  // stale copy of the config can no longer wipe unrelated settings.
  try { writeConfig({ ...readConfig(), ...(cfg || {}) }); return { success: true } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('config:patch', (_, patch = {}) => {
  try {
    const next = { ...readConfig() }
    for (const [k, v] of Object.entries(patch || {})) { if (v === undefined || v === null) delete next[k]; else next[k] = v }
    writeConfig(next)
    return { success: true, config: readConfig() }
  } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('branding:load', () => {
  // User-saved branding (writable location) takes precedence over the bundled defaults.
  try { return JSON.parse(fs.readFileSync(USER_BRANDING_PATH, 'utf-8')) } catch {}
  try { return JSON.parse(fs.readFileSync(BRANDING_PATH, 'utf-8')) } catch { return null }
})
ipcMain.handle('branding:save', (_, data) => {
  // Development: the bundled path is writable. Packaged: app.asar is read-only,
  // so fall back to the launcher data directory.
  let lastError = 'Branding kaydedilemedi.'
  for (const target of [BRANDING_PATH, USER_BRANDING_PATH]) {
    try { writeJsonAtomic(target, data); return { success: true } } catch (e) { lastError = e.message }
  }
  return { success: false, error: lastError }
})

// ── Secure storage (safeStorage) ─────────────────────────────────────────────
function secureWrite(name, value) {
  fs.mkdirSync(APP_DIR, { recursive: true })
  if (!safeStorage.isEncryptionAvailable()) throw new Error('İşletim sistemi güvenli depolaması kullanılamıyor.')
  const file = path.join(APP_DIR, name)
  if (value == null) { fs.rmSync(file, { force: true }); return }
  fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(value)).toString('base64'), 'utf8')
}
function secureRead(name) {
  const file = path.join(APP_DIR, name)
  if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(file)) return null
  return JSON.parse(safeStorage.decryptString(Buffer.from(fs.readFileSync(file, 'utf8'), 'base64')))
}
const loadAuth = async () => secureRead('auth.bin')
const saveAuth = async auth => secureWrite('auth.bin', auth)

ipcMain.handle('auth:secure-save', (_, auth) => { try { secureWrite('auth.bin', auth || {}); return { success: true } } catch (e) { return { success: false, error: e.message } } })
ipcMain.handle('auth:secure-load', () => { try { const auth = secureRead('auth.bin'); return auth ? { success: true, auth } : { success: false } } catch (e) { return { success: false, error: e.message } } })
ipcMain.handle('auth:secure-clear', () => { try { secureWrite('auth.bin', null); secureWrite('backend.bin', null); return { success: true } } catch (e) { return { success: false, error: e.message } } })

// Reset only launcher data belonging to the currently active local account.
// Never delete the global .minecraft directory, shared runtime libraries, or server branding.
ipcMain.handle('account:reset', async () => {
  try {
    const current = readConfig() || {}
    const uuid = current?.user?.uuid ? String(current.user.uuid).replace(/[^A-Za-z0-9_-]/g, '') : ''
    await secureWrite('auth.bin', null)
    await secureWrite('backend.bin', null)
    store.resetAll()
    if (uuid) {
      fs.rmSync(skinPathFor(uuid), { force: true })
      fs.rmSync(skinPathFor(uuid, 'json'), { force: true })
    }
    const preserved = {}
    for (const key of ['apiUrl', 'serverName', 'serverIp', 'version']) if (current[key] !== undefined) preserved[key] = current[key]
    // Explicitly rebuild a clean launcher session. Do not rely on renderer-side
    // deletion or a reload to remove stale auth/profile/onboarding references.
    preserved.user = null
    preserved.accountRegistered = false
    preserved.hasCompletedOnboarding = false
    preserved.onboarded = false
    preserved.onboardingStep = 0
    preserved.language = current.language === 'en' ? 'en' : 'tr'
    preserved.theme = current.theme === 'light' ? 'light' : 'dark'
    writeConfig(preserved)
    return { success: true, config: readConfig() }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})
handle('session:backend-token-get', async () => ({ token: secureRead('backend.bin')?.token || '' }))
handle('session:backend-token-set', async token => { secureWrite('backend.bin', token ? { token: String(token) } : null); return {} })

// ── Auth ─────────────────────────────────────────────────────────────────────
ipcMain.handle('auth:cracked', (_, username) => {
  const name = username?.trim()
  if (!name || name.length < 3 || name.length > 16) return { success: false, error: 'Geçersiz kullanıcı adı.' }
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return { success: false, error: 'Sadece harf, rakam ve _ kullanılabilir.' }
  const uuid = crypto.createHash('md5').update('OfflinePlayer:' + name).digest('hex')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
  return { success: true, user: { username: name, uuid, type: 'cracked', auth: { access_token: 'offline', client_token: uuid, uuid, name, user_properties: '{}', meta: { type: 'mojang', demo: false } } } }
})

ipcMain.handle('auth:microsoft', async () => {
  // Browser OAuth on Microsoft's own page; no password reaches the launcher.
  let authWin
  try {
    const code = await new Promise((resolve, reject) => {
      authWin = new BrowserWindow({ width: 520, height: 720, parent: win, modal: true, show: true, autoHideMenuBar: true, title: 'Microsoft ile giriş', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } })
      let settled = false
      const finish = (err, value) => { if (settled) return; settled = true; try { authWin?.close() } catch {} ; err ? reject(err) : resolve(value) }
      const inspect = url => {
        try {
          const u = new URL(url)
          if (u.hostname === 'login.live.com' && u.pathname === '/oauth20_desktop.srf') {
            const code = u.searchParams.get('code')
            const error = u.searchParams.get('error_description') || u.searchParams.get('error')
            if (code) finish(null, code)
            else if (error) finish(new Error(decodeURIComponent(error)))
          }
        } catch {}
      }
      authWin.webContents.on('will-redirect', (_, url) => inspect(url))
      authWin.webContents.on('will-navigate', (_, url) => inspect(url))
      authWin.webContents.on('did-navigate', (_, url) => inspect(url))
      authWin.on('closed', () => { if (!settled) reject(new Error('Microsoft giriş penceresi kapatıldı.')) })
      authWin.loadURL(authLib.authorizeUrl()).catch(e => finish(e))
    })
    const auth = await authLib.loginWithCode(code)
    return { success: true, user: { username: auth.name, uuid: auth.uuid, type: 'microsoft', auth } }
  } catch (e) {
    try { authWin?.close() } catch {}
    return { success: false, error: e.message || 'Microsoft girişi başarısız.' }
  }
})

// ── Versions ─────────────────────────────────────────────────────────────────
ipcMain.handle('fabric:versions', async (_, mcVersion) => {
  try { return (await loaderVersions('fabric', mcVersion)).slice(0, 8).map(v => v.version) } catch { return [] }
})
handle('loader:versions', async ({ loader, mcVersion }) => {
  if (loader === 'vanilla') return { versions: [] }
  if (loader !== 'fabric') throw new Error('Desteklenmeyen loader.')
  return { versions: await loaderVersions('fabric', mcVersion) }
})
let manifestCache = null
async function versionManifest() {
  if (manifestCache && manifestCache.expires > Date.now()) return manifestCache.data
  const data = await net.getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
  manifestCache = { data, expires: Date.now() + 10 * 60e3 }
  return data
}
ipcMain.handle('minecraft:versions', async () => {
  try { return { success: true, versions: ((await versionManifest()).versions || []).filter(v => v.type === 'release').map(v => v.id) } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('minecraft:verify-version', async (_, mcVersion) => {
  try {
    const found = (await versionManifest()).versions?.find(v => v.id === mcVersion && v.type === 'release')
    return found ? { success: true } : { success: false, error: `${mcVersion} Java Edition sürümü bulunamadı.` }
  } catch { return { success: false, error: 'Minecraft sürüm listesine ulaşılamadı.' } }
})

// ── Presence ─────────────────────────────────────────────────────────────────
ipcMain.handle('presence:register', async (_, { apiUrl, uuid, username } = {}) => {
  try {
    if (!apiUrl || !uuid || !username) return { success: false, error: 'Eksik launcher kimliği.' }
    // Presence writes to the backend, so it must present the backend session.
    const token = secureRead('backend.bin')?.token || ''
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const raw = await net.postJson(`${String(apiUrl).replace(/\/$/, '')}/api/presence/register`, { uuid, username, launcher: 'RtfLauncher', version: '8.0' }, headers)
    return { success: true, data: JSON.parse(raw) }
  } catch (e) { return { success: false, error: e.message } }
})

// ── Profiles (single source of truth: ProfileStore in the main process) ──────
const store = new ProfileStore({ appDir: APP_DIR, profilesDir: PROFILES_DIR, legacyConfigPath: CONFIG_PATH })
const content = new ContentManager({ store, emit: send })
const launcher = new GameLauncher({ store, sharedRoot: SHARED_MC_ROOT, createClient: () => new Client(), loadAuth, saveAuth, emit: send })
// Paths the user picked through a native dialog. Uploads and icons are only
// accepted from this list, so the renderer cannot make us copy arbitrary files.
const pickedPaths = new Set()

function profilesPayload() {
  return { profiles: store.list().map(p => store.toPublic(p)), activeProfileId: store.activeId(), launch: launcher.allStatus() }
}
function assertPicked(p) { if (p && !pickedPaths.has(path.resolve(String(p)))) throw new Error('Dosya bir seçim penceresinden seçilmeli.') }

handle('profiles:list', async () => profilesPayload())
handle('profiles:create', async input => {
  const loader = input?.loader === 'fabric' ? 'fabric' : 'vanilla'
  input = { ...(input || {}), loader, loaderVersion: loader === 'fabric' ? input?.loaderVersion : '' }
  if (loader === 'fabric') {
    const versions = await loaderVersions('fabric', input?.minecraftVersion).catch(() => null)
    const effectiveLoaderVersion = input?.loaderVersion
    if (versions && !versions.some(v => v.version === effectiveLoaderVersion)) throw new Error(`Fabric ${effectiveLoaderVersion} bu Minecraft sürümüyle uyumlu değil.`)
  }
  assertPicked(input?.iconSourcePath)
  const profile = store.create(input || {})
  return { profile: store.toPublic(profile), ...profilesPayload() }
})
handle('profiles:update', async ({ id, patch }) => {
  if (patch?.iconSourcePath) assertPicked(patch.iconSourcePath)
  if (launcher.status(id).state !== 'idle' && (patch?.minecraftVersion || patch?.loader || patch?.loaderVersion)) throw new Error('Oyun açıkken sürüm veya loader değiştirilemez.')
  if (patch?.loader && patch.loader !== 'vanilla' && patch.loader !== 'fabric') throw new Error('Sadece Vanilla ve Fabric destekleniyor.')
  if (patch?.loader === 'vanilla') patch = { ...(patch || {}), loaderVersion: '' }
  if (patch?.loader === 'fabric') {
    const targetMc = patch.minecraftVersion || store.get(id).minecraftVersion
    const versions = await loaderVersions('fabric', targetMc).catch(() => null)
    const effectiveLoaderVersion = patch.loaderVersion
    if (versions && !versions.some(v => v.version === effectiveLoaderVersion)) throw new Error(`Fabric ${effectiveLoaderVersion} bu Minecraft sürümüyle uyumlu değil.`)
  }
  const profile = store.update(id, patch || {})
  return { profile: store.toPublic(profile), ...profilesPayload() }
})
handle('profiles:delete', async id => {
  if (launcher.status(id).state !== 'idle') throw new Error('Oyun açıkken profil silinemez.')
  store.remove(id)
  return profilesPayload()
})
handle('profiles:duplicate', async id => { const p = store.duplicate(id); return { profile: store.toPublic(p), ...profilesPayload() } })
handle('profiles:select', async id => { store.setActive(id || null); return { activeProfileId: store.activeId() } })
handle('profiles:open-folder', async ({ id, rel = '' }) => {
  const { target } = content.resolveInInstance(id, rel)
  if (!fs.existsSync(target)) throw new Error('Klasör bulunamadı.')
  if (fs.statSync(target).isDirectory()) { const err = await shell.openPath(target); if (err) throw new Error(err) }
  else shell.showItemInFolder(target)
  return {}
})
handle('profiles:pick-icon', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Görsel', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] })
  if (r.canceled || !r.filePaths[0]) return { success: false, cancelled: true }
  const file = path.resolve(r.filePaths[0])
  if (fs.statSync(file).size > 1024 * 1024) throw new Error('Profil ikonu 1 MB’dan küçük olmalı.')
  pickedPaths.add(file)
  const ext = path.extname(file).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return { path: file, dataUrl: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}` }
})
handle('profiles:export', async id => {
  const p = store.get(id)
  const r = await dialog.showSaveDialog(win, { defaultPath: `${p.name.replace(/[^\w .-]/g, '_')}.rtfprofile.zip`, filters: [{ name: 'RtfLauncher profili', extensions: ['zip'] }] })
  if (r.canceled || !r.filePath) return { success: false, cancelled: true }
  const zip = new AdmZip()
  const manifest = { format: 'rtflauncher-profile', formatVersion: 1, exportedAt: new Date().toISOString(), profile: { ...p, instancePath: undefined } }
  zip.addFile('rtf-profile.json', Buffer.from(JSON.stringify(manifest, null, 2)))
  for (const folder of ['mods', 'resourcepacks', 'shaderpacks', 'config']) {
    const dir = path.join(p.instancePath, folder)
    if (fs.existsSync(dir)) zip.addLocalFolder(dir, folder)
  }
  const opts = path.join(p.instancePath, 'options.txt')
  if (fs.existsSync(opts)) zip.addLocalFile(opts)
  await new Promise((resolve, reject) => zip.writeZip(r.filePath, err => (err ? reject(err) : resolve())))
  return { path: r.filePath }
})

// ── Profile content ──────────────────────────────────────────────────────────
handle('content:list', async profileId => ({ content: content.list(profileId), worlds: content.worlds(profileId) }))
handle('content:installed-index', async profileId => ({ index: content.installedIndex(profileId) }))
handle('content:plan', async args => ({ plan: await content.plan(args.profileId, args) }))
handle('content:install', async args => content.install(args.profileId, args))
handle('content:uninstall', async args => content.uninstall(args.profileId, args))
handle('content:set-enabled', async args => content.setEnabled(args.profileId, args))
handle('content:pick', async ({ type }) => {
  const info = CONTENT_TYPES[type]
  if (!info) throw new Error('Desteklenmeyen içerik türü.')
  const ext = info.ext.slice(1)
  const r = await dialog.showOpenDialog(win, { title: `${info.label} yükle`, properties: ['openFile', 'multiSelections'], filters: [{ name: info.label, extensions: [ext] }] })
  if (r.canceled || !r.filePaths.length) return { success: false, cancelled: true }
  for (const f of r.filePaths) pickedPaths.add(path.resolve(f))
  return { paths: r.filePaths }
})
handle('content:upload', async args => {
  for (const p of args.sourcePaths || []) assertPicked(p)
  return content.upload(args.profileId, args)
})
handle('profile:worlds', async profileId => ({ worlds: content.worlds(profileId) }))
handle('profile:files', async ({ profileId, rel = '' }) => content.files(profileId, rel))
handle('profile:logs', async profileId => ({ logs: content.logs(profileId) }))
handle('profile:read-log', async ({ profileId, rel }) => content.readLog(profileId, rel))

// ── Profile launch ───────────────────────────────────────────────────────────
handle('profile:launch', async ({ profileId, serverIp, serverPort, apiUrl }) => launcher.launch(profileId, { serverIp, serverPort, apiUrl, backendToken: secureRead('backend.bin')?.token || '' }))
handle('profile:stop', async profileId => launcher.stop(profileId))
handle('profile:launch-status', async () => ({ launch: launcher.allStatus() }))
handle('java:detect', async ({ mcVersion, javaPath }) => ({ java: await findJava(mcVersion, javaPath || '') }))
handle('java:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Java seç', properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [] })
  if (r.canceled || !r.filePaths[0]) return { success: false, cancelled: true }
  const info = await javaMajor(r.filePaths[0])
  if (!info) throw new Error('Seçilen dosya çalıştırılabilir bir Java değil.')
  return { path: r.filePaths[0], major: info.major }
})

// Legacy per-id helpers kept for older renderer code paths.
handle('profile:path', async id => ({ path: store.ensureInstance(store.get(id).id) }))
handle('profile:open-folder', async id => { const err = await shell.openPath(store.ensureInstance(store.get(id).id)); if (err) throw new Error(err); return {} })

// ── Skins ────────────────────────────────────────────────────────────────────
const SKIN_DIR = path.join(APP_DIR, 'skins')
function skinPathFor(uuid, ext = 'png') {
  const safe = String(uuid || '')
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(safe)) throw new Error('Geçersiz kullanıcı kimliği.')
  return path.join(SKIN_DIR, `${safe}.${ext}`)
}
function pngInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) return null
  if (buffer.readUInt32BE(0) !== 0x89504E47 || buffer.readUInt32BE(4) !== 0x0D0A1A0A) return null
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bitDepth: buffer[24], colorType: buffer[25] }
}
function validateSkin(data) {
  if (data.length > 256 * 1024) throw Object.assign(new Error('Skin dosyası çok büyük.'), { code: 'INVALID_SKIN' })
  const info = pngInfo(data)
  if (!info) throw Object.assign(new Error('Geçersiz Minecraft skin’i: dosya PNG değil.'), { code: 'INVALID_SKIN' })
  if (!(info.width === 64 && (info.height === 64 || info.height === 32))) throw Object.assign(new Error(`Geçersiz Minecraft skin’i: ${info.width}×${info.height}. Skin 64×64 veya 64×32 olmalı.`), { code: 'INVALID_SKIN' })
  return info
}
function bufferFrom(raw) {
  if (typeof raw === 'string') {
    const m = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/)
    if (!m) throw Object.assign(new Error('Geçersiz Minecraft skin’i: PNG verisi okunamadı.'), { code: 'INVALID_SKIN' })
    return Buffer.from(m[1], 'base64')
  }
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof ArrayBuffer) return Buffer.from(new Uint8Array(raw))
  if (ArrayBuffer.isView(raw)) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
  if (Array.isArray(raw)) return Buffer.from(raw)
  throw Object.assign(new Error('Skin verisi okunamadı.'), { code: 'INVALID_SKIN' })
}
const toDataUrl = buf => `data:image/png;base64,${buf.toString('base64')}`

function saveSkin(uuid, data, model) {
  const info = validateSkin(data)
  const m = model === 'slim' ? 'slim' : 'default'
  fs.mkdirSync(SKIN_DIR, { recursive: true })
  const tmp = `${skinPathFor(uuid)}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, skinPathFor(uuid))
  const meta = { model: m, width: info.width, height: info.height, updatedAt: new Date().toISOString() }
  writeJsonAtomic(skinPathFor(uuid, 'json'), meta)
  return { success: true, dataUrl: toDataUrl(data), ...meta }
}

// Pick only returns a validated preview; nothing is saved until Apply.
handle('skin:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Minecraft Skin', extensions: ['png'] }] })
  if (r.canceled || !r.filePaths[0]) return { success: false, cancelled: true }
  const data = fs.readFileSync(r.filePaths[0])
  const info = validateSkin(data)
  return { success: true, dataUrl: toDataUrl(data), width: info.width, height: info.height, fileName: path.basename(r.filePaths[0]) }
})
handle('skin:apply', async ({ uuid, dataUrl, model }) => saveSkin(uuid, bufferFrom(dataUrl), model))
handle('skin:save', async ({ uuid, data, model }) => saveSkin(uuid, bufferFrom(data), model))
handle('skin:load', async uuid => {
  const f = skinPathFor(uuid)
  if (!fs.existsSync(f)) return { success: false, missing: true }
  const data = fs.readFileSync(f)
  validateSkin(data)
  let meta = {}
  try { meta = JSON.parse(fs.readFileSync(skinPathFor(uuid, 'json'), 'utf8')) } catch {}
  return { success: true, dataUrl: toDataUrl(data), model: meta.model === 'slim' ? 'slim' : meta.model === 'default' ? 'default' : null, updatedAt: meta.updatedAt || null }
})
handle('skin:clear', async uuid => { fs.rmSync(skinPathFor(uuid), { force: true }); fs.rmSync(skinPathFor(uuid, 'json'), { force: true }); return { success: true } })
// Uploads the saved skin to the Minecraft account (Microsoft accounts only).
handle('skin:upload-account', async ({ uuid, model }) => {
  let auth = await loadAuth()
  if (!auth || auth.meta?.type !== 'msa') throw Object.assign(new Error('Skin’i hesaba yüklemek için Microsoft hesabıyla giriş yapmalısın.'), { code: 'AUTH_REQUIRED' })
  const fresh = await authLib.ensureFresh(auth)
  if (fresh.refreshed) { auth = fresh.auth; await saveAuth(auth) }
  const data = fs.readFileSync(skinPathFor(uuid || auth.uuid))
  validateSkin(data)
  const boundary = `----RtfLauncher${crypto.randomBytes(8).toString('hex')}`
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="variant"\r\n\r\n${model === 'slim' ? 'slim' : 'classic'}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="skin.png"\r\nContent-Type: image/png\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await net.request('https://api.minecraftservices.com/minecraft/profile/skins', { method: 'POST', headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body })
  if (res.status >= 200 && res.status < 300) return {}
  const map = { 400: 'Mojang skin’i reddetti (geçersiz dosya).', 401: 'Minecraft oturumu geçersiz. Çıkış yapıp tekrar giriş yap.', 403: 'Bu hesap skin değiştiremiyor.', 429: 'Çok fazla deneme. Biraz sonra tekrar dene.' }
  throw Object.assign(new Error(map[res.status] || `Mojang skin yüklemesi başarısız (HTTP ${res.status}).`), { status: res.status })
})

// ── Legacy global Play page (uses the official .minecraft folder) ────────────
ipcMain.handle('mc:launch', async (_, opts = {}) => {
  const { mcVersion, fabricVersion, maxRam, serverIp, serverPort, apiUrl } = opts
  const requestedLoader = opts.loader === 'fabric' ? 'fabric' : 'vanilla'
  let auth = opts.auth
  try {
    const stored = await loadAuth()
    if (stored && (!auth || stored.uuid === auth.uuid)) {
      const fresh = await authLib.ensureFresh(stored)
      if (fresh.refreshed) await saveAuth(fresh.auth)
      auth = fresh.auth
    }
  } catch (e) { return { success: false, error: e.message } }
  if (!auth) return { success: false, error: 'Minecraft hesabında oturum açık değil.' }
  if (apiUrl && auth?.uuid && auth?.name) {
    const token = secureRead('backend.bin')?.token || ''
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    net.postJson(`${String(apiUrl).replace(/\/$/, '')}/api/presence/register`, { uuid: auth.uuid, username: auth.name, launcher: 'RtfLauncher', version: '8.0' }, headers).catch(() => {})
  }
  try {
    const manifest = await versionManifest().catch(() => null)
    if (manifest && !manifest.versions?.some(v => v.id === mcVersion && v.type === 'release')) return { success: false, error: `${mcVersion} bulunamadı. Sürümü kontrol et.` }
    let versionId = mcVersion
    // Every launch — including a profile the player picked "Vanilla" for —
    // silently prepares a real Fabric Loader install so the one required,
    // hidden launcher mod can load. This replaces the previous
    // "-javaagent" runtime-instrumentation experiment against the vanilla
    // client, which was fragile across game updates and architecturally the
    // same technique cheat clients use to dodge normal mod-loader detection.
    // The player never sees Fabric as a concept; nothing changes for them.
    let effectiveLoader = requestedLoader
    let effectiveFabricVersion = fabricVersion
    // The bundled RTF mod needs fabricloader >= 0.18.4; an older pinned
    // version (branding.json used to say 0.16.9) makes Fabric refuse to start.
    if (requestedLoader === 'vanilla' || !loaderMeetsMinimum(effectiveFabricVersion)) {
      effectiveLoader = 'fabric'
      effectiveFabricVersion = await defaultFabricLoaderVersion(mcVersion)
    }
    if (effectiveLoader === 'fabric') {
      if (!effectiveFabricVersion) return { success: false, error: 'Fabric Loader sürümü seçilmedi.' }
      send('mc:log', { msg: '📦 Fabric profil indiriliyor...' })
      const profileJson = await net.getText(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${effectiveFabricVersion}/profile/json`)
      const profile = JSON.parse(profileJson)
      if (profile.inheritsFrom !== mcVersion) return { success: false, error: `Fabric profili ${profile.inheritsFrom} döndü; seçilen ${mcVersion} ile eşleşmiyor.` }
      versionId = profile.id
      const vDir = path.join(MC_DIR, 'versions', versionId)
      fs.mkdirSync(vDir, { recursive: true })
      fs.writeFileSync(path.join(vDir, `${versionId}.json`), profileJson)
      send('mc:log', { msg: `✅ Fabric hazır: ${versionId}` })
    }
    ensureRequiredMods(MC_DIR)
    send('mc:log', { msg: '📦 Fabric API kontrol ediliyor...' })
    await ensureFabricApi(MC_DIR, mcVersion, m => send('mc:log', { msg: m }))
    const client = new Client()
    client.on('debug', e => send('mc:log', { msg: String(e) }))
    client.on('data', e => send('mc:log', { msg: String(e) }))
    client.on('progress', e => send('mc:progress', e))
    client.on('close', c => send('mc:closed', c))
    // Without an explicit javaPath minecraft-launcher-core just runs `java`
    // from PATH — if that's missing or too old (1.21.x needs Java 21) the
    // game silently never opens. Resolve a suitable runtime ourselves and fail
    // with a readable message instead.
    const java = await findJava(mcVersion, '')
    send('mc:log', { msg: `✓ Java ${java.major}: ${java.path}` })
    const launchOpts = {
      authorization: auth, root: MC_DIR, javaPath: java.path,
      version: { number: mcVersion, type: 'release', custom: versionId },
      memory: { max: `${maxRam || 4096}M`, min: '1024M' },
      ...(serverIp ? { quickPlay: { type: 'multiplayer', identifier: `${serverIp}:${serverPort || 25565}` } } : {}),
    }
    const proc = await client.launch(launchOpts)
    return proc ? { success: true } : { success: false, error: 'Minecraft başlatılamadı. Konsol çıktısını kontrol et.' }
  } catch (e) { return { success: false, error: e.message } }
})

// ── Global mods / packs (Mod Merkezi page, official .minecraft) ──────────────
const modsDir = () => { const d = path.join(MC_DIR, 'mods'); fs.mkdirSync(d, { recursive: true }); ensureRequiredMods(MC_DIR); return d }
const packDir = type => { const d = path.join(MC_DIR, type === 'shader' ? 'shaderpacks' : 'resourcepacks'); fs.mkdirSync(d, { recursive: true }); return d }
// Global mod/pack downloads may only come from Modrinth's own hosts.
const GLOBAL_MOD_HOSTS = ['cdn.modrinth.com', 'api.modrinth.com', 'modrinth.com']
function assertModrinthUrl(rawUrl) {
  const u = new URL(String(rawUrl))
  if (u.protocol !== 'https:') throw new Error('Yalnızca HTTPS indirmelerine izin verilir.')
  if (!GLOBAL_MOD_HOSTS.some(h => u.hostname === h || u.hostname.endsWith(`.${h}`))) throw new Error(`İzin verilmeyen indirme kaynağı: ${u.hostname}`)
  return u
}
const legacyDownload = async (url, dest, meta) => {
  try {
    assertModrinthUrl(url)
    await net.downloadFile(url, dest, { allowedHosts: GLOBAL_MOD_HOSTS, onProgress: pct => send('dl:progress', { ...meta, pct }) })
    return { success: true }
  }
  catch (e) { return { success: false, error: e.message } }
}
ipcMain.handle('mods:list', () => fs.readdirSync(modsDir()).filter(f => f.endsWith('.jar') && !isBuiltinManagedFilename(f)))
ipcMain.handle('mods:delete', (_, filename) => {
  if (isBuiltinManagedFilename(filename)) return { success: false, error: 'Bu bileşen kaldırılamaz.' }
  try { fs.rmSync(path.join(modsDir(), path.basename(String(filename))), { force: true }); return { success: true } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('mods:download', async (_, { url, filename }) => {
  const safeName = path.basename(String(filename)).replace(/[^a-zA-Z0-9._+ -]/g, '_')
  return legacyDownload(url, path.join(modsDir(), safeName), { filename: safeName })
})
ipcMain.handle('packs:list', (_, type) => fs.readdirSync(packDir(type)).filter(f => f.endsWith('.zip')))
ipcMain.handle('packs:delete', (_, { type, filename }) => {
  try { fs.rmSync(path.join(packDir(type), path.basename(String(filename))), { force: true }); return { success: true } } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('packs:download', async (_, { type, url, filename }) => {
  const safeName = path.basename(String(filename)).replace(/[^a-zA-Z0-9._+ -]/g, '_')
  return legacyDownload(url, path.join(packDir(type), safeName), { filename: safeName })
})
async function installMrpackMods(index) {
  const files = (index.files || []).filter(f => f.path?.startsWith('mods/') && f.downloads?.[0] && f.env?.client !== 'unsupported')
  let count = 0
  for (const entry of files) {
    const filename = path.basename(entry.path)
    const r = await legacyDownload(entry.downloads[0], path.join(modsDir(), filename), { filename, kind: 'modpack' })
    if (r.success) count++
  }
  return count
}
ipcMain.handle('modpack:import', async (_, { url, mcVersion }) => {
  try {
    const match = String(url).match(/modrinth\.com\/modpack\/([^/?#]+)/i)
    if (!match) throw new Error('Geçerli bir Modrinth modpack bağlantısı girin.')
    const project = await net.getJson(`https://api.modrinth.com/v2/project/${match[1]}`)
    const versions = await net.getJson(`https://api.modrinth.com/v2/project/${project.id}/version`)
    const version = versions.find(v => v.game_versions?.includes(mcVersion) && v.loaders?.includes('fabric'))
    const file = version?.files?.find(f => f.primary && f.filename.endsWith('.mrpack')) || version?.files?.find(f => f.filename.endsWith('.mrpack'))
    if (!file) throw new Error(`${mcVersion} Fabric için modpack bulunamadı.`)
    assertModrinthUrl(file.url)
    const archive = (await net.request(file.url, { timeout: 60000 })).body
    const index = JSON.parse(new AdmZip(archive).readAsText('modrinth.index.json'))
    return { success: true, count: await installMrpackMods(index) }
  } catch (e) { return { success: false, error: e.message } }
})
ipcMain.handle('modpack:pick-file', async (_, { mcVersion }) => {
  try {
    const picked = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Modrinth modpack', extensions: ['mrpack'] }] })
    if (picked.canceled || !picked.filePaths[0]) return { success: false, cancelled: true }
    const index = JSON.parse(new AdmZip(fs.readFileSync(picked.filePaths[0])).readAsText('modrinth.index.json'))
    if (index.dependencies?.minecraft && index.dependencies.minecraft !== mcVersion) throw new Error(`Bu paket ${index.dependencies.minecraft} için; seçili sürüm ${mcVersion}.`)
    return { success: true, count: await installMrpackMods(index) }
  } catch (e) { return { success: false, error: e.message } }
})

// ── Modrinth App local-profile import (into the global mods folder) ──────────
ipcMain.handle('modrinth:instances', async () => {
  const roots = [path.join(os.homedir(), 'AppData', 'Roaming', 'ModrinthApp'), path.join(os.homedir(), 'AppData', 'Roaming', 'com.modrinth.theseus')]
  const found = [], seen = new Set()
  function walk(dir, depth = 0) {
    if (depth > 5 || !fs.existsSync(dir)) return
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    const hasMinecraft = entries.some(e => e.isDirectory() && (e.name === '.minecraft' || e.name === 'mods'))
    if (hasMinecraft) {
      const key = dir.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        const base = entries.some(e => e.isDirectory() && e.name === '.minecraft') ? path.join(dir, '.minecraft') : dir
        let mods = []
        try { mods = fs.readdirSync(path.join(base, 'mods')).filter(f => f.endsWith('.jar')) } catch {}
        found.push({ id: key, name: path.basename(dir) || 'Modrinth Profili', path: dir, mods, source: 'ModrinthApp' })
      }
      return
    }
    for (const e of entries) if (e.isDirectory() && !['node_modules', 'cache', 'caches', 'logs'].includes(e.name.toLowerCase())) walk(path.join(dir, e.name), depth + 1)
  }
  for (const root of roots) walk(root)
  return { success: true, instances: found.sort((a, b) => a.name.localeCompare(b.name)) }
})
ipcMain.handle('modrinth:import-instance', async (_, { instancePath }) => {
  try {
    const safe = path.resolve(String(instancePath || ''))
    const allowed = [path.join(os.homedir(), 'AppData', 'Roaming', 'ModrinthApp'), path.join(os.homedir(), 'AppData', 'Roaming', 'com.modrinth.theseus')].map(p => path.resolve(p).toLowerCase())
    if (!allowed.some(a => safe.toLowerCase().startsWith(a + path.sep))) throw new Error('Geçersiz profil yolu.')
    const source = [path.join(safe, 'mods'), path.join(safe, '.minecraft', 'mods')].find(d => fs.existsSync(d) && fs.statSync(d).isDirectory())
    if (!source) throw new Error('Bu profilde mods klasörü bulunamadı.')
    let count = 0
    for (const file of fs.readdirSync(source).filter(f => f.endsWith('.jar'))) { fs.copyFileSync(path.join(source, file), path.join(modsDir(), path.basename(file))); count++ }
    return { success: true, count }
  } catch (e) { return { success: false, error: e.message } }
})
