// Keeps the RTF Fabric mod (and the Fabric API it depends on) present in a
// profile's mods folder without exposing either in any mod list/removal UI.
//
// Why Fabric API matters: the bundled mod's fabric.mod.json declares
//   "fabricloader": ">=0.18.4", "fabric-api": ">=0.141.3", "minecraft": "1.21.11"
// If any of those is missing Fabric aborts startup before a window even
// opens — which is exactly what "the game doesn't open" looked like. So every
// launch makes sure (1) the mod jar is there, (2) a Fabric API jar for this
// Minecraft version is there (downloaded from Modrinth's public API, Apache-2.0
// licensed, never bundled by us), and (3) the Fabric Loader is new enough.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const net = require('./net')
const { BUILTIN_CLIENT_FILENAME, isBuiltinDependencyFilename } = require('./builtin-client')

const RESOURCE_JAR = path.join(__dirname, '..', 'resources', 'required-mods', 'rtfclient-builtin.jar')
const MIN_FABRIC_LOADER = '0.18.4'
const MODRINTH_HOSTS = ['modrinth.com', 'cdn.modrinth.com']

function sha1File(file) {
  try { return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex') } catch { return null }
}

// "0.18.4" vs "0.16.9" style comparison (ignores any -beta/+build suffix).
function cmpVersion(a, b) {
  const pa = String(a).split(/[-+]/)[0].split('.').map(n => parseInt(n, 10) || 0)
  const pb = String(b).split(/[-+]/)[0].split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}
const loaderMeetsMinimum = v => !!v && cmpVersion(v, MIN_FABRIC_LOADER) >= 0

// Copies the bundled mod into <gameDir>/mods, replacing an out-of-date copy
// so shipping an updated jar in a future launcher update reaches players.
// Cheap to call on every launch (hash-checked first).
function ensureRequiredMods(gameDir) {
  if (!fs.existsSync(RESOURCE_JAR)) return
  const modsDir = path.join(gameDir, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  const dest = path.join(modsDir, BUILTIN_CLIENT_FILENAME)
  if (fs.existsSync(dest) && sha1File(dest) === sha1File(RESOURCE_JAR)) return
  fs.writeFileSync(dest, fs.readFileSync(RESOURCE_JAR)) // read+write (not copyFileSync) so it also works from inside an asar
}

// Makes sure exactly one Fabric API jar matching this Minecraft version is in
// the mods folder. Skips the network entirely when one is already there.
async function ensureFabricApi(gameDir, mcVersion, log = () => {}) {
  const modsDir = path.join(gameDir, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })
  const existing = fs.readdirSync(modsDir).filter(isBuiltinDependencyFilename)
  if (existing.length) return existing[0]

  log('⇩ Fabric API indiriliyor (RTF Client için gerekli)…')
  const q = `game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}&loaders=${encodeURIComponent(JSON.stringify(['fabric']))}`
  let versions
  try { versions = await net.getJson(`https://api.modrinth.com/v2/project/fabric-api/version?${q}`) }
  catch (e) { throw new Error(`Fabric API sürümü alınamadı (${e.message}). İnternet bağlantını kontrol et.`) }
  const release = (Array.isArray(versions) ? versions : []).find(v => v.version_type === 'release') || versions?.[0]
  const file = release?.files?.find(f => f.primary) || release?.files?.[0]
  if (!file?.url || !/^fabric-api-.*\.jar$/i.test(file.filename || '')) throw new Error(`Minecraft ${mcVersion} için Fabric API bulunamadı.`)
  const dest = path.join(modsDir, path.basename(file.filename))
  const tmp = `${dest}.part`
  try {
    await net.downloadFile(file.url, tmp, { sha512: file.hashes?.sha512, sha1: file.hashes?.sha1, size: file.size, allowedHosts: MODRINTH_HOSTS })
    fs.renameSync(tmp, dest)
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }) } catch {}
    throw new Error(`Fabric API indirilemedi: ${e.message}`)
  }
  log(`✓ Fabric API hazır: ${path.basename(dest)}`)
  return path.basename(dest)
}

module.exports = { ensureRequiredMods, ensureFabricApi, loaderMeetsMinimum, cmpVersion, MIN_FABRIC_LOADER }
