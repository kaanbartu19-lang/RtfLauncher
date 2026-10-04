# RtfLauncher

Minecraft launcher for RtfSMP.

## Features

- Electron + React/Vite launcher
- Minecraft profiles and separate instances
- Microsoft and offline account flows
- Modrinth content management
- Skins and cosmetics
- Windows NSIS installer
- GitHub Releases based production updates with `electron-updater`

## Requirements

### Development

- Windows 10/11 recommended for the full launcher workflow
- Node.js 20+
- npm
- Git

### End users

Download the Windows installer from the public GitHub Releases page. A GitHub account is **not** required.

## Download RtfLauncher

[GitHub Releases](https://github.com/kaanbartu19-lang/RtfLauncher/releases)

## Development

```bash
npm ci
npm run dev
```

The renderer runs through Vite while Electron starts the launcher.

## Build

```bash
npm ci
npm run build
```

For the Windows production installer:

```bash
npm run dist:win
```

The Windows artifact is produced in `dist/` as:

```text
RtfLauncher Setup X.Y.Z.exe
```

and the updater metadata is produced as `latest.yml`.

## Release

The production release workflow is tag based.

1. Update `package.json` version to the exact release version.
2. Run QA and the local Windows build.
3. Commit the version change.
4. Create the matching tag, for example:

```bash
git tag v8.0.1
git push origin v8.0.1
```

GitHub Actions then runs on `windows-latest`, installs dependencies with `npm ci`, runs QA, builds the NSIS installer, validates `latest.yml` and lets Electron Builder publish the release using the GitHub-provided token.

**Do not push a tag whose version does not exactly match `package.json`.** The workflow fails before publishing if they differ.

## Auto Update

RtfLauncher uses `electron-updater` with the public GitHub repository:

```text
https://github.com/kaanbartu19-lang/RtfLauncher
```

The renderer never connects directly to GitHub for update control. The Electron main process owns update operations and exposes a minimal IPC API through the isolated preload bridge.

Production startup performs a non-blocking update check. If a stable release is available, RtfLauncher can show the update screen, download the real release artifact with real progress, and restart through `quitAndInstall()`.

Prereleases are excluded from the normal stable update channel.

## Update Test Strategy

Before relying on a public release:

1. Build/install `v8.0.0` (or the current production version).
2. Launch it and confirm the current version.
3. Prepare the next version, for example `v8.0.1`.
4. Build and test the installer locally.
5. Push the matching `v8.0.1` tag.
6. Wait for GitHub Actions to complete.
7. Confirm the release contains the installer and `latest.yml`.
8. Launch the older installed version with internet access.
9. Confirm the update screen appears.
10. Start the download and verify the real progress reaches completion.
11. Restart and verify the new application version.
12. Confirm profiles, accounts, settings, skins and Minecraft data remain available.

For a production-safe test, use two installed versions or a clean Windows test machine/VM so the existing installation can be restored if an installer issue is found.

## Project Structure

```text
RtfLauncher/
├── .github/
│   └── workflows/
│       └── release.yml
├── electron/
│   └── updater/
│       └── updater.js
├── renderer/
├── src/
│   ├── main.js
│   └── preload.js
├── scripts/
├── assets/
├── electron-builder.yml
├── package.json
├── package-lock.json
└── README.md
```

## Security

- Renderer runs with `contextIsolation: true` and `nodeIntegration: false`.
- Update operations are owned by Electron main process.
- GitHub Actions uses the automatically provided `GITHUB_TOKEN`; no token is stored in source code.
- Microsoft/account secrets must not be committed.
- User tokens continue to use the launcher's secure storage flow.
- Update release notes are rendered as text by React rather than injected as arbitrary HTML.

## Troubleshooting

### No update is detected

- Confirm the installed launcher is a packaged production build.
- Confirm a newer **stable** GitHub Release exists.
- Confirm the release contains `latest.yml` and the installer artifacts.
- Confirm the release tag matches `package.json`.
- Check the launcher log for the update event/error.

### GitHub Actions fails on version validation

The tag must match `package.json` exactly:

```text
package.json: 8.0.1
tag:           v8.0.1
```

### Internet is unavailable

The launcher remains usable. Update failure is non-blocking and does not prevent local/offline launcher functionality.

## Release Checklist

- [ ] `package.json` version updated
- [ ] version change committed
- [ ] `npm ci` succeeds
- [ ] `npm run qa` succeeds
- [ ] `npm run build` succeeds
- [ ] Windows installer tested
- [ ] matching `vX.Y.Z` tag created
- [ ] tag pushed after explicit approval
- [ ] GitHub Actions succeeds
- [ ] GitHub Release exists
- [ ] `latest.yml` exists
- [ ] installer exists
- [ ] stable auto-update tested

## Current Production Repository

`https://github.com/kaanbartu19-lang/RtfLauncher`
