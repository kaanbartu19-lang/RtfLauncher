// Profile launcher. Everything the game needs is derived from the profile
// record in the main process: the renderer only sends a profile ID, so it is
// impossible to launch one profile with another profile's folders.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFile } = require('child_process')
const net = require('./net')
const { ensureRequiredMods, ensureFabricApi, loaderMeetsMinimum, MIN_FABRIC_LOADER } = require('./required-mods')
const { isBuiltinManagedFilename } = require('./builtin-client')

const LOADER_META = {
  fabric: (mc, v) => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(v)}/profile/json`,
  quilt: (mc, v) => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}/${encodeURIComponent(v)}/profile/json`,
}
const LOADER_LIST = {
  fabric: mc => `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`,
  quilt: mc => `https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`,
}

function parseMc(v) {
  const m = String(v).match(/^(\d+)\.(\d+)(?:\.(\d+))?/)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null
}
function cmpMc(a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }

function requiredJava(mcVersion) {
  const v = parseMc(mcVersion)
  if (!v) return 21
  if (v[0] >= 26) return 25
  if (cmpMc(v, [1, 20, 5]) >= 0) return 21
  if (cmpMc(v, [1, 18, 0]) >= 0) return 17
  if (cmpMc(v, [1, 17, 0]) >= 0) return 16
  return 8
}

function javaMajor(javaPath) {
  return new Promise(resolve => {
    execFile(javaPath, ['-version'], { timeout: 10000, windowsHide: true }, (err, stdout, stderr) => {
      if (err && !stderr) return resolve(null)
      const m = String(stderr || stdout).match(/version "(\d+)(?:\.(\d+))?/)
      if (!m) return resolve(null)
      const major = Number(m[1]) === 1 ? Number(m[2]) : Number(m[1])
      resolve({ major, raw: String(stderr).split(/\r?\n/)[0] })
    })
  })
}

function javaCandidates(preferred) {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java'
  const list = []
  if (preferred) list.push(preferred)
  if (process.env.JAVA_HOME) list.push(path.join(process.env.JAVA_HOME, 'bin', exe))
  list.push('java')
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean)
    for (const r of roots) for (const vendor of ['Java', 'Eclipse Adoptium', 'Microsoft', 'Zulu', 'BellSoft', 'Amazon Corretto', 'Semeru']) {
      const dir = path.join(r, vendor)
      try { for (const d of fs.readdirSync(dir)) list.push(path.join(dir, d, 'bin', exe)) } catch {}
    }
    // Java runtimes shipped with the official launcher.
    const mcRuntime = [
      path.join(os.homedir(), 'AppData', 'Roaming', '.minecraft', 'runtime'),
      path.join(process.env.LOCALAPPDATA || '', 'Packages', 'Microsoft.4297127D64EC6_8wekyb3d8bbwe', 'LocalCache', 'Local', 'runtime'),
    ]
    for (const base of mcRuntime) {
      try {
        for (const comp of fs.readdirSync(base)) list.push(path.join(base, comp, 'windows-x64', comp, 'bin', exe))
      } catch {}
    }
  }
  return [...new Set(list)]
}

async function findJava(mcVersion, preferred) {
  const need = requiredJava(mcVersion)
  const tried = []
  for (const candidate of javaCandidates(preferred)) {
    if (candidate !== 'java' && !fs.existsSync(candidate)) continue
    const info = await javaMajor(candidate)
    if (!info) continue
    tried.push(`${candidate} → Java ${info.major}`)
    const ok = need === 8 ? info.major === 8 : info.major >= need
    if (ok) return { path: candidate, major: info.major, required: need }
    if (candidate === preferred) throw Object.assign(new Error(`Profilde seçili Java ${info.major}, Minecraft ${mcVersion} için Java ${need}${need === 8 ? '' : '+'} gerekli.`), { code: 'JAVA_MISMATCH' })
  }
  throw Object.assign(new Error(`Minecraft ${mcVersion} için Java ${need}${need === 8 ? '' : '+'} bulunamadı.${tried.length ? ` Bulunanlar: ${tried.join('; ')}` : ' Sistemde Java bulunamadı.'} Java ${need} kurup profil ayarlarından seçebilirsin.`), { code: 'JAVA_NOT_FOUND' })
}

// In-memory cache so a "Vanilla"-labeled profile doesn't hit the Fabric meta
// API on every single launch — only once per Minecraft version per run of
// the launcher.
const defaultFabricLoaderCache = new Map()
async function defaultFabricLoaderVersion(mcVersion) {
  if (defaultFabricLoaderCache.has(mcVersion)) return defaultFabricLoaderCache.get(mcVersion)
  const versions = await loaderVersions('fabric', mcVersion)
  const stable = versions.find(v => v.stable) || versions[0]
  if (!stable) throw new Error(`Bu Minecraft sürümü (${mcVersion}) için Fabric Loader bulunamadı.`)
  defaultFabricLoaderCache.set(mcVersion, stable.version)
  return stable.version
}

