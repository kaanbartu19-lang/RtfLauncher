import { useEffect, useState } from 'react'
import { apiAuth, setToken } from '../services/api.js'
import { useI18n } from '../services/i18n.js'
import UpdatesSection from '../components/UpdatesSection.jsx'

export default function SettingsPage({ user, branding, setBranding }) {
  const api = window.api || {}
  const { language, setLanguage, t } = useI18n()
  const [theme, setTheme] = useState('dark')
  const [msg, setMsg] = useState('')
  const [serverName, setServerName] = useState(branding?.serverName || '')
  const [serverIp, setServerIp] = useState(branding?.serverIp || '')
  const [version, setVersion] = useState(branding?.version || '')
  const [apiUrl, setApiUrl] = useState(branding?.apiUrl || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.loadConfig?.().then(c => setTheme(c?.theme === 'light' ? 'light' : 'dark'))
  }, [])

  async function changeTheme(v) {
    setTheme(v)
    document.body.classList.toggle('light', v === 'light')
    document.documentElement.dataset.theme = v
    await api.patchConfig?.({ theme: v })
    setMsg(v === 'light' ? (language === 'en' ? 'Light theme selected.' : 'Açık tema seçildi.') : (language === 'en' ? 'Dark theme selected.' : 'Koyu tema seçildi.'))
    setTimeout(() => setMsg(''), 1800)
  }

  async function changeLanguage(v) {
    await setLanguage(v)
    setMsg(v === 'en' ? 'Language changed to English.' : 'Dil Türkçe olarak değiştirildi.')
    setTimeout(() => setMsg(''), 1800)
  }

  async function restartOnboarding(clearAccount = false) {
    if (clearAccount) {
      if (!window.confirm(t('settings.resetWarning'))) return
      if (!window.confirm(t('settings.resetConfirm'))) return
    } else {
      const warning = language === 'en'
        ? 'First-run selections will be reset. Profiles, mods, skins and instance files will remain. Continue?'
        : 'İlk kurulum seçimleri sıfırlanacak. Profiller, modlar, skinler ve instance dosyaları silinmeyecek. Devam etmek istiyor musun?'
      if (!window.confirm(warning)) return
    }
    setBusy(true)
    try {
      if (clearAccount) {
        const r = await api.resetAccount?.()
        if (!r?.success) throw new Error(r?.error || 'Account reset failed.')
        await setToken(null)
        // Do not reload the BrowserWindow. The packaged renderer must remain
        // alive and let App transition atomically to the clean onboarding state.
        window.dispatchEvent(new CustomEvent('rtf:account-reset', { detail: r.config || {} }))
      } else {
        const r = await api.patchConfig?.({ onboarded: false, hasCompletedOnboarding: false, onboardingVersion: 1, onboardingStep: 0 })
        window.dispatchEvent(new CustomEvent('rtf:onboarding-reset', { detail: r?.config || {} }))
      }
    } catch (e) {
      setMsg(e.message || (language === 'en' ? 'Reset failed.' : 'Sıfırlama başarısız oldu.'))
    } finally { setBusy(false) }
  }

  async function save(e) {
    e.preventDefault()
    try {
      const next = { ...branding, serverName, serverIp, version, apiUrl }
      const d = await apiAuth({ apiUrl }, '/api/config', { method: 'PUT', body: JSON.stringify(next) })
      if (!d.success) throw new Error(d.error || 'Kaydetme başarısız')
      await api.saveBranding?.(next)
      setBranding(next)
      setMsg(language === 'en' ? 'Server settings updated for everyone.' : 'Sunucu ayarları herkese güncellendi.')
    } catch (e) { setMsg(e.message) }
  }

  return <div className="page-scroll">
    <div className="page-kicker">{t('settings.title').toUpperCase()}</div><h1>{t('settings.title')}</h1>{msg && <div className="notice">{msg}</div>}
    <section className="settings-card"><h2>{t('settings.language')}</h2><p className="muted">{language === 'en' ? 'The interface updates immediately and is kept after restart.' : 'Arayüz anında değişir ve yeniden açıldığında korunur.'}</p>
      <div className="theme-settings language-settings">
        <button className={language === 'tr' ? 'selected' : ''} onClick={() => changeLanguage('tr')}><b>Türkçe</b><small>RtfLauncher arayüzü</small></button>
        <button className={language === 'en' ? 'selected' : ''} onClick={() => changeLanguage('en')}><b>English</b><small>RtfLauncher interface</small></button>
      </div>
    </section>
    <section className="settings-card"><h2>{t('settings.appearance')}</h2><p className="muted">{t('settings.themeHelp')}</p>
      <div className="theme-settings">
        <button className={theme === 'dark' ? 'selected' : ''} onClick={() => changeTheme('dark')}><span className="theme-preview dark-preview" /><b>{t('settings.dark')}</b><small>{t('settings.darkSub')}</small></button>
        <button className={theme === 'light' ? 'selected' : ''} onClick={() => changeTheme('light')}><span className="theme-preview light-preview" /><b>{t('settings.light')}</b><small>{t('settings.lightSub')}</small></button>
      </div>
    </section>
    <section className="settings-card"><h2>{t('settings.account')}</h2><p className="muted">{user?.username} · {user?.type === 'microsoft' ? 'Microsoft' : (language === 'en' ? 'Offline / Cracked' : 'Yerel / Cracked')}</p></section>
    <UpdatesSection language={language} />
    <section className="settings-card danger-zone"><h2>{t('settings.firstRun')}</h2><p className="muted">{t('settings.resetHelp')}</p>
      <div className="settings-actions-row">
        <button className="btn ghost" disabled={busy} onClick={() => restartOnboarding(false)}>{t('settings.restartOnboarding')}</button>
        <button className="btn danger" disabled={busy} onClick={() => restartOnboarding(true)}>{t('settings.resetAccount')}</button>
      </div>
      <div className="settings-danger-warning">{t('settings.resetWarning')}</div>{busy && <div className="notice">{t('settings.resetting')}</div>}
    </section>
    {user?.isAdmin && <form onSubmit={save} className="settings-card"><h2>{language === 'en' ? 'Server' : 'Sunucu'}</h2><div className="form-grid">
      <label>{language === 'en' ? 'Server name' : 'Sunucu adı'}<input value={serverName} onChange={e => setServerName(e.target.value)} /></label>
      <label>{language === 'en' ? 'Server IP' : 'Sunucu IP'}<input value={serverIp} onChange={e => setServerIp(e.target.value)} /></label>
      <label>{language === 'en' ? 'Minecraft version' : 'Minecraft sürümü'}<input value={version} onChange={e => setVersion(e.target.value)} /></label>
      <label>API URL<input value={apiUrl} onChange={e => setApiUrl(e.target.value)} /></label>
    </div><button className="primary-btn">{language === 'en' ? 'Save and apply for everyone' : 'Kaydet ve herkese uygula'}</button></form>}
  </div>
}
