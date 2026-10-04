// Thin wrappers over the preload bridge. Every call resolves to
// { success, error?, code?, ... } — callers use `unwrap` to turn failures into
// thrown errors with the real message from the main process.
const api = () => window.api || {}

export function unwrap(r, fallback = 'İşlem başarısız.') {
  if (r?.success) return r
  if (r?.cancelled) return null
  const e = new Error(r?.error || fallback)
  e.code = r?.code || null
  throw e
}

const call = (name, ...args) => {
  const fn = api()[name]
  if (!fn) return Promise.resolve({ success: false, error: 'Launcher köprüsü bulunamadı (Electron dışında mı çalışıyor?).' })
  return fn(...args)
}

export const profilesApi = {
  list: () => call('profilesList'),
  create: input => call('profilesCreate', input),
  update: (id, patch) => call('profilesUpdate', { id, patch }),
  remove: id => call('profilesDelete', id),
  duplicate: id => call('profilesDuplicate', id),
  select: id => call('profilesSelect', id),
  openFolder: (id, rel = '') => call('profilesOpenFolder', { id, rel }),
  pickIcon: () => call('profilesPickIcon'),
  exportZip: id => call('profilesExport', id),
  launch: args => call('profileLaunch', args),
  launchStatus: () => call('profileLaunchStatus'),
  stop: id => call('profileStop', id),
  worlds: id => call('profileWorlds', id),
  files: (profileId, rel) => call('profileFiles', { profileId, rel }),
  logs: id => call('profileLogs', id),
  readLog: (profileId, rel) => call('profileReadLog', { profileId, rel }),
  javaDetect: (mcVersion, javaPath) => call('javaDetect', { mcVersion, javaPath }),
  javaPick: () => call('javaPick'),
  loaderVersions: (loader, mcVersion) => call('getLoaderVersions', { loader, mcVersion }),
  minecraftVersions: () => call('getMinecraftVersions'),
}

export const contentApi = {
  list: id => call('contentList', id),
  plan: args => call('contentPlan', args),
  install: args => call('contentInstall', args),
  uninstall: args => call('contentUninstall', args),
  setEnabled: args => call('contentSetEnabled', args),
  pick: type => call('contentPick', { type }),
  upload: args => call('contentUpload', args),
}

export const events = {
  onLaunchState: cb => api().onLaunchState?.(cb) || (() => {}),
  onContentProgress: cb => api().onContentProgress?.(cb) || (() => {}),
  onContentChanged: cb => api().onContentChanged?.(cb) || (() => {}),
  onLog: cb => api().onLog?.(cb) || (() => {}),
}

export const openExternal = url => api().openExternal?.(url)
