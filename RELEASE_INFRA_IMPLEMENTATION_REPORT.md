# RtfLauncher Release Infrastructure Report

## Repository

`https://github.com/kaanbartu19-lang/RtfLauncher`

## Current application version

`8.0.0` — retained from the existing project. It was not changed blindly to `1.0.0`.

## Implemented

- Dedicated `electron-builder.yml` configuration
- Windows NSIS target
- Per-user installation (`perMachine: false`)
- Start Menu shortcut
- Optional installation directory selection
- Uninstall support without deleting application data
- Versioned installer artifact: `RtfLauncher Setup X.Y.Z.exe`
- GitHub publish provider configured for `kaanbartu19-lang/RtfLauncher`
- `electron-updater` service under `electron/updater/updater.js`
- Secure updater IPC through existing context-isolated preload
- Non-blocking startup update check
- Stable-only updater behavior (`allowPrerelease: false`)
- Real download progress from `electron-updater`
- Update-ready / restart-and-install flow
- Retry and manual GitHub Releases fallback
- Update event logging without credentials/tokens
- Tag/package version validation
- Release artifact validation
- Windows GitHub Actions workflow on `windows-latest`
- Public GitHub Release publishing using the workflow-provided `GITHUB_TOKEN`
- `.gitignore`
- Production README with build/release/update/test instructions
- Renderer version display now comes from Electron `app.getVersion()` over IPC; the old hard-coded `v10.1` label was removed.

## Existing systems preserved

The release work does not rewrite the Minecraft launcher, profile store, authentication flow, Modrinth content system, skins, cosmetics, onboarding, or existing safeStorage architecture.

The existing application data directory was intentionally not migrated during this infrastructure-only change, so an update cannot silently move or delete existing RtfLauncher data.

## Release flow

The workflow intentionally separates artifact validation from publication:

1. tag push
2. Windows runner
3. tag/version validation
4. `npm ci`
5. `npm run qa`
6. Windows NSIS build
7. `latest.yml` + installer validation
8. Electron Builder publishes the validated release
9. GitHub Release verification

No `git push` is performed by this work.

## QA / build truth

### Static release infrastructure checks

Passed:

- JavaScript syntax for updater/main/preload/release scripts
- YAML parsing for `electron-builder.yml` and `.github/workflows/release.yml`
- builder/provider/NSIS configuration checks
- workflow wiring checks
- `v8.0.0` ↔ `package.json` version validation
- existing `scripts/qa-static.js` static checks that do not require installed dependencies

### Full QA

`node scripts/qa-static.js` reaches the existing behavioral test stage but fails in this environment because the extracted project does not have its npm dependencies installed; `adm-zip` is missing. An `npm ci` attempt timed out in this environment.

Therefore this report does **not** claim a full dependency-backed QA pass.

### Production Windows build

Not claimed as passed. A real `npm ci` + Vite build + Electron Builder NSIS build could not be completed in this environment because dependency installation timed out.

### GitHub Release / auto-update runtime

Not claimed as passed. No release was published and no `git push` was performed.

The first real Windows release should be tested on the GitHub Actions Windows runner according to the README release checklist.
