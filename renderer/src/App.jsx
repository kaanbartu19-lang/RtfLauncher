import { useEffect, useState } from 'react'
import LoginPage from './pages/LoginPage.jsx'
import MainLayout from './pages/MainLayout.jsx'
import OnboardingPage from './pages/OnboardingPage.jsx'
import { setToken } from './services/api.js'
import { applyLanguage, translate } from './services/i18n.js'

export default function App() {
  const api = window.api || {}
  const [cfg, setCfg] = useState({})
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  const [update, setUpdate] = useState(null)
  const [updateBusy, setUpdateBusy] = useState(false)

  useEffect(() => {
    api.loadConfig?.().then(async c => {
      const next = c || {}
      if (next.user && !next.user.auth) {
        const sec = await api.authSecureLoad?.()
        if (sec?.success && sec.auth) next.user = { ...next.user, auth: sec.auth }
      }
      // Existing authenticated users are necessarily past the registration gate.
      // Fresh/reset configs intentionally keep this marker false/absent.
      if (next.accountRegistered == null) next.accountRegistered = Boolean(next.user || next.hasCompletedOnboarding || next.onboarded)
      if (next.accountRegistered == null) next.accountRegistered = false
      applyLanguage(next.language || 'tr')
      setCfg(next)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const theme = cfg.theme === 'light' ? 'light' : 'dark'
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.body.classList.toggle('light', theme === 'light')
  }, [theme])

  useEffect(() => {
    const onAccountReset = event => {
      const clean = event?.detail || {}
      setOpening(false)
      setUpdate(null)
      setCfg(prev => ({ ...prev, ...clean, user: null, accountRegistered: false, hasCompletedOnboarding: false, onboarded: false, onboardingStep: 0 }))
    }
    const onOnboardingReset = event => {
      const clean = event?.detail || {}
      setOpening(false)
      setCfg(prev => ({ ...prev, ...clean, user: prev.user || null, hasCompletedOnboarding: false, onboarded: false, onboardingStep: 0 }))
    }
    window.addEventListener('rtf:account-reset', onAccountReset)
    window.addEventListener('rtf:onboarding-reset', onOnboardingReset)
    return () => {
      window.removeEventListener('rtf:account-reset', onAccountReset)
      window.removeEventListener('rtf:onboarding-reset', onOnboardingReset)
    }
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      try { const state = await api.getUpdateState?.(); if (alive && state) setUpdate(state) } catch {}
    }
    load()
    const off = api.onUpdateStatus?.(state => { if (alive) setUpdate(state) })
    return () => { alive = false; try { off?.() } catch {} }
  }, [])

  const startUpdateDownload = async () => {
    setUpdateBusy(true)
    try { await api.downloadUpdate?.() } finally { setUpdateBusy(false) }
  }

  const installUpdate = async () => {
    setUpdateBusy(true)
    try { await api.installUpdate?.() } catch {}
  }

  if (loading) return <div className="app-loading"><div className="spinner" /><b>RtfLauncher yükleniyor...</b></div>

  const finishOnboarding = async data => {
    const nextData = { ...(data || {}), hasCompletedOnboarding: true, onboarded: true }
    const onboardUser = nextData.user
    delete nextData.user
    if (onboardUser) {
      const safeUser = { ...onboardUser }
      delete safeUser.auth
      delete safeUser.token
      await api.authSecureSave?.(onboardUser.auth || {})
      await setToken(onboardUser.token || null)
      nextData.user = safeUser
    }
    const r = await api.patchConfig?.(nextData)
    const merged = { ...cfg, ...nextData, ...(r?.config || {}) }
    if (onboardUser) merged.user = onboardUser
    setCfg(merged)
    setOpening(true)
    window.setTimeout(() => setOpening(false), 1500)
  }

  const login = async u => {
    const safeUser = { ...u }
    delete safeUser.auth
    delete safeUser.token
    await api.authSecureSave?.(u.auth || {})
    await setToken(u.token || null)
    const r = await api.patchConfig?.({ user: safeUser, accountRegistered: true })
    setCfg({ ...(r?.config || cfg), user: u, accountRegistered: true })
  }

  const logout = async () => {
    await api.authSecureClear?.()
    await setToken(null)
    const r = await api.patchConfig?.({ user: null })
    const next = r?.config || { ...cfg }
    delete next.user
    setCfg(next)
  }

  if (!cfg.accountRegistered && !cfg.user) {
    return <div className={`app-shell ${theme}`}><LoginPage initialTab="register" onLogin={login} />{update && <UpdateOverlay update={update} busy={updateBusy} onDownload={startUpdateDownload} onInstall={installUpdate} onDismiss={() => setUpdate(s => s ? { ...s, status: 'idle', dismissed: true } : s)} />}</div>
  }

  if (!cfg.hasCompletedOnboarding && !cfg.onboarded) {
    return <OnboardingPage initialConfig={cfg} onComplete={finishOnboarding} />
  }

  if (opening) {
    return <div className="rtf-opening-screen"><img className="rtf-opening-logo-img" src="./logo.png" alt="RtfLauncher" /><div className="rtf-opening-name">RtfLauncher</div></div>
  }

  if (!cfg.user) return <div className={`app-shell ${theme}`}><LoginPage initialTab="login" onLogin={login} />{update && <UpdateOverlay update={update} busy={updateBusy} onDownload={startUpdateDownload} onInstall={installUpdate} onDismiss={() => setUpdate(s => s ? { ...s, status: 'idle', dismissed: true } : s)} />}</div>
  return <div className={`app-shell ${theme}`}><MainLayout user={cfg.user} onLogout={logout} initialTheme={theme} />{update && <UpdateOverlay update={update} busy={updateBusy} onDownload={startUpdateDownload} onInstall={installUpdate} onDismiss={() => setUpdate(s => s ? { ...s, status: 'idle', dismissed: true } : s)} />}</div>
}

function UpdateOverlay({ update, busy, onDownload, onInstall, onDismiss }) {
  const language = document.documentElement.dataset.language === 'en' ? 'en' : 'tr'
  const tr = (key, fallback) => translate(language, key) || fallback
  const status = update.status
  if (update.dismissed || update.cancelled || !['available', 'downloading', 'downloaded'].includes(status) && !(status === 'error' && update.interactive && update.stage !== 'check')) return null
  const current = update.currentVersion || '—'
  const target = update.version || '—'
  const pct = Math.max(0, Math.min(100, Number(update.percent) || 0))
  const mb = n => Number(n) > 0 ? `${(Number(n) / 1024 / 1024).toFixed(1)} MB` : '—'
  const speed = Number(update.bytesPerSecond) > 0 ? `${(Number(update.bytesPerSecond) / 1024 / 1024).toFixed(1)} MB/s` : ''
  return <div className="rtf-update-backdrop">
    <section className="rtf-update-card" role="dialog" aria-modal="true" aria-labelledby="rtf-update-title">
      <div className="rtf-update-badge">RTF LAUNCHER</div>
      <h2 id="rtf-update-title">{status === 'error' ? tr('update.error', 'Güncelleme başarısız oldu') : status === 'downloaded' ? tr('update.ready', 'Güncelleme hazır') : tr('update.available', 'Yeni sürüm hazır')}</h2>
      <div className="rtf-update-version">v{current} <span>→</span> <b>v{target}</b></div>
      {status === 'available' && <><h3>{language === 'en' ? 'What is new?' : 'Yeni sürümde neler var?'}</h3><div className="rtf-update-notes">{update.releaseNotes || 'Bu sürüm için yayın notu bulunmuyor.'}</div><button className="primary-btn" onClick={onDownload} disabled={busy}>{tr('update.download', 'Güncellemeyi İndir')}</button></>}
      {status === 'downloading' && <><div className="rtf-update-download-row"><b>{language === 'en' ? 'Downloading update…' : 'Güncelleme indiriliyor…'}</b><strong>{pct.toFixed(1)}%</strong></div><div className="rtf-update-progress"><i style={{ width: `${pct}%` }} /></div><div className="rtf-update-meta">{mb(update.transferred)} / {mb(update.total)} {speed && ` · ${speed}`}</div></>}
      {status === 'downloaded' && <><div className="rtf-update-notes">İndirme tamamlandı. RtfLauncher yeniden başlatılarak güncellenecek.</div><button className="primary-btn" onClick={onInstall} disabled={busy}>{tr('update.restart', 'Şimdi Yeniden Başlat ve Güncelle')}</button></>}
      {status === 'error' && <><div className="rtf-update-error">{update.error || 'Güncelleme sırasında bir sorun oluştu. Ayrıntılar log dosyasına kaydedildi.'}</div><div className="rtf-update-actions"><button className="primary-btn" onClick={() => window.api?.checkForUpdates?.(true)}>{tr('update.retry', 'Tekrar Dene')}</button><button className="secondary-btn" onClick={() => window.api?.getReleasesUrl?.().then(r => r?.url && window.api?.openExternal?.(r.url))}>{tr('update.manual', 'Manuel İndir')}</button></div></>}
      {status !== 'downloading' ? <button className="rtf-update-later" onClick={onDismiss}>{tr('update.later', 'Daha Sonra')}</button> : <button className="rtf-update-later" onClick={() => window.api?.cancelUpdateDownload?.()}>{language === 'en' ? 'Cancel download' : 'İndirmeyi iptal et'}</button>}
    </section>
  </div>
}