async function loaderVersions(loader, mcVersion) {
  if (!LOADER_LIST[loader]) return []
  const data = await net.getJson(LOADER_LIST[loader](mcVersion))
  return (Array.isArray(data) ? data : []).map(v => ({ version: v.loader?.version, stable: v.loader?.stable !== false })).filter(v => v.version)
}

// Fetches the loader profile JSON into the shared versions folder. If the
// network is down but the file already exists, the cached copy is used.
//
// A profile labeled "Vanilla" in the UI still gets a real Fabric Loader
// prepared here — silently, with no mods shown to the player except the
// one required launcher-managed client (see required-mods.js). This is what
// lets that mod run everywhere without exposing Fabric as a concept to
// players who just want to press Play, and without resorting to runtime
// bytecode instrumentation of the vanilla client (the previous "standalone
// javaagent" approach, which this replaces).
async function prepareLoader(root, profile, log) {
  let loader = profile.loader
  let loaderVersion = profile.loaderVersion
  if (loader === 'vanilla') {
    loader = 'fabric'
    loaderVersion = await defaultFabricLoaderVersion(profile.minecraftVersion)
  } else if (loader === 'fabric' && !loaderMeetsMinimum(loaderVersion)) {
    // The bundled RTF mod needs fabricloader >= MIN_FABRIC_LOADER. Older
    // profiles (e.g. created with the 0.16.9 from branding.json) would make
    // Fabric refuse to start, so silently move them to the newest stable.
    const newer = await defaultFabricLoaderVersion(profile.minecraftVersion)
    log(`⚠ Fabric Loader ${loaderVersion || '?'} çok eski (RTF Client ${MIN_FABRIC_LOADER}+ ister), ${newer} kullanılıyor.`)
    loaderVersion = newer
  }
  const url = LOADER_META[loader]?.(profile.minecraftVersion, loaderVersion)
  if (!url) throw new Error(`Desteklenmeyen loader: ${loader}`)
  const marker = path.join(root, 'versions', `.rtf-${loader}-${profile.minecraftVersion}-${loaderVersion}.id`)
  let json
  try {
    json = await net.getText(url)
  } catch (e) {
    if (fs.existsSync(marker)) {
      const id = fs.readFileSync(marker, 'utf8').trim()
      if (fs.existsSync(path.join(root, 'versions', id, `${id}.json`))) { log(`⚠ ${loader} meta alınamadı, önbellekteki profil kullanılıyor: ${id}`); return id }
    }
    throw new Error(`${loader} ${loaderVersion} (${profile.minecraftVersion}) profili indirilemedi: ${e.message}`)
  }
  const parsed = JSON.parse(json)
  if (parsed.inheritsFrom !== profile.minecraftVersion) throw new Error(`${loader} profili ${parsed.inheritsFrom} döndü; profil ${profile.minecraftVersion} kullanıyor.`)
  const id = parsed.id
  const dir = path.join(root, 'versions', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${id}.json`), json)
  fs.writeFileSync(marker, id)
  return id
}

class GameLauncher {
  constructor({ store, sharedRoot, createClient, loadAuth, saveAuth, emit }) {
    this.store = store
    this.sharedRoot = sharedRoot
    this.createClient = createClient
    this.loadAuth = loadAuth
    this.saveAuth = saveAuth
    this.emit = emit
    this.sessions = new Map() // profileId → { state, startedAt, pid }
    this.procs = new Map()
  }

  stop(profileId) {
    const proc = this.procs.get(profileId)
    if (!proc) throw new Error('Bu profil için çalışan bir oyun yok.')
    proc.kill()
    return { success: true }
  }

  status(profileId) { return this.sessions.get(profileId) || { state: 'idle' } }
  allStatus() { return Object.fromEntries(this.sessions) }

  setState(profileId, patch) {
    const next = { ...(this.sessions.get(profileId) || {}), ...patch }
    if (next.state === 'idle') this.sessions.delete(profileId); else this.sessions.set(profileId, next)
    this.emit('profile:launch-state', { profileId, ...next })
  }

  async launch(profileId, { serverIp, serverPort, apiUrl, backendToken } = {}) {
    const current = this.status(profileId).state
    if (current === 'preparing' || current === 'running') throw Object.assign(new Error('Bu profil zaten çalışıyor.'), { code: 'ALREADY_RUNNING' })
    const storedProfile = this.store.get(profileId)
    const profile = storedProfile
    const gameDir = this.store.ensureInstance(profile.id)
    fs.mkdirSync(path.join(gameDir, 'logs'), { recursive: true })
    const logFile = path.join(gameDir, 'logs', 'rtf-launcher.log')
    fs.writeFileSync(logFile, `[${new Date().toISOString()}] RtfLauncher — ${profile.name} (${profile.minecraftVersion} ${profile.loader} ${profile.loaderVersion})\n`)
    const log = msg => {
      const line = String(msg).replace(/\s+$/, '')
      try { fs.appendFileSync(logFile, `${line}\n`) } catch {}
      this.emit('mc:log', { msg: line, profileId })
    }
    this.setState(profileId, { state: 'preparing', step: 'Hesap doğrulanıyor', startedAt: Date.now(), error: null })
    try {
      let auth = await this.loadAuth()
      if (!auth) throw Object.assign(new Error('Minecraft hesabında oturum açık değil. Çıkış yapıp tekrar giriş yap.'), { code: 'AUTH_REQUIRED' })
      const fresh = await require('./auth').ensureFresh(auth)
      if (fresh.refreshed) { auth = fresh.auth; await this.saveAuth(auth); log('✓ Microsoft oturumu yenilendi.') }

      this.setState(profileId, { step: 'Java kontrol ediliyor' })
      const java = await findJava(profile.minecraftVersion, profile.javaPath)
      log(`✓ Java ${java.major}: ${java.path}`)

      this.setState(profileId, { step: profile.loader === 'vanilla' ? 'Minecraft hazırlanıyor' : `${profile.loader} hazırlanıyor` })
      fs.mkdirSync(this.sharedRoot, { recursive: true })
      const customId = await prepareLoader(this.sharedRoot, profile, log)
      if (customId) log(`✓ Loader profili: ${customId}`)

      ensureRequiredMods(gameDir)
      if (customId && /fabric/i.test(customId)) {
        this.setState(profileId, { step: 'Fabric API kontrol ediliyor' })
        await ensureFabricApi(gameDir, profile.minecraftVersion, log)
      }
      const enabledMods = fs.readdirSync(path.join(gameDir, 'mods')).filter(f => f.toLowerCase().endsWith('.jar') && !isBuiltinManagedFilename(f))
      log(`✓ Instance: ${gameDir}`)
      log(`✓ Mods (${enabledMods.length}): ${enabledMods.join(', ') || '—'}`)

      const client = this.createClient()
      client.on('debug', e => log(e))
      client.on('data', e => { for (const l of String(e).split(/\r?\n/)) if (l.trim()) this.emit('mc:log', { msg: l, profileId }) })
      client.on('progress', e => { this.emit('mc:progress', { ...e, profileId }); this.setState(profileId, { step: `İndiriliyor: ${e.type} ${e.task}/${e.total}`, progress: e.total ? Math.round(e.task / e.total * 100) : null }) })
      client.on('close', code => {
        log(`Minecraft kapandı (çıkış kodu ${code}).`)
        this.procs.delete(profileId)
        const crashed = code !== 0 && code !== null && Date.now() - (this.status(profileId).runningSince || Date.now()) < 5 * 60 * 1000
        this.setState(profileId, { state: 'idle' })
        if (code !== 0 && code !== null) this.emit('profile:launch-state', { profileId, state: 'crashed', exitCode: code, error: crashed ? `Minecraft beklenmedik şekilde kapandı (kod ${code}). Logs sekmesine bak.` : null })
      })

      const extraJvm = String(profile.jvmArgs || '').split(/\s+/).filter(Boolean)
      const customArgs = [...extraJvm]
      const opts = {
        authorization: auth,
        root: this.sharedRoot,
        javaPath: java.path,
        version: customId ? { number: profile.minecraftVersion, type: 'release', custom: customId } : { number: profile.minecraftVersion, type: 'release' },
        memory: { max: `${profile.memory}M`, min: `${Math.min(1024, profile.memory)}M` },
        overrides: { gameDirectory: gameDir, cwd: gameDir },
        ...(customArgs.length ? { customArgs } : {}),
        ...(profile.autoJoinServer && serverIp ? { quickPlay: { type: 'multiplayer', identifier: `${serverIp}:${serverPort || 25565}` } } : {}),
      }
      this.setState(profileId, { step: 'Minecraft başlatılıyor' })
      const proc = await client.launch(opts)
      if (!proc) throw new Error(`Minecraft başlatılamadı. Ayrıntılar: ${logFile}`)
      this.procs.set(profileId, proc)
      this.store.touchPlayed(profileId)
      this.setState(profileId, { state: 'running', step: 'Oyun açık', pid: proc.pid, runningSince: Date.now(), progress: null })
      if (apiUrl && auth?.uuid && auth?.name) {
        const headers = backendToken ? { Authorization: `Bearer ${backendToken}` } : {}
        net.postJson(`${String(apiUrl).replace(/\/$/, '')}/api/presence/register`, { uuid: auth.uuid, username: auth.name, launcher: 'RtfLauncher', version: '8.0' }, headers).catch(() => {})
      }
      return { success: true, pid: proc.pid }
    } catch (e) {
      log(`✗ ${e.message}`)
      this.setState(profileId, { state: 'idle' })
      this.emit('profile:launch-state', { profileId, state: 'error', error: e.message, code: e.code || null })
      throw e
    }
  }
}

module.exports = { GameLauncher, requiredJava, findJava, javaMajor, loaderVersions, prepareLoader, defaultFabricLoaderVersion }
