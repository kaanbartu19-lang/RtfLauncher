// Per-profile content (mods, resource packs, data packs, shaders).
//
// Installed state is the profile record in ProfileStore, reconciled against
// the real files on every listing. Duplicate detection is by Modrinth project
// ID first, then by file hash, then by destination filename — never by name
// alone. Every install for a profile runs through a per-profile lock so a
// double click cannot download the same project twice.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const crypto = require('crypto')
const net = require('./net')
const { isBuiltinClientFilename, isBuiltinClientEntry, isBuiltinManagedFilename } = require('./builtin-client')
const FABRIC_API_PROJECT_ID = 'P7dR8mSH' // modrinth.com/mod/fabric-api

const MODRINTH = 'https://api.modrinth.com/v2'
const DOWNLOAD_HOSTS = ['cdn.modrinth.com', 'cdn-raw.modrinth.com']
const IRIS_PROJECT_ID = 'YL57xq9U'

const TYPES = {
  mod: { folder: 'mods', ext: '.jar', label: 'Mod' },
  resourcepack: { folder: 'resourcepacks', ext: '.zip', label: 'Resource Pack' },
  datapack: { folder: 'datapacks', ext: '.zip', label: 'Data Pack' },
  shader: { folder: 'shaderpacks', ext: '.zip', label: 'Shader' },
}

function codedError(message, code, extra = {}) { return Object.assign(new Error(message), { code, ...extra }) }

function safeFilename(name) {
  const base = path.basename(String(name || '')).replace(/[^a-zA-Z0-9._+ ()\[\]-]/g, '_')
  if (!base || base === '.' || base === '..') throw new Error('Geçersiz dosya adı.')
  return base
}

function isInside(root, target) {
  const r = path.resolve(root), t = path.resolve(target)
  return t === r || t.startsWith(r + path.sep)
}

// ── Modrinth (main-process side, cached) ─────────────────────────────────────
const cache = new Map()
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const value = await fn()
  cache.set(key, { value, expires: Date.now() + ttlMs })
  if (cache.size > 500) cache.delete(cache.keys().next().value)
  return value
}
const mr = {
  project: id => cached(`p:${id}`, 5 * 60e3, () => net.getJson(`${MODRINTH}/project/${encodeURIComponent(id)}`)),
  version: id => cached(`v:${id}`, 30 * 60e3, () => net.getJson(`${MODRINTH}/version/${encodeURIComponent(id)}`)),
  versions: (id, loaders, gameVersions) => {
    const q = new URLSearchParams()
    if (loaders?.length) q.set('loaders', JSON.stringify(loaders))
    if (gameVersions?.length) q.set('game_versions', JSON.stringify(gameVersions))
    return cached(`vs:${id}:${q}`, 5 * 60e3, () => net.getJson(`${MODRINTH}/project/${encodeURIComponent(id)}/version?${q}`))
  },
  projects: ids => ids.length ? net.getJson(`${MODRINTH}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`) : Promise.resolve([]),
  byHashes: async hashes => {
    if (!hashes.length) return {}
    return JSON.parse(await net.postJson(`${MODRINTH}/version_files`, { hashes, algorithm: 'sha1' }))
  },
}

function modrinthError(e) {
  if (e instanceof net.HttpError) {
    if (e.status === 404) return codedError('Modrinth projesi bulunamadı.', 'NOT_FOUND')
    if (e.status === 429) return codedError('Modrinth istek limiti aşıldı. Biraz sonra tekrar dene.', 'RATE_LIMITED')
    if (e.status >= 500) return codedError('Modrinth sunucusu şu anda yanıt vermiyor.', 'SERVER_ERROR')
    return codedError(`Modrinth isteği başarısız (HTTP ${e.status}).`, 'HTTP_ERROR')
  }
  if (e && e.code) return e
  return codedError('Modrinth’e ulaşılamadı. İnternet bağlantını kontrol et.', 'NETWORK')
}

