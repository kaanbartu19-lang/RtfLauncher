import { useEffect, useState } from 'react'

// Settings → "Güncellemeler". This is only a view over the existing updater
// (electron/updater/updater.js): every button calls the real IPC and every line
// of status comes from the real `updates:status` events — nothing here is
// simulated. The startup popup in App.jsx keeps working independently.
export default function UpdatesSection({ language = 'tr' }) {
  const api = window.api || {}
  const en = language === 'en'
  const tr = (trText, enText) => (en ? enText : trText)

  const [version, setVersion] = useState('')
  const [state, setState] = useState({ status: 'idle' })
  const [pending, setPending] = useState(false) // a button press is awaiting the main process
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let alive = true
    api.getAppVersion?.().then(r => { if (alive && r?.version) setVersion(r.version) }).catch(() => {})
    api.getUpdateState?.().then(s => { if (alive && s) setState(s) }).catch(() => {})
    const off = api.onUpdateStatus?.(s => { if (alive && s) { setState(s); setNotice('') } })
    return () => { alive = false; if (typeof off === 'function') off() }
  }, [])

  const current = state.currentVersion || version || '—'
  const status = state.status
  const checking = status === 'checking'
  const downloading = status === 'downloading'
  const pct = Math.max(0, Math.min(100, Number(state.percent) || 0))
  const mb = n => `${(Number(n || 0) / 1024 / 1024).toFixed(1)} MB`

  async function run(fn) {
    setPending(true); setNotice('')
    try { return await fn() } catch { setNotice(tr('İşlem başlatılamadı. Launcher’ı yeniden başlatıp tekrar dene.', 'Could not start the action. Restart the launcher and try again.')) }
    finally { setPending(false) }
  }
  const check = () => run(async () => {
    const r = await api.checkForUpdates?.(true)
    if (r?.skipped) setNotice(tr('Güncelleme kontrolü yalnızca kurulu (paketlenmiş) sürümde çalışır.', 'Update checks only run in the installed (packaged) build.'))
  })
  const download = () => run(() => api.downloadUpdate?.())
  const cancel = () => run(() => api.cancelUpdateDownload?.())
  const install = () => run(() => api.installUpdate?.())
  const openReleases = () => api.getReleasesUrl?.().then(r => r?.url && api.openExternal?.(r.url)).catch(() => {})

  let line = tr('Güncellemeleri kontrol etmek için düğmeye bas.', 'Press the button to check for updates.')
  if (state.dev) line = tr('Geliştirme modundasın: güncelleme kontrolü yalnızca kurulu sürümde çalışır.', 'Development mode: update checks only run in the installed build.')
  else if (checking) line = tr('Güncellemeler kontrol ediliyor…', 'Checking for updates…')
  else if (status === 'up-to-date') line = tr('RtfLauncher güncel. Yapman gereken bir şey yok.', 'RtfLauncher is up to date. Nothing to do.')
  else if (status === 'no-release') line = tr('Henüz yayınlanmış bir güncelleme yok.', 'No update has been published yet.')
  else if (status === 'available') line = state.cancelled
    ? tr(`İndirme iptal edildi. v${state.version || '?'} hâlâ indirilebilir.`, `Download cancelled. v${state.version || '?'} is still available.`)
    : tr(`Yeni sürüm bulundu: v${state.version || '?'}`, `New version found: v${state.version || '?'}`)
  else if (downloading) line = tr('Güncelleme indiriliyor…', 'Downloading update…')
  else if (status === 'downloaded') line = tr(`v${state.version || '?'} indirildi. Kurmak için launcher yeniden başlatılacak.`, `v${state.version || '?'} downloaded. The launcher will restart to install it.`)
  else if (status === 'installing') line = tr('Güncelleme kuruluyor, launcher birazdan yeniden açılacak…', 'Installing the update — the launcher will reopen shortly…')
  else if (status === 'error') line = state.error || tr('Güncelleme sırasında bir sorun oluştu.', 'Something went wrong while updating.')

  const isError = status === 'error' && !state.dev
  const canCheck = !pending && !checking && !downloading && status !== 'installing'

  return <section className="settings-card" data-testid="updates-section">
    <h2>{tr('Güncellemeler', 'Updates')}</h2>
    <p className="muted">{tr('Mevcut sürüm', 'Current version')}: <b>v{current}</b></p>

    <div className={isError ? 'notice error' : 'notice'} style={{ position: 'static', margin: '12px 0' }} role="status" aria-live="polite">{line}</div>
    {notice && <div className="notice" style={{ position: 'static', margin: '0 0 12px' }}>{notice}</div>}

    {downloading && <>
      <div className="rtf-update-download-row"><b>{pct.toFixed(1)}%</b><span className="muted">{mb(state.transferred)} / {mb(state.total)}{Number(state.bytesPerSecond) > 0 ? ` · ${mb(state.bytesPerSecond)}/s` : ''}</span></div>
      <div className="rtf-update-progress"><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: '#19d66b', borderRadius: 99 }} /></div>
    </>}

    <div className="settings-actions-row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
      {(status === 'idle' || status === 'up-to-date' || status === 'no-release' || checking || isError) &&
        <button className="btn primary" onClick={check} disabled={!canCheck}>{checking ? tr('Kontrol ediliyor…', 'Checking…') : isError ? tr('Tekrar dene', 'Try again') : tr('Güncellemeleri kontrol et', 'Check for updates')}</button>}
      {status === 'available' && <>
        <button className="btn primary" onClick={download} disabled={pending}>{tr('Güncellemeyi indir', 'Download update')}</button>
        <button className="btn ghost" onClick={check} disabled={!canCheck}>{tr('Tekrar kontrol et', 'Check again')}</button>
      </>}
      {downloading && <button className="btn ghost" onClick={cancel} disabled={pending}>{tr('İndirmeyi iptal et', 'Cancel download')}</button>}
      {status === 'downloaded' && <button className="btn primary" onClick={install} disabled={pending}>{tr('Yeniden başlat ve güncelle', 'Restart and update')}</button>}
      {(isError || status === 'no-release') && <button className="btn ghost" onClick={openReleases}>{tr('GitHub sürümlerini aç', 'Open GitHub releases')}</button>}
    </div>

    {status === 'available' && state.releaseNotes && <>
      <h3 style={{ margin: '18px 0 6px', fontSize: 14 }}>{tr('Yeni sürümde neler var?', 'What is new?')}</h3>
      <div className="rtf-update-notes" style={{ paddingTop: 0 }}>{state.releaseNotes}</div>
    </>}
  </section>
}
