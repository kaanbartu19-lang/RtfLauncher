import { useEffect, useMemo, useState } from 'react'
import { contentApi, unwrap } from '../../services/profile-api.js'
import { PROJECT_TYPES, timeAgo } from '../../services/modrinth.js'
import { ConfirmDialog, EmptyState, Icon, Pagination, ProjectIcon, Spinner, Toggle } from './ui.jsx'

export const TYPE_ORDER = ['mod', 'resourcepack', 'datapack', 'shader']

export function TypeTabs({ type, setType, counts }) {
  return (
    <div className="rtf-pills" role="tablist">
      {TYPE_ORDER.map(t => (
        <button key={t} role="tab" aria-selected={type === t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>
          {PROJECT_TYPES[t].label}{counts && counts[t] > 0 && <em>{counts[t]}</em>}
        </button>
      ))}
    </div>
  )
}

export function WorldPicker({ worlds, value, onChange, label = 'World' }) {
  if (!worlds.length) return <span className="world-picker empty"><Icon name="alert" size={14} />Data Pack için önce oyunda bir dünya oluştur.</span>
  return (
    <label className="world-picker">
      <Icon name="globe" size={15} />{label}
      <select value={value} onChange={e => onChange(e.target.value)}>
        {worlds.map(w => <option key={w.folder} value={w.folder}>{w.name}</option>)}
      </select>
    </label>
  )
}

// Picks files through the native dialog and uploads them into the profile.
export async function uploadFiles({ profile, type, worldName, toasts, onChanged }) {
  const pick = await contentApi.pick(type)
  if (pick?.cancelled) return
  if (!pick?.success) return toasts.push(pick?.error || 'Dosya seçilemedi.', 'error')
  const r = await contentApi.upload({ profileId: profile.id, type, sourcePaths: pick.paths, worldName })
  if (!r?.results) return toasts.push(r?.error || 'Yükleme başarısız.', 'error')
  const ok = r.results.filter(x => x.success)
  for (const f of r.results.filter(x => !x.success)) toasts.push(f.error, 'error')
  if (ok.length) toasts.push(`${ok.length} dosya ${profile.name} profiline eklendi.`)
  onChanged()
}

export default function ContentTab({ profile, content, counts, total, loading, worlds, type, setType, toasts, onChanged, onBrowse }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [limit, setLimit] = useState(20)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState({})
  const [uploading, setUploading] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const [world, setWorld] = useState(worlds[0]?.folder || '')

  useEffect(() => { setPage(0) }, [type, query, sort, limit])
  useEffect(() => { if (!worlds.some(w => w.folder === world)) setWorld(worlds[0]?.folder || '') }, [worlds])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (content[type] || []).filter(e => !q || e.title.toLowerCase().includes(q) || e.filename.toLowerCase().includes(q))
    return list.sort(sort === 'recent' ? (a, b) => String(b.installedAt).localeCompare(String(a.installedAt)) : (a, b) => a.title.localeCompare(b.title))
  }, [content, type, query, sort])
  const totalPages = Math.max(1, Math.ceil(items.length / limit))
  const pageItems = items.slice(page * limit, page * limit + limit)
  const worldName = folder => worlds.find(w => w.folder === folder)?.name || folder

  async function toggle(e, enabled) {
    setBusy(b => ({ ...b, [e.id]: true }))
    try { unwrap(await contentApi.setEnabled({ profileId: profile.id, type, entryId: e.id, enabled })); onChanged() }
    catch (err) { toasts.push(err.message, 'error') }
    finally { setBusy(b => { const n = { ...b }; delete n[e.id]; return n }) }
  }

  function askRemove(e) {
    setConfirm({
      title: 'İçeriği kaldır',
      message: `“${e.title}” bu profilden kaldırılacak ve dosyası (${e.filename}) silinecek.${e.dependency ? ' Bu içerik başka bir modun bağımlılığı olarak kuruldu; kaldırmak o modu bozabilir.' : ''}`,
      confirmLabel: 'Kaldır', danger: true, entry: e,
    })
  }
  async function remove() {
    const e = confirm.entry
    setConfirm(c => ({ ...c, busy: true }))
    try { unwrap(await contentApi.uninstall({ profileId: profile.id, type, entryId: e.id })); toasts.push(`${e.title} kaldırıldı.`); onChanged(); setConfirm(null) }
    catch (err) { toasts.push(err.message, 'error'); setConfirm(c => ({ ...c, busy: false })) }
  }

  async function upload() {
    if (type === 'datapack' && !world) return toasts.push('Data Pack yüklemek için önce bir dünya seç.', 'error')
    setUploading(true)
    try { await uploadFiles({ profile, type, worldName: world, toasts, onChanged }) } finally { setUploading(false) }
  }

  const actions = (
    <>
      <button className="btn ghost" onClick={upload} disabled={uploading || (type === 'datapack' && !worlds.length)}>{uploading ? <Spinner /> : <Icon name="upload" size={16} />}Upload files</button>
      <button className="btn primary" onClick={() => onBrowse(type)}><Icon name="search" size={16} />Browse content</button>
    </>
  )

  if (!loading && total === 0) {
    return (
      <div className="rtf-content">
        <EmptyState icon="box" title="No content installed" text="Browse or upload projects to get started" large>
          <button className="btn ghost" onClick={upload} disabled={uploading || (type === 'datapack' && !worlds.length)}>{uploading ? <Spinner /> : <Icon name="upload" size={16} />}Upload files</button>
          <button className="btn primary" onClick={() => onBrowse('mod')}><Icon name="search" size={16} />Browse content</button>
        </EmptyState>
        <div className="rtf-empty-hint"><TypeTabs type={type} setType={setType} counts={counts} /><span>Upload files will add {PROJECT_TYPES[type].label.toLowerCase()}.</span></div>
      </div>
    )
  }

  return (
    <div className="rtf-content">
      <div className="rtf-content-top">
        <TypeTabs type={type} setType={setType} counts={counts} />
        <div className="rtf-content-actions">{actions}</div>
      </div>
      <div className="rtf-searchbar">
        <Icon name="search" size={18} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${PROJECT_TYPES[type].label.toLowerCase()}...`} aria-label="İçerik ara" />
        {query && <button className="icon-btn" onClick={() => setQuery('')} aria-label="Temizle"><Icon name="x" size={14} /></button>}
      </div>
      <div className="rtf-toolbar">
        <label className="rtf-select">Sort by: <select value={sort} onChange={e => setSort(e.target.value)}><option value="name">Name</option><option value="recent">Recently added</option></select></label>
        <label className="rtf-select">View: <select value={limit} onChange={e => setLimit(Number(e.target.value))}>{[10, 20, 40, 60].map(n => <option key={n}>{n}</option>)}</select></label>
        {type === 'datapack' && <WorldPicker worlds={worlds} value={world} onChange={setWorld} label="Upload to" />}
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {loading && !items.length ? <div className="rtf-rows">{Array.from({ length: 6 }, (_, i) => <div className="rtf-skel row-skel" key={i} />)}</div>
      : !items.length ? (
        <EmptyState icon={query ? 'search' : 'box'} title={query ? 'No matching content' : `No ${PROJECT_TYPES[type].label.toLowerCase()} installed`} text={query ? 'Try a different search.' : `Browse ${PROJECT_TYPES[type].label.toLowerCase()} for ${profile.name}.`}>
          {!query && actions}
        </EmptyState>
      ) : (
        <div className="rtf-rows installed">
          <div className="rtf-rows-head"><span>Name</span><span>Version</span><span>Source</span><span /></div>
          {pageItems.map(e => (
            <div className={`rtf-installed-row ${e.enabled ? '' : 'disabled'}`} key={e.id}>
              <div className="cell-name">
                <ProjectIcon src={e.iconUrl} size={42} radius={10} label={e.title} />
                <div>
                  <b title={e.title}>{e.title}</b>
                  <small title={e.filename}>{e.filename}{type === 'datapack' && e.worldName ? ` · ${worldName(e.worldName)}` : ''}</small>
                </div>
              </div>
              <div className="cell-version">{e.versionNumber || '—'}<small>{e.installedAt ? timeAgo(e.installedAt) : ''}</small></div>
              <div className="cell-source">
                <span className={`badge ${e.source === 'modrinth' ? 'blue' : 'gray'}`}>{e.source === 'modrinth' ? 'Modrinth' : 'Local file'}</span>
                {e.dependency && <span className="badge amber" title="Başka bir içeriğin bağımlılığı olarak kuruldu">Dependency</span>}
              </div>
              <div className="cell-actions">
                {busy[e.id] ? <Spinner /> : <Toggle checked={e.enabled} onChange={v => toggle(e, v)} label={e.enabled ? 'Devre dışı bırak' : 'Etkinleştir'} />}
                <button className="icon-btn danger" onClick={() => askRemove(e)} title="Kaldır" aria-label={`${e.title} kaldır`}><Icon name="trash" size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirm && <ConfirmDialog {...confirm} onConfirm={remove} onCancel={() => !confirm.busy && setConfirm(null)} />}
    </div>
  )
}
