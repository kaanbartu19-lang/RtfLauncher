# RtfLauncher v6 — QA Report

## Static QA passed
- Electron main/preload Node syntax checks passed.
- `contextIsolation: true` and `nodeIntegration: false` verified.
- Electron `safeStorage` integration present.
- Modrinth API integration present.
- `skinview3d` dependency present.
- Theme state is now applied through a top-level effect without conditional React hooks.
- Nonexistent `assets/icon.ico` reference was removed from electron-builder config so packaging does not fail solely because of a missing icon file.
- Added `npm run qa` static regression script.
- Mods page was rebuilt around theme variables with a stronger Modrinth-style catalog: search, pagination, icons with fallback, author/download metadata, install state, detail modal, profile import and installed-mod management.
- 3D preview cleanup and error fallback were improved.

## Build limitation in this environment
`npm run build` could not be completed here because the environment does not have the required npm packages available locally and registry installation timed out. An offline install was also attempted and failed because required tarballs were not cached.

Therefore a production Electron installer is **not claimed as tested** in this environment.

## Remaining external/runtime verification
Run on a connected Windows machine:
1. `npm install`
2. `npm run qa`
3. `npm run build`
4. `npm run start`
5. Test Microsoft login, Minecraft launch, Modrinth download, skin upload, cosmetic backend, Render API and NSIS installer.
