import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    try {
      console.error('[RtfLauncher ErrorBoundary] message:', error?.message || String(error))
      console.error('[RtfLauncher ErrorBoundary] stack:', error?.stack || '')
      console.error('[RtfLauncher ErrorBoundary] componentStack:', info?.componentStack || '')
    } catch {}
  }

  render() {
    if (this.state.error) {
      const english = document.documentElement.dataset.language === 'en'
      return <div className="app-loading renderer-error-screen">
        <b>{english ? 'RtfLauncher encountered a UI error.' : 'RtfLauncher arayüzünde bir hata oluştu.'}</b>
        <p>{english ? 'The launcher is still open. You can reload the interface safely.' : 'Launcher açık kalıyor. Arayüzü güvenli şekilde yeniden yükleyebilirsin.'}</p>
        <button className="primary-btn" onClick={() => window.location.reload()}>{english ? 'Reload interface' : 'Arayüzü yeniden yükle'}</button>
      </div>
    }
    return this.props.children
  }
}
