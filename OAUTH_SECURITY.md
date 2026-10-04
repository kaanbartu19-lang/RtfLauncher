# Microsoft and Modrinth account security

Never ask for, store, or transmit a Microsoft/Minecraft password in the
launcher. A secure account connection must use the provider's browser-based
OAuth flow: the launcher opens the official Microsoft or Modrinth sign-in page,
and only the Render API receives the authorization callback.

To add this feature, create a Microsoft Entra application and a Modrinth OAuth
application. Keep each client secret only in Render environment variables (never
in `branding.json`, the Electron renderer, or a Git repository). The Render API
then needs callback endpoints, encrypted refresh-token storage, token revocation,
and an explicit account-disconnect action.

Modrinth's public API does not expose the installed profiles from a player's
local Modrinth App. With OAuth it can expose only data the player explicitly
authorizes (such as their account and public/private Modrinth resources). Local
profiles should continue to be imported as `.mrpack` files or Modrinth modpack
links.
