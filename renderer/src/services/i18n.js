import { useEffect, useMemo, useState } from 'react'

const DICT = {
  tr: {
    'nav.home':'Ana Sayfa','nav.profiles':'Profiller','nav.minecraft':'Minecraft','nav.mods':'Modlar','nav.packs':'Paketler','nav.skins':'Skinler','nav.cosmetics':'Kozmetikler','nav.wardrobe':'Gardırop','nav.store':'RC Mağazası','nav.settings':'Ayarlar','nav.admin':'Admin',
    'common.cancel':'Vazgeç','common.save':'Kaydet','common.back':'Geri','common.continue':'Devam','common.close':'Kapat','common.retry':'Tekrar dene','common.loading':'Yükleniyor…','common.login':'Giriş Yap','common.logout':'Çıkış Yap','common.delete':'Sil','common.apply':'Uygula','common.choose':'Seç','common.installed':'Yüklü','common.install':'Yükle',
    'settings.title':'Ayarlar','settings.resetting':'Hesap sıfırlanıyor…','settings.appearance':'Görünüm','settings.language':'Dil','settings.themeHelp':'Temayı istediğin zaman değiştirebilirsin.','settings.dark':'Koyu','settings.light':'Açık','settings.darkSub':'Premium gece görünümü','settings.lightSub':'Temiz gündüz görünümü','settings.account':'Hesap','settings.firstRun':'İlk kurulum','settings.resetHelp':'İlk kurulum seçimlerini tekrar test edebilirsin.','settings.restartOnboarding':'İlk Kurulumu Yeniden Başlat','settings.resetAccount':'Hesabı Sıfırla','settings.resetWarning':'Bu işlem hesabınıza ait ayarları, skin/kozmetik seçimlerini ve oluşturduğunuz profilleri kalıcı olarak sıfırlar.','settings.resetConfirm':'Hesabınıza ait launcher verileri silinecek. Bu işlem geri alınamaz. Devam etmek istiyor musun?',
    'login.welcome':'RtfLauncher\'a hoş geldin','login.username':'KULLANICI ADI','login.password':'ŞİFRE','login.connectMicrosoft':'Microsoft ile Giriş Yap','login.passwordNote':'Microsoft şifren launcher\'a girilmez; resmi Microsoft giriş sayfası açılır.','login.crackedNote':'Offline/Cracked hesabında kullanıcı adı ve gerekiyorsa RtfSMP hesap şifresi kullanılır.','login.register':'Kayıt Ol','login.connect':'Hesabı Bağla','login.accountExists':'Bu hesap zaten mevcut. Mevcut hesabının şifresiyle giriş yap.', 'login.accountCreated':'Hesap oluşturuldu! Giriş yapabilirsin.','login.offline':'Offline / Cracked','login.microsoft':'Microsoft / Original',
    'onboarding.installTitle':'Kurulum','onboarding.preparing':'Hazırlanıyor…','onboarding.clientReady':'RtfSMP Client\'ı hazırla','onboarding.open':'RtfLauncher\'ı Aç','onboarding.start':'Başlayalım','onboarding.confirm':'Onayla ve devam et',
    'skin.title':'Skin','skin.subtitle':'Minecraft skin’ini seç, 3D olarak önizle ve uygula. PNG dosyasını buraya sürükleyip bırakabilirsin.','skin.choose':'Skin seç…','skin.apply':'Skin uygula','skin.remove':'Kayıtlı skini kaldır','skin.preview':'Önizleme','skin.current':'Mevcut skin','skin.none':'Özel skin yok','skin.uploaded':'Skin launcher\'a kaydedildi.','skin.invalid':'Geçersiz Minecraft skin','skin.classic':'Classic (Steve)','skin.slim':'Slim (Alex)',
    'cosmetics.title':'Kozmetikler','cosmetics.subtitle':'Üzerine gelince karakter üzerinde önizle; tıklayınca önizlemeyi sabitle.','cosmetics.preview':'KARAKTER ÖNİZLEMESİ','cosmetics.hover':'Bir kozmetiğin üzerine gel','cosmetics.equipSoon':'Kuşan — yakında',
    'mods.title':'Mod Merkezi','mods.search':'Sodium, Iris, Fabric API, Lithium...','mods.searchButton':'Mod Ara','mods.searching':'Aranıyor','mods.installing':'İndiriliyor…','mods.installed':'✓ Yüklü','mods.notFound':'Sonuç bulunamadı','mods.install':'＋ Yükle',
    'profiles.title':'Profiller','profiles.create':'Profil oluştur','profiles.empty':'Henüz profil yok','profiles.content':'İçerik','profiles.files':'Dosyalar','profiles.worlds':'Dünyalar','profiles.logs':'Loglar','profiles.share':'Paylaş','profiles.loadError':'Profiller yüklenemedi','profiles.retry':'Tekrar dene','profiles.noProfilesText':'Her profil kendi Minecraft sürümüne, loader’ına ve içeriğine sahip ayrı bir instance’tır.','profiles.createFirst':'Profil oluştur','profiles.tabContent':'İçerik','profiles.tabFiles':'Dosyalar','profiles.tabWorlds':'Dünyalar','profiles.tabLogs':'Loglar','profiles.tabShare':'Paylaş','profiles.starting':'Başlatılıyor','profiles.gameOpened':'Minecraft açıldı.','profiles.selectFailed':'Profil seçilemedi.','profiles.profileDeleted':'Profil silindi.','profiles.profileSettingsSaved':'Profil ayarları kaydedildi.','profiles.confirmDeleteTitle':'Profili sil','profiles.confirmDelete':'Bu profil ve tüm instance dosyaları (modlar, dünyalar, ayarlar) kalıcı olarak silinecek.','profiles.confirmDeleteButton':'Profili sil','profiles.createFailed':'Profil oluşturulamadı.',
    'update.download':'Güncellemeyi İndir','update.restart':'Şimdi Yeniden Başlat ve Güncelle','update.later':'Daha Sonra','update.retry':'Tekrar Dene','update.manual':'Manuel İndir','update.error':'Güncelleme başarısız oldu','update.ready':'Güncelleme hazır','update.available':'Yeni sürüm hazır',
  },
  en: {
    'nav.home':'Home','nav.profiles':'Profiles','nav.minecraft':'Minecraft','nav.mods':'Mods','nav.packs':'Packs','nav.skins':'Skins','nav.cosmetics':'Cosmetics','nav.wardrobe':'Wardrobe','nav.store':'RC Store','nav.settings':'Settings','nav.admin':'Admin',
    'common.cancel':'Cancel','common.save':'Save','common.back':'Back','common.continue':'Continue','common.close':'Close','common.retry':'Retry','common.loading':'Loading…','common.login':'Log In','common.logout':'Log Out','common.delete':'Delete','common.apply':'Apply','common.choose':'Choose','common.installed':'Installed','common.install':'Install',
    'settings.title':'Settings','settings.resetting':'Resetting account…','settings.appearance':'Appearance','settings.language':'Language','settings.themeHelp':'You can change the theme any time.','settings.dark':'Dark','settings.light':'Light','settings.darkSub':'Premium night look','settings.lightSub':'Clean daytime look','settings.account':'Account','settings.firstRun':'First setup','settings.resetHelp':'Restart first-run setup without deleting launcher data.','settings.restartOnboarding':'Restart First Setup','settings.resetAccount':'Reset Account','settings.resetWarning':'This permanently resets your account settings, skin/cosmetic selections, and profiles you created.','settings.resetConfirm':'Your launcher account data will be deleted. This cannot be undone. Continue?',
    'login.welcome':'Welcome to RtfLauncher','login.username':'USERNAME','login.password':'PASSWORD','login.connectMicrosoft':'Sign in with Microsoft','login.passwordNote':'Your Microsoft password is never entered into the launcher; the official Microsoft sign-in page is opened.','login.crackedNote':'For an Offline/Cracked account, use the username and, when required, your RtfSMP account password.','login.register':'Register','login.connect':'Connect Account','login.accountExists':'This account already exists. Sign in with its existing password.','login.accountCreated':'Account created! You can sign in.','login.offline':'Offline / Cracked','login.microsoft':'Microsoft / Original',
    'onboarding.installTitle':'Setup','onboarding.preparing':'Preparing…','onboarding.clientReady':'Prepare RtfSMP Client','onboarding.open':'Open RtfLauncher','onboarding.start':'Let\'s start','onboarding.confirm':'Confirm and continue',
    'skin.title':'Skin','skin.subtitle':'Choose, preview and apply your Minecraft skin in 3D. You can drag a PNG here.','skin.choose':'Choose skin…','skin.apply':'Apply skin','skin.remove':'Remove saved skin','skin.preview':'Preview','skin.current':'Current skin','skin.none':'No custom skin','skin.uploaded':'Skin saved to the launcher.','skin.invalid':'Invalid Minecraft skin','skin.classic':'Classic (Steve)','skin.slim':'Slim (Alex)',
    'cosmetics.title':'Cosmetics','cosmetics.subtitle':'Hover to preview a cosmetic on your character; click to pin the preview.','cosmetics.preview':'CHARACTER PREVIEW','cosmetics.hover':'Hover a cosmetic','cosmetics.equipSoon':'Equip — coming soon',
    'mods.title':'Mod Center','mods.search':'Sodium, Iris, Fabric API, Lithium...','mods.searchButton':'Search Mods','mods.searching':'Searching','mods.installing':'Downloading…','mods.installed':'✓ Installed','mods.notFound':'No results','mods.install':'＋ Install',
    'profiles.title':'Profiles','profiles.create':'Create profile','profiles.empty':'No profiles yet','profiles.content':'Content','profiles.files':'Files','profiles.worlds':'Worlds','profiles.logs':'Logs','profiles.share':'Share','profiles.loadError':'Profiles could not be loaded','profiles.retry':'Retry','profiles.noProfilesText':'Each profile has its own Minecraft version, loader and isolated instance.','profiles.createFirst':'Create profile','profiles.tabContent':'Content','profiles.tabFiles':'Files','profiles.tabWorlds':'Worlds','profiles.tabLogs':'Logs','profiles.tabShare':'Share','profiles.starting':'Starting','profiles.gameOpened':'Minecraft opened.','profiles.selectFailed':'Profile could not be selected.','profiles.profileDeleted':'Profile deleted.','profiles.profileSettingsSaved':'Profile settings saved.','profiles.confirmDeleteTitle':'Delete profile','profiles.confirmDelete':'This profile and all of its instance files (mods, worlds and settings) will be permanently deleted.','profiles.confirmDeleteButton':'Delete profile','profiles.createFailed':'Profile could not be created.',
    'update.download':'Download Update','update.restart':'Restart and Update Now','update.later':'Later','update.retry':'Retry','update.manual':'Manual Download','update.error':'Update failed','update.ready':'Update ready','update.available':'New version available',
  }
}

