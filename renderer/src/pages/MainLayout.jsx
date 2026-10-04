import { useEffect, useState } from 'react'
import HomePage from './HomePage.jsx'
import PlayPage from './PlayPage.jsx'
import ModsPage from './ModsPage.jsx'
import AdminPage from './AdminPage.jsx'
import SettingsPage from './SettingsPage.jsx'
import PacksPage from './PacksPage.jsx'
import CosmeticsPage from './CosmeticsPage.jsx'
import ProfilePage from './ProfilePage.jsx'
import StorePage from './StorePage.jsx'
import SkinsPage from './SkinsPage.jsx'
import { useI18n } from '../services/i18n.js'

const NAV = [['home', 'nav.home', '⌂'], ['profile', 'nav.profiles', '●'], ['play', 'nav.minecraft', '▶'], ['mods', 'nav.mods', '◇'], ['packs', 'nav.packs', '▦'], ['skins', 'nav.skins', '◉'], ['cosmetics', 'nav.cosmetics', '✦'], ['outfits', 'nav.wardrobe', '◈'], ['store', 'nav.store', '◆'], ['settings', 'nav.settings', '⚙']]

export default function MainLayout({ user, onLogout }) {
  const { t, language } = useI18n()
  const [page, setPage] = useState('home')
  const [branding, setBranding] = useState({})
  const [downloadTask, setDownloadTask] = useState(null)
  const [appVersion, setAppVersion] = useState('')
  const api = window.api || {}

  useEffect(() => {
    api.getAppVersion?.().then(r => setAppVersion(r?.version || ''))
    const off = api.onDlProgress?.(d => setDownloadTask(d.pct >= 100 ? null : { ...d, ts: Date.now() }))
    return () => { try { off?.() } catch {} }
  }, [])
  useEffect(() => {
    let alive = true
    async function load() {
      const local = await api.loadBranding?.() || {}
      if (alive) setBranding(local)
      if (!local.apiUrl) return
      try {
        const r = await fetch(`${local.apiUrl.replace(/\/$/, '')}/api/config`, { cache: 'no-store' })
        const d = await r.json()
        if (alive && d.success) setBranding(p => ({ ...p, ...d.config, apiUrl: p.apiUrl }))
      } catch {}
    }
    load()
    const t = setInterval(load, 15000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  useEffect(() => {
    if (branding.apiUrl && user?.uuid) api.registerPresence?.({ apiUrl: branding.apiUrl, uuid: user.uuid, username: user.username })
  }, [branding.apiUrl, user?.uuid])

  const nav = [...NAV, ...(user?.isAdmin ? [['admin', 'nav.admin', '▣']] : [])]
  return (
    <div className="launcher-shell">
      <header className="titlebar">
        <div className="brand"><img src="./logo.png" alt="RTFMC" style={{height:22,width:22,objectFit:'contain'}} /><b>RtfLauncher</b><span>{appVersion ? `v${appVersion}` : ""}</span></div>
        <div className="title-user">
          <span className="user-dot">{user?.username?.[0]?.toUpperCase() || '?'}</span><span>{user?.username}</span>
          <button onClick={() => api.minimize?.()} aria-label="Küçült">—</button>
          <button onClick={() => api.maximize?.()} aria-label="Büyüt">□</button>
          <button className="close" onClick={() => api.close?.()} aria-label="Kapat">×</button>
        </div>
      </header>
      <div className="launcher-body">
        <aside className="sidebar">
          <div className="nav-group">{nav.map(([id, label, icon]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><span>{icon}</span>{t(label)}</button>)}</div>
          <div className="sidebar-bottom"><div className="online"><i /> {language === 'en' ? `${t('nav.minecraft')} connection ready` : `${t('nav.minecraft')} bağlantısı hazır`}</div><button className="logout" onClick={onLogout}>{t('common.logout')}</button></div>
        </aside>
        <main className="content">
          {page === 'home' && <HomePage branding={branding} user={user} onPlay={() => setPage('play')} onOpen={u => api.openExternal?.(u)} onPage={setPage} />}
          {page === 'play' && <PlayPage branding={branding} user={user} />}
          {page === 'mods' && <ModsPage branding={branding} onOpenProfiles={() => setPage('profile')} />}
          {page === 'packs' && <PacksPage />}
          {page === 'skins' && <SkinsPage user={user} />}
          {page === 'cosmetics' && <CosmeticsPage branding={branding} user={user} />}
          {page === 'outfits' && <OutfitsPage />}
          {page === 'profile' && <ProfilePage branding={branding} user={user} />}
          {page === 'store' && <StorePage branding={branding} user={user} />}
          {page === 'settings' && <SettingsPage user={user} branding={branding} setBranding={setBranding} />}
          {page === 'admin' && user?.isAdmin && <AdminPage branding={branding} />}
        </main>
      </div>
      {downloadTask && page !== 'profile' && <DownloadBar task={downloadTask} />}
    </div>
  )
}

function DownloadBar({ task }) {
  const pct = Math.max(0, Math.min(100, Number(task.pct) || 0))
  return (
    <div className="download-bar">
      <div className="download-icon">↓</div>
      <div className="download-main">
        <div className="download-title">İndiriliyor <b>{pct}%</b></div>
        <div className="download-file">{task.filename || task.task || 'Dosyalar indiriliyor...'}</div>
        <div className="progress"><i style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  )
}

// Outfits need server-side storage that does not exist yet; nothing here
// pretends otherwise.
function OutfitsPage() {
  return (
    <div className="page-scroll">
      <div className="page-kicker">WARDROBE</div>
      <h1>Gardırop</h1>
      <p className="muted">Skin + kozmetik kombinasyonlarını outfit olarak kaydetme özelliği sunucu desteği gerektiriyor.</p>
      <div className="empty-card"><div className="empty-icon">◈</div><b>Yakında</b><span>Outfit kaydetme RtfSMP sunucusuna eklendiğinde burada aktif olacak.</span><button className="primary-btn" disabled>＋ Outfit oluştur</button></div>
    </div>
  )
}
