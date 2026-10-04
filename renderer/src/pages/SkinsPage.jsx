import { useEffect, useState } from 'react'
import CharacterPreview from '../components/CharacterPreview.jsx'
import { detectSkinModel, readFileAsDataUrl } from '../services/skin.js'
import '../features/profiles/profiles.css'
import { useI18n } from '../services/i18n.js'
import './skins.css'

// Choose → validate → detect model → preview → Apply → persisted skin.
// Nothing is saved until Apply; the saved skin and model are reloaded from
// disk on every start.
export function skinIdFor(user) { return String(user?.uuid || user?.id || user?.username || '').replace(/[^A-Za-z0-9_-]/g, '') }

export function useSavedSkin(user) {
  const [saved, setSaved] = useState({ loading: true, dataUrl: null, model: null })
  const id = skinIdFor(user)
  const reload = async () => {
    if (!id) return setSaved({ loading: false, dataUrl: null, model: null })
    const r = await window.api?.loadSkin?.(id)
    setSaved({ loading: false, dataUrl: r?.success ? r.dataUrl : null, model: r?.success ? r.model : null, updatedAt: r?.updatedAt, error: r?.success || r?.missing ? '' : r?.error })
  }
  useEffect(() => { reload() }, [id])
  return { ...saved, id, reload }
}

