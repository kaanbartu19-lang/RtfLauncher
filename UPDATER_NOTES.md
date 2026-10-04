# RtfLauncher — otomatik güncelleme notları

Sistem: GitHub Releases + electron-updater (Windows NSIS). Updater kodu: `electron/updater/updater.js`.
Arayüz: Ayarlar → **Güncellemeler** (`renderer/src/components/UpdatesSection.jsx`) ve açılışta çıkan güncelleme penceresi (`App.jsx`).

## Yeni sürüm yayınlama
1. `package.json` içindeki `version` değerini artır (ör. `8.0.1`).
2. `npm run qa` → hepsi PASS olmalı.
3. Commit + `git tag v8.0.1` + `git push --tags` → `.github/workflows/release.yml` çalışır:
   tag/sürüm kontrolü → QA → build (yayınlamaz) → `validate-artifacts` → yayın → release'te
   `latest.yml`, `RtfLauncher-Setup-8.0.1.exe`, `.exe.blockmap` var mı kontrolü.
4. Release'in **public ve "published" (draft değil)** olduğundan emin ol.

## İlk gerçek güncelleme testi (release gerektirir)
1. `v8.0.0` yayınla, bu sürümü bir bilgisayara kur.
2. `package.json` → `8.0.1`, yukarıdaki adımlarla `v8.0.1` yayınla.
3. Kurulu 8.0.0'da Ayarlar → Güncellemeler → "Güncellemeleri kontrol et" → "Yeni sürüm bulundu: v8.0.1"
   → indir → "Yeniden başlat ve güncelle". Launcher sessizce kurulup kendini yeniden açar.

## Sorun giderme
- Log: `app.getPath('logs')\updater.log` (Windows'ta genelde `%APPDATA%\rtflauncher-v2\logs\`). Token/şifre loglanmaz.
- "Henüz yayınlanmış bir güncelleme yok" → repo'da yayınlanmış (draft olmayan) release yok ya da `latest.yml` eksik.
- İmzasız installer ilk kurulumda Windows SmartScreen uyarısı verebilir (kod imzalama sertifikası gerekir).
- Geliştirme modunda (`npm start`) güncelleme kontrolü bilerek devre dışıdır.
