import { useEffect, useState } from 'react'
import { contentApi, openExternal } from '../../services/profile-api.js'
import { compatibility, formatCount, getMembers, getProject, timeAgo } from '../../services/modrinth.js'
import { Icon, ProjectIcon, Spinner } from './ui.jsx'
import InstallButton from './InstallButton.jsx'

function summarizeVersions(list = []) {
  const releases = list.filter(v => /^\d+\.\d+(\.\d+)?$/.test(v))
  if (!releases.length) return list.slice(-3).join(', ')
  if (releases.length <= 4) return releases.join(', ')
  return `${releases[0]} – ${releases[releases.length - 1]}`
}

export default function ProjectDetail({ hit, profile, type, worldName, installed, installState, onInstall, onClose }) {
  const [project, setProject] = useState(null)
  const [owner, setOwner] = useState(hit.author || '')
  const [plan, setPlan] = useState(null)
  const [planError, setPlanError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setProject(null); setPlan(null); setPlanError(''); setError('')
    getProject(hit.project_id, controller.signal).then(setProject).catch(e => { if (e.name !== 'AbortError') setError(e.message) })
    getMembers(hit.project_id, controller.signal).then(m => { const o = m.find(x => x.role === 'Owner') || m[0]; if (o?.user?.username) setOwner(o.user.username) }).catch(() => {})
    contentApi.plan({ profileId: profile.id, projectId: hit.project_id, type, worldName }).then(r => { if (r?.success) setPlan(r.plan); else setPlanError(r?.error || 'Uyumluluk kontrol edilemedi.') })
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { controller.abort(); window.removeEventListener('keydown', onKey) }
  }, [hit.project_id, profile.id, type, worldName])

  // The plan is authoritative (it checks real versions/dependencies); the hit
  // based check is only used while the plan is loading.
  const compat = plan ? { ok: plan.compatible || !!plan.alreadyInstalled, reason: plan.reason } : compatibility(hit, profile, type)
  const p = project || {}
  const links = [
    ['Modrinth page', `https://modrinth.com/${p.project_type || hit.project_type || 'mod'}/${p.slug || hit.slug}`],
    ['Source', p.source_url], ['Issues', p.issues_url], ['Wiki', p.wiki_url], ['Discord', p.discord_url],
  ].filter(([, url]) => url)
  const gallery = (p.gallery || []).slice(0, 4)

  return (
    <div className="rtf-drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <aside className="rtf-drawer" role="dialog" aria-modal="true" aria-label={hit.title}>
        <button className="icon-btn drawer-x" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        <div className="detail-head">
          <ProjectIcon src={hit.icon_url} size={96} radius={20} label={hit.title} />
          <div>
            <h2>{hit.title}</h2>
            <div className="detail-author"><Icon name="user" size={14} />by {owner || 'Unknown'}</div>
            <div className="detail-stats">
              <span><Icon name="download" size={14} />{formatCount(p.downloads ?? hit.downloads)} downloads</span>
              <span><Icon name="heart" size={14} />{formatCount(p.followers ?? hit.follows)} followers</span>
              <span><Icon name="clock" size={14} />Updated {timeAgo(p.updated || hit.date_modified)}</span>
            </div>
          </div>
        </div>

        <div className="detail-install">
          <InstallButton state={installState} installed={installed || !!plan?.alreadyInstalled} compat={compat} onInstall={onInstall} large />
          {!installed && plan && !plan.compatible && !plan.alreadyInstalled && <p className="detail-warn"><Icon name="alert" size={14} />{plan.reason || 'Not compatible with this profile'}</p>}
          {planError && <p className="detail-warn"><Icon name="alert" size={14} />{planError}</p>}
          {plan?.version && !installed && <p className="detail-muted">Installs {plan.version.versionNumber} ({plan.version.file.filename}) into <b>{profile.name}</b>{worldName ? ` · world ${worldName}` : ''}.</p>}
        </div>

        <p className="detail-desc">{p.description || hit.description}</p>

        {plan && (plan.dependencies.length > 0 || plan.optionalDependencies.length > 0) && (
          <section className="detail-section">
            <h4>Dependencies</h4>
            {plan.dependencies.map(d => (
              <div className="dep-row" key={d.projectId}>
                <ProjectIcon src={d.iconUrl} size={32} radius={8} label={d.title} />
                <div><b>{d.title}</b><small>Required</small></div>
                {d.installed ? <span className="badge green"><Icon name="check" size={12} />Installed</span> : d.compatible ? <span className="badge amber">Will be installed</span> : <span className="badge red">Unavailable</span>}
              </div>
            ))}
            {plan.optionalDependencies.map(d => (
              <div className="dep-row" key={d.projectId}><ProjectIcon src={d.iconUrl} size={32} radius={8} label={d.title} /><div><b>{d.title}</b><small>Optional</small></div></div>
            ))}
          </section>
        )}
        {!plan && !planError && <div className="detail-muted"><Spinner size={12} /> Checking compatibility…</div>}

        <section className="detail-section grid">
          <div><h4>Minecraft</h4><p>{summarizeVersions(p.game_versions || hit.versions)}</p></div>
          <div><h4>Loaders</h4><p>{(p.loaders || []).join(', ') || '—'}</p></div>
          <div><h4>Client / Server</h4><p>{p.client_side || hit.client_side || '—'} / {p.server_side || hit.server_side || '—'}</p></div>
          <div><h4>License</h4><p>{p.license?.id || hit.license || '—'}</p></div>
        </section>

        {(p.categories || hit.display_categories || []).length > 0 && (
          <section className="detail-section">
            <h4>Categories</h4>
            <div className="rtf-card-tags">{(p.categories || hit.display_categories).map(c => <span key={c} className="tag">{c.replace(/-/g, ' ')}</span>)}</div>
          </section>
        )}

        {gallery.length > 0 && (
          <section className="detail-section">
            <h4>Gallery</h4>
            <div className="detail-gallery">{gallery.map(g => <img key={g.url} src={g.url} alt={g.title || ''} loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />)}</div>
          </section>
        )}

        {links.length > 0 && (
          <section className="detail-section">
            <h4>Links</h4>
            <div className="detail-links">{links.map(([label, url]) => <button key={label} className="btn ghost small" onClick={() => openExternal(url)}><Icon name={label === 'Modrinth page' ? 'external' : 'link'} size={14} />{label}</button>)}</div>
          </section>
        )}
        {error && <p className="detail-warn"><Icon name="alert" size={14} />{error}</p>}
      </aside>
    </div>
  )
}
