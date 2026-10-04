// Profile store: the single source of truth for profiles.
//
// Profiles used to live inside config.json, which several renderer pages
// rewrote wholesale (login, logout, onboarding, settings). Any of those writes
// could drop `modProfiles`, which is why a selected profile could suddenly be
// "not found". Profiles now live in their own file, are only mutated through
// this module in the main process, and every write is atomic.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SCHEMA_VERSION = 1
const LOADERS = ['vanilla', 'fabric']
const CONTENT_KEYS = { mod: 'mods', resourcepack: 'resourcePacks', datapack: 'dataPacks', shader: 'shaders' }
const PRESET_ICONS = ['R', 'S', 'F', 'M', '◈', '◆', '✦', '●', '⬢', '◇', '▣', '★']

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  const fd = fs.openSync(tmp, 'w')
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2), 'utf8'); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
  if (fs.existsSync(file)) { try { fs.copyFileSync(file, `${file}.bak`) } catch {} }
  fs.renameSync(tmp, file)
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function isSafeId(id) {
  const s = String(id || '')
  return /^[A-Za-z0-9_-]{1,64}$/.test(s)
}

function cleanString(v, max = 64) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max)
}

function normalizeEntry(e, type) {
  if (!e || typeof e !== 'object') return null
  const filename = path.basename(String(e.filename || ''))
  if (!filename) return null
  return {
    id: isSafeId(e.id) ? String(e.id) : crypto.randomUUID(),
    type,
    projectId: e.projectId ? String(e.projectId) : '',
    versionId: e.versionId && e.versionId !== 'local' ? String(e.versionId) : '',
    versionNumber: e.versionNumber && e.versionNumber !== 'local' ? String(e.versionNumber) : '',
    title: String(e.title || e.projectName || filename),
    author: e.author ? String(e.author) : '',
    iconUrl: typeof e.iconUrl === 'string' && /^https:\/\//.test(e.iconUrl) ? e.iconUrl : '',
    filename,
    worldName: type === 'datapack' ? path.basename(String(e.worldName || '')) : '',
    sha1: e.sha1 ? String(e.sha1).toLowerCase() : '',
    source: e.source === 'modrinth' ? 'modrinth' : 'local',
    dependency: !!e.dependency,
    installedAt: e.installedAt || new Date().toISOString(),
    identifyAttempted: !!e.identifyAttempted,
  }
}

class ProfileStore {
  constructor({ appDir, profilesDir, legacyConfigPath }) {
    this.appDir = appDir
    this.profilesDir = profilesDir
    this.legacyConfigPath = legacyConfigPath
    this.file = path.join(appDir, 'profiles.json')
    this.state = null
  }

  instancePath(id) {
    if (!isSafeId(id)) throw new Error('Geçersiz profil kimliği.')
    return path.join(this.profilesDir, String(id), 'instance')
  }

  profileDir(id) { return path.dirname(this.instancePath(id)) }

  ensureInstance(id) {
    const dir = this.instancePath(id)
    for (const folder of ['mods', 'config', 'resourcepacks', 'shaderpacks', 'saves', 'logs']) fs.mkdirSync(path.join(dir, folder), { recursive: true })
    return dir
  }

  normalizeProfile(p) {
    if (!p || typeof p !== 'object' || !isSafeId(p.id)) return null
    const name = cleanString(p.name, 48)
    if (!name) return null
    const rawLoader = String(p.loader || '').toLowerCase()
    const loader = rawLoader === 'fabric' ? 'fabric' : 'vanilla'
    const out = {
      id: String(p.id),
      name,
      icon: cleanString(p.icon, 4) || name[0].toUpperCase(),
      iconImage: p.iconImage ? path.basename(String(p.iconImage)) : '',
      minecraftVersion: cleanString(p.minecraftVersion || p.version, 32) || '1.21.11',
      loader,
      loaderVersion: loader === 'vanilla' ? '' : cleanString(p.loaderVersion, 32),
      instancePath: this.instancePath(p.id),
      memory: Math.max(1024, Math.min(65536, Number(p.memory) || 4096)),
      javaPath: typeof p.javaPath === 'string' ? p.javaPath.slice(0, 512) : '',
      jvmArgs: typeof p.jvmArgs === 'string' ? p.jvmArgs.slice(0, 1000) : '',
      autoJoinServer: p.autoJoinServer !== false,
      createdAt: p.createdAt || new Date().toISOString(),
      updatedAt: p.updatedAt || p.createdAt || new Date().toISOString(),
      lastPlayedAt: p.lastPlayedAt || null,
      mods: [], resourcePacks: [], dataPacks: [], shaders: [],
    }
    for (const [type, key] of Object.entries(CONTENT_KEYS)) {
      const list = Array.isArray(p[key]) ? p[key] : []
      // Legacy profiles stored bare filenames in `mods`; those came from the
      // global .minecraft folder and are not trustworthy, so only objects are kept.
      out[key] = list.map(e => normalizeEntry(e, type)).filter(Boolean)
    }
    return out
  }

