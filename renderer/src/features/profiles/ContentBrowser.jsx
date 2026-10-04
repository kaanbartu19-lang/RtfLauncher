import { useEffect, useMemo, useRef, useState } from 'react'
import { contentApi, events } from '../../services/profile-api.js'
import { PROJECT_TYPES, SORTS, compatibility, formatCount, getCategories, search, timeAgo } from '../../services/modrinth.js'
import { EmptyState, Icon, Modal, Pagination, ProjectIcon, Spinner, Toggle } from './ui.jsx'
import { TypeTabs, WorldPicker, uploadFiles } from './ContentTab.jsx'
import ProjectDetail from './ProjectDetail.jsx'
import InstallButton from './InstallButton.jsx'

// Shared install controller for the browser list and the detail panel.
export function useInstaller({ profile, type, worldName, toasts, onChanged }) {
  const [installing, setInstalling] = useState({})
  const [confirm, setConfirm] = useState(null)
  const mainRef = useRef(null)

  useEffect(() => events.onContentProgress(p => {
    if (p.profileId !== profile.id || !mainRef.current) return
    const main = mainRef.current
    setInstalling(s => s[main] ? { ...s, [main]: { pct: p.pct, label: p.projectId === main ? null : p.title } } : s)
  }), [profile.id])

  async function run(hit, includeDependencies = false) {
    const projectId = hit.project_id || hit.id
    const title = hit.title
    if (type === 'datapack' && !worldName) { toasts.push('Data Pack kurmak için önce bir dünya seç.', 'error'); return }
    mainRef.current = projectId
    setInstalling(s => ({ ...s, [projectId]: { pct: null, label: null } }))
    try {
      const r = await contentApi.install({ profileId: profile.id, projectId, type, worldName, includeDependencies })
      if (r?.needsConfirmation) { setConfirm({ hit, plan: r.plan }); return }
      if (!r?.success) { toasts.push(r?.error || `${title} kurulamadı.`, 'error'); return }
      if (r.alreadyInstalled) toasts.push(`${title} zaten bu profilde kurulu.`)
      else {
        const deps = r.installed.filter(e => e.projectId !== projectId)
        toasts.push(deps.length ? `${title} ve ${deps.length} bağımlılık kuruldu.` : `${title} kuruldu.`)
      }
      onChanged()
    } finally {
      if (mainRef.current === projectId) mainRef.current = null
      setInstalling(s => { const n = { ...s }; delete n[projectId]; return n })
    }
  }

  const dialog = confirm && (
    <DependencyDialog plan={confirm.plan} onCancel={() => setConfirm(null)} onConfirm={() => { const h = confirm.hit; setConfirm(null); run(h, true) }} />
  )
  return { installing, install: hit => run(hit), dialog }
}

function DependencyDialog({ plan, onCancel, onConfirm }) {
  const missing = plan.dependencies.filter(d => !d.installed)
  const present = plan.dependencies.filter(d => d.installed)
  return (
    <Modal title={`Install ${plan.project.title}`} subtitle="This project requires other projects to work." onClose={onCancel} width={500} footer={<>
      <button className="btn ghost" onClick={onCancel}>Cancel</button>
      <button className="btn primary" onClick={onConfirm}><Icon name="download" size={16} />Install with {missing.length} {missing.length === 1 ? 'dependency' : 'dependencies'}</button>
    </>}>
      <div className="dep-list">
        <div className="dep-heading">This {plan.type === 'shader' ? 'shader' : 'mod'} requires:</div>
        {missing.map(d => (
          <div className="dep-row" key={d.projectId}>
            <ProjectIcon src={d.iconUrl} size={36} radius={9} label={d.title} />
            <div><b>{d.title}</b><small>{d.version?.versionNumber || ''}</small></div>
            <span className="badge amber">Will be installed</span>
          </div>
        ))}
        {present.map(d => (
          <div className="dep-row" key={d.projectId}>
            <ProjectIcon src={d.iconUrl} size={36} radius={9} label={d.title} />
            <div><b>{d.title}</b></div>
            <span className="badge green"><Icon name="check" size={12} />Installed</span>
          </div>
        ))}
        {plan.optionalDependencies?.length > 0 && <p className="dep-note">Optional (not installed): {plan.optionalDependencies.map(d => d.title).join(', ')}</p>}
      </div>
    </Modal>
  )
}

