# RtfLauncher shared API contract

The launcher expects one shared Render API. All clients must use the same `apiUrl`.

- `GET /api/health` → service health
- `GET /api/config` → `{ "success": true, "config": {} }`
- `PUT /api/config` (admin Bearer token) → updates shared server configuration
- `POST /api/cosmetics` (admin Bearer token) → accepts `{ "name", "type", "imageUrl", "description" }`
- `GET /api/cosmetics` → shared cosmetic catalog
- `DELETE /api/cosmetics/:id` (admin Bearer token) → deletes a shared cosmetic
- `POST /api/auth/register`
- `POST /api/auth/login` → returns a JWT with the user's role
- `GET /api/admin/players` (admin)
- `POST /api/admin/players/:id/ban` and `/unban` (admin)
- `GET /api/stats`

Cosmetic images may be HTTPS URLs or small `data:image/...;base64,...` values. For large production catalogs, use object storage and store HTTPS URLs instead of base64.
