// Behavioural tests for the main-process profile/content modules.
// Run: node tests/main-modules.test.js   (add --network to hit the real Modrinth API)
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const assert = require('assert/strict')
const AdmZip = require('adm-zip')
const net = require('../src/lib/net')
const { ProfileStore } = require('../src/lib/profile-store')
const cm = require('../src/lib/content-manager')
const { requiredJava } = require('../src/lib/game-launcher')

const NETWORK = process.argv.includes('--network')
const results = []
async function test(name, fn) {
  try { await fn(); results.push([true, name]) } catch (e) { results.push([false, name, e]) }
}

function tmpEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rtf-test-'))
  const appDir = path.join(root, 'app')
  fs.mkdirSync(appDir, { recursive: true })
  return { root, appDir, profilesDir: path.join(appDir, 'profiles'), legacyConfigPath: path.join(appDir, 'config.json') }
}
const newStore = env => new ProfileStore(env)

// ── Fake Modrinth ────────────────────────────────────────────────────────────
const FAKE = {
  sodium: { id: 'AANobbMI', title: 'Sodium', project_type: 'mod', icon_url: 'https://cdn.modrinth.com/s.png', deps: [] },
  iris: { id: 'YL57xq9U', title: 'Iris Shaders', project_type: 'mod', icon_url: '', deps: [{ project_id: 'AANobbMI', dependency_type: 'required' }] },
  fapi: { id: 'P7dR8mSH', title: 'Fabric API', project_type: 'mod', icon_url: '', deps: [] },
  modmenu: { id: 'mOgUt4GM', title: 'Mod Menu', project_type: 'mod', icon_url: '', deps: [{ project_id: 'P7dR8mSH', dependency_type: 'required' }] },
  forgeonly: { id: 'FORGE001', title: 'Forge Only', project_type: 'mod', icon_url: '', deps: [], loaders: ['forge'] },
  faithful: { id: 'RP000001', title: 'Faithful', project_type: 'resourcepack', icon_url: '', deps: [], loaders: ['minecraft'], ext: 'zip' },
  bsl: { id: 'SH000001', title: 'BSL', project_type: 'shader', icon_url: '', deps: [], loaders: ['iris'], ext: 'zip' },
  terralith: { id: 'DP000001', title: 'Terralith', project_type: 'datapack', icon_url: '', deps: [], loaders: ['datapack'], ext: 'zip' },
}
const byId = id => Object.values(FAKE).find(p => p.id === id)
let downloads = 0
function installFakeModrinth() {
  cm._cache.clear()
  cm._mr.project = async id => { const p = byId(id); if (!p) throw new net.HttpError(404, 'nf'); return { ...p, loaders: p.loaders || ['fabric'], game_versions: ['1.21.11'] } }
  cm._mr.versions = async (id, loaders) => {
    const p = byId(id); if (!p) throw new net.HttpError(404, 'nf')
    const pl = p.loaders || ['fabric']
    if (loaders && !loaders.some(l => pl.includes(l))) return []
    const ext = p.ext || 'jar'
    return [{ id: `${id}-v1`, project_id: id, version_number: '1.0.0', version_type: 'release', game_versions: ['1.21.11'], loaders: pl, date_published: '2026-01-01', dependencies: p.deps, files: [{ primary: true, filename: `${p.title.toLowerCase().replace(/\W/g, '')}-1.0.0.${ext}`, url: `https://cdn.modrinth.com/data/${id}/file.${ext}`, hashes: {}, size: 0 }] }]
  }
  cm._mr.version = async id => { const pid = id.replace(/-v1$/, ''); return (await cm._mr.versions(pid))[0] }
  cm._mr.byHashes = async () => ({})
  cm._mr.projects = async ids => ids.map(byId).filter(Boolean)
  net.downloadFile = async (url, dest) => {
    downloads++
    await new Promise(r => setTimeout(r, 20))
    fs.writeFileSync(dest, `fake:${url}`)
    return { success: true, sha1: require('crypto').createHash('sha1').update(url).digest('hex'), size: 10 }
  }
}

function makeZip(file, entries) {
  const z = new AdmZip()
  for (const [name, body] of Object.entries(entries)) z.addFile(name, Buffer.from(body))
  z.writeZip(file)
  return file
}

