// Static QA + behavioural tests for the main-process modules.
// This does NOT prove the Electron app, the installer or Minecraft work —
// those must be tested by running the app on Windows.
const fs = require('fs'), path = require('path'), cp = require('child_process')
const root = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const exists = f => fs.existsSync(path.join(root, f))
const walk = (dir, re) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => {
  const rel = path.join(dir, e.name)
  if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'dist' ? [] : walk(rel, re)
  return re.test(e.name) ? [rel] : []
})

const main = read('src/main.js'), preload = read('src/preload.js')
const rendererFiles = walk('renderer/src', /\.(jsx?|css)$/)
const renderer = rendererFiles.map(read).join('\n')
const preview = read('renderer/src/components/CharacterPreview.jsx')
const previewCss = read('renderer/src/components/character-preview.css')

const checks = [
  ['Electron contextIsolation', /contextIsolation:\s*true/.test(main)],
  ['Electron nodeIntegration disabled', /nodeIntegration:\s*false/.test(main)],
  ['Electron sandbox enabled', /sandbox:\s*true/.test(main)],
  ['safeStorage for Minecraft + backend tokens', /safeStorage/.test(main) && /backend\.bin/.test(main)],
  ['config.json never stores tokens', /delete u\.auth; delete u\.token/.test(main)],
  ['config writes are merges (no stale overwrite)', /config:patch/.test(main) && /\.\.\.readConfig\(\), \.\.\.\(cfg/.test(main)],
  ['LoginPage no longer replaces config with { user }', !/saveConfig\?\.\(\{\s*user\s*\}\)/.test(read('renderer/src/pages/LoginPage.jsx'))],
  ['Profiles have a dedicated store (profiles.json)', /profiles\.json/.test(read('src/lib/profile-store.js'))],
  ['Renderer never writes profiles into config', !/modProfiles/.test(renderer)],
  ['Launch takes only a profile ID (no renderer paths/mods)', /profile:launch/.test(main) && !/profileMods/.test(main + renderer)],
  ['Game directory = profile instance (overrides.gameDirectory)', /overrides:\s*\{\s*gameDirectory:\s*gameDir/.test(read('src/lib/game-launcher.js'))],
  ['Server join uses MCLC quickPlay', /quickPlay/.test(read('src/lib/game-launcher.js'))],
  ['Downloads verify status + hash, write .part first', /\.part/.test(read('src/lib/net.js')) && /sha512/.test(read('src/lib/net.js'))],
  ['Profile content downloads limited to Modrinth CDN', /cdn\.modrinth\.com/.test(read('src/lib/content-manager.js'))],
  ['Duplicate prevention by project ID + hash', /installedProject/.test(read('src/lib/content-manager.js')) && /sameHash|e\.sha1 === sha1/.test(read('src/lib/content-manager.js'))],
  ['Per-profile install lock', /withLock/.test(read('src/lib/content-manager.js'))],
  ['Data packs go to saves/<world>/datapacks', /'saves', world/.test(read('src/lib/content-manager.js'))],
  ['Uploads accepted only from native dialog picks', /assertPicked/.test(main)],
  ['Preload subscriptions return unsubscribe', /removeListener/.test(preload)],
  ['Profile rail + detail + tabs present', /rtf-rail/.test(renderer) && /rtf-profile-header/.test(renderer) && /'Share'/.test(renderer)],
  ['Browse content + pagination + view count', /Browse content/.test(renderer) && /Pagination/.test(renderer) && /\[10, 20, 40, 60\]/.test(renderer)],
  ['Install states (+ Install / Installing / Installed / Not compatible)', /Installing…/.test(renderer) && /Installed/.test(renderer) && /Not compatible/.test(renderer)],
  ['Unable to load content + Retry', /Unable to load content/.test(renderer) && /Retry/.test(renderer)],
  ['Remote logos fall back to RtfLauncher icon', /RtfFallbackIcon/.test(renderer) && exists('renderer/public/rtf-fallback.svg')],
  ['No third-party logo used as fallback', !/fallback\s*=\s*['"][^'"]*modrinth-logo/.test(renderer)],
  ['skinview3d: no createOrbitControls import', !/createOrbitControls/.test(renderer)],
  ['3D viewer resized via ResizeObserver + setSize', /ResizeObserver/.test(preview) && /viewer\.setSize\(w, h\)/.test(preview) && /dispose\(\)/.test(preview)],
  ['3D canvas not stretched by CSS width/height', /canvas\s*\{/.test(previewCss) && !/canvas\s*\{[^}]*(width|height)\s*:/.test(previewCss)],
  ['Skin flow: pick → preview → apply (persisted with model)', /skin:apply/.test(main) && /detectSkinModel/.test(renderer) && /model: m/.test(main)],
  ['Skin IPC success contract', /handle\('skin:pick'[\s\S]*success: true/.test(main) && /return \{ success: true, dataUrl: toDataUrl\(data\)/.test(main) && /handle\('skin:load'[\s\S]*success: true/.test(main)],
  ['Account reset IPC + preload', /account:reset/.test(main) && /resetAccount: invoke\('account:reset'\)/.test(preload) && /store\.resetAll\(\)/.test(main)],
  ['Account reset does not delete global .minecraft', (() => { const a = main.indexOf("ipcMain.handle('account:reset'"); const b = main.indexOf("handle('session:backend-token-get'", a); const block = a >= 0 && b > a ? main.slice(a, b) : ''; return Boolean(block) && /writeConfig\(preserved\)/.test(block) && !/MC_DIR/.test(block) })()],
  ['Language state persisted and broadcast', /rtf:language/.test(read('renderer/src/services/i18n.js')) && /patchConfig\?\.\(\{ language: next \}/.test(read('renderer/src/services/i18n.js')) && /useI18n/.test(read('renderer/src/pages/SettingsPage.jsx'))],
  ['Opening animation uses RtfLauncher logo asset', /rtf-opening-logo-img/.test(read('renderer/src/App.jsx')) && /logo\.png/.test(read('renderer/src/App.jsx'))],
  ['RtfShaders prepared as profile shader content', /\['shader', ['"]rtfshaders['"]/.test(read('renderer/src/pages/OnboardingPage.jsx')) && /shader: \{ folder: 'shaderpacks'/.test(read('src/lib/content-manager.js'))],
  ['Shader install auto-prepares Iris dependency', /type === 'shader'[\s\S]*IRIS_PROJECT_ID/.test(read('src/lib/content-manager.js')) && /includeDependencies: true/.test(read('renderer/src/pages/OnboardingPage.jsx'))],
  ['Profile avatars use vector icons', /ProfileAvatar/.test(read('renderer/src/features/profiles/ui.jsx')) && /rtf-avatar\.glyph\.vector/.test(read('renderer/src/features/profiles/profiles.css'))],
  ['Mod modal is vertically scrollable', /\.mod-modal\{[^}]*overflow-y:auto/.test(read('renderer/src/index.css')) && /\.mod-modal-backdrop\{[^}]*overflow:auto/.test(read('renderer/src/index.css'))],
  ['Cosmetics page remains inside scrollable page container', /page-scroll/.test(read('renderer/src/pages/CosmeticsPage.jsx')) && /\.wardrobe-preview\{[^}]*overflow:visible/.test(read('renderer/src/index.css'))],
  ['Backend errors mapped by status (401/403/404/409/422/429/5xx)', ['401', '403', '404', '409', '422', '429'].every(s => new RegExp(`case ${s}`).test(read('renderer/src/services/api.js')))],
  ['Server: 403 for non-admin, 401 for missing session', /send\(res, 403/.test(read('server/server.js'))],
  ['No fake cosmetic equip state', !/equippedCosmeticId/.test(renderer)],
  ['Mock RC purchase only in dev builds', /import\.meta\.env\.DEV\?<button onClick=\{\(\)=>buy/.test(read('renderer/src/pages/StorePage.jsx'))],
  // ── Release / auto-update wiring ───────────────────────────────────────────
  ['Updater: version is valid semver and USER_AGENT follows package.json (no hard-coded copy)', /^\d+\.\d+\.\d+$/.test(JSON.parse(read('package.json')).version) && !/RtfLauncher\/\d+\.\d+\.\d+/.test(read('src/lib/net.js')) && /package\.json/.test(read('src/lib/net.js'))],
  ['Updater: electron-updater is a runtime dependency (bundled into the app), electron-builder a dev dependency', (() => { const p = JSON.parse(read('package.json')); return Boolean(p.dependencies?.['electron-updater']) && Boolean(p.devDependencies?.['electron-builder']) && Boolean(p.devDependencies?.electron) })()],
  ['Updater: electron-builder publishes to GitHub with the same owner/repo the app links to', (() => { const y = read('electron-builder.yml'), u = read('electron/updater/updater.js'); const g = k => (y.match(new RegExp(`^\\s+${k}:\\s*(\\S+)`, 'm')) || [])[1]; return /provider:\s*github/.test(y) && g('owner') && g('repo') && new RegExp(`OWNER = '${g('owner')}'`).test(u) && new RegExp(`REPO = '${g('repo')}'`).test(u) })()],
  ['Updater: NSIS target and updater code are packaged (electron/**, installer is not one-click)', /electron\/\*\*/.test(read('electron-builder.yml')) && /target:\s*[\s\S]*nsis/.test(read('electron-builder.yml')) && /oneClick:\s*false/.test(read('electron-builder.yml'))],
  ['Updater IPC: state/check/download/cancel/install/releases-url handled in main and exposed in preload', ['updates:state', 'updates:check', 'updates:download', 'updates:cancel', 'updates:install', 'updates:releases-url'].every(ch => main.includes(`'${ch}'`)) && ['getUpdateState', 'checkForUpdates', 'downloadUpdate', 'cancelUpdateDownload', 'installUpdate', 'getReleasesUrl', 'onUpdateStatus'].every(k => preload.includes(k))],
  ['Updater: only runs when packaged, never auto-downloads, never installs on its own', /app\.isPackaged/.test(read('electron/updater/updater.js')) && /autoDownload = false/.test(read('electron/updater/updater.js')) && /autoInstallOnAppQuit = false/.test(read('electron/updater/updater.js'))],
  ['Settings: "Güncellemeler" section calls the real updater IPC (no mock)', (() => { const s = read('renderer/src/components/UpdatesSection.jsx'); return /checkForUpdates/.test(s) && /downloadUpdate/.test(s) && /installUpdate/.test(s) && /onUpdateStatus/.test(s) && /UpdatesSection/.test(read('renderer/src/pages/SettingsPage.jsx')) })()],
]

let bad = 0
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) bad++ }

for (const f of [...walk('src', /\.js$/), ...walk('electron', /\.js$/), 'server/server.js', ...walk('tests', /\.js$/), 'scripts/qa-static.js']) {
  try { cp.execFileSync(process.execPath, ['--check', path.join(root, f)], { stdio: 'pipe' }); console.log(`PASS  syntax ${f.split(path.sep).join('/')}`) }
  catch (e) { console.log(`FAIL  syntax ${f}\n${e.stderr}`); bad++ }
}

console.log('\n── Behavioural tests (tests/main-modules.test.js) ──')
try {
  const args = [path.join(root, 'tests/main-modules.test.js'), ...(process.argv.includes('--network') ? ['--network'] : [])]
  process.stdout.write(cp.execFileSync(process.execPath, args, { stdio: 'pipe', encoding: 'utf8', env: process.env }))
} catch (e) { process.stdout.write(String(e.stdout || '')); process.stdout.write(String(e.stderr || '')); bad++ }

console.log('\n── Behavioural tests (tests/updater.test.js) ──')
try { process.stdout.write(cp.execFileSync(process.execPath, [path.join(root, 'tests/updater.test.js')], { stdio: 'pipe', encoding: 'utf8', env: process.env })) }
catch (e) { process.stdout.write(String(e.stdout || '')); process.stdout.write(String(e.stderr || '')); bad++ }

if (bad) { console.error(`\nQA failed: ${bad}`); process.exit(1) }
console.log('\nStatic QA + module tests passed. This is not a runtime/installer test.')
