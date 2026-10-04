// RtfSMP backend client. Errors are mapped from the real HTTP status so the UI
// never shows "log in as admin" for what is actually a 404 or a 500.
export const apiBase = branding => String(branding?.apiUrl || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code }
}

export function messageForStatus(status, serverMessage = '') {
  switch (status) {
    case 400: return serverMessage || 'İstek geçersiz.'
    case 401: return 'Oturum gerekli veya süresi dolmuş. Çıkış yapıp tekrar giriş yap.'
    case 403: return 'Bu işlem için yetkin yok.'
    case 404: return serverMessage && !/endpoint/i.test(serverMessage) ? serverMessage : 'Kaynak veya endpoint bulunamadı.'
    case 409: return serverMessage || 'Çakışma: bu kayıt zaten var.'
    case 413: return serverMessage || 'Gönderilen veri çok büyük.'
    case 422: return serverMessage || 'Gönderilen veri geçersiz.'
    case 429: return 'Çok fazla istek. Biraz sonra tekrar dene.'
    default:
      if (status >= 500) return `Sunucu hatası (HTTP ${status}).${serverMessage ? ` ${serverMessage}` : ''}`
      return serverMessage || `HTTP ${status}`
  }
}

let tokenCache = null
export async function getToken() {
  if (tokenCache !== null) return tokenCache
  const r = await window.api?.getBackendToken?.()
  tokenCache = r?.token || ''
  return tokenCache
}
export async function setToken(token) {
  tokenCache = token || ''
  await window.api?.setBackendToken?.(token || null)
}

export async function getJson(url, options = {}) {
  let r
  try { r = await fetch(url, { cache: 'no-store', ...options }) }
  catch { throw new ApiError('Sunucuya ulaşılamadı. İnternet bağlantını veya API adresini kontrol et.', 0, 'NETWORK') }
  const text = await r.text()
  let data = null
  try { data = text ? JSON.parse(text) : {} } catch {}
  if (!r.ok) throw new ApiError(messageForStatus(r.status, data?.error), r.status)
  if (data === null) throw new ApiError('API JSON yerine başka bir yanıt döndürdü. API adresini kontrol et.', r.status, 'BAD_RESPONSE')
  return data
}
export async function apiGet(branding, path) { return getJson(`${apiBase(branding)}${path}`) }
export async function apiAuth(branding, path, options = {}) {
  const token = await getToken()
  return getJson(`${apiBase(branding)}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } })
}