export default function ContentBrowser({ profile, content, worlds, type, setType, toasts, onChanged, onBack }) {
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [sort, setSort] = useState('relevance')
  const [limit, setLimit] = useState(20)
  const [page, setPage] = useState(0)
  const [cats, setCats] = useState([])
  const [environment, setEnvironment] = useState('')
  const [compatibleOnly, setCompatibleOnly] = useState(true)
  const [allCategories, setAllCategories] = useState([])
  const [state, setState] = useState({ status: 'loading', hits: [], total: 0, error: '' })
  const [retry, setRetry] = useState(0)
  const [detail, setDetail] = useState(null)
  const [world, setWorld] = useState(worlds[0]?.folder || '')
  const seq = useRef(0)

  useEffect(() => { if (!worlds.some(w => w.folder === world)) setWorld(worlds[0]?.folder || '') }, [worlds])
  useEffect(() => { const t = setTimeout(() => setDebounced(query), query ? 300 : 0); return () => clearTimeout(t) }, [query])
  useEffect(() => { setPage(0) }, [type, debounced, sort, limit, cats, environment, compatibleOnly])
  useEffect(() => { setCats([]); setEnvironment('') }, [type])
  useEffect(() => { getCategories().then(setAllCategories).catch(() => setAllCategories([])) }, [])

  useEffect(() => {
    const id = ++seq.current
    const controller = new AbortController()
    // Clear immediately so results for the previous query are never shown as
    // if they belonged to the new one.
    setState(s => ({ ...s, status: 'loading', hits: [], error: '' }))
    search({ type, profile, query: debounced, sort, limit, page, categories: cats, environment, compatibleOnly, signal: controller.signal })
      .then(r => { if (id === seq.current) setState({ status: 'ok', hits: r.hits, total: r.total, error: '' }) })
      .catch(e => { if (e.name !== 'AbortError' && id === seq.current) setState({ status: 'error', hits: [], total: 0, error: e.message }) })
    return () => controller.abort()
  }, [type, debounced, sort, limit, page, cats, environment, compatibleOnly, profile.id, profile.minecraftVersion, profile.loader, retry])

  const installedIds = useMemo(() => new Set((content[type] || []).filter(e => e.projectId && (type !== 'datapack' || e.worldName === world)).map(e => e.projectId)), [content, type, world])
  const installer = useInstaller({ profile, type, worldName: type === 'datapack' ? world : '', toasts, onChanged })
  const categoryOptions = useMemo(() => {
    const ptype = type === 'datapack' ? 'mod' : type
    return allCategories.filter(c => c.project_type === ptype && c.header === 'categories').map(c => c.name).sort()
  }, [allCategories, type])
  const totalPages = Math.min(Math.max(1, Math.ceil(state.total / limit)), Math.floor(10000 / limit))
  const meta = PROJECT_TYPES[type]

  return (
    <div className="rtf-browser">
      <div className="rtf-browser-top">
        <button className="btn ghost back" onClick={onBack}><Icon name="left" size={16} />Back</button>
        <div className="rtf-crumbs"><b>{profile.name}</b><Icon name="right" size={14} /><span>Content</span><Icon name="right" size={14} /><span>Browse</span></div>
        <button className="btn ghost" onClick={() => uploadFiles({ profile, type, worldName: world, toasts, onChanged })} disabled={type === 'datapack' && !worlds.length}><Icon name="upload" size={16} />Upload files</button>
      </div>

      <TypeTabs type={type} setType={setType} />

      <div className="rtf-searchbar">
        <Icon name="search" size={18} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={meta.search} aria-label={meta.search} autoFocus />
        {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Temizle"><Icon name="x" size={14} /></button>}
      </div>

      <div className="rtf-filters">
        <label className="rtf-check"><Toggle checked={compatibleOnly} onChange={setCompatibleOnly} label="Only compatible" /><span>Only {profile.minecraftVersion}{type === 'mod' && profile.loader !== 'vanilla' ? ` · ${profile.loader}` : type === 'shader' ? ' · Iris' : ''}</span></label>
        {type === 'mod' && (
          <label className="rtf-select">Environment: <select value={environment} onChange={e => setEnvironment(e.target.value)}><option value="">Any</option><option value="client">Client</option><option value="server">Server</option></select></label>
        )}
        {type === 'datapack' && <WorldPicker worlds={worlds} value={world} onChange={setWorld} label="Install to" />}
        <div className="rtf-chips">
          {categoryOptions.map(c => (
            <button key={c} className={`chip ${cats.includes(c) ? 'on' : ''}`} onClick={() => setCats(x => x.includes(c) ? x.filter(y => y !== c) : [...x, c])}>{c.replace(/-/g, ' ')}</button>
          ))}
        </div>
      </div>

      <div className="rtf-toolbar">
        <label className="rtf-select">Sort by: <select value={sort} onChange={e => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="rtf-select">View: <select value={limit} onChange={e => setLimit(Number(e.target.value))}>{[10, 20, 40, 60].map(n => <option key={n}>{n}</option>)}</select></label>
        {state.status === 'ok' && <span className="rtf-total">{state.total.toLocaleString('en')} results</span>}
        <Pagination page={page} totalPages={totalPages} onChange={p => { setPage(p); document.querySelector('.rtf-profile-main')?.scrollTo({ top: 0, behavior: 'smooth' }) }} disabled={state.status === 'loading'} />
      </div>

      {state.status === 'loading' ? (
        <div className="rtf-cards">{Array.from({ length: 8 }, (_, i) => <div className="rtf-skel card-skel" key={i}><span /><div><i /><i /><i /></div></div>)}</div>
      ) : state.status === 'error' ? (
        <EmptyState icon="alert" title="Unable to load content" text={state.error}><button className="btn primary" onClick={() => setRetry(x => x + 1)}><Icon name="refresh" size={16} />Retry</button></EmptyState>
      ) : !state.hits.length ? (
        <EmptyState icon="search" title="No results" text={compatibleOnly ? `Nothing found for Minecraft ${profile.minecraftVersion}. Try another search or turn off the compatibility filter.` : 'Try another search.'} />
      ) : (
        <div className="rtf-cards">
          {state.hits.map(hit => {
            const compat = compatibility(hit, profile, type)
            const installed = installedIds.has(hit.project_id)
            return (
              <article key={hit.project_id} className="rtf-card" onClick={() => setDetail(hit)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setDetail(hit) }}>
                <ProjectIcon src={hit.icon_url} size={88} radius={16} label={hit.title} />
                <div className="rtf-card-body">
                  <div className="rtf-card-title"><h3>{hit.title}</h3><span>by {hit.author}</span></div>
                  <p>{hit.description}</p>
                  <div className="rtf-card-tags">
                    {(hit.display_categories || hit.categories || []).slice(0, 5).map(c => <span key={c} className="tag">{c.replace(/-/g, ' ')}</span>)}
                  </div>
                </div>
                <div className="rtf-card-side">
                  <InstallButton state={installer.installing[hit.project_id]} installed={installed} compat={compat} onInstall={() => installer.install(hit)} />
                  <div className="rtf-card-stats">
                    <span title="Downloads"><Icon name="download" size={15} /><b>{formatCount(hit.downloads)}</b></span>
                    <span title="Followers"><Icon name="heart" size={15} /><b>{formatCount(hit.follows)}</b></span>
                  </div>
                  <span className="rtf-card-updated"><Icon name="clock" size={14} />{timeAgo(hit.date_modified)}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {state.status === 'ok' && totalPages > 1 && <div className="rtf-toolbar bottom"><Pagination page={page} totalPages={totalPages} onChange={p => { setPage(p); document.querySelector('.rtf-profile-main')?.scrollTo({ top: 0, behavior: 'smooth' }) }} /></div>}

      {detail && (
        <ProjectDetail hit={detail} profile={profile} type={type} worldName={type === 'datapack' ? world : ''} installed={installedIds.has(detail.project_id)}
          installState={installer.installing[detail.project_id]} onInstall={() => installer.install(detail)} onClose={() => setDetail(null)} />
      )}
      {installer.dialog}
    </div>
  )
}
