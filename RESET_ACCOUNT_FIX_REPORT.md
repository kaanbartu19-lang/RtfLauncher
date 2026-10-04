# RtfLauncher 8.0.0 — Reset Account Runtime Fix

## ROOT CAUSE
The Settings reset flow performed the destructive reset successfully and then called `window.location.reload()` from the renderer. The reset changed authentication/profile/onboarding state while the currently mounted React tree still belonged to the old authenticated session. In the packaged renderer, a reload after this state transition could leave the BrowserWindow showing only its background when renderer initialization did not recover cleanly. There was also no renderer-level error boundary to turn a post-reset React exception into a visible recovery UI.

The IPC handler itself was already catch-wrapped, but the renderer had no explicit state handoff after success and relied on a full BrowserWindow reload.

## FIX
- `account:reset` now always returns `{ success: true, config }` on success or `{ success: false, error }` on failure.
- The main process explicitly rebuilds a clean launcher session after clearing secure auth/backend tokens and profile-owned data.
- Global `%APPDATA%/.minecraft` is not touched.
- The renderer no longer calls `window.location.reload()` after a successful account reset.
- The reset flow clears the backend token cache with `setToken(null)`.
- A `rtf:account-reset` event hands the clean config to the top-level React App atomically.
- App state immediately transitions to the existing first-run/onboarding entry point.
- First-run-only reset uses the same controlled state transition without a full BrowserWindow reload.
- A lightweight React `ErrorBoundary` was added at the renderer root so a renderer exception shows a recovery UI instead of an unexplained blank background.
- Reset progress uses the existing i18n layer in Turkish and English.

## RESET DATA SCOPE
Cleared:
- secure auth/session storage
- backend token
- `profiles.json`
- profile instance directories
- active user's stored skin + skin metadata
- launcher user/onboarding/personalization state
- active profile selection

Preserved:
- global `%APPDATA%/.minecraft`
- shared Minecraft data outside the launcher-owned profile tree
- release/update infrastructure
- application branding/server configuration keys intentionally preserved by the existing reset design

## FILES CHANGED
- `src/main.js`
- `renderer/src/App.jsx`
- `renderer/src/pages/SettingsPage.jsx`
- `renderer/src/services/i18n.js`
- `renderer/src/main.jsx`
- `renderer/src/components/ErrorBoundary.jsx`

## RELEASE INFRASTRUCTURE
Not changed:
- `.github/workflows/release.yml`
- `electron-builder.yml`
- `electron/updater/updater.js`
- `package.json`
- `package-lock.json`

Package version remains `8.0.0`.

## TEST STATUS
Static syntax/QA checks pass for the reset path and related security/runtime checks.

Full QA cannot complete because `npm ci` cannot reach `registry.npmjs.org` in this environment (`Could not resolve host` / `EAI_AGAIN`). The interrupted install leaves `adm-zip`, Electron, Vite and other packages incomplete, so:
- `npm run qa` stops in behavioral tests at missing `adm-zip`.
- `npm run build` stops at `vite: not found`.
- `npm run dist:win` stops at the same renderer build failure.
- No new Windows installer could be built here.
- No real Windows runtime test could be performed here.

No Git push, Git tag, or GitHub Release was performed.