  load() {
    if (this.state) return this.state
    let raw = null
    for (const candidate of [this.file, `${this.file}.bak`]) {
      if (!fs.existsSync(candidate)) continue
      try { raw = readJson(candidate); break } catch {}
    }
    if (raw && Array.isArray(raw.profiles)) {
      const seen = new Set()
      const profiles = raw.profiles.map(p => this.normalizeProfile(p)).filter(p => p && !seen.has(p.id) && seen.add(p.id))
      this.state = { schemaVersion: SCHEMA_VERSION, activeProfileId: raw.activeProfileId || null, profiles }
      if (!profiles.some(p => p.id === this.state.activeProfileId)) this.state.activeProfileId = profiles[0]?.id || null
      return this.state
    }
    this.state = this.migrateLegacy()
    this.persist()
    return this.state
  }

  migrateLegacy() {
    let cfg = {}
    try { cfg = readJson(this.legacyConfigPath) } catch {}
    const legacy = [
      ...(Array.isArray(cfg.modProfiles) ? cfg.modProfiles : []),
      ...(Array.isArray(cfg.profiles) ? cfg.profiles : []),
    ]
    const seen = new Set(), profiles = []
    for (const p of legacy) {
      const n = this.normalizeProfile(p)
      if (!n || seen.has(n.id)) continue
      seen.add(n.id)
      this.importLegacyContentMeta(n)
      profiles.push(n)
    }
    const active = profiles.some(p => p.id === cfg.activeModProfileId) ? cfg.activeModProfileId : profiles[0]?.id || null
    return { schemaVersion: SCHEMA_VERSION, activeProfileId: active, profiles, migratedAt: new Date().toISOString() }
  }

  // v7.x kept per-instance metadata in `.rtf-content.json`; fold it into the
  // profile record so there is exactly one place that says what is installed.
  importLegacyContentMeta(profile) {
    const file = path.join(profile.instancePath, '.rtf-content.json')
    if (!fs.existsSync(file)) return
    try {
      const items = readJson(file)
      if (!Array.isArray(items)) return
      for (const item of items) {
        const key = CONTENT_KEYS[item?.type]
        if (!key) continue
        const e = normalizeEntry({ ...item, title: item.projectName, source: item.source }, item.type)
        if (e && !profile[key].some(x => x.filename === e.filename && x.worldName === e.worldName)) profile[key].push(e)
      }
      fs.renameSync(file, `${file}.migrated`)
    } catch {}
  }

  persist() {
    writeJsonAtomic(this.file, this.state)
  }

  list() { return this.load().profiles }
  activeId() { return this.load().activeProfileId }

  get(id) {
    const p = this.load().profiles.find(x => x.id === String(id))
    if (!p) throw Object.assign(new Error('Profil bulunamadı.'), { code: 'PROFILE_NOT_FOUND' })
    return p
  }

  create(input = {}) {
    const state = this.load()
    const name = cleanString(input.name, 48)
    if (!name) throw new Error('Profil adı gerekli.')
    const loader = input.loader === 'fabric' ? 'fabric' : 'vanilla'
    if (loader === 'fabric' && !cleanString(input.loaderVersion, 32)) throw new Error('Fabric Loader sürümü seçilmedi.')
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    const profile = this.normalizeProfile({
      id, name,
      icon: input.icon, minecraftVersion: input.minecraftVersion, loader, loaderVersion: input.loaderVersion,
      memory: input.memory, createdAt: now, updatedAt: now, lastPlayedAt: null,
    })
    this.ensureInstance(id)
    if (input.iconSourcePath) this.setIconFromFile(profile, input.iconSourcePath)
    state.profiles.push(profile)
    state.activeProfileId = id
    this.persist()
    return profile
  }

  setIconFromFile(profile, source) {
    const ext = path.extname(String(source)).toLowerCase()
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('Profil ikonu PNG, JPG veya WEBP olmalı.')
    const stat = fs.statSync(source)
    if (stat.size > 1024 * 1024) throw new Error('Profil ikonu 1 MB’dan küçük olmalı.')
    const name = `icon${ext === '.jpeg' ? '.jpg' : ext}`
    const dir = this.profileDir(profile.id)
    fs.mkdirSync(dir, { recursive: true })
    for (const old of ['icon.png', 'icon.jpg', 'icon.webp']) fs.rmSync(path.join(dir, old), { force: true })
    fs.copyFileSync(source, path.join(dir, name))
    profile.iconImage = name
  }

