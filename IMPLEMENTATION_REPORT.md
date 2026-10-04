# RtfLauncher embedded-client implementation

Implemented from the supplied specification:

- Embedded `assets/client/client.zip` with a client manifest.
- Versioned extracted client cache under `%LOCALAPPDATA%/RtfLauncher/clients/rtf-client/1.10.0` (APPDATA fallback).
- SHA-256 integrity tracking and automatic re-extraction on mismatch/missing runtime.
- Safe ZIP extraction with path-traversal protection.
- Separate Vanilla/Fabric profile loader model; legacy `rtf`/other loader values normalize to Vanilla.
- Vanilla launch path uses the launcher-managed RTF standalone Java agent; Fabric loader preparation remains separate.
- Renderer loader picker exposes only Vanilla and Fabric.
- Standalone runtime build explicitly embeds the Sponge Mixin JAR under `META-INF/jars/` and verifies it.
- Standalone Java agent now fails fast instead of silently continuing when bootstrap fails.

Not claimed PASS without a real Windows Minecraft launch: graphical smoke test, Microsoft auth, exact Fabric launch, and packaged installer launch.


## Build script fix
The one-click build now installs root and renderer dependencies before Vite/Electron build and runs static QA before packaging. Runtime/Windows Minecraft launch remains unverified until tested on the user machine.
