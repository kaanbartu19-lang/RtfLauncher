import { useState, useEffect } from 'react'

export default function HomePage({ branding, user, onPlay, onOpen, onPage }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!branding.apiUrl) return
    fetch(`${branding.apiUrl}/api/stats`).then(r=>r.json()).then(d=>{ if(d.success) setStats(d) }).catch(()=>{})
  }, [branding])

  const recentPlays = [
    { name: branding.serverName || 'RtfSMP', type: 'Survival', mods: 156, time: 'Bugün, 21:43', version: branding.version || '1.21.11', loader: 'Fabric', img: null },
  ]

  const quickAccess = [
    { label: 'Mod Paketleri', logo: './modrinth-logo.png', color: '#28d17c', desc: 'Modrinth profili', url: 'https://modrinth.com/user/CordezxMC' },
    { label: 'Discord', icon: '💬', color: '#5865f2', desc: 'Topluluk', url: branding.discordUrl },
    { label: 'YouTube', icon: '▶', color: '#ef4444', desc: 'RtfSMP videoları', url: 'https://www.youtube.com/@rtfsmp' },
    { label: 'Destek', icon: '?', color: '#374151', desc: 'Yardım' },
  ]

  return (
    <div style={{display:'flex',flex:1,overflow:'hidden'}}>
      {/* Sol - Ana içerik */}
      <div style={{flex:1,overflowY:'auto',padding:'0 0 20px'}}>
        {/* Hero */}
        <div style={{position:'relative',height:240,overflow:'hidden',flexShrink:0}}>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(135deg,#0a1628,#0d2040,#1a0a28)',zIndex:0}}/>
          <div style={{position:'absolute',inset:0,background:'url(./bg.jpg) center/cover no-repeat',zIndex:0,opacity:.4}}/>
          <div style={{position:'absolute',inset:0,background:'linear-gradient(to top,#0f1117 0%,transparent 60%)',zIndex:1}}/>
          <div style={{position:'absolute',bottom:28,left:28,zIndex:2}}>
            <div style={{fontSize:32,fontWeight:800,color:'#fff',letterSpacing:-1,marginBottom:6,textShadow:'0 2px 12px rgba(0,0,0,.5)'}}>{branding.serverName||'RtfSMP'}</div>
            <div style={{fontSize:14,color:'rgba(255,255,255,.7)',marginBottom:20}}>{branding.description||'Hayatta kal. Keşfet. Eğlen.'}</div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <button onClick={onPlay} style={{
                display:'flex',alignItems:'center',gap:8,padding:'10px 24px',
                background:'#2563eb',border:'none',borderRadius:8,
                color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',
                boxShadow:'0 4px 16px rgba(37,99,235,.4)',transition:'all .2s'
              }}
                onMouseEnter={e=>e.currentTarget.style.background='#3b82f6'}
                onMouseLeave={e=>e.currentTarget.style.background='#2563eb'}>
                ▶ Oyna
              </button>
              <div style={{background:'rgba(0,0,0,.5)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,.12)',borderRadius:8,padding:'8px 16px',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:13,color:'rgba(255,255,255,.8)',fontWeight:500}}>Son Oynanan Sürüm</span>
                <span style={{fontSize:13,color:'#e6edf3',fontWeight:600}}>{branding.version||'1.21.11'} (Fabric)</span>
                <span style={{color:'rgba(255,255,255,.4)'}}>▾</span>
              </div>
            </div>
          </div>
        </div>

        {/* Son Oynananlar */}
        <div style={{padding:'20px 28px 0'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
            <span style={{fontSize:16,fontWeight:600,color:'#e6edf3'}}>Son Oynananlar</span>
            <button style={{fontSize:13,color:'#2563eb',background:'none',border:'none',cursor:'pointer',fontWeight:500}}>Tümünü Gör →</button>
          </div>
          {recentPlays.map((p,i)=>(
            <div key={i} style={{
              display:'flex',alignItems:'center',gap:14,padding:'14px 16px',
              background:'#161b22',border:'1px solid rgba(255,255,255,.06)',
              borderRadius:10,marginBottom:8,cursor:'pointer',transition:'all .2s'
            }}
              onMouseEnter={e=>{e.currentTarget.style.background='#1c2128';e.currentTarget.style.borderColor='rgba(255,255,255,.1)'}}
              onMouseLeave={e=>{e.currentTarget.style.background='#161b22';e.currentTarget.style.borderColor='rgba(255,255,255,.06)'}}>
              <div style={{width:44,height:44,borderRadius:8,background:'#1c2128',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>🌍</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:'#e6edf3',marginBottom:2}}>{p.name}</div>
                <div style={{fontSize:12,color:'#8b949e'}}>{p.type} • {p.mods} mod</div>
              </div>
              <div style={{textAlign:'right',marginRight:12}}>
                <div style={{fontSize:12,color:'#8b949e',marginBottom:2}}>{p.time}</div>
                <div style={{fontSize:12,color:'#484f58'}}>{p.version} • {p.loader}</div>
              </div>
              <button style={{width:32,height:32,borderRadius:'50%',background:'#2563eb',border:'none',color:'#fff',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>▶</button>
            </div>
          ))}
        </div>
      </div>

      {/* Sağ panel */}
      <div style={{width:260,borderLeft:'1px solid rgba(255,255,255,.06)',padding:'20px 16px',overflowY:'auto',flexShrink:0}}>
        <div style={{fontSize:14,fontWeight:600,color:'#e6edf3',marginBottom:16}}>Hızlı Erişim</div>
        {quickAccess.map((q,i)=>(
          <button key={i} onClick={()=>q.url ? onOpen?.(q.url) : q.label==='Destek' ? onPage?.('packs') : null} style={{
            display:'flex',alignItems:'center',gap:12,padding:'10px 12px',
            background:'#161b22',border:'1px solid rgba(255,255,255,.06)',
            borderRadius:8,marginBottom:8,cursor:'pointer',transition:'all .2s'
          }}
            onMouseEnter={e=>{e.currentTarget.style.background='#1c2128'}}
            onMouseLeave={e=>{e.currentTarget.style.background='#161b22'}}>
            <div style={{width:36,height:36,borderRadius:8,background:q.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:'#fff',flexShrink:0,overflow:'hidden'}}>{q.logo ? <img src={q.logo} alt="Modrinth" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : q.icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500,color:'#e6edf3'}}>{q.label}</div>
              <div style={{fontSize:11,color:'#8b949e'}}>{q.desc}</div>
            </div>
            <span style={{color:'#484f58',fontSize:14}}>›</span>
          </button>
        ))}

        {/* Sunucu durumu */}
        <div style={{marginTop:20,borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:13,fontWeight:600,color:'#e6edf3'}}>Sunucu Durumu</span>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <div style={{width:6,height:6,borderRadius:'50%',background:'#3fb950'}}/>
              <span style={{fontSize:11,color:'#3fb950',fontWeight:600}}>{branding.serverName||'RtfSMP'}</span>
            </div>
          </div>
          <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.06)',borderRadius:8,padding:12}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:40,height:40,borderRadius:8,background:'#1c2128',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🌍</div>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:'#e6edf3'}}>{branding.serverName||'RtfSMP'}</div>
                <div style={{fontSize:11,color:'#8b949e'}}>Survival Multiplayer</div>
                <div style={{fontSize:11,color:'#8b949e',display:'flex',alignItems:'center',gap:4,marginTop:2}}>
                  <span>👥</span>
                  <span>{stats?.onlinePlayers??'--'} / 250</span>
                </div>
              </div>
            </div>
            <button style={{
              width:'100%',padding:'8px',background:'transparent',
              border:'1px solid rgba(255,255,255,.1)',borderRadius:6,
              color:'#e6edf3',fontSize:12,fontWeight:500,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'space-between',
              transition:'all .2s'
            }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(37,99,235,.5)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,.1)'}>
              <span>Sunucuya Bağlan</span>
              <span style={{fontSize:10}}>↗</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