export default function SkinsPage({ user }) {
  const api = window.api || {}
  const { t, locale, language } = useI18n()
  const saved = useSavedSkin(user)
  const [draft, setDraft] = useState(null) // { dataUrl, model, detected, fileName }
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [outer, setOuter] = useState(true)
  const [anim, setAnim] = useState('walk')
  const isMicrosoft = user?.type === 'microsoft'

  async function prepare(dataUrl, fileName) {
    const detected = await detectSkinModel(dataUrl)
    setDraft({ dataUrl, model: detected, detected, fileName })
    setError(''); setNotice('')
  }

  async function choose() {
    setError(''); setNotice('')
    const r = await api.pickSkin?.()
    if (r?.cancelled) return
    if (!r?.success) return setError(r?.error || t('skin.invalid'))
    try { await prepare(r.dataUrl, r.fileName) } catch (e) { setError(e.message) }
  }

  async function onDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.type !== 'image/png' && !/\.png$/i.test(file.name)) return setError('Invalid Minecraft skin: dosya PNG olmalı.')
    try { await prepare(await readFileAsDataUrl(file), file.name) } catch (err) { setError(err.message) }
  }

  async function apply() {
    if (!draft || !saved.id) return
    setBusy('apply'); setError('')
    try {
      const r = await api.applySkin?.({ uuid: saved.id, dataUrl: draft.dataUrl, model: draft.model })
      if (!r?.success) throw new Error(r?.error || 'Skin kaydedilemedi.')
      await saved.reload()
      setDraft(null)
      setNotice(isMicrosoft ? (language === 'en' ? 'Skin saved to launcher. Use “Upload to Minecraft account” to publish it in-game.' : 'Skin launcher’a kaydedildi. Oyunda görünmesi için “Minecraft hesabına yükle”yi kullan.') : t('skin.uploaded'))
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  async function uploadToAccount() {
    setBusy('upload'); setError(''); setNotice('')
    try {
      const r = await api.uploadSkinToAccount?.({ uuid: saved.id, model: saved.model || 'default' })
      if (!r?.success) throw new Error(r?.error || 'Skin hesaba yüklenemedi.')
      setNotice('Skin Minecraft hesabına yüklendi. Oyunda birkaç dakika içinde görünür.')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  async function removeSkin() {
    setBusy('remove'); setError('')
    const r = await api.clearSkin?.(saved.id)
    if (!r?.success) setError(r?.error || 'Skin silinemedi.')
    await saved.reload(); setBusy(''); setNotice('Kayıtlı skin kaldırıldı.')
  }

  const showing = draft || (saved.dataUrl ? { dataUrl: saved.dataUrl, model: saved.model || 'auto-detect' } : null)
  return (
    <div className="page-scroll skins-v2" onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <div className="page-kicker">{t('nav.skins').toUpperCase()}</div>
      <div className="skins-head">
        <div><h1>{t('skin.title')}</h1><p className="muted">{t('skin.subtitle')}</p></div>
      </div>
      {error && <div className="notice error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <div className="skins-layout">
        <div className="skins-stage">
          <CharacterPreview username={user?.username} skinUrl={showing?.dataUrl} model={showing?.model || 'auto-detect'} animation={anim} showOuterLayer={outer} />
          <div className="skins-stage-tools">
            <div className="seg compact">
              {[['walk', 'Walk'], ['idle', 'Idle'], ['none', 'Still']].map(([v, l]) => <button key={v} className={anim === v ? 'on' : ''} onClick={() => setAnim(v)}>{l}</button>)}
            </div>
            <label className="rtf-check small"><input type="checkbox" checked={outer} onChange={e => setOuter(e.target.checked)} />Overlay layer</label>
            <span className="skins-hint">Sürükle: döndür · Tekerlek: yakınlaştır</span>
          </div>
        </div>
        <aside className="skins-panel">
          {draft ? (
            <>
              <h3>{t('skin.preview')}</h3>
              <p className="muted">{draft.fileName || 'Yeni skin'} — henüz kaydedilmedi</p>
              <div className="field-block">
                <span>Model</span>
                <div className="seg">
                  <button className={draft.model === 'default' ? 'on' : ''} onClick={() => setDraft(d => ({ ...d, model: 'default' }))}>Classic (Steve)</button>
                  <button className={draft.model === 'slim' ? 'on' : ''} onClick={() => setDraft(d => ({ ...d, model: 'slim' }))}>Slim (Alex)</button>
                </div>
                <small className="muted">Otomatik algılanan: <b>{draft.detected === 'slim' ? 'Slim' : 'Classic'}</b></small>
              </div>
              <div className="skins-actions">
                <button className="btn ghost" onClick={() => setDraft(null)} disabled={!!busy}>{language === 'en' ? 'Cancel' : 'Vazgeç'}</button>
                <button className="btn primary" onClick={apply} disabled={!!busy}>{busy === 'apply' ? (language === 'en' ? 'Applying…' : 'Uygulanıyor…') : t('skin.apply')}</button>
              </div>
            </>
          ) : (
            <>
              <h3>{saved.dataUrl ? t('skin.current') : t('skin.none')}</h3>
              <p className="muted">{saved.dataUrl ? `${saved.model === 'slim' ? 'Slim' : 'Classic'} model${saved.updatedAt ? ` · ${new Date(saved.updatedAt).toLocaleDateString(locale)}` : ''}` : 'Varsayılan olarak hesabının mevcut skin’i gösterilir.'}</p>
              <div className="skins-actions column">
                <button className="btn primary" onClick={choose} disabled={!!busy || !saved.id}>{t('skin.choose')}</button>
                {saved.dataUrl && isMicrosoft && <button className="btn ghost" onClick={uploadToAccount} disabled={!!busy}>{busy === 'upload' ? (language === 'en' ? 'Uploading…' : 'Yükleniyor…') : (language === 'en' ? 'Upload to Minecraft account' : 'Minecraft hesabına yükle')}</button>}
                {saved.dataUrl && <button className="btn ghost" onClick={removeSkin} disabled={!!busy}>{t('skin.remove')}</button>}
              </div>
              {!isMicrosoft && saved.dataUrl && <p className="muted small-note">Yerel (offline) hesaplarda skin yalnızca launcher’da görünür; oyun içinde göstermek için sunucu tarafında skin eklentisi gerekir.</p>}
            </>
          )}
          <p className="muted small-note">Kabul edilen: PNG, 64×64 veya 64×32 (eski format).</p>
        </aside>
      </div>
    </div>
  )
}