function makeWorld(instance, folder, levelName) {
  const dir = path.join(instance, 'saves', folder)
  fs.mkdirSync(dir, { recursive: true })
  const name = Buffer.from(levelName, 'utf8')
  const nbt = Buffer.concat([
    Buffer.from([10, 0, 0, 10, 0, 4]), Buffer.from('Data'),
    Buffer.from([8, 0, 9]), Buffer.from('LevelName'), Buffer.from([0, name.length]), name,
    Buffer.from([4, 0, 10]), Buffer.from('LastPlayed'), (() => { const b = Buffer.alloc(8); b.writeBigInt64BE(1758600000000n); return b })(),
    Buffer.from([3, 0, 8]), Buffer.from('GameType'), Buffer.from([0, 0, 0, 1]),
    Buffer.from([0, 0]),
  ])
  fs.writeFileSync(path.join(dir, 'level.dat'), zlib.gzipSync(nbt))
}

;(async () => {
  installFakeModrinth()

  await test('legacy config.modProfiles + .rtf-content.json migrate into profiles.json', async () => {
    const env = tmpEnv()
    const id = 'legacy-1'
    const inst = path.join(env.profilesDir, id, 'instance')
    fs.mkdirSync(path.join(inst, 'mods'), { recursive: true })
    fs.writeFileSync(path.join(inst, 'mods', 'sodium.jar'), 'x')
    fs.writeFileSync(path.join(inst, '.rtf-content.json'), JSON.stringify([{ type: 'mod', projectId: 'AANobbMI', projectName: 'Sodium', filename: 'sodium.jar', versionId: 'v', source: 'modrinth' }]))
    fs.writeFileSync(env.legacyConfigPath, JSON.stringify({ onboarded: true, modProfiles: [{ id, name: 'Old', version: '1.21.4', loader: 'fabric', loaderVersion: '0.16.9', mods: ['global.jar'] }], activeModProfileId: id }))
    const s = newStore(env)
    const p = s.get(id)
    assert.equal(p.minecraftVersion, '1.21.4')
    assert.equal(p.mods.length, 1)
    assert.equal(p.mods[0].projectId, 'AANobbMI')
    assert.equal(s.activeId(), id)
    assert.ok(fs.existsSync(path.join(env.appDir, 'profiles.json')))
    // A stale config write can no longer remove the profile.
    fs.writeFileSync(env.legacyConfigPath, JSON.stringify({ onboarded: true }))
    assert.equal(newStore(env).get(id).name, 'Old')
  })

  await test('create persists profile, instance folders and selection; reload finds same ID', async () => {
    const env = tmpEnv()
    const s = newStore(env)
    const p = s.create({ name: 'Rtf Survival', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2', icon: 'R' })
    for (const f of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'config']) assert.ok(fs.existsSync(path.join(p.instancePath, f)), f)
    const again = newStore(env)
    assert.equal(again.get(p.id).name, 'Rtf Survival')
    assert.equal(again.activeId(), p.id)
    assert.throws(() => again.get('nope'), /Profil bulunamadı/)
    assert.throws(() => s.create({ name: '', loader: 'fabric', loaderVersion: 'x' }), /Profil adı/)
    assert.throws(() => s.create({ name: 'x', loader: 'fabric' }), /Loader/)
  })

  await test('corrupt profiles.json falls back to .bak', async () => {
    const env = tmpEnv()
    const s = newStore(env)
    const a = s.create({ name: 'A', loader: 'vanilla', minecraftVersion: '1.21.11' })
    s.update(a.id, { name: 'A2' })
    fs.writeFileSync(path.join(env.appDir, 'profiles.json'), '{broken')
    assert.equal(newStore(env).list().length, 1)
  })

  await test('PROFILE SWITCH: A has Sodium only, B has Iris(+Sodium dep) only', async () => {
    const env = tmpEnv()
    const s = newStore(env)
    const c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    const B = s.create({ name: 'B', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    const ra = await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    assert.equal(ra.success, true)
    const plan = await c.plan(B.id, { projectId: 'YL57xq9U', type: 'mod' })
    assert.deepEqual(plan.dependencies.map(d => d.title), ['Sodium'])
    const needs = await c.install(B.id, { projectId: 'YL57xq9U', type: 'mod' })
    assert.equal(needs.needsConfirmation, true, 'dependencies must be confirmed, not hidden')
    await c.install(B.id, { projectId: 'YL57xq9U', type: 'mod', includeDependencies: true })
    const la = c.list(A.id).mod.map(e => e.title).sort()
    const lb = c.list(B.id).mod.map(e => e.title).sort()
    assert.deepEqual(la, ['Sodium'])
    assert.deepEqual(lb, ['Iris Shaders', 'Sodium'])
    assert.ok(fs.readdirSync(path.join(A.instancePath, 'mods')).every(f => !/iris/i.test(f)))
    assert.equal(s.contentList(B.id, 'mod').find(e => e.title === 'Sodium').dependency, true)
  })

  await test('DUPLICATE: second install is a no-op, concurrent double click downloads once, restart keeps Installed', async () => {
    const env = tmpEnv()
    const s = newStore(env)
    const c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    downloads = 0
    const [r1, r2] = await Promise.all([c.install(A.id, { projectId: 'AANobbMI', type: 'mod' }), c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })])
    assert.equal(downloads, 1)
    assert.equal([r1, r2].filter(r => r.alreadyInstalled).length, 1)
    // "Restart": brand-new store + manager reading from disk.
    const s2 = newStore(env), c2 = new cm.ContentManager({ store: s2 })
    const idx = c2.installedIndex(A.id)
    assert.ok(idx.mod.some(x => x.projectId === 'AANobbMI'))
    const r3 = await c2.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    assert.equal(r3.alreadyInstalled, true)
    assert.equal(downloads, 1)
    assert.equal(fs.readdirSync(path.join(A.instancePath, 'mods')).length, 1)
  })

  await test('UNINSTALL removes file + metadata, then Install works again', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    const entry = c.list(A.id).mod[0]
    await c.uninstall(A.id, { type: 'mod', entryId: entry.id })
    assert.equal(fs.readdirSync(path.join(A.instancePath, 'mods')).length, 0)
    assert.equal(c.installedIndex(A.id).mod.length, 0)
    const again = await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    assert.equal(again.success, true)
    assert.ok(!again.alreadyInstalled)
  })

  await test('disable/enable renames to .disabled and keeps the entry', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    const e = c.list(A.id).mod[0]
    await c.setEnabled(A.id, { type: 'mod', entryId: e.id, enabled: false })
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'mods')), [`${e.filename}.disabled`])
    assert.equal(c.list(A.id).mod[0].enabled, false)
    assert.equal(c.list(A.id).mod[0].id, e.id)
    await c.setEnabled(A.id, { type: 'mod', entryId: e.id, enabled: true })
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'mods')), [e.filename])
  })

  await test('reconcile: deleted file drops entry, manual file appears as local', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    fs.rmSync(path.join(A.instancePath, 'mods', c.list(A.id).mod[0].filename))
    fs.writeFileSync(path.join(A.instancePath, 'mods', 'manual.jar'), 'x')
    const list = c.list(A.id).mod
    assert.deepEqual(list.map(e => [e.filename, e.source]), [['manual.jar', 'local']])
    assert.equal(c.installedIndex(A.id).mod.length, 0)
  })

  await test('RESOURCE PACK → resourcepacks/, SHADER → shaderpacks/ with Iris dependency, never mods/', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await c.install(A.id, { projectId: 'RP000001', type: 'resourcepack' })
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'resourcepacks')), ['faithful-1.0.0.zip'])
    const plan = await c.plan(A.id, { projectId: 'SH000001', type: 'shader' })
    assert.deepEqual(plan.dependencies.map(d => d.title).sort(), ['Iris Shaders', 'Sodium'])
    await c.install(A.id, { projectId: 'SH000001', type: 'shader', includeDependencies: true })
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'shaderpacks')), ['bsl-1.0.0.zip'])
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'mods')).sort(), ['irisshaders-1.0.0.jar', 'sodium-1.0.0.jar'])
  })

  await test('DATA PACK requires a world and installs into saves/<world>/datapacks', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await assert.rejects(c.install(A.id, { projectId: 'DP000001', type: 'datapack' }), /dünya/)
    makeWorld(A.instancePath, 'New World', 'Benim Dünyam')
    await c.install(A.id, { projectId: 'DP000001', type: 'datapack', worldName: 'New World' })
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'saves', 'New World', 'datapacks')), ['terralith-1.0.0.zip'])
    assert.equal(fs.readdirSync(path.join(A.instancePath, 'mods')).length, 0)
    const w = c.worlds(A.id)[0]
    assert.equal(w.name, 'Benim Dünyam')
    assert.equal(w.gameType, 'creative')
    assert.equal(w.datapacks, 1)
    assert.equal(c.list(A.id).datapack[0].worldName, 'New World')
  })

  await test('COMPATIBILITY: Forge-only mod and mods on vanilla are rejected with a reason', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    const V = s.create({ name: 'V', minecraftVersion: '1.21.11', loader: 'vanilla' })
    const p = await c.plan(A.id, { projectId: 'FORGE001', type: 'mod' })
    assert.equal(p.compatible, false)
    assert.match(p.reason, /uyumlu değil/)
    await assert.rejects(c.install(A.id, { projectId: 'FORGE001', type: 'mod' }), /uyumlu değil/)
    const pv = await c.plan(V.id, { projectId: 'AANobbMI', type: 'mod' })
    assert.equal(pv.compatible, false)
  })

  await test('UPLOAD validates archive type and blocks duplicates by hash', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtf-up-'))
    const fabricJar = makeZip(path.join(dir, 'cool.jar'), { 'fabric.mod.json': '{}' })
    const forgeJar = makeZip(path.join(dir, 'forge.jar'), { 'META-INF/mods.toml': '' })
    const rp = makeZip(path.join(dir, 'pack.zip'), { 'pack.mcmeta': '{}', 'assets/x.txt': '' })
    const dp = makeZip(path.join(dir, 'data.zip'), { 'pack.mcmeta': '{}', 'data/x.json': '' })
    const sh = makeZip(path.join(dir, 'shader.zip'), { 'shaders/final.fsh': '' })
    let r = await c.upload(A.id, { type: 'mod', sourcePaths: [fabricJar, forgeJar] })
    assert.equal(r.results[0].success, true)
    assert.match(r.results[1].error, /Forge/)
    r = await c.upload(A.id, { type: 'mod', sourcePaths: [fabricJar] })
    assert.equal(r.results[0].code, 'DUPLICATE')
    r = await c.upload(A.id, { type: 'resourcepack', sourcePaths: [dp] })
    assert.match(r.results[0].error, /data pack/i)
    r = await c.upload(A.id, { type: 'resourcepack', sourcePaths: [rp] })
    assert.equal(r.success, true)
    r = await c.upload(A.id, { type: 'shader', sourcePaths: [rp] })
    assert.equal(r.success, false)
    r = await c.upload(A.id, { type: 'shader', sourcePaths: [sh] })
    assert.equal(r.success, true)
    r = await c.upload(A.id, { type: 'mod', sourcePaths: [rp] })
    assert.match(r.results[0].error, /\.jar/)
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'mods')), ['cool.jar'])
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'resourcepacks')), ['pack.zip'])
    assert.deepEqual(fs.readdirSync(path.join(A.instancePath, 'shaderpacks')), ['shader.zip'])
  })

  await test('UPLOAD recognises an already-installed project by Modrinth hash lookup', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rtf-up-'))
    const renamed = makeZip(path.join(dir, 'sodium-renamed-1.2.jar'), { 'fabric.mod.json': '{"id":"sodium"}' })
    const orig = cm._mr.byHashes
    cm._mr.byHashes = async hashes => Object.fromEntries(hashes.map(h => [h, { id: 'x', project_id: 'AANobbMI', version_number: '1.2' }]))
    const r = await c.upload(A.id, { type: 'mod', sourcePaths: [renamed] })
    cm._mr.byHashes = orig
    assert.equal(r.results[0].code, 'DUPLICATE')
    assert.equal(fs.readdirSync(path.join(A.instancePath, 'mods')).length, 1)
  })

  await test('duplicate/delete profile copies content and removes only its own folder', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    const B = s.create({ name: 'B', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
    await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
    const copy = s.duplicate(A.id)
    assert.notEqual(copy.id, A.id)
    assert.equal(c.list(copy.id).mod[0].projectId, 'AANobbMI')
    s.remove(A.id)
    assert.ok(!fs.existsSync(path.dirname(A.instancePath)))
    assert.ok(fs.existsSync(B.instancePath) && fs.existsSync(copy.instancePath))
    assert.equal(newStore(env).list().length, 2)
  })

  await test('path safety: traversal in files/logs/ids is rejected', async () => {
    const env = tmpEnv()
    const s = newStore(env), c = new cm.ContentManager({ store: s })
    const A = s.create({ name: 'A', minecraftVersion: '1.21.11', loader: 'vanilla' })
    assert.throws(() => c.files(A.id, '../../..'), /Geçersiz yol/)
    assert.throws(() => c.readLog(A.id, '../profiles.json'), /Geçersiz/)
    assert.throws(() => s.instancePath('../x'), /Geçersiz profil/)
    assert.ok(c.files(A.id, '').entries.some(e => e.name === 'mods'))
  })

  await test('required Java per Minecraft version', async () => {
    assert.equal(requiredJava('1.21.11'), 21)
    assert.equal(requiredJava('1.20.4'), 17)
    assert.equal(requiredJava('1.20.5'), 21)
    assert.equal(requiredJava('1.16.5'), 8)
  })

  if (NETWORK) {
    const real = { ...require('../src/lib/content-manager')._mr }
    delete require.cache[require.resolve('../src/lib/net')]
    delete require.cache[require.resolve('../src/lib/content-manager')]
    const realNet = require('../src/lib/net')
    const realCm = require('../src/lib/content-manager')
    await test('NETWORK: real Modrinth plan for Sodium / Iris / Mod Menu on 1.21.11 Fabric', async () => {
      const env = tmpEnv()
      const s = newStore(env), c = new realCm.ContentManager({ store: s })
      const A = s.create({ name: 'Net', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
      const sodium = await c.plan(A.id, { projectId: 'sodium', type: 'mod' })
      assert.equal(sodium.compatible, true, sodium.reason)
      assert.ok(sodium.version.file.url.startsWith('https://cdn.modrinth.com/'))
      const iris = await c.plan(A.id, { projectId: 'iris', type: 'mod' })
      assert.ok(iris.dependencies.some(d => d.title === 'Sodium'), 'Iris should require Sodium')
      const modmenu = await c.plan(A.id, { projectId: 'modmenu', type: 'mod' })
      assert.ok(modmenu.dependencies.some(d => /Fabric API/.test(d.title)), 'Mod Menu should require Fabric API')
    })
    await test('NETWORK: real install of Sodium with hash verification, then duplicate blocked', async () => {
      const env = tmpEnv()
      const s = newStore(env), c = new realCm.ContentManager({ store: s })
      const A = s.create({ name: 'Net', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
      const r = await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
      assert.equal(r.success, true)
      const files = fs.readdirSync(path.join(A.instancePath, 'mods'))
      assert.equal(files.length, 1)
      assert.ok(/sodium/i.test(files[0]), files[0])
      const zip = new AdmZip(path.join(A.instancePath, 'mods', files[0]))
      assert.ok(zip.getEntry('fabric.mod.json'), 'downloaded jar is a real Fabric mod')
      const r2 = await c.install(A.id, { projectId: 'AANobbMI', type: 'mod' })
      assert.equal(r2.alreadyInstalled, true)
    })
    await test('NETWORK: real resource pack / shader (+Iris) / data pack plans resolve correct file types', async () => {
      const env = tmpEnv()
      const s = newStore(env), c = new realCm.ContentManager({ store: s })
      const A = s.create({ name: 'Net', minecraftVersion: '1.21.11', loader: 'fabric', loaderVersion: '0.17.2' })
      const search = async type => (await realNet.getJson(`https://api.modrinth.com/v2/search?limit=5&index=downloads&facets=${encodeURIComponent(JSON.stringify([[`project_type:${type}`], ['versions:1.21.11']]))}`)).hits
      for (const type of ['resourcepack', 'shader', 'datapack']) {
        const hits = await search(type)
        assert.ok(hits.length > 0, `search ${type}`)
        let plan = null
        for (const h of hits) { plan = await c.plan(A.id, { projectId: h.project_id, type }); if (plan.version) break }
        assert.ok(plan.version, `${type}: no compatible version among top hits`)
        assert.ok(plan.version.file.filename.toLowerCase().endsWith('.zip'), `${type} file ${plan.version.file.filename}`)
        if (type === 'shader') assert.ok(plan.dependencies.some(d => /Iris/.test(d.title)), 'shader plan includes Iris')
      }
    })
    void real
  }

  let failed = 0
  for (const [ok, name, err] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
    if (!ok) { failed++; console.log(`      ${err?.stack?.split('\n').slice(0, 4).join('\n      ')}`) }
  }
  console.log(`\n${results.length - failed}/${results.length} passed${NETWORK ? ' (with network)' : ' (offline; add --network for real Modrinth checks)'}`)
  process.exit(failed ? 1 : 0)
})()
