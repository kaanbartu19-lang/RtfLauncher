import { useEffect, useMemo, useState } from 'react'
import { profilesApi, contentApi } from '../services/profile-api.js'
import CharacterPreview from '../components/CharacterPreview.jsx'
import { detectSkinModel } from '../services/skin.js'
import { useI18n, applyLanguage } from '../services/i18n.js'

const PREPARE_MODS = [
  ['mod', 'sodium', 'Sodium', 'Performans'],
  ['mod', 'lithium', 'Lithium', 'Sunucu/oyun optimizasyonu'],
  ['mod', 'ferrite-core', 'FerriteCore', 'Bellek optimizasyonu'],
  ['mod', 'iris', 'Iris Shaders', 'Shader desteği'],
  ['shader', 'rtfshaders', 'RtfShaders', 'RtfSMP shader paketi'],
]

const STEPS = [
  ['welcome', 'Hoş geldin', 'RtfLauncher’ı birkaç adımda Minecraft ve RtfSMP için hazırlayalım.'],
  ['language', 'Dilini seç', 'Launcher dilini seç. Daha sonra Ayarlar’dan değiştirebilirsin.'],
  ['theme', 'Görünümünü seç', 'Açık veya koyu temayı canlı önizleme ile seç.'],
  ['account', 'Hesabını bağla', 'Microsoft ile giriş yapabilir veya mevcut Offline/Cracked hesabınla devam edebilirsin.'],
  ['minecraft', 'Minecraft kurulumu', 'Sürüm, loader, RAM ve oyun klasörünü seç.'],
  ['performance', 'Performans', 'RtfLauncher ve Minecraft için başlangıç performans ayarını seç.'],
  ['skin', 'Karakterin', 'Skinini seç ve gerçek 3D Minecraft karakterinde önizle.'],
  ['client', 'RtfSMP Client', 'Gerekli performans modları ve Iris otomatik hazırlanacak. Mod seçmen gerekmiyor.'],
  ['summary', 'Her şey hazır', 'Seçimlerini kontrol et ve RtfLauncher’ı hazırlamayı başlat.'],
  ['finish', 'Hazırsın', 'Kurulum tamamlandığında kısa açılış animasyonuyla launcher’a geçeceksin.'],
]

const STEP_TEXT = {
  tr: {
    welcome: ['Hoş geldin', 'RtfLauncher’ı birkaç adımda Minecraft ve RtfSMP için hazırlayalım.'], language: ['Dilini seç', 'Launcher dilini seç. Daha sonra Ayarlar’dan değiştirebilirsin.'], theme: ['Görünümünü seç', 'Açık veya koyu temayı canlı önizleme ile seç.'], account: ['Hesabını bağla', 'Microsoft ile giriş yapabilir veya mevcut Offline/Cracked hesabınla devam edebilirsin.'], minecraft: ['Minecraft kurulumu', 'Sürüm, loader, RAM ve oyun klasörünü seç.'], performance: ['Performans', 'RtfLauncher ve Minecraft için başlangıç performans ayarını seç.'], skin: ['Karakterin', 'Skinini seç ve gerçek 3D Minecraft karakterinde önizle.'], client: ['RtfSMP Client', 'Gerekli performans modları, Iris ve RtfShaders otomatik hazırlanacak.'], summary: ['Her şey hazır', 'Seçimlerini kontrol et ve RtfLauncher’ı hazırlamayı başlat.'], finish: ['Hazırsın', 'Kurulum tamamlandığında kısa açılış animasyonuyla launcher’a geçeceksin.']
  },
  en: {
    welcome: ['Welcome', 'Let’s prepare Minecraft and RtfSMP in a few steps.'], language: ['Choose your language', 'Choose the launcher language. You can change it later in Settings.'], theme: ['Choose your look', 'Pick a light or dark theme with a live preview.'], account: ['Connect your account', 'Sign in with Microsoft or continue with an Offline/Cracked account.'], minecraft: ['Minecraft setup', 'Choose the version, loader and RAM settings.'], performance: ['Performance', 'Choose the initial performance preset for RtfLauncher and Minecraft.'], skin: ['Your character', 'Choose your skin and preview it on a real 3D Minecraft character.'], client: ['RtfSMP Client', 'Required performance mods, Iris and RtfShaders will be prepared automatically.'], summary: ['Everything is ready', 'Review your choices and start preparing RtfLauncher.'], finish: ['You are ready', 'Once setup finishes, a short opening animation will take you to the launcher.']
  }
}
const getStepText = (language, key, index) => (STEP_TEXT[language]?.[key] || STEP_TEXT.tr[key])[index]