// Which Modrinth loaders a profile can use for a content type.
function loadersFor(profile, type) {
  if (type === 'mod') {
    if (profile.loader === 'fabric' || profile.loader === 'rtf') return ['fabric']
    if (profile.loader === 'quilt') return ['quilt', 'fabric']
    return null
  }
  if (type === 'resourcepack') return ['minecraft']
  if (type === 'datapack') return ['datapack']
  if (type === 'shader') return profile.loader === 'vanilla' ? null : ['iris']
  return null
}

function incompatibleReason(profile, type) {
  if (type === 'mod' && profile.loader === 'vanilla') return 'Vanilla profiller mod yükleyemez. Fabric veya Quilt profili kullan.'
  if (type === 'shader' && profile.loader === 'vanilla') return 'Shader’lar Iris gerektirir; Fabric veya Quilt profili kullan.'
  return ''
}

function pickVersion(versions, profile) {
  const ok = (versions || []).filter(v => (v.game_versions || []).includes(profile.minecraftVersion))
  const rank = { release: 0, beta: 1, alpha: 2 }
  return ok.slice().sort((a, b) => (rank[a.version_type] ?? 3) - (rank[b.version_type] ?? 3) || String(b.date_published).localeCompare(String(a.date_published)))[0] || null
}

function primaryFile(version, type) {
  const ext = TYPES[type].ext
  const files = (version?.files || []).filter(f => String(f.filename).toLowerCase().endsWith(ext))
  return files.find(f => f.primary) || files[0] || null
}

class ContentManager {
  constructor({ store, emit = () => {} }) {
    this.store = store
    this.emit = emit
    this.locks = new Map()
  }

  withLock(profileId, fn) {
    const prev = this.locks.get(profileId) || Promise.resolve()
    const run = prev.catch(() => {}).then(fn)
    const tail = run.catch(() => {})
    this.locks.set(profileId, tail)
    tail.then(() => { if (this.locks.get(profileId) === tail) this.locks.delete(profileId) })
    return run
  }

  dirFor(profile, type, worldName = '') {
    const root = this.store.ensureInstance(profile.id)
    if (type === 'datapack') {
      const world = path.basename(String(worldName || ''))
      if (!world || world !== String(worldName)) throw codedError('Data Pack için bir dünya seçmelisin.', 'NEEDS_WORLD')
      const worldDir = path.join(root, 'saves', world)
      if (!fs.existsSync(path.join(worldDir, 'level.dat'))) throw codedError('Seçilen dünya bulunamadı.', 'NEEDS_WORLD')
      return path.join(worldDir, 'datapacks')
    }
    return path.join(root, TYPES[type].folder)
  }