const normalize = value => value === 'en' ? 'en' : 'tr'

export function applyLanguage(language) {
  const lang = normalize(language)
  document.documentElement.dataset.language = lang
  window.dispatchEvent(new CustomEvent('rtf:language', { detail: lang }))
  return lang
}

export function interpolate(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => vars[key] == null ? `{${key}}` : String(vars[key]))
}

export function translate(language, key, vars) {
  const lang = normalize(language)
  const template = DICT[lang][key] ?? DICT.tr[key] ?? key
  return interpolate(template, vars)
}

export function useI18n() {
  const api = window.api || {}
  const [language, setLanguageState] = useState(() => normalize(document.documentElement.dataset.language || 'tr'))

  useEffect(() => {
    let alive = true
    api.loadConfig?.().then(cfg => {
      if (!alive) return
      const lang = applyLanguage(cfg?.language)
      setLanguageState(lang)
    }).catch(() => {})
    const onLang = e => setLanguageState(normalize(e.detail))
    window.addEventListener('rtf:language', onLang)
    return () => { alive = false; window.removeEventListener('rtf:language', onLang) }
  }, [])

  const setLanguage = async lang => {
    const next = applyLanguage(lang)
    setLanguageState(next)
    await api.patchConfig?.({ language: next })
    return next
  }

  const t = useMemo(() => (key, vars) => translate(language, key, vars), [language])
  return { language, t, setLanguage, locale: language === 'en' ? 'en-US' : 'tr-TR' }
}
