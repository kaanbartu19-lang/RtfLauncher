# RtfLauncher API — Render kurulumu

Bu pakette `server/` klasörü, launcher'ın ortak API'sidir. Launcher'daki kozmetik ve yönetici ayarları artık yerel `config.json` yerine bu ortak API'ye yazılır.

## Render

1. Bu klasörü GitHub'a push et veya mevcut Render kaynağına koy.
2. `render.yaml` içindeki `rtfsmp-server` web servisini deploy et.
3. Render Environment Variables bölümünde `ADMIN_PASSWORD` değerini güçlü bir şifre olarak ayarla. `JWT_SECRET` otomatik oluşturulur.
4. `branding.json` içindeki `apiUrl` değerini Render'ın gerçek servis adresiyle aynı tut.

## Ortak güncelleme davranışı

- Kozmetik ekleme/silme: `POST/DELETE /api/cosmetics` → tüm launcherlar aynı listeyi okur.
- Sunucu ayarları: `PUT /api/config` → tüm launcherlar yaklaşık 15 saniyelik polling ile yeni ayarı alır.
- Launcherlar API'yi cache'siz okur.

### Veri kalıcılığı

API varsayılan olarak `server/data.json` kullanır. Render'ın kalıcı disk özelliği kullanılmıyorsa servis yeniden oluşturulduğunda bu dosyanın kalıcılığı garanti edilmez. Üretimde kalıcı bir veri katmanı eklenmesi önerilir; çalışan servis üzerindeki tüm istemciler ise aynı API verisini görür.

## Microsoft giriş

Launcher, Microsoft hesabının parolasını kendi formuna istemez. Giriş düğmesi ayrı Microsoft OAuth penceresini açar; başarılı girişten sonra Xbox Live → XSTS → Minecraft Services adımlarıyla Java profilini alır ve Minecraft'a bu hesapla giriş yapar.
