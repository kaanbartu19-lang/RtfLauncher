import { Icon, Spinner } from './ui.jsx'

// + Install → Installing… → ✓ Installed. Installed content never shows Install.
export default function InstallButton({ state, installed, compat, onInstall, large }) {
  if (installed) return <span className={`install-state installed ${large ? 'large' : ''}`}><Icon name="check" size={16} />Installed</span>
  if (state) return <button className={`btn install ${large ? 'large' : ''}`} disabled><Spinner size={14} />{state.label ? `${state.label}…` : Number.isFinite(state.pct) ? `Installing ${state.pct}%` : 'Installing…'}</button>
  if (!compat.ok) return <span className={`install-state incompatible ${large ? 'large' : ''}`} title={compat.reason}><Icon name="alert" size={14} />Not compatible</span>
  return <button className={`btn install ${large ? 'large' : ''}`} onClick={e => { e.stopPropagation(); onInstall() }}><Icon name="plus" size={16} />Install</button>
}
