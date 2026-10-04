import { useEffect, useState } from 'react'
import { profilesApi, unwrap } from '../../services/profile-api.js'
import { Icon, Modal, ProfileAvatar, Spinner, loaderLabel } from './ui.jsx'

export const PRESET_ICONS = ['R', 'S', 'F', 'M', '◈', '◆', '✦', '●', '⬢', '◇', '▣', '★']
export const FALLBACK_VERSIONS = ['1.21.11', '1.21.10', '1.21.8', '1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1']
const LOADERS = [['vanilla', 'Vanilla'], ['fabric', 'Fabric']]
const SUPPORTED = new Set(['vanilla', 'fabric'])

// Loads Minecraft releases once and loader versions whenever the pair changes.
export function useVersionData(minecraftVersion, loader) {
  const [versions, setVersions] = useState(FALLBACK_VERSIONS)
  const [loaderVersions, setLoaderVersions] = useState([])
  const [loadingLoader, setLoadingLoader] = useState(false)
  const [loaderError, setLoaderError] = useState('')
  useEffect(() => { profilesApi.minecraftVersions().then(r => { if (r?.success && r.versions?.length) setVersions(r.versions) }) }, [])
  useEffect(() => {
    if (loader === 'vanilla' || !SUPPORTED.has(loader)) { setLoaderVersions([]); setLoaderError(''); return }
    let alive = true
    setLoadingLoader(true); setLoaderError(''); setLoaderVersions([])
    profilesApi.loaderVersions(loader, minecraftVersion).then(r => {
      if (!alive) return
      setLoadingLoader(false)
      if (!r?.success) return setLoaderError(r?.error || 'Loader sürümleri alınamadı.')
      if (!r.versions.length) setLoaderError(`${loaderLabel(loader)} henüz Minecraft ${minecraftVersion} desteklemiyor.`)
      setLoaderVersions(r.versions)
    })
    return () => { alive = false }
  }, [minecraftVersion, loader])
  return { versions, loaderVersions, loadingLoader, loaderError }
}

export function LoaderPicker({ value, onChange, disabled }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Loader">
      {LOADERS.map(([id, label]) => (
        <button type="button" key={id} role="radio" aria-checked={value === id} className={value === id ? 'on' : ''} disabled={disabled || !SUPPORTED.has(id)} onClick={() => onChange(id)} title={SUPPORTED.has(id) ? label : `${label} desteği yakında`}>
          {label}{!SUPPORTED.has(id) && <small>soon</small>}
        </button>
      ))}
    </div>
  )
}

export function IconPicker({ icon, image, onIcon, onImage }) {
  async function pick() {
    const r = await profilesApi.pickIcon()
    if (r?.success) onImage({ path: r.path, dataUrl: r.dataUrl })
    else if (!r?.cancelled && r?.error) alert(r.error)
  }
  return (
    <div className="icon-picker">
      {PRESET_ICONS.map(i => <button type="button" key={i} className={!image && icon === i ? 'on' : ''} onClick={() => { onIcon(i); onImage(null) }}>{i}</button>)}
      <button type="button" className={`upload ${image ? 'on' : ''}`} onClick={pick} title="Özel görsel yükle">{image ? <img src={image.dataUrl} alt="" /> : <Icon name="image" size={18} />}</button>
    </div>
  )
}

export default function CreateProfileModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [minecraftVersion, setMinecraftVersion] = useState('1.21.11')
  const [loader, setLoader] = useState('vanilla')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [icon, setIcon] = useState('R')
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = useVersionData(minecraftVersion, loader)

  useEffect(() => {
    const stable = data.loaderVersions.find(v => v.stable) || data.loaderVersions[0]
    setLoaderVersion(stable?.version || '')
  }, [data.loaderVersions])

  const needsLoader = loader === 'fabric'
  const canSubmit = name.trim() && !busy && (!needsLoader || loaderVersion)

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true); setError('')
    try {
      const r = unwrap(await profilesApi.create({ name: name.trim(), minecraftVersion, loader, loaderVersion: needsLoader ? loaderVersion : '', icon, iconSourcePath: image?.path || '' }), 'Profil oluşturulamadı.')
      onCreated(r)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const preview = { name: name.trim() || 'New profile', icon, iconDataUrl: image?.dataUrl }
  return (
    <Modal title="Create profile" subtitle="Each profile has its own Minecraft version, loader, mods, packs and worlds." onClose={onClose} width={600}
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="create-profile" className="btn primary" disabled={!canSubmit}>{busy ? <Spinner /> : <Icon name="plus" size={16} />}{busy ? 'Creating…' : 'Create profile'}</button>
      </>}>
      <form id="create-profile" className="rtf-form" onSubmit={submit}>
        <div className="create-preview">
          <ProfileAvatar profile={preview} size={64} />
          <div><b>{preview.name}</b><span>Minecraft {minecraftVersion} · {loaderLabel(loader)}{needsLoader && loaderVersion ? ` ${loaderVersion}` : ''}</span></div>
        </div>
        <label>Profile name<input value={name} onChange={e => setName(e.target.value)} placeholder="Rtf Survival" maxLength={48} autoFocus /></label>
        <label>Minecraft version
          <select value={minecraftVersion} onChange={e => setMinecraftVersion(e.target.value)}>{data.versions.map(v => <option key={v}>{v}</option>)}</select>
        </label>
        <div className="field"><span>Loader</span><LoaderPicker value={loader} onChange={setLoader} /></div>
        {needsLoader && (
          <label>Loader version
            <select value={loaderVersion} onChange={e => setLoaderVersion(e.target.value)} disabled={data.loadingLoader || !data.loaderVersions.length}>
              {data.loadingLoader ? <option>Loading…</option> : data.loaderVersions.map(v => <option key={v.version} value={v.version}>{v.version}{v.stable ? ' (stable)' : ''}</option>)}
            </select>
            {data.loaderError && <small className="field-error">{data.loaderError}</small>}
          </label>
        )}
        <div className="field"><span>Icon</span><IconPicker icon={icon} image={image} onIcon={setIcon} onImage={setImage} /></div>
        {error && <div className="form-error"><Icon name="alert" size={15} />{error}</div>}
      </form>
    </Modal>
  )
}
