# RtfTabMarker

Paper sunucusunda RtfLauncher kullanan oyuncuların TAB listesinde adının yanında `◆` işareti gösterir.

## Kurulum
1. `mvn package` çalıştır.
2. `target/rtf-tab-marker-1.0.0.jar` dosyasını sunucunun `plugins` klasörüne koy.
3. `plugins/RtfTabMarker/config.yml` içindeki `api-url` değerini RtfLauncher API adresinle aynı yap.
4. Sunucuyu yeniden başlat.

Launcher, Microsoft hesabıyla Minecraft'a girip oyunu başlatırken UUID'sini ortak API'ye kısa süreli olarak bildirir. Plugin de bu listeyi okuyup TAB işaretini uygular.
