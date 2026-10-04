import { useEffect, useState } from 'react'
import { profilesApi, unwrap } from '../../services/profile-api.js'
import { Icon, Modal, Spinner, Toggle } from './ui.jsx'
import { IconPicker, LoaderPicker, useVersionData } from './CreateProfileModal.jsx'

export default function ProfileSettingsModal({ profile, running, onClose, onSaved }) {
  const [name, setName] = useState(profile.name)
  const [icon, setIcon] = useState(profile.icon)
  const [image, setImage] = useState(profile.iconDataUrl ? { dataUrl: profile.iconDataUrl, existing: true } : null)
  const [minecraftVersion, setMinecraftVersion] = useState(profile.minecraftVersion)
  const [loader, setLoader] = useState(profile.loader)
  const [loaderVersion, setLoaderVersion] = useState(profile.loaderVersion)
  const [memory, setMemory] = useState(profile.memory)
  const [javaPath, setJavaPath] = useState(profile.javaPath || '')
  const [jvmArgs, setJvmArgs] = useState(profile.jvmArgs || '')
  const [autoJoin, setAutoJoin] = useState(profile.autoJoinServer !== false)
  const [java, setJava] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const data = useVersionData(minecraftVersion, loader)

  useEffect(() => {
    if (!data.loaderVersions.length) return
    if (!data.loaderVersions.some(v => v.version === loaderVersion)) setLoaderVersion((data.loaderVersions.find(v => v.stable) || data.loaderVersions[0]).version)
  }, [data.loaderVersions])

  useEffect(() => {
    let alive = true
    setJava({ checking: true })
    profilesApi.javaDetect(minecraftVersion, javaPath).then(r => { if (alive) setJava(r?.success ? r.java : { error: r?.error }) })
    return () => { alive = false }
  }, [minecraftVersion, javaPath])

  const versionChanged = minecraftVersion !== profile.minecraftVersion || loader !== profile.loader || loaderVersion !== profile.loaderVersion
  const needsLoader = loader === 'fabric'

  async function pickJava() {
    const r = await profilesApi.javaPick()
    if (r?.success) setJavaPath(r.path)
    else if (!r?.cancelled && r?.error) setError(r.error)
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const patch = { name: name.trim() || profile.name, icon, memory: Number(memory), javaPath, jvmArgs, autoJoinServer: autoJoin, minecraftVersion, loader, loaderVersion: needsLoader ? loaderVersion : '' }
      if (image?.path) patch.iconSourcePath = image.path
      if (!image && profile.iconDataUrl) patch.clearIconImage = true
      onSaved(unwrap(await profilesApi.update(profile.id, patch), 'Ayarlar kaydedilemedi.'))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Profile settings" subtitle={profile.name} onClose={onClose} width={640} className="settings-modal"
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="profile-settings" className="btn primary" disabled={busy || (needsLoader && !loaderVersion)}>{busy ? <Spinner /> : <Icon name="check" size={16} />}Save</button>
      </>}>
      <form id="profile-settings" className="rtf-form" onSubmit={save}>
        <h4 className="form-section">General</h4>
        <label>Profile name<input value={name} onChange={e => setName(e.target.value)} maxLength={48} /></label>
        <div className="field"><span>Icon</span><IconPicker icon={icon} image={image} onIcon={setIcon} onImage={setImage} /></div>

        <h4 className="form-section">Installation</h4>
        {running && <div className="form-note"><Icon name="alert" size={14} />Oyun açıkken sürüm ve loader değiştirilemez.</div>}
        <label>Minecraft version<select value={minecraftVersion} onChange={e => setMinecraftVersion(e.target.value)} disabled={running}>{data.versions.map(v => <option key={v}>{v}</option>)}</select></label>
        <div className="field"><span>Loader</span><LoaderPicker value={loader} onChange={setLoader} disabled={running} /></div>
        {needsLoader && (
          <label>Loader version
            <select value={loaderVersion} onChange={e => setLoaderVersion(e.target.value)} disabled={running || data.loadingLoader || !data.loaderVersions.length}>
              {data.loadingLoader ? <option>Loading…</option> : data.loaderVersions.map(v => <option key={v.version} value={v.version}>{v.version}{v.stable ? ' (stable)' : ''}</option>)}
            </select>
            {data.loaderError && <small className="field-error">{data.loaderError}</small>}
          </label>
        )}
        {versionChanged && <div className="form-note warn"><Icon name="alert" size={14} />Installed mods and packs are kept but may not be compatible with the new version. Check the Content tab after saving.</div>}

        <h4 className="form-section">Java & memory</h4>
        <label>Memory: <b>{(memory / 1024).toFixed(1)} GB</b>
          <input type="range" min={1024} max={16384} step={512} value={memory} onChange={e => setMemory(Number(e.target.value))} />
        </label>
        <div className="field">
          <span>Java</span>
          <div className="java-row">
            <input value={javaPath} onChange={e => setJavaPath(e.target.value)} placeholder="Automatic (recommended)" />
            <button type="button" className="btn ghost small" onClick={pickJava}><Icon name="folder" size={14} />Browse</button>
            {javaPath && <button type="button" className="btn ghost small" onClick={() => setJavaPath('')}>Auto</button>}
          </div>
          <small className={java?.error ? 'field-error' : 'field-hint'}>
            {java?.checking ? 'Checking Java…' : java?.error ? java.error : java ? `Java ${java.major} will be used (${java.path}). Minecraft ${minecraftVersion} needs Java ${java.required}+.` : ''}
          </small>
        </div>
        <label>JVM arguments<input value={jvmArgs} onChange={e => setJvmArgs(e.target.value)} placeholder="-XX:+UseG1GC" /></label>

        <h4 className="form-section">Launch</h4>
        <div className="field inline"><Toggle checked={autoJoin} onChange={setAutoJoin} label="Auto-join server" /><span>Join the RtfSMP server automatically when this profile starts</span></div>
        <div className="field">
          <span>Game directory</span>
          <div className="java-row"><code className="path">{profile.instancePath}</code><button type="button" className="btn ghost small" onClick={() => profilesApi.openFolder(profile.id)}><Icon name="external" size={14} />Open</button></div>
        </div>
        {error && <div className="form-error"><Icon name="alert" size={15} />{error}</div>}
      </form>
    </Modal>
  )
}
