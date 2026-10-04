import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { profilesApi, contentApi, events, unwrap } from '../../services/profile-api.js'
import { Toasts, useToasts, ConfirmDialog, EmptyState, Icon } from './ui.jsx'
import ProfileRail from './ProfileRail.jsx'
import ProfileHeader from './ProfileHeader.jsx'
import ContentTab from './ContentTab.jsx'
import ContentBrowser from './ContentBrowser.jsx'
import { FilesTab, WorldsTab, LogsTab, ShareTab } from './InstanceTabs.jsx'
import CreateProfileModal from './CreateProfileModal.jsx'
import ProfileSettingsModal from './ProfileSettingsModal.jsx'
import './profiles.css'
import { useI18n } from '../../services/i18n.js'

const TABS = [['content', 'profiles.tabContent', 'box'], ['files', 'profiles.tabFiles', 'folder'], ['worlds', 'profiles.tabWorlds', 'globe'], ['logs', 'profiles.tabLogs', 'terminal'], ['share', 'profiles.tabShare', 'share']]
const EMPTY_CONTENT = { mod: [], resourcepack: [], datapack: [], shader: [] }

export default function ProfilesPage({ branding }) {
  const { t, language } = useI18n()
  const toasts = useToasts()
  const [profiles, setProfiles] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [launch, setLaunch] = useState({})
  const [tab, setTab] = useState('content')
  const [mode, setMode] = useState('installed') // installed | browse
  const [contentType, setContentType] = useState('mod')
  const [content, setContent] = useState(EMPTY_CONTENT)
  const [worlds, setWorlds] = useState([])
  const [contentLoading, setContentLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [liveLogs, setLiveLogs] = useState({})
  const activeRef = useRef(activeId)
  activeRef.current = activeId

  const profile = useMemo(() => profiles.find(p => p.id === activeId) || null, [profiles, activeId])

  const applyPayload = useCallback(r => {
    if (Array.isArray(r?.profiles)) setProfiles(r.profiles)
    if (r && 'activeProfileId' in r) setActiveId(r.activeProfileId || null)
    if (r?.launch) setLaunch(r.launch)
  }, [])

  const refreshProfiles = useCallback(async () => {
    try { applyPayload(unwrap(await profilesApi.list(), t('profiles.loadError'))); setLoadError('') }
    catch (e) { setLoadError(e.message) }
    finally { setLoaded(true) }
  }, [applyPayload])

  // Content for the selected profile only. Responses for a profile that is no
  // longer selected are dropped so lists can never bleed between profiles.
  const refreshContent = useCallback(async (id = activeRef.current) => {
    if (!id) { setContent(EMPTY_CONTENT); setWorlds([]); return }
    setContentLoading(true)
    try {
      const r = unwrap(await contentApi.list(id), 'Profil içeriği okunamadı.')
      if (activeRef.current !== id) return
      setContent({ ...EMPTY_CONTENT, ...r.content })
      setWorlds(r.worlds || [])
    } catch (e) {
      if (activeRef.current === id) toasts.push(e.message, 'error')
    } finally { if (activeRef.current === id) setContentLoading(false) }
  }, [])

  useEffect(() => { refreshProfiles() }, [refreshProfiles])
  useEffect(() => { setContent(EMPTY_CONTENT); setWorlds([]); refreshContent(activeId) }, [activeId, refreshContent])

  useEffect(() => {
    const offState = events.onLaunchState(s => {
      setLaunch(prev => {
        const next = { ...prev }
        if (s.state === 'idle' || s.state === 'error' || s.state === 'crashed') delete next[s.profileId]
        else next[s.profileId] = s
        return next
      })
      if (s.state === 'error' && s.error) toasts.push(s.error, 'error')
      if (s.state === 'crashed' && s.error) toasts.push(s.error, 'error')
      if (s.state === 'running') { toasts.push(t('profiles.gameOpened')); refreshProfiles() }
    })
    const offChanged = events.onContentChanged(({ profileId }) => { if (profileId === activeRef.current) refreshContent(profileId) })
    const offLog = events.onLog(({ msg, profileId }) => {
      if (!profileId) return
      setLiveLogs(prev => ({ ...prev, [profileId]: [...(prev[profileId] || []).slice(-1500), msg] }))
    })
    return () => { offState(); offChanged(); offLog() }
  }, [refreshContent, refreshProfiles])

  async function select(id) {
    if (id === activeId) { setTab('content'); setMode('installed'); return }
    setActiveId(id)
    setTab('content'); setMode('installed'); setContentType('mod')
    const r = await profilesApi.select(id)
    if (!r?.success) toasts.push(r?.error || t('profiles.selectFailed'), 'error')
  }

  async function play() {
    if (!profile) return
    setLiveLogs(prev => ({ ...prev, [profile.id]: [] }))
    setLaunch(prev => ({ ...prev, [profile.id]: { state: 'preparing', step: 'Başlatılıyor' } }))
    const r = await profilesApi.launch({ profileId: profile.id, serverIp: branding?.serverIp, serverPort: branding?.serverPort || 25565, apiUrl: branding?.apiUrl })
    if (!r?.success) {
      setLaunch(prev => { const n = { ...prev }; delete n[profile.id]; return n })
      if (r?.code === 'AUTH_REQUIRED' || r?.code === 'AUTH_EXPIRED') toasts.push(r.error, 'error')
      else if (r?.error) toasts.push(r.error, 'error')
    }
  }

  async function stop() {
    const r = await profilesApi.stop(profile.id)
    if (!r?.success) toasts.push(r?.error || 'Oyun durdurulamadı.', 'error')
  }

  async function duplicate() {
    try { const r = unwrap(await profilesApi.duplicate(profile.id)); applyPayload(r); toasts.push(`${r.profile.name} ${language === 'en' ? 'created.' : 'oluşturuldu.'}`) }
    catch (e) { toasts.push(e.message, 'error') }
  }

  async function exportZip() {
    try { const r = await profilesApi.exportZip(profile.id); if (unwrap(r)) toasts.push('Profil dışa aktarıldı.') }
    catch (e) { toasts.push(e.message, 'error') }
  }

  function askDelete() {
    const p = profile
    setConfirm({
      title: t('profiles.confirmDeleteTitle'),
      message: `“${p.name}” ${t('profiles.confirmDelete')}`,
      confirmLabel: t('profiles.confirmDeleteButton'), danger: true,
      run: async () => {
        const r = unwrap(await profilesApi.remove(p.id))
        applyPayload(r)
        setTab('content'); setMode('installed')
        toasts.push(t('profiles.profileDeleted'))
      },
    })
  }

  async function runConfirm() {
    setConfirm(c => ({ ...c, busy: true }))
    try { await confirm.run(); setConfirm(null) }
    catch (e) { toasts.push(e.message, 'error'); setConfirm(c => ({ ...c, busy: false })) }
  }

  function onCreated(r) {
    applyPayload(r)
    setCreating(false)
    setTab('content'); setMode('installed'); setContentType('mod')
    toasts.push(`${r.profile.name} ${language === 'en' ? 'created.' : 'oluşturuldu.'}`)
  }

  const counts = useMemo(() => Object.fromEntries(Object.entries(content).map(([k, v]) => [k, v.length])), [content])
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="rtf-profiles">
      <section className="rtf-profile-main">
        {!loaded ? <div className="rtf-profile-loading"><div className="rtf-skel header-skel" /><div className="rtf-skel tabs-skel" /><div className="rtf-skel body-skel" /></div>
        : loadError ? <EmptyState icon="alert" title={t('profiles.loadError')} text={loadError} large><button className="btn primary" onClick={refreshProfiles}><Icon name="refresh" size={16} />{t('profiles.retry')}</button></EmptyState>
        : !profile ? <EmptyState icon="cube" title={t('profiles.empty')} text={t('profiles.noProfilesText')} large>
            <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />{t('profiles.createFirst')}</button>
          </EmptyState>
        : <>
          <ProfileHeader profile={profile} launch={launch[profile.id]} total={total} onPlay={play} onStop={stop}
            onSettings={() => setSettingsOpen(true)} onDuplicate={duplicate} onOpenFolder={() => profilesApi.openFolder(profile.id)}
            onExport={exportZip} onDelete={askDelete} />
          <nav className="rtf-tabs" role="tablist">
            {TABS.map(([id, label, icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); if (id === 'content') setMode('installed') }}>
                <Icon name={icon} size={16} />{t(label)}
              </button>
            ))}
          </nav>
          <div className="rtf-tab-body">
            {tab === 'content' && mode === 'installed' && (
              <ContentTab key={profile.id} profile={profile} content={content} counts={counts} total={total} loading={contentLoading} worlds={worlds}
                type={contentType} setType={setContentType} toasts={toasts} onChanged={() => refreshContent(profile.id)}
                onBrowse={t => { if (t) setContentType(t); setMode('browse') }} />
            )}
            {tab === 'content' && mode === 'browse' && (
              <ContentBrowser key={profile.id} profile={profile} content={content} worlds={worlds} type={contentType} setType={setContentType}
                toasts={toasts} onChanged={() => refreshContent(profile.id)} onBack={() => setMode('installed')} />
            )}
            {tab === 'files' && <FilesTab key={profile.id} profile={profile} toasts={toasts} />}
            {tab === 'worlds' && <WorldsTab key={profile.id} profile={profile} worlds={worlds} onRefresh={() => refreshContent(profile.id)} toasts={toasts} onBrowseDatapacks={() => { setTab('content'); setContentType('datapack'); setMode('browse') }} />}
            {tab === 'logs' && <LogsTab key={profile.id} profile={profile} live={liveLogs[profile.id] || []} running={!!launch[profile.id]} toasts={toasts} />}
            {tab === 'share' && <ShareTab profile={profile} onExport={exportZip} />}
          </div>
        </>}
      </section>

      <ProfileRail profiles={profiles} activeId={activeId} launch={launch} onSelect={select} onCreate={() => setCreating(true)} />

      {creating && <CreateProfileModal onClose={() => setCreating(false)} onCreated={onCreated} />}
      {settingsOpen && profile && <ProfileSettingsModal profile={profile} running={!!launch[profile.id]} onClose={() => setSettingsOpen(false)}
        onSaved={r => { applyPayload(r); setSettingsOpen(false); toasts.push(t('profiles.profileSettingsSaved')) }} />}
      {confirm && <ConfirmDialog {...confirm} onConfirm={runConfirm} onCancel={() => !confirm.busy && setConfirm(null)} />}
      <Toasts items={toasts.items} onDismiss={toasts.dismiss} />
    </div>
  )
}
