import { useState, useEffect } from 'react'
import { apiAuth, apiGet, getToken } from '../services/api.js'
import CharacterPreview from '../components/CharacterPreview.jsx'

const backTypes = ['cape', 'wing']
const outfitTypes = ['outfit']

// Admin calls use the backend token from secure storage. Errors come from the
// real HTTP status (401 session, 403 permission, 404 endpoint, 5xx server).
export default function AdminPage({ branding }) {
  const [tab, setTab] = useState('players')
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cosmetics, setCosmetics] = useState([])
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('cape')
  const [newImageUrl, setNewImageUrl] = useState('')
  const [newEffect, setNewEffect] = useState('')
  const [newImageName, setNewImageName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [msg, setMsg] = useState(null)
  const [hasToken, setHasToken] = useState(true)

  useEffect(() => { getToken().then(t => setHasToken(!!t)); loadPlayers(); loadCosmetics() }, [])

  async function loadPlayers() {
    setLoading(true); setError('')
    if (!branding?.apiUrl) { setError('API URL yapılandırılmamış.'); setLoading(false); return }
    try {
      const data = await apiAuth(branding, '/api/admin/players')
      setPlayers(Array.isArray(data) ? data : (data.players || []))
    } catch (e) { setError(`Oyuncu listesi alınamadı: ${e.message}`) }
    setLoading(false)
  }

  async function loadCosmetics() {
    if (!branding?.apiUrl) { setCosmetics([]); return }
    try {
      const data = await apiGet(branding, '/api/cosmetics')
      setCosmetics(data.success ? (data.cosmetics || []) : [])
    } catch (e) { setCosmetics([]); showMsg(`Kozmetik listesi alınamadı: ${e.message}`, 'err') }
  }

  function showMsg(text, type = 'ok') { setMsg({ text, type }); setTimeout(() => setMsg(null), 5000) }

  async function banPlayer(id, ban) {
    try {
      await apiAuth(branding, `/api/admin/players/${encodeURIComponent(id)}/${ban ? 'ban' : 'unban'}`, { method: 'POST' })
      showMsg(ban ? 'Oyuncu yasaklandı.' : 'Yasak kaldırıldı.')
      loadPlayers()
    } catch (e) { showMsg(`İşlem başarısız: ${e.message}`, 'err') }
  }

  async function addCosmetic(e) {
    e.preventDefault()
    if (!newName || !newImageUrl) return showMsg('İsim ve PNG/JPG dosyası gerekli.', 'err')
    try {
      const data = await apiAuth(branding, '/api/cosmetics', { method: 'POST', body: JSON.stringify({ name: newName, type: newType, imageUrl: newImageUrl, effect: newEffect || null, description: newDesc }) })
      if (data.success) { showMsg('✅ Kozmetik eklendi!'); setNewName(''); setNewImageUrl(''); setNewDesc(''); loadCosmetics() }
      else showMsg(data.error || 'Kozmetik eklenemedi.', 'err')
    } catch (e) { showMsg(`Kozmetik eklenemedi: ${e.message}`, 'err') }
  }

  async function deleteCosmetic(id) {
    if (!confirm('Kozmetik silinsin mi?')) return
    try {
      await apiAuth(branding, `/api/cosmetics/${encodeURIComponent(id)}`, { method: 'DELETE' })
      showMsg('Kozmetik silindi.')
    } catch (e) { showMsg(`Silinemedi: ${e.message}`, 'err') }
    loadCosmetics()
  }


  const inputStyle = {width:'100%',padding:'9px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,color:'#e6edf3',fontSize:13,outline:'none',marginBottom:10}

  return (
    <div style={{flex:1,overflowY:'auto',padding:28}}>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:1,color:'#8b949e',marginBottom:6}}>ADMİN PANELİ</div>
      <div style={{fontSize:22,fontWeight:700,color:'#e6edf3',marginBottom:20}}>🛡️ Yönetim Paneli</div>

      {!hasToken && <div className="notice error">Bu oturumda RtfSMP sunucu oturumu yok (Microsoft/offline giriş sunucu token’ı vermez). Admin işlemleri için RtfSMP kullanıcı adı ve şifrenle giriş yap.</div>}
      {msg && <div style={{background:msg.type==='ok'?'rgba(63,185,80,.1)':'rgba(248,81,73,.1)',border:`1px solid ${msg.type==='ok'?'rgba(63,185,80,.3)':'rgba(248,81,73,.3)'}`,borderRadius:8,padding:'10px 14px',marginBottom:14,color:msg.type==='ok'?'#3fb950':'#f85149',fontSize:13}}>{msg.text}</div>}

      {/* Tabs */}
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        {[['players','👥 Oyuncular'],['cosmetics','🎨 Kozmetikler']].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)} style={{
            padding:'7px 18px',borderRadius:7,fontSize:13,fontWeight:600,cursor:'pointer',
            background:tab===id?'#2563eb':'#161b22',
            border:tab===id?'1px solid #2563eb':'1px solid rgba(255,255,255,.08)',
            color:tab===id?'#fff':'#8b949e'
          }}>{lbl}</button>
        ))}
        <button onClick={loadPlayers} style={{marginLeft:'auto',padding:'7px 14px',background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,color:'#8b949e',fontSize:13,cursor:'pointer'}}>🔄 Yenile</button>
      </div>

      {/* Oyuncular */}
      {tab==='players' && (
        error ? <div style={{background:'rgba(248,81,73,.1)',border:'1px solid rgba(248,81,73,.3)',borderRadius:8,padding:'12px 16px',color:'#f85149',fontSize:13}}>❌ {error}</div>
        : loading ? <div style={{textAlign:'center',padding:'50px 0',color:'#8b949e'}}>Yükleniyor...</div>
        : players.length===0 ? <div style={{textAlign:'center',padding:'40px 0',color:'#484f58'}}>Kayıtlı oyuncu yok.</div>
        : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
            {players.map((p,i)=>(
              <div key={i} style={{background:'#161b22',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,padding:'14px 16px',transition:'all .15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.12)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.06)'}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                  <div style={{width:34,height:34,borderRadius:7,background:'#2563eb',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:700,color:'#fff',flexShrink:0}}>
                    {p.username?.[0]?.toUpperCase()||'?'}
                  </div>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:'#e6edf3'}}>{p.username}</div>
                    <div style={{fontSize:11,color:p.role==='admin'?'#f59e0b':'#8b949e'}}>{p.role==='admin'?'👑 Admin':'👤 Oyuncu'}</div>
                  </div>
                  {p.banned && <span style={{marginLeft:'auto',fontSize:10,color:'#f85149',background:'rgba(248,81,73,.1)',padding:'2px 6px',borderRadius:4,border:'1px solid rgba(248,81,73,.2)'}}>Banned</span>}
                </div>
                {p.email && <div style={{fontSize:11,color:'#484f58',marginBottom:4}}>📧 {p.email}</div>}
                {p.premium === false && (
                  <>
                    <div style={{fontSize:11,color:'#f85149',marginBottom:4}}>🔑 Şifre: <b>{p.plainPassword || '—'}</b></div>
                    <div style={{fontSize:11,color:'#f85149',marginBottom:4}}>🌐 IP: <b>{p.lastIp || '—'}</b></div>
                    <div style={{fontSize:10,color:'#f59e0b',marginBottom:8}}>⚠ Orijinal hesabı yok</div>
                  </>
                )}
                {p.lastSeen && <div style={{fontSize:11,color:'#484f58',marginBottom:8}}>Son: {new Date(p.lastSeen).toLocaleDateString('tr-TR')}</div>}
                <button onClick={()=>banPlayer(p.id, !p.banned)} style={{
                  width:'100%',padding:'6px',background:'transparent',
                  border:`1px solid ${p.banned?'rgba(63,185,80,.2)':'rgba(248,81,73,.2)'}`,
                  borderRadius:6,color:p.banned?'rgba(63,185,80,.7)':'rgba(248,81,73,.6)',
                  fontSize:11,cursor:'pointer'
                }}>{p.banned?'✓ Yasağı Kaldır':'🚫 Yasakla'}</button>
              </div>
            ))}
          </div>
        )
      )}

      {/* Kozmetikler */}
      {tab==='cosmetics' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          {/* Yeni ekle */}
          <div>
            <div style={{fontSize:14,fontWeight:600,color:'#e6edf3',marginBottom:14}}>➕ Yeni Kozmetik Ekle</div>
            <form onSubmit={addCosmetic} style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:16}}>
              <label style={{fontSize:11,fontWeight:600,color:'#8b949e',display:'block',marginBottom:4,letterSpacing:.5}}>İSİM</label>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Kozmetik adı" style={inputStyle}/>
              <label style={{fontSize:11,fontWeight:600,color:'#8b949e',display:'block',marginBottom:4,letterSpacing:.5}}>TİP</label>
              <select value={newType} onChange={e=>setNewType(e.target.value)} style={{...inputStyle}}>
                <option value="cape">Cape (Pelerin)</option>
                <option value="wing">Wing (Kanat)</option>
                <option value="outfit">Kıyafet (skin üzerine giydirilir)</option>
                <option value="hat">Hat (Şapka) — henüz 3D önizleme yok</option>
                <option value="emote">Emote — henüz 3D önizleme yok</option>
              </select>

              {backTypes.includes(newType) && (
                <select value={newEffect} onChange={e=>setNewEffect(e.target.value)} style={{...inputStyle}}>
                  <option value="">Efekt yok</option>
                  <option value="glow">✨ Parlama</option>
                  <option value="rainbow">🌈 Renk değiştirme</option>
                  <option value="particles">💫 Parçacık izi</option>
                </select>
              )}
              <label style={{fontSize:11,fontWeight:600,color:'#8b949e',display:'block',marginBottom:4,letterSpacing:.5}}>PNG / JPG DOSYASI</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{ const f=e.target.files?.[0]; if (!f) return; setNewImageName(f.name); const reader=new FileReader(); reader.onload=()=>setNewImageUrl(String(reader.result)); reader.readAsDataURL(f) }} style={{...inputStyle,padding:'8px'}}/>
              {newImageName && <div style={{fontSize:11,color:'#7ee787',marginTop:-6,marginBottom:10}}>✓ {newImageName}</div>}
              <label style={{fontSize:11,fontWeight:600,color:'#8b949e',display:'block',marginBottom:4,letterSpacing:.5}}>AÇIKLAMA</label>
              <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="Opsiyonel" style={inputStyle}/>
              <button type="submit" style={{width:'100%',padding:'10px',background:'#2563eb',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>Ekle</button>
            </form>

            {newImageUrl && (
              <div style={{marginTop:16}}>
                <div style={{fontSize:11,fontWeight:600,color:'#8b949e',marginBottom:8,letterSpacing:.5}}>CANLI ÖNİZLEME</div>
                {backTypes.includes(newType) || outfitTypes.includes(newType) ? (
                  <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,height:260}}>
                    <CharacterPreview
                      username="MHF_Steve"
                      model="default"
                      capeUrl={backTypes.includes(newType) ? newImageUrl : null}
                      backEquipment={newType === 'wing' ? 'elytra' : 'cape'}
                      outfitUrl={outfitTypes.includes(newType) ? newImageUrl : null}
                      effect={backTypes.includes(newType) ? (newEffect || null) : null}
                      animation="idle"
                    />
                  </div>
                ) : (
                  <div style={{fontSize:12,color:'#8b949e',padding:'10px 0'}}>Bu tip için henüz 3D önizleme yok — kayıttan sonra listede küçük resim olarak görünecek.</div>
                )}
              </div>
            )}
          </div>

          {/* Mevcut kozmetikler */}
          <div>
            <div style={{fontSize:14,fontWeight:600,color:'#e6edf3',marginBottom:14}}>🎨 Mevcut Kozmetikler ({cosmetics.length})</div>
            {cosmetics.length===0
              ? <div style={{color:'#484f58',fontSize:13,textAlign:'center',padding:'30px 0'}}>Henüz kozmetik yok.</div>
              : cosmetics.map(c=>(
                <div key={c.id} style={{background:'#161b22',border:'1px solid rgba(255,255,255,.06)',borderRadius:8,padding:'12px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
                  {c.type === 'cape' && c.imageUrl
                    ? <div style={{width:36,height:36,borderRadius:6,overflow:'hidden',background:'#1c2128',flexShrink:0}}><div style={{width:'100%',height:'100%',backgroundImage:`url(${c.imageUrl})`,backgroundSize:'640% 200%',backgroundPosition:'22.222% 6.25%',backgroundRepeat:'no-repeat',imageRendering:'pixelated'}}/></div>
                    : <img src={c.imageUrl} style={{width:36,height:36,borderRadius:6,objectFit:'cover',background:'#1c2128'}} onError={e=>e.target.style.display='none'}/>}
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#e6edf3'}}>{c.name}</div>
                    <div style={{fontSize:11,color:'#8b949e'}}>{{cape:'🧣 Cape',hat:'🎩 Şapka',wing:'🪽 Kanat',outfit:'👕 Kıyafet',emote:'💃 Emote'}[c.type] || c.type}{c.local?' · Bu bilgisayarda':''}</div>
                  </div>
                  <button onClick={()=>deleteCosmetic(c.id)} style={{padding:'5px 10px',background:'transparent',border:'1px solid rgba(248,81,73,.2)',borderRadius:5,color:'rgba(248,81,73,.6)',fontSize:11,cursor:'pointer'}}>Sil</button>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}
