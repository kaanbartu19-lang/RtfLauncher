// Microsoft → Xbox Live → XSTS → Minecraft services chain, shared by the
// interactive login and by the silent refresh that runs before a launch.
const crypto = require('crypto')
const net = require('./net')

const CLIENT_ID = '00000000402b5328'
const REDIRECT_URI = 'https://login.live.com/oauth20_desktop.srf'
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL'

const XERR = {
  2148916233: 'Bu Microsoft hesabının bir Xbox profili yok. Önce xbox.com üzerinden profil oluştur.',
  2148916235: 'Xbox Live bu ülkede kullanılamıyor.',
  2148916236: 'Bu hesap için yetişkin doğrulaması gerekiyor.',
  2148916237: 'Bu hesap için yetişkin doğrulaması gerekiyor.',
  2148916238: 'Bu bir çocuk hesabı; bir aile grubuna eklenmesi gerekiyor.',
}

function authorizeUrl() {
  return `https://login.live.com/oauth20_authorize.srf?${new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI, scope: SCOPE, display: 'touch', locale: 'en' })}`
}

async function liveToken(params) {
  const { status, text } = await net.postForm('https://login.live.com/oauth20_token.srf', new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPE, ...params }).toString())
  let token = {}
  try { token = JSON.parse(text) } catch {}
  if (status < 200 || status >= 300 || !token.access_token) throw new Error(token.error_description || token.error || `Microsoft erişim belirteci alınamadı (HTTP ${status}).`)
  return token
}

async function minecraftFromLiveToken(token) {
  const xbl = JSON.parse(await net.postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${token.access_token}` },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT',
  }))
  const uhs = xbl.DisplayClaims?.xui?.[0]?.uhs
  if (!uhs || !xbl.Token) throw new Error('Xbox Live doğrulaması başarısız.')
  let xsts
  try {
    xsts = JSON.parse(await net.postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
      RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT',
    }))
  } catch (e) {
    let code = null
    try { code = JSON.parse(e.body || '{}').XErr } catch {}
    throw new Error(XERR[code] || (code ? `Xbox doğrulama hatası: ${code}` : e.message))
  }
  if (!xsts.Token) throw new Error('Xbox hesabı Minecraft için yetkilendirilemedi.')
  const xstsUhs = xsts.DisplayClaims?.xui?.[0]?.uhs || uhs
  const mc = JSON.parse(await net.postJson('https://api.minecraftservices.com/authentication/login_with_xbox', { identityToken: `XBL3.0 x=${xstsUhs};${xsts.Token}` }))
  if (!mc.access_token) throw new Error('Minecraft oturum belirteci alınamadı. Minecraft Java Edition sahipliğini kontrol et.')
  let profile
  try { profile = await net.getJson('https://api.minecraftservices.com/minecraft/profile', { Authorization: `Bearer ${mc.access_token}` }) }
  catch (e) { if (e.status === 404) throw new Error('Bu Microsoft hesabında Minecraft Java profili bulunamadı.'); throw e }
  if (!profile?.id || !profile?.name) throw new Error('Bu Microsoft hesabında Minecraft Java profili bulunamadı.')
  return {
    access_token: mc.access_token, client_token: crypto.randomUUID(), uuid: profile.id, name: profile.name,
    user_properties: '{}', meta: { type: 'msa', demo: false },
    refresh_token: token.refresh_token || null,
    expires_at: Date.now() + Number(mc.expires_in || 86400) * 1000,
  }
}

async function loginWithCode(code) {
  return minecraftFromLiveToken(await liveToken({ code, grant_type: 'authorization_code' }))
}

// Returns { auth, refreshed }. Offline accounts are returned unchanged.
async function ensureFresh(auth) {
  if (!auth || auth.meta?.type !== 'msa') return { auth, refreshed: false }
  if (auth.expires_at && auth.expires_at - Date.now() > 5 * 60 * 1000) return { auth, refreshed: false }
  if (!auth.refresh_token) throw Object.assign(new Error('Microsoft oturumunun süresi doldu. Çıkış yapıp tekrar giriş yap.'), { code: 'AUTH_EXPIRED' })
  try {
    const next = await minecraftFromLiveToken(await liveToken({ refresh_token: auth.refresh_token, grant_type: 'refresh_token' }))
    return { auth: { ...next, refresh_token: next.refresh_token || auth.refresh_token }, refreshed: true }
  } catch (e) {
    throw Object.assign(new Error(`Microsoft oturumu yenilenemedi: ${e.message}. Çıkış yapıp tekrar giriş yap.`), { code: 'AUTH_EXPIRED' })
  }
}

module.exports = { authorizeUrl, loginWithCode, ensureFresh, REDIRECT_URI }
