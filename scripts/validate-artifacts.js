// Validates the Windows release artifacts electron-updater depends on.
// A release that passes this has: an installer, a blockmap (differential
// updates), and a latest.yml whose version, file name, size and sha512 all
// describe the installer that will actually be uploaded.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const pkg = require('../package.json')

const dist = path.join(__dirname, '..', 'dist')
const installerName = `RtfLauncher Setup ${pkg.version}.exe` // local file name (spaces)
const installer = path.join(dist, installerName)
const blockmap = `${installer}.blockmap`
const latest = path.join(dist, 'latest.yml')

const fail = msg => { console.error(`✗ ${msg}`); process.exit(1) }

for (const file of [installer, blockmap, latest]) {
  if (!fs.existsSync(file)) fail(`Missing required release artifact: ${file}`)
  if (!fs.statSync(file).size) fail(`Empty release artifact: ${file}`)
}

const yml = fs.readFileSync(latest, 'utf8')
const field = (key, text = yml) => (text.match(new RegExp(`^${key}:\\s*['"]?(.+?)['"]?\\s*$`, 'm')) || [])[1]

if (field('version') !== pkg.version) fail(`latest.yml version "${field('version')}" != package.json "${pkg.version}"`)

// GitHub rewrites spaces in uploaded asset names, so the name latest.yml points
// at must already be GitHub-safe. electron-builder uploads the installer under
// that "safe" name (RtfLauncher-Setup-x.y.z.exe), which is what url/path hold.
const url = yml.match(/^\s*-\s*url:\s*(.+)$/m)?.[1]?.trim()
const pathField = field('path')
for (const [label, value] of [['files[0].url', url], ['path', pathField]]) {
  if (!value) fail(`latest.yml has no ${label}`)
  if (!/^[0-9A-Za-z._-]+\.exe$/.test(value)) fail(`latest.yml ${label} "${value}" is not a GitHub-safe .exe name (spaces/special characters would 404 on download)`)
  if (!value.includes(pkg.version)) fail(`latest.yml ${label} "${value}" does not contain version ${pkg.version}`)
}
if (url !== pathField) fail(`latest.yml files[0].url "${url}" != path "${pathField}"`)

// size + sha512 must describe the installer that is on disk.
const data = fs.readFileSync(installer)
const wantSize = Number(yml.match(/^\s+size:\s*(\d+)/m)?.[1])
const wantHash = yml.match(/^\s+sha512:\s*(\S+)/m)?.[1]
if (wantSize !== data.length) fail(`latest.yml size ${wantSize} != installer size ${data.length}`)
if (wantHash !== crypto.createHash('sha512').update(data).digest('base64')) fail('latest.yml sha512 does not match the installer')

// The installer must be an NSIS PE executable (MZ header), not an empty/placeholder file.
if (data.subarray(0, 2).toString('latin1') !== 'MZ') fail('Installer is not a Windows executable (missing MZ header)')

console.log(`✓ Release artifacts validated for ${pkg.version}`)
console.log(`  installer : ${installerName} (${(data.length / 1048576).toFixed(1)} MB)`)
console.log(`  uploads as: ${url} (+ .blockmap, latest.yml)`)
