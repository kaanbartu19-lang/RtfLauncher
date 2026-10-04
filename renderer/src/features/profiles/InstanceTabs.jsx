import { useEffect, useMemo, useRef, useState } from 'react'
import { profilesApi, unwrap } from '../../services/profile-api.js'
import { timeAgo } from '../../services/modrinth.js'
import { EmptyState, Icon, Spinner, formatBytes } from './ui.jsx'

// ── Files ────────────────────────────────────────────────────────────────────
export function FilesTab({ profile, toasts }) {
  const [rel, setRel] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  async function load(path = rel) {
    setError('')
    try { const r = unwrap(await profilesApi.files(profile.id, path)); setData(r); setRel(r.path) }
    catch (e) { setError(e.message); setData(null) }
  }
  useEffect(() => { load('') }, [profile.id])

  const crumbs = rel ? rel.split('/') : []
  const open = async (path = rel) => { const r = await profilesApi.openFolder(profile.id, path); if (!r?.success) toasts.push(r?.error || 'Açılamadı.', 'error') }

  return (
    <div className="rtf-pane">
      <div className="rtf-pane-head">
        <div className="rtf-crumbs files">
          <button onClick={() => load('')}><Icon name="folder" size={15} />instance</button>
          {crumbs.map((c, i) => <span key={i}><Icon name="right" size={13} /><button onClick={() => load(crumbs.slice(0, i + 1).join('/'))}>{c}</button></span>)}
        </div>
        <div className="rtf-pane-actions">
          <button className="btn ghost small" onClick={() => load()}><Icon name="refresh" size={14} />Refresh</button>
          <button className="btn ghost small" onClick={() => open()}><Icon name="external" size={14} />Open in Explorer</button>
        </div>
      </div>
      {error ? <EmptyState icon="alert" title="Klasör okunamadı" text={error} />
      : !data ? <div className="rtf-rows">{Array.from({ length: 6 }, (_, i) => <div className="rtf-skel row-skel small" key={i} />)}</div>
      : !data.entries.length ? <EmptyState icon="folder" title="Bu klasör boş" />
      : (
        <div className="rtf-file-list">
          {rel && <button className="rtf-file-row" onClick={() => load(crumbs.slice(0, -1).join('/'))}><Icon name="left" size={16} /><span>..</span><span /><span /></button>}
          {data.entries.map(e => (
            <button key={e.path} className="rtf-file-row" onClick={() => (e.type === 'directory' ? load(e.path) : open(e.path))} title={e.type === 'directory' ? 'Aç' : 'Explorer’da göster'}>
              <Icon name={e.type === 'directory' ? 'folder' : 'file'} size={16} className={e.type === 'directory' ? 'is-dir' : ''} />
              <span className="name">{e.name}</span>
              <span className="size">{e.type === 'file' ? formatBytes(e.size) : ''}</span>
              <span className="date">{e.modified ? timeAgo(e.modified) : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Worlds ───────────────────────────────────────────────────────────────────
export function WorldsTab({ profile, worlds, onRefresh, toasts, onBrowseDatapacks }) {
  useEffect(() => { onRefresh() }, [profile.id])
  const open = async folder => { const r = await profilesApi.openFolder(profile.id, `saves/${folder}`); if (!r?.success) toasts.push(r?.error || 'Açılamadı.', 'error') }
  if (!worlds.length) return (
    <EmptyState icon="globe" title="No worlds yet" text="Singleplayer worlds created in this profile appear here." large>
      <button className="btn ghost" onClick={() => profilesApi.openFolder(profile.id, 'saves')}><Icon name="folder" size={16} />Open saves folder</button>
    </EmptyState>
  )
  return (
    <div className="rtf-pane">
      <div className="rtf-pane-head">
        <h3>{worlds.length} {worlds.length === 1 ? 'world' : 'worlds'}</h3>
        <div className="rtf-pane-actions">
          <button className="btn ghost small" onClick={onRefresh}><Icon name="refresh" size={14} />Refresh</button>
          <button className="btn ghost small" onClick={onBrowseDatapacks}><Icon name="search" size={14} />Browse data packs</button>
        </div>
      </div>
      <div className="rtf-world-grid">
        {worlds.map(w => (
          <article key={w.folder} className="rtf-world">
            {w.icon ? <img src={w.icon} alt="" /> : <span className="rtf-world-ph"><Icon name="globe" size={26} /></span>}
            <div>
              <b title={w.name}>{w.name}</b>
              <small>{w.gameType ? `${w.gameType[0].toUpperCase()}${w.gameType.slice(1)}` : 'World'}{w.hardcore ? ' · Hardcore' : ''} · {w.datapacks} data packs</small>
              <small><Icon name="clock" size={12} />Played {timeAgo(w.lastPlayed)}</small>
            </div>
            <button className="icon-btn" onClick={() => open(w.folder)} title="Klasörü aç" aria-label={`${w.name} klasörünü aç`}><Icon name="folder" size={16} /></button>
          </article>
        ))}
      </div>
    </div>
  )
}

// ── Logs ─────────────────────────────────────────────────────────────────────
const LIVE = '__live__'
export function LogsTab({ profile, live, running, toasts }) {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [reload, setReload] = useState(0)
  const viewer = useRef(null)

  async function loadList(keep = true) {
    const r = await profilesApi.logs(profile.id)
    const list = r?.logs || []
    setFiles(list)
    if (!keep || !selected) setSelected(running || live.length ? LIVE : list[0]?.path || LIVE)
  }
  useEffect(() => { loadList(false) }, [profile.id])
  useEffect(() => {
    if (!selected || selected === LIVE) return
    let alive = true
    setLoading(true)
    profilesApi.readLog(profile.id, selected).then(r => { if (!alive) return; setLoading(false); if (r?.success) setText(r.exists ? r.content : ''); else toasts.push(r?.error || 'Log okunamadı.', 'error') })
    return () => { alive = false }
  }, [selected, profile.id, reload])

  const content = selected === LIVE ? live.join('\n') : text
  const shown = useMemo(() => {
    if (!filter.trim()) return content
    const f = filter.toLowerCase()
    return content.split('\n').filter(l => l.toLowerCase().includes(f)).join('\n')
  }, [content, filter])
  useEffect(() => { if (viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight }, [shown, selected])

  const crash = files.find(f => f.kind === 'crash')
  return (
    <div className="rtf-logs">
      <aside className="rtf-log-list">
        <button className={selected === LIVE ? 'active' : ''} onClick={() => setSelected(LIVE)}><Icon name="terminal" size={15} /><span>Live output</span>{running && <i className="live-dot" />}</button>
        {files.map(f => (
          <button key={f.path} className={`${selected === f.path ? 'active' : ''} ${f.kind}`} onClick={() => setSelected(f.path)} title={f.path}>
            <Icon name={f.kind === 'crash' ? 'alert' : 'file'} size={15} /><span>{f.name}</span><small>{timeAgo(f.modified)}</small>
          </button>
        ))}
        {!files.length && <p className="muted-note">No log files yet. Launch the profile once.</p>}
      </aside>
      <section className="rtf-log-view">
        <div className="rtf-log-tools">
          <div className="rtf-searchbar small"><Icon name="search" size={15} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter lines..." /></div>
          <button className="btn ghost small" onClick={() => { loadList(); setReload(x => x + 1) }}><Icon name="refresh" size={14} />Refresh</button>
          <button className="btn ghost small" onClick={() => navigator.clipboard?.writeText(shown).then(() => toasts.push('Log kopyalandı.'))} disabled={!shown}><Icon name="copy" size={14} />Copy</button>
          <button className="btn ghost small" onClick={() => profilesApi.openFolder(profile.id, selected && selected !== LIVE ? selected : 'logs')}><Icon name="folder" size={14} />Show file</button>
        </div>
        {crash && selected !== crash.path && <button className="rtf-crash-banner" onClick={() => setSelected(crash.path)}><Icon name="alert" size={15} />Crash report found: {crash.name} ({timeAgo(crash.modified)})</button>}
        {loading ? <div className="rtf-log-empty"><Spinner /> Loading…</div>
        : shown ? <pre className="rtf-log-pre" ref={viewer}>{shown}</pre>
        : <div className="rtf-log-empty">{selected === LIVE ? (running ? 'Waiting for output…' : 'Press Play to see live output here.') : 'This log is empty.'}</div>}
      </section>
    </div>
  )
}

// ── Share ────────────────────────────────────────────────────────────────────
// The RtfSMP backend has no profile-sharing endpoint, so nothing here pretends
// to produce a share link. Export is the real, working alternative.
export function ShareTab({ profile, onExport }) {
  return (
    <EmptyState icon="share" title="Sharing is coming soon" text={`Online profile sharing needs RtfSMP server support, which is not available yet. You can export “${profile.name}” as a .zip (mods, packs, config) and send it instead.`} large>
      <button className="btn ghost" disabled title="Sunucu desteği gerekiyor"><Icon name="link" size={16} />Create share link</button>
      <button className="btn primary" onClick={onExport}><Icon name="upload" size={16} />Export profile</button>
    </EmptyState>
  )
}