function defaultRam() {
  const gb = Math.max(4, Math.min(8, Math.floor((Number(navigator.deviceMemory) || 8) / 2)))
  return gb * 1024
}

export default function OnboardingPage({ initialConfig = {}, onComplete }) {
  const { language, t, setLanguage } = useI18n()
  const [step, setStep] = useState(Number(initialConfig.onboardingStep) || 0)
  const [theme, setTheme] = useState(initialConfig.theme === 'light' ? 'light' : 'dark')
  const [user, setUser] = useState(initialConfig.user || null)
  const [offlineName, setOfflineName] = useState(initialConfig.user?.type === 'cracked' ? initialConfig.user.username : '')
  const [offlinePassword, setOfflinePassword] = useState('')
  const [mcVersion, setMcVersion] = useState(initialConfig.minecraftVersion || '1.21.11')
  const [versions, setVersions] = useState([])
  const [loader, setLoader] = useState(initialConfig.loader || 'fabric')
  const [loaderVersion, setLoaderVersion] = useState(initialConfig.loaderVersion || '')
  const [loaders, setLoaders] = useState([])
  const [ram, setRam] = useState(Number(initialConfig.ram || initialConfig.maxRam) || defaultRam())
  const [performance, setPerformance] = useState(initialConfig.performanceMode || 'balanced')
  const [java, setJava] = useState({ status: 'idle', major: null, path: '' })
  const [skin, setSkin] = useState(initialConfig.onboardingSkin || null)
  const [prep, setPrep] = useState({ status: 'idle', items: {} })
  const [error, setError] = useState('')

  const current = STEPS[step]
  const currentTitle = getStepText(language, current[0], 0)
  const currentDesc = getStepText(language, current[0], 1)
  const progress = Math.round((step / (STEPS.length - 1)) * 100)

  useEffect(() => {
    window.api?.patchConfig?.({ onboardingStep: step, language, theme, minecraftVersion: mcVersion, loader, loaderVersion, ram, performanceMode: performance })
    applyLanguage(language)
  }, [step, language, theme, mcVersion, loader, loaderVersion, ram, performance])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    if (step !== 4) return
    let alive = true
    window.api?.getMinecraftVersions?.().then(r => {
      if (!alive) return
      const list = r?.versions || []
      setVersions(list.length ? list : [mcVersion])
      if (!list.includes(mcVersion) && list[0]) setMcVersion(list[0])
    }).catch(() => setVersions([mcVersion]))
    return () => { alive = false }
  }, [step])

  useEffect(() => {
    if (step !== 4 || loader !== 'fabric') return
    let alive = true
    profilesApi.loaderVersions('fabric', mcVersion).then(r => {
      if (!alive) return
      const list = r?.versions || []
      setLoaders(list)
      const chosen = list.find(v => v.version === loaderVersion) || list.find(v => v.stable) || list[0]
      if (chosen) setLoaderVersion(chosen.version)
    }).catch(() => {})
    return () => { alive = false }
  }, [step, loader, mcVersion])

  useEffect(() => {
    if (step !== 4) return
    let alive = true
    setJava({ status: 'checking', major: null, path: '' })
    window.api?.javaDetect?.(mcVersion, '').then(r => {
      if (!alive) return
      const j = r?.java
      setJava(j?.path ? { status: 'found', major: j.major, path: j.path } : { status: 'missing', major: null, path: '' })
    }).catch(() => alive && setJava({ status: 'missing', major: null, path: '' }))
    return () => { alive = false }
  }, [step, mcVersion])

  async function loginMicrosoft() {
    setError('')
    const r = await window.api?.authMicrosoft?.()
    if (!r?.success) return setError(r?.error || 'Microsoft girişi başarısız.')
    setUser(r.user)
  }

  async function loginOffline() {
    setError('')
    const name = offlineName.trim()
    if (!name) return setError(language === 'en' ? 'Enter an Offline/Cracked username.' : 'Offline/Cracked kullanıcı adı gir.')
    const local = await window.api?.authCracked?.(name)
    if (!local?.success) return setError(local?.error || (language === 'en' ? 'Offline account could not be created.' : 'Offline hesabı oluşturulamadı.'))
    const branding = await window.api?.loadBranding?.() || {}
    if (branding.apiUrl) {
      if (!offlinePassword) return setError(language === 'en' ? 'Enter the RtfSMP account password when server login is enabled.' : 'Sunucu hesabı açıksa RtfSMP hesap şifresini gir.')
      try {
        const res = await fetch(`${String(branding.apiUrl).replace(/\/$/, '')}/api/auth/login`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: name, password: offlinePassword })
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.success) return setError(data.error || (language === 'en' ? 'Account login failed.' : 'Hesap girişi başarısız.'))
        setUser({ ...local.user, token: data.token, role: data.user?.role || 'player', isAdmin: data.user?.role === 'admin' })
        setOfflinePassword('')
        return
      } catch (e) { return setError(language === 'en' ? `Account login failed: ${e.message}` : `Hesap girişi başarısız: ${e.message}`) }
    }
    setUser(local.user)
  }

  async function chooseSkin() {
    setError('')
    const r = await window.api?.pickSkin?.()
    if (r?.cancelled) return
    if (!r?.success) return setError(r?.error || 'Skin seçilemedi.')
    try {
      const model = await detectSkinModel(r.dataUrl)
      setSkin({ dataUrl: r.dataUrl, model, fileName: r.fileName })
    } catch (e) { setError(e.message) }
  }

  async function prepare() {
    if (!user) return setError('Önce bir hesap seç.')
    setError('')
    setPrep({ status: 'running', items: {} })
    try {
      const existing = await profilesApi.list()
      const existingProfile = existing?.profiles?.find(p => p.name === 'Rtf SMP')
      let profileId = existingProfile?.id
      if (!profileId) {
        const created = await profilesApi.create({ name: 'Rtf SMP', minecraftVersion: mcVersion, loader, loaderVersion, memory: ram })
        if (!created?.profile?.id) throw new Error(created?.error || 'Rtf SMP profili oluşturulamadı.')
        profileId = created.profile.id
      } else {
        await profilesApi.update(profileId, { minecraftVersion: mcVersion, loader, loaderVersion, memory: ram })
      }
      await profilesApi.select(profileId)
      setPrep(p => ({ ...p, items: { ...p.items, profile: 'done' } }))

      const failedRequired = []
      for (const [type, projectId, name] of PREPARE_MODS) {
        setPrep(p => ({ ...p, items: { ...p.items, [projectId]: 'running' } }))
        try {
          const r = await contentApi.install({ profileId, projectId, type, includeDependencies: true })
          if (r?.success === false) throw new Error(r.error || `${name} yüklenemedi.`)
          setPrep(p => ({ ...p, items: { ...p.items, [projectId]: 'done' } }))
        } catch (e) {
          failedRequired.push(`${name}: ${e.message}`)
          setPrep(p => ({ ...p, items: { ...p.items, [projectId]: 'error' } }))
        }
      }
      if (failedRequired.length) throw new Error((language === 'en' ? 'Required client content could not be installed: ' : 'Gerekli RtfSMP içerikleri kurulamadı: ') + failedRequired.join(' · '))

      if (skin?.dataUrl && user?.uuid) {
        const r = await window.api?.applySkin?.({ uuid: user.uuid, dataUrl: skin.dataUrl, model: skin.model })
        if (!r?.success) throw new Error(r?.error || 'Skin kaydedilemedi.')
        setPrep(p => ({ ...p, items: { ...p.items, skin: 'done' } }))
      }

      setPrep(p => ({ ...p, status: 'done' }))
    } catch (e) {
      setPrep(p => ({ ...p, status: 'error' }))
      setError(e.message || 'Kurulum hazırlanamadı.')
    }
  }

  const prepDone = prep.status === 'done'
  const summary = useMemo(() => ({
    Hesap: user ? `${user.username} (${user.type === 'microsoft' ? 'Microsoft' : 'Offline'})` : 'Seçilmedi',
    Minecraft: mcVersion,
    Loader: loader === 'fabric' ? `Fabric ${loaderVersion || 'otomatik'}` : 'Vanilla',
    Java: java.status === 'found' ? `Java ${java.major}` : 'Otomatik kontrol',
    RAM: `${Math.round(ram / 1024)} GB`,
    Tema: theme === 'dark' ? 'Koyu' : 'Açık',
    Performans: performance === 'performance' ? 'Performans' : performance === 'visual' ? 'Görsel' : 'Dengeli',
    Skin: skin ? 'Özel skin' : 'Varsayılan',
    Client: 'RtfSMP Client + RtfShaders',
  }), [user, mcVersion, loader, loaderVersion, java, ram, theme, performance, skin])

  async function next() {
    setError('')
    if (step === 3 && !user) return setError(language === 'en' ? 'Sign in with Microsoft or continue with Offline/Cracked.' : 'Microsoft ile giriş yap veya Offline/Cracked olarak devam et.')
    if (step === 4 && loader === 'fabric' && !loaderVersion) return setError(language === 'en' ? 'A Fabric Loader version could not be selected.' : 'Fabric Loader sürümü seçilemedi.')
    if (step === 7 && prep.status !== 'done') return prepare()
    if (step === 8) {
      if (!prepDone) { setStep(7); return }
    }
    if (step < STEPS.length - 1) setStep(step + 1)
    else await onComplete({ theme, language, user, minecraftVersion: mcVersion, loader, loaderVersion, ram, maxRam: ram, performanceMode: performance, onboardingSkin: skin })
  }

  return (
    <div className={`onboarding-v2 ${theme}`}>
      <div className="onboarding-v2-bg" />
      <div className="onboarding-v2-shell">
        <header className="onboarding-v2-top"><div className="onboarding-v2-brand"><img src="./logo.png" alt="RtfLauncher" /><b>RtfLauncher</b></div><small>{step + 1} / {STEPS.length}</small></header>
        <div className="onboarding-v2-progress"><i style={{ width: `${progress}%` }} /></div>
        <main className="onboarding-v2-main">
          <section className="onboarding-v2-copy">
            <div className="onboarding-kicker">{language === 'en' ? 'RTF LAUNCHER · SETUP' : 'RTF LAUNCHER · KURULUM'}</div>
            <h1>{currentTitle}</h1><p>{currentDesc}</p>
            {error && <div className="onboarding-v2-error">{error}</div>}

            {current[0] === 'welcome' && <div className="onboarding-hero-card"><b>{language === 'en' ? 'One setup.' : 'Tek kurulum.'}</b><span>{language === 'en' ? 'Profiles, Minecraft settings, performance and RtfSMP client preparation in one flow.' : 'Profil, Minecraft ayarları, performans sistemi ve RtfSMP client hazırlığı tek akışta.'}</span></div>}

            {current[0] === 'language' && <div className="choice-grid two">
              <button className={language === 'tr' ? 'selected' : ''} onClick={() => setLanguage('tr')}>🇹🇷 <b>Türkçe</b><small>Türkçe arayüz</small></button>
              <button className={language === 'en' ? 'selected' : ''} onClick={() => setLanguage('en')}>🇬🇧 <b>English</b><small>English interface</small></button>
            </div>}

            {current[0] === 'theme' && <div className="choice-grid two">
              <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}><span className="theme-preview dark-preview" /><b>Koyu</b><small>Modern gece görünümü</small></button>
              <button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}><span className="theme-preview light-preview" /><b>Açık</b><small>Temiz gündüz görünümü</small></button>
            </div>}

            {current[0] === 'account' && <div className="account-choice">
              <button className="onboarding-wide-btn" onClick={loginMicrosoft}>{language === 'en' ? 'Sign in with Microsoft' : 'Microsoft ile giriş yap'}</button>
              <div className="account-divider">{language === 'en' ? 'or' : 'veya'}</div>
              <input value={offlineName} onChange={e => setOfflineName(e.target.value)} placeholder={language === 'en' ? 'Offline username' : 'Offline kullanıcı adı'} maxLength={16} />
              <input value={offlinePassword} onChange={e => setOfflinePassword(e.target.value)} type="password" placeholder={language === 'en' ? 'RtfSMP account password (if required)' : 'RtfSMP hesap şifresi (gerekiyorsa)'} autoComplete="off" />
              <button className="onboarding-wide-btn secondary" onClick={loginOffline}>{language === 'en' ? 'Continue as Offline / Cracked' : 'Offline / Cracked olarak devam et'}</button>
              {user && <div className="selected-account">✓ {user.username} · {user.type === 'microsoft' ? 'Microsoft' : 'Offline'}</div>}
            </div>}

            {current[0] === 'minecraft' && <div className="onboarding-form-grid">
              <label>{language === 'en' ? 'Minecraft version' : 'Minecraft sürümü'}<select value={mcVersion} onChange={e => setMcVersion(e.target.value)}>{versions.map(v => <option key={v}>{v}</option>)}</select></label>
              <label>Loader<div className="choice-inline"><button className={loader === 'vanilla' ? 'selected' : ''} onClick={() => setLoader('vanilla')}>Vanilla</button><button className={loader === 'fabric' ? 'selected' : ''} onClick={() => setLoader('fabric')}>Fabric</button></div></label>
              {loader === 'fabric' && <label>{language === 'en' ? 'Fabric Loader' : 'Fabric Loader'}<select value={loaderVersion} onChange={e => setLoaderVersion(e.target.value)}>{loaders.map(v => <option key={v.version} value={v.version}>{v.version}{v.stable ? ' · Recommended' : ''}</option>)}</select></label>}
              <label>RAM<input type="range" min="2048" max="12288" step="512" value={ram} onChange={e => setRam(Number(e.target.value))} /><b>{Math.round(ram / 1024)} GB</b></label>
              <div className="java-status"><b>Java</b><span>{java.status === 'found' ? `✓ Java ${java.major} bulundu` : java.status === 'missing' ? 'Java bulunamadı; Play sırasında gerekli runtime kontrol edilecek.' : 'Java kontrol ediliyor…'}</span></div>
            </div>}

            {current[0] === 'performance' && <div className="choice-grid three">
              {['performance','balanced','visual'].map(v => <button key={v} className={performance === v ? 'selected' : ''} onClick={() => setPerformance(v)}><b>{v === 'performance' ? 'Performans' : v === 'balanced' ? 'Dengeli' : 'Görsel'}</b><small>{v === 'performance' ? 'Daha yüksek FPS' : v === 'balanced' ? 'FPS + görüntü dengesi' : 'Daha yüksek görsel kalite'}</small></button>)}
            </div>}

            {current[0] === 'skin' && <div className="skin-onboarding">
              <div className="skin-onboarding-preview"><CharacterPreview username={user?.username} skinUrl={skin?.dataUrl} model={skin?.model || 'auto-detect'} animation="idle" /></div>
              <div><button className="onboarding-wide-btn" onClick={chooseSkin}>Skin yükle</button><small>PNG · 64×64 {language === 'en' ? 'or' : 'veya'} 64×32 · Slim/Classic otomatik algılanır</small>{skin && <div className="selected-account">✓ {skin.fileName} · {skin.model === 'slim' ? 'Slim' : 'Classic'}</div>}</div>
            </div>}

            {current[0] === 'client' && <div className="prepare-card">
              {PREPARE_MODS.map(([, id, name, note]) => <div className={`prepare-row ${prep.items[id] || 'pending'}`} key={id}><span>{prep.items[id] === 'done' ? '✓' : prep.items[id] === 'error' ? '!' : prep.items[id] === 'running' ? '…' : '○'}</span><div><b>{name}</b><small>{note}</small></div></div>)}
              <div className="prepare-row"><span>{prep.items.profile === 'done' ? '✓' : '○'}</span><div><b>RtfSMP Profile</b><small>Profile instance + klasörler</small></div></div>
              <div className="prepare-row"><span>{prep.items.skin === 'done' ? '✓' : skin ? '○' : '—'}</span><div><b>Skin</b><small>{skin ? 'Profile hazırlanırken kaydedilecek' : 'Atlandı'}</small></div></div>
            </div>}

            {current[0] === 'summary' && <div className="summary-grid">{Object.entries(summary).map(([k,v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>}
            {current[0] === 'finish' && <div className="finish-card"><img className="finish-logo-img" src="./logo.png" alt="RtfLauncher" /><b>{language === 'en' ? 'RtfLauncher is ready.' : 'RtfLauncher hazır.'}</b><span>{language === 'en' ? 'Your setup choices are saved. You can continue to the launcher.' : 'Kurulum seçimlerin kaydedildi. Ana launcher’a geçebilirsin.'}</span></div>}
          </section>

          <aside className="onboarding-v2-side">
            <div className="step-list">{STEPS.map((s, i) => <div key={s[0]} className={i === step ? 'active' : i < step ? 'done' : ''}><i>{i < step ? '✓' : i + 1}</i><span>{getStepText(language, s[0], 0)}</span></div>)}</div>
          </aside>
        </main>
        <footer className="onboarding-v2-actions">
          <button className="secondary" disabled={step === 0 || prep.status === 'running'} onClick={() => setStep(s => Math.max(0, s - 1))}>{language === 'en' ? 'Back' : 'Geri'}</button>
          <button className="primary" disabled={step === 7 && prep.status === 'running'} onClick={next}>{step === 7 ? (prep.status === 'running' ? (language === 'en' ? 'Preparing…' : 'Hazırlanıyor…') : (language === 'en' ? 'Prepare RtfSMP Client' : 'RtfSMP Client’ı hazırla')) : step === 8 ? (language === 'en' ? 'Confirm and continue' : 'Onayla ve devam et') : step === 9 ? (language === 'en' ? 'Open RtfLauncher' : 'RtfLauncher’ı Aç') : step === 0 ? (language === 'en' ? 'Let’s start' : 'Başlayalım') : (language === 'en' ? 'Continue' : 'Devam')}</button>
        </footer>
      </div>
    </div>
  )
}