  // ── Listing & reconciliation ───────────────────────────────────────────────
  scanFiles(profile, type) {
    const root = this.store.ensureInstance(profile.id)
    const ext = TYPES[type].ext
    const out = []
    const scanDir = (dir, worldName = '') => {
      if (!fs.existsSync(dir)) return
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!f.isFile()) continue
        if (type === 'mod' && isBuiltinManagedFilename(f.name)) continue
        const lower = f.name.toLowerCase()
        if (lower.endsWith(ext)) out.push({ filename: f.name, enabled: true, worldName })
        else if (lower.endsWith(`${ext}.disabled`)) {
          const visibleName = f.name.slice(0, -'.disabled'.length)
          if (type === 'mod' && isBuiltinManagedFilename(visibleName)) continue
          out.push({ filename: visibleName, enabled: false, worldName })
        }
      }
    }
    if (type === 'datapack') {
      const saves = path.join(root, 'saves')
      if (fs.existsSync(saves)) for (const w of fs.readdirSync(saves, { withFileTypes: true })) if (w.isDirectory()) scanDir(path.join(saves, w.name, 'datapacks'), w.name)
    } else scanDir(path.join(root, TYPES[type].folder))
    return out
  }

  reconcile(profileId, type) {
    const profile = this.store.get(profileId)
    const files = this.scanFiles(profile, type)
    const key = f => `${f.worldName}/${f.filename}`
    const onDisk = new Map(files.map(f => [key(f), f]))
    const entries = this.store.contentList(profileId, type)
    let changed = false
    const kept = []
    const seen = new Set()
    for (const e of entries) {
      const k = key(e)
      if (!onDisk.has(k) || seen.has(k)) { changed = true; continue }
      seen.add(k)
      kept.push(e)
    }
    for (const f of files) {
      if (seen.has(key(f))) continue
      seen.add(key(f))
      changed = true
      kept.push({ id: crypto.randomUUID(), type, filename: f.filename, worldName: f.worldName, title: f.filename.replace(/\.(jar|zip)$/i, ''), source: 'local', installedAt: new Date().toISOString() })
    }
    if (changed) this.store.replaceContent(profileId, type, kept)
    const final = this.store.contentList(profileId, type).filter(e => !(type === 'mod' && (isBuiltinClientEntry(e) || isBuiltinManagedFilename(e.filename))))
    return final.map(e => ({ ...e, enabled: onDisk.get(key(e))?.enabled !== false }))
  }

  list(profileId) {
    const result = {}
    for (const type of Object.keys(TYPES)) result[type] = this.reconcile(profileId, type)
    // Identify untracked files in the background (hash lookup on Modrinth) so a
    // manually copied sodium-x.jar is still recognised as Sodium.
    this.identifyUntracked(profileId).catch(() => {})
    return result
  }

  async identifyUntracked(profileId) {
    if (this._identifying?.has(profileId)) return
    this._identifying = this._identifying || new Set()
    this._identifying.add(profileId)
    try {
      const profile = this.store.get(profileId)
      const pending = []
      for (const type of Object.keys(TYPES)) {
        for (const e of this.store.contentList(profileId, type)) if (!e.projectId && !e.identifyAttempted) pending.push({ type, e })
      }
      if (!pending.length) return
      for (const p of pending) {
        if (p.e.sha1) continue
        const file = this.entryPath(profile, p.type, p.e)
        if (file) p.e.sha1 = await net.hashFile(file, 'sha1').catch(() => '')
      }
      let map = {}
      try { map = await mr.byHashes(pending.map(p => p.e.sha1).filter(Boolean)) } catch { return }
      const projectIds = [...new Set(Object.values(map).map(v => v.project_id))]
      let projects = []
      try { projects = await mr.projects(projectIds) } catch {}
      const byId = new Map(projects.map(p => [p.id, p]))
      let changed = false
      for (const { type, e } of pending) {
        const current = this.store.contentList(profileId, type).find(x => x.id === e.id)
        if (!current) continue
        const v = map[e.sha1]
        const patch = { identifyAttempted: true, sha1: e.sha1 }
        if (v) {
          const proj = byId.get(v.project_id)
          Object.assign(patch, { projectId: v.project_id, versionId: v.id, versionNumber: v.version_number, title: proj?.title || current.title, iconUrl: proj?.icon_url || '' })
        }
        this.store.patchContent(profileId, type, e.id, patch)
        changed = true
      }
      if (changed) this.emit('content:changed', { profileId })
    } finally { this._identifying.delete(profileId) }
  }

  entryPath(profile, type, e) {
    try {
      const dir = this.dirFor(profile, type, e.worldName)
      const on = path.join(dir, e.filename), off = `${on}.disabled`
      return fs.existsSync(on) ? on : fs.existsSync(off) ? off : null
    } catch { return null }
  }

  installedProject(profileId, type, projectId, worldName = '') {
    if (!projectId) return null
    return this.store.contentList(profileId, type).find(e => e.projectId === projectId && (type !== 'datapack' || e.worldName === worldName)) || null
  }

  // ── Planning ───────────────────────────────────────────────────────────────
  async resolveDependencies(profile, version, seen, depth = 0) {
    const required = [], optional = [], conflicts = []
    if (depth > 4) return { required, optional, conflicts }
    for (const dep of version.dependencies || []) {
      let projectId = dep.project_id
      let pinned = null
      try {
        if (!projectId && dep.version_id) { pinned = await mr.version(dep.version_id); projectId = pinned.project_id }
      } catch { continue }
      if (!projectId || seen.has(projectId)) continue
      // Fabric API is provided (hidden, version-matched) by the launcher itself
      // for the RTF Client, so mods that depend on it must not try to install a
      // second copy — that filename is reserved and would abort the install.
      if (projectId === FABRIC_API_PROJECT_ID) continue
      if (dep.dependency_type === 'incompatible') {
        const installed = this.installedProject(profile.id, 'mod', projectId)
        if (installed) conflicts.push({ projectId, title: installed.title })
        continue
      }
      if (dep.dependency_type !== 'required' && dep.dependency_type !== 'optional') continue
      seen.add(projectId)
      let project = null
      try { project = await mr.project(projectId) } catch {}
      const title = project?.title || projectId
      if (dep.dependency_type === 'optional') { optional.push({ projectId, title, iconUrl: project?.icon_url || '' }); continue }
      const installed = this.installedProject(profile.id, 'mod', projectId)
      const node = { projectId, title, iconUrl: project?.icon_url || '', installed: !!installed, version: null, compatible: true, reason: '' }
      if (!installed) {
        let v = pinned && (pinned.game_versions || []).includes(profile.minecraftVersion) ? pinned : null
        if (!v) { try { v = pickVersion(await mr.versions(projectId, loadersFor(profile, 'mod'), [profile.minecraftVersion]), profile) } catch (e) { throw modrinthError(e) } }
        const file = v && primaryFile(v, 'mod')
        if (!v || !file) { node.compatible = false; node.reason = `${title} bu profil için (${profile.minecraftVersion} / ${profile.loader}) bulunamadı.` }
        else {
          node.version = { id: v.id, versionNumber: v.version_number, file: { url: file.url, filename: file.filename, sha1: file.hashes?.sha1, sha512: file.hashes?.sha512, size: file.size } }
          const sub = await this.resolveDependencies(profile, v, seen, depth + 1)
          required.push(...sub.required); conflicts.push(...sub.conflicts)
        }
      }
      required.push(node)
    }
    return { required, optional, conflicts }
  }

  async plan(profileId, { projectId, type, worldName = '' }) {
    if (!TYPES[type]) throw new Error('Desteklenmeyen içerik türü.')
    const profile = this.store.get(profileId)
    let project
    try { project = await mr.project(projectId) } catch (e) { throw modrinthError(e) }
    const summary = { id: project.id, title: project.title, iconUrl: project.icon_url || '', projectType: project.project_type, gameVersions: project.game_versions || [], loaders: project.loaders || [] }
    const already = this.installedProject(profileId, type, project.id, worldName)
    const base = { profileId, type, project: summary, alreadyInstalled: already, dependencies: [], optionalDependencies: [], conflicts: [], compatible: false, reason: '', version: null }
    if (already) return { ...base, compatible: true }
    const bad = incompatibleReason(profile, type)
    if (bad) return { ...base, reason: bad }
    let versions
    try { versions = await mr.versions(project.id, loadersFor(profile, type), [profile.minecraftVersion]) } catch (e) { throw modrinthError(e) }
    const v = pickVersion(versions, profile)
    const file = v && primaryFile(v, type)
    if (!v || !file) return { ...base, reason: `Bu profille uyumlu değil (${profile.minecraftVersion} · ${profile.loader}).` }
    const seen = new Set([project.id])
    let deps = { required: [], optional: [], conflicts: [] }
    if (type === 'mod') deps = await this.resolveDependencies(profile, v, seen)
    if (type === 'shader' && !this.installedProject(profileId, 'mod', IRIS_PROJECT_ID)) {
      // Shader packs do not declare Iris, but they cannot load without it.
      const irisPlan = await this.plan(profileId, { projectId: IRIS_PROJECT_ID, type: 'mod' }).catch(() => null)
      if (irisPlan?.version) deps.required.push(...irisPlan.dependencies, { projectId: IRIS_PROJECT_ID, title: irisPlan.project.title, iconUrl: irisPlan.project.iconUrl, installed: false, compatible: true, reason: '', version: irisPlan.version })
      else deps.required.push({ projectId: IRIS_PROJECT_ID, title: 'Iris Shaders', iconUrl: '', installed: false, compatible: false, reason: 'Iris bu profilin sürümü için bulunamadı.', version: null })
    }
    // Deduplicate dependencies that appear in several branches.
    const uniq = new Map()
    for (const d of deps.required) if (!uniq.has(d.projectId)) uniq.set(d.projectId, d)
    const required = [...uniq.values()]
    const blocking = required.find(d => !d.installed && !d.compatible)
    return {
      ...base,
      compatible: !blocking && !deps.conflicts.length,
      reason: blocking ? blocking.reason : deps.conflicts.length ? `Kurulu içerikle çakışıyor: ${deps.conflicts.map(c => c.title).join(', ')}` : '',
      version: { id: v.id, versionNumber: v.version_number, versionType: v.version_type, file: { url: file.url, filename: file.filename, sha1: file.hashes?.sha1, sha512: file.hashes?.sha512, size: file.size } },
      dependencies: required,
      optionalDependencies: deps.optional,
      conflicts: deps.conflicts,
    }
  }

  // ── Install / uninstall ────────────────────────────────────────────────────
  install(profileId, { projectId, type, worldName = '', includeDependencies = false }) {
    return this.withLock(profileId, async () => {
      const plan = await this.plan(profileId, { projectId, type, worldName })
      if (plan.alreadyInstalled) return { success: true, alreadyInstalled: true, installed: [], plan }
      if (!plan.compatible) throw codedError(plan.reason || 'Bu içerik bu profille uyumlu değil.', 'INCOMPATIBLE')
      const missing = plan.dependencies.filter(d => !d.installed)
      if (missing.length && !includeDependencies) return { success: false, needsConfirmation: true, plan }
      const profile = this.store.get(profileId)
      const installed = []
      for (const dep of missing) {
        if (this.installedProject(profileId, 'mod', dep.projectId)) continue
        installed.push(await this.downloadEntry(profile, 'mod', { projectId: dep.projectId, title: dep.title, iconUrl: dep.iconUrl, version: dep.version, dependency: true }))
      }
      installed.push(await this.downloadEntry(profile, type, { projectId: plan.project.id, title: plan.project.title, iconUrl: plan.project.iconUrl, version: plan.version, worldName }))
      this.emit('content:changed', { profileId })
      return { success: true, installed, plan }
    })
  }

  async downloadEntry(profile, type, { projectId, title, iconUrl, version, worldName = '', dependency = false }) {
    if (this.installedProject(profile.id, type, projectId, worldName)) return this.installedProject(profile.id, type, projectId, worldName)
    const file = version.file
    const filename = safeFilename(file.filename)
    if (type === 'mod' && isBuiltinManagedFilename(filename)) throw new Error('Bu dosya adı launcher tarafından kullanılan yerleşik RTF bileşenine ayrılmış.')
    if (!filename.toLowerCase().endsWith(TYPES[type].ext)) throw new Error(`Beklenmeyen dosya türü: ${filename}`)
    const sha1 = String(file.sha1 || '').toLowerCase()
    if (sha1) {
      const same = this.store.contentList(profile.id, type).find(e => e.sha1 === sha1 && (type !== 'datapack' || e.worldName === worldName))
      if (same) throw codedError(`Bu dosya zaten kurulu: ${same.title}`, 'DUPLICATE')
    }
    const dir = this.dirFor(profile, type, worldName)
    fs.mkdirSync(dir, { recursive: true })
    const dest = path.join(dir, filename)
    if (fs.existsSync(dest) || fs.existsSync(`${dest}.disabled`)) throw codedError(`Aynı dosya bu profilde zaten var: ${filename}`, 'DUPLICATE')
    this.emit('content:progress', { profileId: profile.id, projectId, type, pct: 0, stage: 'download', title })
    const res = await net.downloadFile(file.url, dest, {
      sha1: file.sha1, sha512: file.sha512, size: file.size, allowedHosts: DOWNLOAD_HOSTS,
      onProgress: pct => this.emit('content:progress', { profileId: profile.id, projectId, type, pct, stage: 'download', title }),
    }).catch(e => { throw e instanceof net.HttpError ? modrinthError(e) : e })
    // Re-check after the await: the profile might have been deleted meanwhile.
    this.store.get(profile.id)
    const entry = this.store.addContent(profile.id, type, {
      projectId, versionId: version.id, versionNumber: version.versionNumber, title, iconUrl, filename, worldName,
      sha1: res.sha1, source: 'modrinth', dependency, identifyAttempted: true,
    })
    this.emit('content:progress', { profileId: profile.id, projectId, type, pct: 100, stage: 'done', title })
    return entry
  }

  uninstall(profileId, { type, entryId }) {
    return this.withLock(profileId, async () => {
      const profile = this.store.get(profileId)
      const e = this.store.contentList(profileId, type).find(x => x.id === entryId)
      if (!e) throw new Error('İçerik bulunamadı.')
      if (type === 'mod' && isBuiltinClientEntry(e)) throw new Error('RTF Client launcher tarafından yönetiliyor ve kaldırılamaz.')
      const dir = this.dirFor(profile, type, e.worldName)
      for (const f of [path.join(dir, e.filename), path.join(dir, `${e.filename}.disabled`)]) {
        if (isInside(dir, f)) fs.rmSync(f, { force: true })
      }
      this.store.removeContent(profileId, type, entryId)
      this.emit('content:changed', { profileId })
      return { success: true }
    })
  }

  setEnabled(profileId, { type, entryId, enabled }) {
    return this.withLock(profileId, async () => {
      const profile = this.store.get(profileId)
      const e = this.store.contentList(profileId, type).find(x => x.id === entryId)
      if (!e) throw new Error('İçerik bulunamadı.')
      if (type === 'mod' && isBuiltinClientEntry(e)) throw new Error('RTF Client launcher tarafından yönetiliyor ve devre dışı bırakılamaz.')
      const dir = this.dirFor(profile, type, e.worldName)
      const on = path.join(dir, e.filename), off = `${on}.disabled`
      if (enabled && fs.existsSync(off)) fs.renameSync(off, on)
      if (!enabled && fs.existsSync(on)) fs.renameSync(on, off)
      this.emit('content:changed', { profileId })
      return { success: true }
    })
  }

  // Which projects the renderer should show as installed for a content type.
  installedIndex(profileId) {
    const out = {}
    for (const type of Object.keys(TYPES)) {
      out[type] = this.store.contentList(profileId, type).filter(e => !(isBuiltinClientEntry(e) || (type === 'mod' && isBuiltinManagedFilename(e.filename))) && e.projectId).map(e => ({ projectId: e.projectId, worldName: e.worldName, entryId: e.id }))
    }
    return out
  }

  // ── Uploads ────────────────────────────────────────────────────────────────
  inspectArchive(file, type, profile) {
    let zip
    try { const AdmZip = require('adm-zip'); zip = new AdmZip(file) } catch { throw new Error(`${path.basename(file)} geçerli bir arşiv değil.`) }
    const names = zip.getEntries().map(e => e.entryName.replace(/\\/g, '/'))
    const has = n => names.includes(n)
    const hasDir = d => names.some(n => n.startsWith(d))
    const base = path.basename(file)
    if (type === 'mod') {
      if (profile.loader === 'vanilla') throw new Error('Vanilla profile mod yüklenemez.')
      const fabric = has('fabric.mod.json'), quilt = has('quilt.mod.json')
      const forge = has('META-INF/mods.toml') || has('META-INF/neoforge.mods.toml')
      if (profile.loader === 'fabric' && !fabric) throw new Error(forge ? `${base} bir Forge/NeoForge modu; bu profil Fabric kullanıyor.` : quilt ? `${base} yalnızca Quilt için; bu profil Fabric kullanıyor.` : `${base} bir Fabric modu değil.`)
      if (profile.loader === 'quilt' && !fabric && !quilt) throw new Error(forge ? `${base} bir Forge/NeoForge modu; bu profil Quilt kullanıyor.` : `${base} bir Quilt/Fabric modu değil.`)
      return
    }
    const mcmeta = has('pack.mcmeta')
    if (type === 'shader') {
      if (!hasDir('shaders/')) throw new Error(mcmeta ? `${base} bir resource/data pack gibi görünüyor, shader değil.` : `${base} geçerli bir shader paketi değil (shaders/ klasörü yok).`)
      return
    }
    if (!mcmeta) throw new Error(hasDir('shaders/') ? `${base} bir shader paketi gibi görünüyor.` : `${base} içinde pack.mcmeta yok.`)
    if (type === 'resourcepack' && !hasDir('assets/') && hasDir('data/')) throw new Error(`${base} bir data pack; Resource Packs yerine Data Packs sekmesinden yükle.`)
    if (type === 'datapack' && !hasDir('data/')) throw new Error(hasDir('assets/') ? `${base} bir resource pack; Resource Packs sekmesinden yükle.` : `${base} geçerli bir data pack değil (data/ klasörü yok).`)
  }

  upload(profileId, { type, sourcePaths = [], worldName = '' }) {
    return this.withLock(profileId, async () => {
      if (!TYPES[type]) throw new Error('Desteklenmeyen içerik türü.')
      const profile = this.store.get(profileId)
      const dir = this.dirFor(profile, type, worldName)
      fs.mkdirSync(dir, { recursive: true })
      const results = []
      for (const raw of sourcePaths) {
        const source = path.resolve(String(raw || ''))
        const name = path.basename(source)
        try {
          if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error(`${name} bulunamadı.`)
          if (!name.toLowerCase().endsWith(TYPES[type].ext)) throw new Error(`${name}: ${TYPES[type].label} için ${TYPES[type].ext} dosyası gerekli.`)
          this.inspectArchive(source, type, profile)
          const sha1 = await net.hashFile(source, 'sha1')
          const list = this.store.contentList(profileId, type).filter(e => type !== 'datapack' || e.worldName === worldName)
          const sameHash = list.find(e => e.sha1 === sha1)
          if (sameHash) throw codedError(`${name} zaten kurulu (${sameHash.title}).`, 'DUPLICATE')
          let ident = null
          try { const map = await mr.byHashes([sha1]); const v = map[sha1]; if (v) { const [proj] = await mr.projects([v.project_id]); ident = { projectId: v.project_id, versionId: v.id, versionNumber: v.version_number, title: proj?.title, iconUrl: proj?.icon_url } } } catch {}
          if (ident) {
            const dup = list.find(e => e.projectId === ident.projectId)
            if (dup) throw codedError(`${ident.title || name} zaten bu profilde kurulu (${dup.filename}).`, 'DUPLICATE')
          }
          const filename = safeFilename(name)
          const dest = path.join(dir, filename)
          if (fs.existsSync(dest) || fs.existsSync(`${dest}.disabled`)) throw codedError(`${filename} zaten bu profilde var.`, 'DUPLICATE')
          fs.copyFileSync(source, dest)
          const entry = this.store.addContent(profileId, type, {
            filename, worldName, sha1, source: ident ? 'modrinth' : 'local', identifyAttempted: true,
            title: ident?.title || filename.replace(/\.(jar|zip)$/i, ''), projectId: ident?.projectId, versionId: ident?.versionId, versionNumber: ident?.versionNumber, iconUrl: ident?.iconUrl,
          })
          results.push({ file: name, success: true, entry })
        } catch (e) { results.push({ file: name, success: false, error: e.message, code: e.code }) }
      }
      this.emit('content:changed', { profileId })
      return { success: results.every(r => r.success), results }
    })
  }

  // ── Worlds / files / logs ──────────────────────────────────────────────────
  worlds(profileId) {
    const root = this.store.ensureInstance(profileId)
    const saves = path.join(root, 'saves')
    if (!fs.existsSync(saves)) return []
    return fs.readdirSync(saves, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => {
      const dir = path.join(saves, d.name)
      const level = path.join(dir, 'level.dat')
      if (!fs.existsSync(level)) return null
      const info = readLevelInfo(level)
      let icon = ''
      try { const ic = path.join(dir, 'icon.png'); if (fs.existsSync(ic) && fs.statSync(ic).size < 256 * 1024) icon = `data:image/png;base64,${fs.readFileSync(ic).toString('base64')}` } catch {}
      let datapacks = 0
      try { datapacks = fs.readdirSync(path.join(dir, 'datapacks')).filter(f => /\.zip$/i.test(f)).length } catch {}
      return { folder: d.name, name: info.levelName || d.name, lastPlayed: info.lastPlayed || fs.statSync(level).mtimeMs, gameType: info.gameType, hardcore: info.hardcore, icon, datapacks }
    }).filter(Boolean).sort((a, b) => b.lastPlayed - a.lastPlayed)
  }

  resolveInInstance(profileId, rel = '') {
    const root = this.store.ensureInstance(profileId)
    const target = path.resolve(root, String(rel || '').replace(/^[/\\]+/, ''))
    if (!isInside(root, target)) throw new Error('Geçersiz yol.')
    return { root, target }
  }

  files(profileId, rel = '') {
    const { root, target } = this.resolveInInstance(profileId, rel)
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error('Klasör bulunamadı.')
    const entries = fs.readdirSync(target, { withFileTypes: true }).map(e => {
      const full = path.join(target, e.name)
      let st = null
      try { st = fs.statSync(full) } catch {}
      return { name: e.name, path: path.relative(root, full).split(path.sep).join('/'), type: e.isDirectory() ? 'directory' : 'file', size: st && !e.isDirectory() ? st.size : 0, modified: st ? st.mtimeMs : 0 }
    }).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))
    return { path: path.relative(root, target).split(path.sep).join('/'), entries }
  }

  logs(profileId) {
    const root = this.store.ensureInstance(profileId)
    const out = []
    for (const [folder, re] of [['logs', /\.(log|log\.gz)$/i], ['crash-reports', /\.txt$/i]]) {
      const dir = path.join(root, folder)
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!re.test(f)) continue
        const st = fs.statSync(path.join(dir, f))
        out.push({ path: `${folder}/${f}`, name: f, kind: folder === 'crash-reports' ? 'crash' : f === 'rtf-launcher.log' ? 'launcher' : 'game', size: st.size, modified: st.mtimeMs })
      }
    }
    const weight = x => (x.name === 'latest.log' ? 0 : x.kind === 'launcher' ? 1 : 2)
    return out.sort((a, b) => weight(a) - weight(b) || b.modified - a.modified)
  }

  readLog(profileId, rel) {
    const clean = String(rel || '')
    if (!/^(logs|crash-reports)\/[^/\\]+$/.test(clean)) throw new Error('Geçersiz log dosyası.')
    const { target } = this.resolveInInstance(profileId, clean)
    if (!fs.existsSync(target)) return { exists: false, content: '' }
    let buf = fs.readFileSync(target)
    if (/\.gz$/i.test(target)) buf = zlib.gunzipSync(buf)
    const max = 400 * 1024
    const text = buf.length > max ? buf.subarray(buf.length - max).toString('utf8') : buf.toString('utf8')
    return { exists: true, truncated: buf.length > max, content: text }
  }
}

