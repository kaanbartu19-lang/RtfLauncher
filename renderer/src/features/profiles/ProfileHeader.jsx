import { useState } from 'react'
import { Icon, Menu, ProfileAvatar, Spinner, loaderLabel } from './ui.jsx'
import { timeAgo } from '../../services/modrinth.js'

export default function ProfileHeader({ profile, launch, total, onPlay, onStop, onSettings, onDuplicate, onOpenFolder, onExport, onDelete }) {
  const [menu, setMenu] = useState(false)
  const state = launch?.state
  const preparing = state === 'preparing'
  const running = state === 'running'
  const act = fn => () => { setMenu(false); fn() }

  return (
    <header className="rtf-profile-header">
      <ProfileAvatar profile={profile} size={72} />
      <div className="rtf-profile-title">
        <h1>{profile.name}</h1>
        <div className="rtf-profile-meta">
          <span><Icon name="loader" size={15} />{profile.loader === 'vanilla' ? `Minecraft ${profile.minecraftVersion}` : `${loaderLabel(profile.loader)} ${profile.minecraftVersion}`}</span>
          <span className="sep" />
          <span><Icon name="clock" size={15} />{running ? 'Playing now' : profile.lastPlayedAt ? `Played ${timeAgo(profile.lastPlayedAt)}` : 'Never played'}</span>
          <span className="sep" />
          <span><Icon name="box" size={15} />{total} {total === 1 ? 'project' : 'projects'}</span>
        </div>
        {preparing && <div className="rtf-launch-step"><Spinner size={12} />{launch.step || 'Hazırlanıyor'}{Number.isFinite(launch.progress) ? ` · ${launch.progress}%` : ''}</div>}
      </div>
      <div className="rtf-profile-actions">
        {running
          ? <button className="rtf-play stop" onClick={onStop}><Icon name="stop" size={18} /><span>Stop</span></button>
          : <button className={`rtf-play ${preparing ? 'loading' : ''}`} onClick={onPlay} disabled={preparing} aria-busy={preparing}>
              {preparing ? <Spinner size={18} /> : <Icon name="play" size={20} />}
              <span>{preparing ? 'Launching…' : 'Play'}</span>
            </button>}
        <button className="square-btn" onClick={onSettings} title="Profil ayarları" aria-label="Profil ayarları"><Icon name="gear" size={20} /></button>
        <div className="rtf-menu-anchor">
          <button className={`square-btn ${menu ? 'active' : ''}`} onClick={() => setMenu(v => !v)} title="Diğer işlemler" aria-label="Diğer işlemler" aria-expanded={menu}><Icon name="dots" size={20} /></button>
          <Menu open={menu} onClose={() => setMenu(false)}>
            <button role="menuitem" onClick={act(onDuplicate)}><Icon name="copy" size={16} />Duplicate</button>
            <button role="menuitem" onClick={act(onOpenFolder)}><Icon name="folder" size={16} />Open folder</button>
            <button role="menuitem" onClick={act(onExport)}><Icon name="upload" size={16} />Export</button>
            <div className="rtf-menu-sep" />
            <button role="menuitem" className="danger" onClick={act(onDelete)} disabled={!!state}><Icon name="trash" size={16} />Delete</button>
          </Menu>
        </div>
      </div>
    </header>
  )
}
