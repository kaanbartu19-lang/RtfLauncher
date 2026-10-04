const fs = require('fs')
const path = require('path')

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
const raw = process.argv[2] || process.env.GITHUB_REF_NAME || ''
const tag = raw.trim()
const expected = `v${pkg.version}`

if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  console.error(`Invalid release tag: ${tag || '(empty)'}. Expected vX.Y.Z.`)
  process.exit(1)
}
if (tag !== expected) {
  console.error(`Version mismatch: package.json=${pkg.version}, tag=${tag}. Expected ${expected}.`)
  process.exit(1)
}
if (pkg.version.includes('+')) {
  console.error('Build metadata (+...) is not allowed in release versions.')
  process.exit(1)
}
console.log(`Release version validated: ${pkg.version} == ${tag}`)
