# RtfLauncher 8.0.0 — Authentication Contract Consistency Fix

## Root cause

Register and Login already use the same backend contract:
- request fields: `username`, `password`
- storage: the same `db.users` collection in `server/data.json` (or the configured `DATA_FILE`)
- username comparison: case-insensitive
- password verification: scrypt hash + salt

A clean local HTTP test proved:
- fresh Register -> 201
- fresh Login with the same password -> 200
- duplicate Register -> 409
- wrong password -> 401

The observed "account already exists" + "wrong username/password" combination therefore means the backend already contains that username. Registration is rejected and **does not replace its existing password**. Entering a new password in the Register form and then trying that new password on Login must fail because that password was never registered for that existing account.

## Fix

1. Duplicate registration now returns an explicit `code: ACCOUNT_EXISTS`.
2. Renderer detects that real 409 response and switches to Login for the same username instead of leaving the user in an impossible Register -> Login loop.
3. The renderer never treats a duplicate as a successful registration and never bypasses backend authentication.
4. Safe debug logs record only username, HTTP status and backend error code; passwords/tokens are never logged.
5. Legacy server records containing `plainPassword`/`password` are migrated to the existing scrypt hash and those plaintext fields are removed. New registrations never store plaintext passwords.
6. Invalid/malformed password hash records now fail safely instead of throwing from timingSafeEqual.

## Local contract test results

- Fresh Register -> Login: PASS
- Wrong password -> 401: PASS
- Wrong username -> rejected: PASS (covered by the same login path)
- Duplicate Register -> `ACCOUNT_EXISTS`: PASS
- Existing account + new unregistered password -> login rejected: PASS (expected)
- Existing account + its actual registered password -> login succeeds: PASS
- Legacy plaintext record migration -> login succeeds and plaintext is removed: PASS

## Files changed

- `server/server.js`
- `renderer/src/pages/LoginPage.jsx`
- `renderer/src/services/i18n.js`
- `AUTH_CONTRACT_FIX_REPORT.md`

## Not changed

- Electron / electron-builder / electron-updater versions
- `package.json` dependency versions
- Minecraft launch system
- Modrinth
- profiles
- skins / cosmetics
- updater / release workflow
- global `.minecraft`
- ErrorBoundary
- OnboardingPage language-scope fix

## Build environment

`npm ci` could not complete in this environment because package registry access timed out. Therefore `npm run qa` completed its static checks but stopped at the behavioral stage because `adm-zip` was unavailable, and the renderer build failed with `vite: not found`. No installer was produced here.

No Git push, tag, or GitHub Release was performed.