  iconDataUrl(profile) {
    if (!profile.iconImage) return ''
    try {
      const file = path.join(this.profileDir(profile.id), profile.iconImage)
      const mime = profile.iconImage.endsWith('.jpg') ? 'image/jpeg' : profile.iconImage.endsWith('.webp') ? 'image/webp' : 'image/png'
      return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`
    } catch { return '' }
  }

  update(id, patch = {}) {
    const p = this.get(id)
    const allowed = ['name', 'icon', 'minecraftVersion', 'loader', 'loaderVersion', 'memory', 'javaPath', 'jvmArgs', 'autoJoinServer']
    const next = { ...p }
    for (const k of allowed) if (patch[k] !== undefined) next[k] = patch[k]
    if (patch.clearIconImage) next.iconImage = ''
    const normalized = this.normalizeProfile({ ...next, updatedAt: new Date().toISOString() })
    if (!normalized) throw new Error('Geçersiz profil ayarları.')
    if (normalized.loader !== 'vanilla' && !normalized.loaderVersion) throw new Error('Loader sürümü seçilmedi.')
    if (patch.iconSourcePath) this.setIconFromFile(normalized, patch.iconSourcePath)
    Object.assign(p, normalized)
    this.persist()
    return p
  }

  touchPlayed(id) {
    const p = this.get(id)
    p.lastPlayedAt = new Date().toISOString()
    p.updatedAt = p.lastPlayedAt
    this.persist()
    return p
  }

  setActive(id) {
    const state = this.load()
    if (id !== null) this.get(id)
    state.activeProfileId = id
    this.persist()
    return id
  }

  resetAll() {
    // Profiles are launcher-local and are the current signed-in user's launcher profiles.
    // Remove only the profile store and profile instance tree; never touch the global .minecraft directory.
    const root = path.resolve(this.profilesDir)
    if (!root.endsWith(path.sep + 'profiles') && path.basename(root) !== 'profiles') throw new Error('Geçersiz profil klasörü.')
    this.state = { schemaVersion: SCHEMA_VERSION, activeProfileId: null, profiles: [] }
    try { fs.rmSync(root, { recursive: true, force: true }) } catch {}
    fs.mkdirSync(root, { recursive: true })
    try { fs.rmSync(this.file, { force: true }); fs.rmSync(`${this.file}.bak`, { force: true }) } catch {}
    this.persist()
    return this.state
  }

  remove(id) {
    const state = this.load()
    this.get(id)
    const dir = this.profileDir(id)
    const root = path.resolve(this.profilesDir)
    if (!path.resolve(dir).startsWith(root + path.sep)) throw new Error('Geçersiz profil klasörü.')
    fs.rmSync(dir, { recursive: true, force: true })
    state.profiles = state.profiles.filter(p => p.id !== id)
    if (state.activeProfileId === id) state.activeProfileId = state.profiles[0]?.id || null
    this.persist()
    return state.activeProfileId
  }

  duplicate(id) {
    const state = this.load()
    const src = this.get(id)
    const now = new Date().toISOString()
    const copyId = crypto.randomUUID()
    const copy = this.normalizeProfile({ ...JSON.parse(JSON.stringify(src)), id: copyId, name: `${src.name} (kopya)`.slice(0, 48), createdAt: now, updatedAt: now, lastPlayedAt: null })
    const from = src.instancePath, to = this.instancePath(copyId)
    fs.mkdirSync(to, { recursive: true })
    // Copy only user content and settings — not logs or downloaded runtime files.
    for (const folder of ['mods', 'resourcepacks', 'shaderpacks', 'config', 'saves']) {
      const s = path.join(from, folder)
      if (fs.existsSync(s)) fs.cpSync(s, path.join(to, folder), { recursive: true })
    }
    for (const file of ['options.txt', 'servers.dat']) {
      const s = path.join(from, file)
      if (fs.existsSync(s)) fs.copyFileSync(s, path.join(to, file))
    }
    if (src.iconImage) {
      try { fs.copyFileSync(path.join(this.profileDir(src.id), src.iconImage), path.join(this.profileDir(copyId), src.iconImage)) } catch { copy.iconImage = '' }
    }
    this.ensureInstance(copyId)
    state.profiles.push(copy)
    state.activeProfileId = copyId
    this.persist()
    return copy
  }

  // Content index helpers — mutations are synchronous so they cannot interleave.
  contentList(id, type) {
    const key = CONTENT_KEYS[type]
    if (!key) throw new Error('Desteklenmeyen içerik türü.')
    return this.get(id)[key]
  }

  addContent(id, type, entry) {
    const list = this.contentList(id, type)
    const e = normalizeEntry(entry, type)
    if (!e) throw new Error('Geçersiz içerik kaydı.')
    list.push(e)
    this.get(id).updatedAt = new Date().toISOString()
    this.persist()
    return e
  }

  replaceContent(id, type, entries) {
    const p = this.get(id)
    p[CONTENT_KEYS[type]] = entries.map(e => normalizeEntry(e, type)).filter(Boolean)
    this.persist()
    return p[CONTENT_KEYS[type]]
  }

  patchContent(id, type, entryId, patch) {
    const e = this.contentList(id, type).find(x => x.id === entryId)
    if (!e) throw new Error('İçerik kaydı bulunamadı.')
    Object.assign(e, patch)
    this.persist()
    return e
  }

  removeContent(id, type, entryId) {
    const p = this.get(id)
    const key = CONTENT_KEYS[type]
    p[key] = p[key].filter(x => x.id !== entryId)
    p.updatedAt = new Date().toISOString()
    this.persist()
  }

  // What the renderer receives: plain data, instance path recomputed from id.
  toPublic(p) {
    return { ...p, instancePath: this.instancePath(p.id), iconDataUrl: this.iconDataUrl(p) }
  }
}

module.exports = { ProfileStore, writeJsonAtomic, isSafeId, CONTENT_KEYS, PRESET_ICONS, LOADERS }
