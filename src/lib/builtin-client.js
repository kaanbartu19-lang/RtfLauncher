// Launcher-managed RTF markers.
// The current standalone runtime is NOT installed as a normal mod.
// Legacy filenames are still hidden so an older installation cannot leak a
// stale RTF/Fabric artifact into the Mods UI.
const path = require('path')

const BUILTIN_CLIENT_FILENAME = 'rtfclient-builtin.jar'
const STANDALONE_CLIENT_FILENAME = 'rtf-client-standalone.jar'
const LEGACY_FABRIC_API_PREFIX = 'fabric-api-'

function isBuiltinClientFilename(filename) {
  const name = path.basename(String(filename || '')).toLowerCase()
  return name === BUILTIN_CLIENT_FILENAME || name === STANDALONE_CLIENT_FILENAME
}

function isBuiltinClientEntry(entry) {
  return !!entry && (entry.builtin === 'rtf-client' || isBuiltinClientFilename(entry.filename))
}

function isBuiltinDependencyFilename(filename) {
  const name = path.basename(String(filename || '')).toLowerCase()
  return name.startsWith(LEGACY_FABRIC_API_PREFIX) && name.endsWith('.jar')
}

function isBuiltinManagedFilename(filename) {
  return isBuiltinClientFilename(filename) || isBuiltinDependencyFilename(filename)
}

module.exports = {
  BUILTIN_CLIENT_FILENAME,
  STANDALONE_CLIENT_FILENAME,
  isBuiltinClientFilename,
  isBuiltinClientEntry,
  isBuiltinDependencyFilename,
  isBuiltinManagedFilename,
}
