import { Icon, ProfileAvatar, loaderLabel } from './ui.jsx'
import { useI18n } from '../../services/i18n.js'

export default function ProfileRail({ profiles, activeId, launch, onSelect, onCreate }) {
  const { language } = useI18n()
  return (
    <aside className="rtf-rail" aria-label="Profiller">
      <div className="rtf-rail-head">
        <span className="rtf-rail-title">{language === 'en' ? 'Profiles' : 'Profiller'}</span>
        <span className="rtf-rail-count">{profiles.length}</span>
        <button className="icon-btn rtf-rail-add" onClick={onCreate} title={language === 'en' ? 'Create profile' : 'Profil oluştur'} aria-label={language === 'en' ? 'Create profile' : 'Profil oluştur'}><Icon name="plus" size={16} /></button>
      </div>
      <div className="rtf-rail-list">
        {profiles.map(p => {
          const state = launch[p.id]?.state
          return (
            <button key={p.id} className={`rtf-rail-item ${p.id === activeId ? 'active' : ''}`} onClick={() => onSelect(p.id)} title={`${p.name} — ${p.minecraftVersion} ${loaderLabel(p.loader)}`} aria-current={p.id === activeId ? 'true' : undefined}>
              <span className="rtf-rail-avatar">
                <ProfileAvatar profile={p} size={38} />
                {state && <span className={`rtf-rail-dot ${state}`} title={state === 'running' ? 'Oyun açık' : 'Başlatılıyor'} />}
              </span>
              <span className="rtf-rail-copy">
                <b>{p.name}</b>
                <small>{p.minecraftVersion} · {loaderLabel(p.loader)}</small>
              </span>
            </button>
          )
        })}
        {!profiles.length && <div className="rtf-rail-empty">{language === 'en' ? 'No profiles yet' : 'Henüz profil yok'}</div>}
      </div>
      <button className="rtf-rail-create" onClick={onCreate}><Icon name="plus" size={16} /><span>{language === 'en' ? 'Create profile' : 'Profil oluştur'}</span></button>
    </aside>
  )
}
