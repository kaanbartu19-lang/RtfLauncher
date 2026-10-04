# RtfLauncher 8.0.0 — First-Use Authentication Flow Fix

## Root cause
The application had only a session gate: `!cfg.user` rendered `LoginPage`. There was no persisted distinction between a fresh/reset account and a previously registered-but-logged-out account. As a result, first launch always entered the login tab.

## Fix
- Added `accountRegistered` launcher state.
- Fresh/reset state: `accountRegistered=false` → `LoginPage initialTab="register"`.
- Registration success persists `accountRegistered=true`.
- Login success persists `accountRegistered=true`.
- Existing installations migrate `accountRegistered` from existing user/onboarding state when the marker is absent.
- Logout leaves `accountRegistered=true`, so logout returns to Login rather than Register.
- Account Reset explicitly sets `accountRegistered=false`, so reset returns to Register.
- Existing onboarding flow is preserved and is only evaluated after authentication registration state is satisfied.
- No new dependencies were added and release/update/Minecraft/auth/profile systems were not rewritten.

## Checks
Static syntax checks: PASS
Auth-state flow simulation: PASS

`npm ci`: FAILED in this environment because npm registry access timed out; offline retry also failed because required tarballs were not cached.

`npm run qa`: FAILED only at the behavioral test stage because `adm-zip` was unavailable after incomplete dependency installation; static checks passed.

`npm run build`: FAILED because `vite` is not installed after incomplete dependency installation.

`npm run dist:win`: FAILED at the same renderer build step.

No installer was produced in this environment.

No Git push, tag push, or GitHub Release was performed.