// Minimal NBT reads for level.dat (gzip). We only need a few named tags.
function readLevelInfo(file) {
  const info = {}
  try {
    const buf = zlib.gunzipSync(fs.readFileSync(file))
    const find = (tagType, name) => {
      const needle = Buffer.concat([Buffer.from([tagType]), Buffer.from([0, name.length]), Buffer.from(name, 'utf8')])
      const i = buf.indexOf(needle)
      return i < 0 ? -1 : i + needle.length
    }
    let i = find(8, 'LevelName')
    if (i >= 0) { const len = buf.readUInt16BE(i); info.levelName = buf.toString('utf8', i + 2, i + 2 + len) }
    i = find(4, 'LastPlayed')
    if (i >= 0) info.lastPlayed = Number(buf.readBigInt64BE(i))
    i = find(3, 'GameType')
    if (i >= 0) info.gameType = ['survival', 'creative', 'adventure', 'spectator'][buf.readInt32BE(i)] || ''
    i = find(1, 'hardcore')
    if (i >= 0) info.hardcore = buf.readInt8(i) === 1
  } catch {}
  return info
}

module.exports = { ContentManager, TYPES, loadersFor, pickVersion, readLevelInfo, IRIS_PROJECT_ID, modrinthError, _mr: mr, _cache: cache }
