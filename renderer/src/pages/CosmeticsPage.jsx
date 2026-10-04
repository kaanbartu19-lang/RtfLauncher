import { useEffect, useState } from 'react'
import CharacterPreview from '../components/CharacterPreview.jsx'
import { apiGet } from '../services/api.js'
import { useSavedSkin } from './SkinsPage.jsx'
import { useI18n } from '../services/i18n.js'

const FALLBACK = './rtf-fallback.svg'
const isBackItem = type => ['cape', 'elytra', 'wing', 'wings'].includes(String(type || '').toLowerCase())
const backEquipmentFor = type => (['elytra', 'wing', 'wings'].includes(String(type || '').toLowerCase()) ? 'elytra' : 'cape')
// "Outfit"/clothing cosmetics are worn directly on the skin (Essential-style),
// not attached to the back like a cape.
const isOutfitItem = type => ['outfit', 'kıyafet', 'kiyafet', 'clothing', 'shirt'].includes(String(type || '').toLowerCase())
const isPreviewable = type => isBackItem(type) || isOutfitItem(type)

// A 64x32 cape file is a whole sprite sheet (front, back, elytra, edge
// strips, mostly-unused space). Showing the raw file as a thumbnail looks
// like a broken sprite sheet, not a cape. The part that actually reads as
// "the cape" is the 10x16 back panel at x=12,y=1 (Minecraft's own cape UV
// layout). We crop to just that with a background-position/-size trick
// instead of a canvas, so it's cheap and works for any image host.
function CapeThumbnail({ imageUrl }) {
  return (
    <div style={{ width: 84, height: 134, borderRadius: 6, overflow: 'hidden', boxShadow: '0 2px 10px #0004' }}>
      <div style={{
        width: '100%', height: '100%',
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: '640% 200%',
        backgroundPosition: '22.222% 6.25%',
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }} />
    </div>
  )
}

// Catalog + live preview. The RtfSMP API has no equip endpoint yet, so this
// page only previews; it never stores a fake "equipped" state.
export default function CosmeticsPage({ branding, user }) {
  const { t, language } = useI18n()
  const skin = useSavedSkin(user)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hover, setHover] = useState(null)
  const [pinned, setPinned] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      if (!branding?.apiUrl) { setLoading(false); setError('Kozmetik servisi yapılandırılmamış (API URL yok).'); return }
      setLoading(true); setError('')
      try { const d = await apiGet(branding, '/api/cosmetics'); if (alive) setItems(d.cosmetics || []) }
      catch (e) { if (alive) { setItems([]); setError(e.message) } }
      finally { if (alive) setLoading(false) }
    }
    load()
    return () => { alive = false }
  }, [branding?.apiUrl])

  // hover → preview; mouse leave → back to the pinned item or the plain character.
  const active = hover || pinned
  const back = active && isBackItem(active.type) ? active : null
  const outfit = active && isOutfitItem(active.type) ? active : null
  return (
    <div className="page-scroll">
      <div className="page-kicker">{t('nav.cosmetics').toUpperCase()}</div>
      <div className="cosmetic-head"><div><h1>{t('cosmetics.title')}</h1><p className="muted">{t('cosmetics.subtitle')}</p></div></div>
      {error && <div className="notice error">{error}</div>}
      <div className="wardrobe-layout">
        <div className="cosmetic-grid">
          {loading ? [1, 2, 3, 4, 5, 6].map(i => <div className="skeleton" key={i} />)
          : items.length ? items.map(item => (
            <button className={`cosmetic-card ${pinned?.id === item.id ? 'equipped' : ''}`} key={item.id}
              onMouseEnter={() => setHover(item)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(item)} onBlur={() => setHover(null)}
              onClick={() => setPinned(p => (p?.id === item.id ? null : item))}>
              <div className="cosmetic-image">
                {String(item.type || '').toLowerCase() === 'cape' && item.imageUrl
                  ? <CapeThumbnail imageUrl={item.imageUrl} />
                  : <img src={item.imageUrl || FALLBACK} alt="" onError={e => { if (!e.currentTarget.src.endsWith('rtf-fallback.svg')) e.currentTarget.src = FALLBACK }} />}
              </div>
              <div className="cosmetic-name">{item.name} {item.effect === 'glow' ? '✨' : item.effect === 'rainbow' ? '🌈' : item.effect === 'particles' ? '💫' : ''}</div>
              <div className="cosmetic-meta"><span>{String(item.type || 'cape').toUpperCase()}</span><b>{item.price ? `${Number(item.price).toLocaleString('tr-TR')} RC` : 'Ücretsiz'}</b></div>
            </button>
          ))
          : !error && <div className="empty-card"><b>Henüz kozmetik yok</b><span>Sunucuda yayınlanan kozmetikler burada görünür.</span></div>}
        </div>
        <aside className="wardrobe-preview">
          <div className="preview-label">{t('cosmetics.preview')}</div>
          <div className="wardrobe-stage">
            <CharacterPreview username={user?.username} skinUrl={skin?.dataUrl || null} model={skin?.model || 'auto-detect'} capeUrl={back?.imageUrl || null} backEquipment={back ? backEquipmentFor(back.type) : 'cape'} outfitUrl={outfit?.imageUrl || null} effect={back?.effect || null} animation="idle" />
          </div>
          <div className="preview-equip">
            {active ? <><b>{active.name}</b><span>{hover ? 'Önizleme' : 'Sabitlenmiş önizleme'}{!isPreviewable(active.type) ? ' · bu tür 3D önizlemede gösterilemiyor' : ''}</span></> : <span>{t('cosmetics.hover')}</span>}
          </div>
          <button className="primary-btn" disabled title={language === 'en' ? 'Server support is required for equipping' : 'Kuşanma için sunucu desteği gerekiyor'}>{t('cosmetics.equipSoon')}</button>
        </aside>
      </div>
    </div>
  )
}
