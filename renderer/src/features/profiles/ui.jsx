import { useEffect, useRef, useState } from 'react'

// Stroke icons drawn for RtfLauncher (24×24 grid, currentColor).
const PATHS = {
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
  gear: <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.7 7.7 0 0 0-2.6-1.5L14.2 2.6h-4l-.4 2.5a7.7 7.7 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.7 7.7 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 2.6-1.5l2.3 1 2-3.4z" /></>,
  dots: <><circle cx="12" cy="5" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="19" r="1.6" fill="currentColor" /></>,
  box: <><path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" /><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" /></>,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  file: <><path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" /></>,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3M12.5 15H17" /></>,
  share: <><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  download: <><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  trash: <><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /><path d="M10 11v5M14 11v5" /></>,
  upload: <><path d="M12 16V5m0 0L7.5 9.5M12 5l4.5 4.5" /><path d="M4.5 19.5h15" /></>,
  left: <path d="m14.5 6-6 6 6 6" />,
  right: <path d="m9.5 6 6 6-6 6" />,
  refresh: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>,
  alert: <><path d="M12 3.5 2.5 20h19z" /><path d="M12 10v4.5M12 17.2v.3" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 9" /></>,
  sparkle: <path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2z" />,
  cube: <><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="M4 7.5 12 12l8-4.5M12 12v9" /></>,
  filter: <path d="M4 5h16l-6.2 7.5V19l-3.6-1.8v-4.7z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  loader: <path d="M4 17 12 3l8 14zM8 17h8" />,
  memory: <><rect x="3" y="7" width="18" height="10" rx="1.5" /><path d="M7 7v10M11 7v10M15 7v10M3 12h18" /></>,
  coffee: <><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M11 3v3" /></>,
}

export function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg className={`rtf-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      {PATHS[name] || PATHS.box}
    </svg>
  )
}

export function Spinner({ size = 16 }) {
  return <span className="rtf-spinner" style={{ width: size, height: size }} aria-label="Yükleniyor" />
}

// RtfLauncher's own fallback mark — used whenever a remote logo is missing or fails.
export function RtfFallbackIcon({ size = 64, label = 'R' }) {
  return (
    <svg className="rtf-fallback" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="rtfFallbackGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e3a8a" /><stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#rtfFallbackGrad)" />
      <path d="M32 12 50 22v20L32 52 14 42V22z" fill="none" stroke="#93c5fd" strokeOpacity=".55" strokeWidth="2.5" strokeLinejoin="round" />
      <text x="32" y="40" textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize="22" fontWeight="900" fill="#fff">{label}</text>
    </svg>
  )
}

export function ProjectIcon({ src, size = 64, radius = 14, label }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const style = { width: size, height: size, borderRadius: radius }
  if (!src || failed) return <span className="project-icon" style={style}><RtfFallbackIcon size={size} label={label?.[0]?.toUpperCase() || 'R'} /></span>
  return <span className="project-icon" style={style}><img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /></span>
}

export function ProfileAvatar({ profile, size = 40 }) {
  const style = { width: size, height: size, borderRadius: Math.round(size * 0.26) }
  if (profile?.iconDataUrl) return <span className="rtf-avatar" style={style}><img src={profile.iconDataUrl} alt="" /></span>
  const iconName = profile?.loader === 'fabric' ? 'loader' : /sodium|performance|opt/i.test(profile?.name || '') ? 'sparkle' : /vanilla|survival|world/i.test(profile?.name || '') ? 'cube' : 'layers'
  return <span className="rtf-avatar glyph vector" style={style}><Icon name={iconName} size={Math.max(18, Math.round(size * 0.5))} /></span>
}

export function Modal({ title, subtitle, onClose, children, footer, width = 560, className = '' }) {
  const ref = useRef(null)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector('input,select,button:not(.modal-x)')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="rtf-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className={`rtf-modal ${className}`} style={{ maxWidth: width }} ref={ref} role="dialog" aria-modal="true" aria-label={title}>
        <header className="rtf-modal-head">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-btn modal-x" onClick={onClose} aria-label="Kapat"><Icon name="x" /></button>
        </header>
        <div className="rtf-modal-body">{children}</div>
        {footer && <footer className="rtf-modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'Onayla', danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel} width={440} footer={<>
      <button className="btn ghost" onClick={onCancel} disabled={busy}>Vazgeç</button>
      <button className={`btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>{busy ? <Spinner /> : null}{confirmLabel}</button>
    </>}>
      <p className="confirm-text">{message}</p>
    </Modal>
  )
}

export function Toasts({ items, onDismiss }) {
  return (
    <div className="rtf-toasts" aria-live="polite">
      {items.map(t => (
        <div key={t.id} className={`rtf-toast ${t.type}`}>
          <Icon name={t.type === 'error' ? 'alert' : 'check'} size={16} />
          <span>{t.text}</span>
          <button className="icon-btn" onClick={() => onDismiss(t.id)} aria-label="Kapat"><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  )
}

export function useToasts() {
  const [items, setItems] = useState([])
  const push = (text, type = 'ok', ms = type === 'error' ? 7000 : 3500) => {
    const id = Math.random().toString(36).slice(2)
    setItems(x => [...x.slice(-3), { id, text, type }])
    setTimeout(() => setItems(x => x.filter(t => t.id !== id)), ms)
  }
  return { items, push, dismiss: id => setItems(x => x.filter(t => t.id !== id)) }
}

export function pageWindow(current, total) {
  const set = new Set([0, total - 1, current, current - 1, current + 1])
  return [...set].filter(n => n >= 0 && n < total).sort((a, b) => a - b)
}

export function Pagination({ page, totalPages, onChange, disabled }) {
  if (totalPages <= 1) return null
  const pages = pageWindow(page, totalPages)
  return (
    <nav className="rtf-pagination" aria-label="Sayfalar">
      <button className="page-btn" disabled={disabled || page <= 0} onClick={() => onChange(page - 1)} aria-label="Önceki"><Icon name="left" size={16} /></button>
      {pages.map((n, i) => (
        <span key={n} className="page-group">
          {i > 0 && n !== pages[i - 1] + 1 && <span className="page-gap">…</span>}
          <button className={`page-btn ${n === page ? 'current' : ''}`} disabled={disabled} onClick={() => onChange(n)} aria-current={n === page ? 'page' : undefined}>{n + 1}</button>
        </span>
      ))}
      <button className="page-btn" disabled={disabled || page + 1 >= totalPages} onClick={() => onChange(page + 1)} aria-label="Sonraki"><Icon name="right" size={16} /></button>
    </nav>
  )
}

export function Menu({ open, onClose, children, align = 'right' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!ref.current?.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === 'Escape') onClose() }
    setTimeout(() => window.addEventListener('mousedown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open, onClose])
  if (!open) return null
  return <div className={`rtf-menu ${align}`} ref={ref} role="menu">{children}</div>
}

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`rtf-toggle ${checked ? 'on' : ''}`} disabled={disabled} onClick={e => { e.stopPropagation(); onChange(!checked) }}>
      <span />
    </button>
  )
}

export function EmptyState({ icon = 'box', title, text, children, large }) {
  return (
    <div className={`rtf-empty ${large ? 'large' : ''}`}>
      <div className="rtf-empty-art"><span className="art-ring" /><Icon name={icon} size={large ? 40 : 28} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children && <div className="rtf-empty-actions">{children}</div>}
    </div>
  )
}

export function formatBytes(n) {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)))
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`
}

export function loaderLabel(loader) {
  return { fabric: 'Fabric', vanilla: 'Vanilla' }[loader] || loader
}
