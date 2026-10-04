import { useEffect, useState } from 'react'
import { useI18n } from '../services/i18n.js'

export default function LoginPage({ onLogin, initialTab = 'login' }) {
  const { t, language } = useI18n()
  const [tab, setTab] = useState(initialTab === 'register' ? 'register' : 'login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [regUser, setRegUser] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPass, setRegPass] = useState('')
  const [regPass2, setRegPass2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [appVersion, setAppVersion] = useState('')
  const api = window.api || {}

  useEffect(() => {
    api.getAppVersion?.().then(r => setAppVersion(r?.version || '')).catch(() => {})
  }, [])

  async function getBranding() {
    return await api.loadBranding?.() || {}
  }

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    if (!username.trim()) return setError((language === 'en' ? 'Username is required.' : 'Kullanıcı adı boş olamaz.'))
    if (!password) return setError((language === 'en' ? 'Password is required.' : 'Şifre boş olamaz.'))
    setLoading(true)
    try {
      const branding = await getBranding()
      const apiUrl = branding.apiUrl || ''
      const adminAccounts = branding.adminAccounts || []

      if (apiUrl) {
        const res = await fetch(`${apiUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password })
        }).catch(() => null)

        if (res?.ok) {
          const data = await res.json()
          console.info('[RtfLauncher auth] login response', { username: username.trim(), status: res.status, success: data?.success === true, code: data?.code || null })
          if (data.success) {
            const isAdmin = adminAccounts.includes(username.trim()) || data.user?.role === 'admin'
            const authRes = await api.authCracked?.(username.trim())
            onLogin({ ...authRes?.user, isAdmin, token: data.token, role: data.user?.role }, data.token)
            return
          }
          setError(data.error || (language === 'en' ? 'Sign-in failed.' : 'Giriş başarısız.'))
        } else {
          const data = await res?.json().catch(() => ({}))
          console.warn('[RtfLauncher auth] login rejected', { username: username.trim(), status: res?.status || 0, code: data?.code || null })
          setError(data?.error || (language === 'en' ? 'Could not connect to the server.' : 'Sunucuya bağlanılamadı.'))
        }
      } else {
        setError((language === 'en' ? 'The API server is not configured.' : 'API sunucusu yapılandırılmamış.'))
      }
    } catch(e) { setError((language === 'en' ? 'Error: ' : 'Hata: ') + e.message) }
    setLoading(false)
  }

  async function handleMicrosoft() {
    setError(''); setSuccess(''); setLoading(true)
    try {
      const res = await api.authMicrosoft?.()
      if (!res?.success) throw new Error(res?.error || 'Microsoft girişi başarısız.')
      const user = res.user
      // App persists the user (without tokens) as a config patch; writing
      // { user } here used to replace config.json and erase every profile.
      await onLogin({ ...user, isAdmin: false, role: 'player' }, null)
    } catch (e) { setError(e.message || 'Microsoft girişi başarısız.') }
    setLoading(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!regUser.trim()) return setError((language === 'en' ? 'Username is required.' : 'Kullanıcı adı boş olamaz.'))
    if (regUser.trim().length < 3) return setError((language === 'en' ? 'At least 3 characters.' : 'En az 3 karakter.'))
    if (regUser.trim().length > 16) return setError((language === 'en' ? 'At most 16 characters.' : 'En fazla 16 karakter.'))
    if (!/^[a-zA-Z0-9_]+$/.test(regUser.trim())) return setError((language === 'en' ? 'Only letters, numbers and _ are allowed.' : 'Sadece harf, rakam ve _ kullanılabilir.'))
    if (regPass.length < 6) return setError((language === 'en' ? 'Password must be at least 6 characters.' : 'Şifre en az 6 karakter.'))
    if (regPass !== regPass2) return setError((language === 'en' ? 'Passwords do not match.' : 'Şifreler eşleşmiyor.'))
    setLoading(true)
    try {
      const branding = await getBranding()
      const res = await fetch(`${branding.apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: regUser.trim(), email: regEmail, password: regPass })
      }).catch(() => null)
      if (res?.ok) {
        const data = await res.json()
        console.info('[RtfLauncher auth] register response', { username: regUser.trim(), status: res.status, success: data?.success === true, code: data?.code || null })
        if (data.success) {
          await api.patchConfig?.({ accountRegistered: true })
          setSuccess(t('login.accountCreated'))
          setTab('login')
          setUsername(regUser.trim())
          setPassword('')
          setRegPass('')
          setRegPass2('')
        }
        else setError(data.error || (language === 'en' ? 'Registration failed.' : 'Kayıt başarısız.'))
      } else {
        const data = await res?.json().catch(()=>({}))
        console.warn('[RtfLauncher auth] register rejected', { username: regUser.trim(), status: res?.status || 0, code: data?.code || null })
        if (res?.status === 409 && data?.code === 'ACCOUNT_EXISTS') {
          await api.patchConfig?.({ accountRegistered: true })
          setError('')
          setSuccess(t('login.accountExists'))
          setTab('login')
          setUsername(regUser.trim())
          setPassword('')
          setRegPass('')
          setRegPass2('')
        } else {
          setError(data?.error || (language === 'en' ? 'Could not connect to the server.' : 'Sunucuya bağlanılamadı.'))
        }
      }
    } catch(e) { setError((language === 'en' ? 'Error: ' : 'Hata: ') + e.message) }
    setLoading(false)
  }

  return (
    <div style={{height:'100vh',display:'flex',flexDirection:'column',background:'#0f1117',position:'relative',overflow:'hidden'}}>
      {/* Titlebar */}
      <div style={{height:32,background:'#0d1117',borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 12px',WebkitAppRegion:'drag',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:13,fontWeight:700,color:'#e6edf3'}}>RtfLauncher</span>
        </div>
        <div style={{display:'flex',gap:6,WebkitAppRegion:'no-drag'}}>
          {[{c:'#374151',a:()=>api.minimize?.()},{c:'#374151',a:()=>api.maximize?.()},{c:'#ef4444',a:()=>api.close?.()}].map((b,i)=>(
            <button key={i} onClick={b.a} style={{width:12,height:12,borderRadius:'50%',background:b.c,border:'none',cursor:'pointer'}}/>
          ))}
        </div>
      </div>

      {/* Background */}
      <div style={{position:'absolute',inset:0,zIndex:0,background:'radial-gradient(ellipse at 30% 50%, rgba(37,99,235,.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(59,130,246,.05) 0%, transparent 60%)'}}/>

      {/* Content */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',position:'relative',zIndex:1}}>
        <div style={{width:380}}>
          {/* Logo */}
          <div style={{textAlign:'center',marginBottom:32}}>
            <img src="./logo.png" style={{height:56,marginBottom:12,filter:'drop-shadow(0 0 20px rgba(37,99,235,.4))'}}
              onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='block'}}/>
            <div style={{display:'none',fontSize:28,fontWeight:800,color:'#e6edf3',letterSpacing:-1}}>RtfSMP</div>
            <div style={{fontSize:13,color:'#8b949e',marginTop:4}}>{t('login.welcome')}</div>
          </div>

          {/* Card */}
          <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:12,padding:28,boxShadow:'0 16px 48px rgba(0,0,0,.4)'}}>
            {/* Tabs */}
            <div style={{display:'flex',borderBottom:'1px solid rgba(255,255,255,.08)',marginBottom:24}}>
              {[['login', language === 'en' ? 'Log In' : 'Giriş Yap'],['register', language === 'en' ? 'Register' : 'Kayıt Ol']].map(([t,l])=>(
                <button key={t} onClick={()=>{setTab(t);setError('');setSuccess('')}} style={{
                  flex:1,padding:'8px 0',background:'transparent',border:'none',fontSize:14,
                  fontWeight:tab===t?600:400,color:tab===t?'#e6edf3':'#8b949e',
                  position:'relative',cursor:'pointer',transition:'color .2s'
                }}>
                  {l}
                  {tab===t&&<div style={{position:'absolute',bottom:-1,left:'15%',right:'15%',height:2,background:'#2563eb',borderRadius:2}}/>}
                </button>
              ))}
            </div>

            {error && <div style={{background:'rgba(248,81,73,.1)',border:'1px solid rgba(248,81,73,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,color:'#f85149',fontSize:13}}>{error}</div>}
            {success && <div style={{background:'rgba(63,185,80,.1)',border:'1px solid rgba(63,185,80,.3)',borderRadius:8,padding:'10px 14px',marginBottom:16,color:'#3fb950',fontSize:13}}>{success}</div>}

            {tab === 'login' ? (
              <form onSubmit={handleLogin}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#8b949e',marginBottom:6,letterSpacing:.5}}>{t('login.username')}</label>
                <input value={username} onChange={e=>setUsername(e.target.value)} placeholder={language === 'en' ? 'your username' : 'kullanıcı adın'}
                  style={{width:'100%',padding:'10px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#e6edf3',fontSize:14,outline:'none',marginBottom:14,transition:'border-color .2s'}}
                  onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,.1)'} autoFocus/>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'#8b949e',marginBottom:6,letterSpacing:.5}}>{t('login.password')}</label>
                <input value={password} onChange={e=>setPassword(e.target.value)} type="password" placeholder={language === 'en' ? 'your password' : 'şifren'}
                  style={{width:'100%',padding:'10px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#e6edf3',fontSize:14,outline:'none',marginBottom:20,transition:'border-color .2s'}}
                  onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,.1)'}/>
                <button type="submit" disabled={loading} style={{width:'100%',padding:'11px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer',transition:'background .2s'}}
                  onMouseEnter={e=>e.target.style.background='#3b82f6'} onMouseLeave={e=>e.target.style.background='#2563eb'}>
                  {loading ? (language === 'en' ? 'Signing in…' : 'Giriş yapılıyor…') : t('common.login')}
                </button>
                <div style={{display:'flex',alignItems:'center',gap:10,margin:'18px 0 14px',color:'#484f58',fontSize:11}}><div style={{height:1,background:'rgba(255,255,255,.08)',flex:1}}/><span>{language === 'en' ? 'OR' : 'VEYA'}</span><div style={{height:1,background:'rgba(255,255,255,.08)',flex:1}}/></div>
                <button type="button" disabled={loading} onClick={handleMicrosoft} style={{width:'100%',padding:'11px',background:'#fff',border:'none',borderRadius:8,color:'#1f2937',fontSize:14,fontWeight:700,cursor:'pointer'}}>
                  {loading ? (language === 'en' ? 'Opening Microsoft…' : 'Microsoft açılıyor…') : `▦ ${t('login.connectMicrosoft')}`}
                </button>
                <div style={{fontSize:10,color:'#697386',textAlign:'center',marginTop:9}}>{t('login.passwordNote')}</div>
              </form>
            ) : (
              <form onSubmit={handleRegister}>
                {[
                  [language === 'en' ? 'USERNAME' : 'KULLANICI ADI','text',regUser,setRegUser,language === 'en' ? 'your username (3-16 chars)' : 'kullanıcı adın (3-16 karakter)'],
                  [language === 'en' ? 'EMAIL (optional)' : 'E-POSTA (opsiyonel)','email',regEmail,setRegEmail,'example@mail.com'],
                  [language === 'en' ? 'PASSWORD' : 'ŞİFRE','password',regPass,setRegPass,language === 'en' ? 'at least 6 characters' : 'en az 6 karakter'],
                  [language === 'en' ? 'CONFIRM PASSWORD' : 'ŞİFRE TEKRAR','password',regPass2,setRegPass2,language === 'en' ? 'enter your password again' : 'şifreni tekrar gir'],
                ].map(([lbl,type,val,set,ph],i)=>(
                  <div key={i}>
                    <label style={{display:'block',fontSize:12,fontWeight:600,color:'#8b949e',marginBottom:6,letterSpacing:.5}}>{lbl}</label>
                    <input value={val} onChange={e=>set(e.target.value)} type={type} placeholder={ph}
                      style={{width:'100%',padding:'10px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#e6edf3',fontSize:14,outline:'none',marginBottom:14,transition:'border-color .2s'}}
                      onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,.1)'}/>
                  </div>
                ))}
                <button type="submit" disabled={loading} style={{width:'100%',padding:'11px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:14,fontWeight:600,cursor:'pointer',marginTop:6}}>
                  {loading ? (language === 'en' ? 'Creating account...' : 'Kayıt yapılıyor...') : (language === 'en' ? 'Create Account' : 'Hesap Oluştur')}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div style={{height:32,display:'flex',alignItems:'center',justifyContent:'center',borderTop:'1px solid rgba(255,255,255,.04)'}}>
        <span style={{fontSize:11,color:'#484f58'}}>RtfLauncher {appVersion ? `v${appVersion}` : ''} · RtfSMP Network</span>
      </div>
    </div>
  )
}
