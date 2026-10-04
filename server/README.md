# RtfSMP Launcher API

This service is the shared source of truth for launcher cosmetics and server branding/configuration.

## Render environment variables

- `ADMIN_USERNAME` — default `cordezxM`
- `ADMIN_PASSWORD` — **required**; set a strong password in the deployment environment. There is no default: the server refuses to start without it.
- `JWT_SECRET` — **required**; Render can generate this automatically (`generateValue`). The server refuses to start without it, so issued tokens stay valid across restarts.
- `DATA_FILE` — optional; defaults to `server/data.json` (gitignored, holds password hashes — never commit it)
- `RC_MOCK_PURCHASE` — optional; set `1` to enable the test-only mock purchase endpoint. Never enable it in production.

The API intentionally has no external npm dependencies. For persistent data across Render restarts, attach persistent storage or replace `DATA_FILE` with a durable database adapter. While the service is running, all launcher clients read the same API data, so cosmetic/config changes propagate to every client on the next refresh/poll.
