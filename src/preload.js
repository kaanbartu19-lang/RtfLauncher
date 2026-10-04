const { contextBridge, ipcRenderer } = require('electron')

// Subscriptions return an unsubscribe function so components can clean up.
const on = channel => cb => {
  const listener = (_, d) => cb(d)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('api', {
  // Window
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close:    () => ipcRenderer.send('win:close'),
  openExternal: invoke('external:open'),

  // Auth
  authCracked:  invoke('auth:cracked'),
  authMicrosoft: invoke('auth:microsoft'),
  authSecureSave: invoke('auth:secure-save'),
  authSecureLoad: invoke('auth:secure-load'),
  authSecureClear: invoke('auth:secure-clear'),
  resetAccount: invoke('account:reset'),
  getBackendToken: invoke('session:backend-token-get'),
  setBackendToken: invoke('session:backend-token-set'),
  registerPresence: invoke('presence:register'),
  presenceRegister: invoke('presence:register'),
  listModrinthInstances: invoke('modrinth:instances'),
  importModrinthInstance: invoke('modrinth:import-instance'),

  // Minecraft (legacy global Play page)
  launch:     invoke('mc:launch'),
  onProgress: on('mc:progress'),
  onLog:      on('mc:log'),
  onClosed:   on('mc:closed'),

  // Config
  loadConfig: invoke('config:load'),
  saveConfig: invoke('config:save'),
  patchConfig: invoke('config:patch'),

  // Profiles
  profilesList: invoke('profiles:list'),
  profilesCreate: invoke('profiles:create'),
  profilesUpdate: invoke('profiles:update'),
  profilesDelete: invoke('profiles:delete'),
  profilesDuplicate: invoke('profiles:duplicate'),
  profilesSelect: invoke('profiles:select'),
  profilesOpenFolder: invoke('profiles:open-folder'),
  profilesPickIcon: invoke('profiles:pick-icon'),
  profilesExport: invoke('profiles:export'),
  profileLaunch: invoke('profile:launch'),
  profileLaunchStatus: invoke('profile:launch-status'),
  profileStop: invoke('profile:stop'),
  onLaunchState: on('profile:launch-state'),
  profileWorlds: invoke('profile:worlds'),
  profileFiles: invoke('profile:files'),
  profileLogs: invoke('profile:logs'),
  profileReadLog: invoke('profile:read-log'),
  getProfilePath: invoke('profile:path'),
  openProfileFolder: invoke('profile:open-folder'),
  javaDetect: invoke('java:detect'),
  javaPick: invoke('java:pick'),

  // Profile content
  contentList: invoke('content:list'),
  contentInstalledIndex: invoke('content:installed-index'),
  contentPlan: invoke('content:plan'),
  contentInstall: invoke('content:install'),
  contentUninstall: invoke('content:uninstall'),
  contentSetEnabled: invoke('content:set-enabled'),
  contentPick: invoke('content:pick'),
  contentUpload: invoke('content:upload'),
  onContentProgress: on('content:progress'),
  onContentChanged: on('content:changed'),

  // Branding
  loadBranding: invoke('branding:load'),
  saveBranding: invoke('branding:save'),

  // Global mods (Mod Merkezi)
  listMods:    invoke('mods:list'),
  deleteMod:   invoke('mods:delete'),
  downloadMod: invoke('mods:download'),
  importModpack: invoke('modpack:import'),
  pickModpackFile: invoke('modpack:pick-file'),
  onDlProgress: on('dl:progress'),
  listPacks: invoke('packs:list'),
  deletePack: invoke('packs:delete'),
  downloadPack: invoke('packs:download'),

  // Skin
  pickSkin: invoke('skin:pick'),
  applySkin: invoke('skin:apply'),
  saveSkin: invoke('skin:save'),
  loadSkin: invoke('skin:load'),
  clearSkin: invoke('skin:clear'),
  uploadSkinToAccount: invoke('skin:upload-account'),

  // Application / updates
  getAppVersion: invoke('app:version'),
  getUpdateState: invoke('updates:state'),
  checkForUpdates: invoke('updates:check'),
  downloadUpdate: invoke('updates:download'),
  installUpdate: invoke('updates:install'),
  cancelUpdateDownload: invoke('updates:cancel'),
  getReleasesUrl: invoke('updates:releases-url'),
  onUpdateStatus: on('updates:status'),

  // Versions
  getFabricVersions: invoke('fabric:versions'),
  getLoaderVersions: invoke('loader:versions'),
  verifyMinecraftVersion: invoke('minecraft:verify-version'),
  getMinecraftVersions: invoke('minecraft:versions'),
})
