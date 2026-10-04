import { useState, useEffect, useRef } from 'react'

export default function PlayPage({ branding, user }) {
  const [mcVersion, setMcVersion] = useState(branding?.version || '1.21.11')
  const [fabricVersion, setFabricVersion] = useState(branding?.fabricVersion || '0.16.9')
  const [fabricVersions, setFabricVersions] = useState([])
  const [useFabric, setUseFabric] = useState(false)
  const [ram, setRam] = useState(4096)
  const [launching, setLaunching] = useState(false)
  const [gameRunning, setGameRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [logs, setLogs] = useState([])
  const logsRef = useRef(null)
  const api = window.api || {}

  useEffect(() => {
    // Profile launches carry a profileId; this page only shows the global game.
    const offs = [
      api.onProgress?.(p => { if (!p?.profileId) setProgress(p) }),
      api.onLog?.(l => { if (!l?.profileId) setLogs(prev => [...prev.slice(-150), l.msg]) }),
      api.onClosed?.(() => { setGameRunning(false); setLaunching(false); setProgress(null) }),
    ]
    if (branding?.version) fetchFabricVersions(branding.version)
    return () => offs.forEach(off => { try { off?.() } catch {} })
  }, [])

  useEffect(() => {
    if (branding?.version) { setMcVersion(branding.version); fetchFabricVersions(branding.version) }
    if (branding?.fabricVersion) setFabricVersion(branding.fabricVersion)
  }, [branding])

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [logs])

  async function fetchFabricVersions(mc) {
    const versions = await api.getFabricVersions?.(mc)
    if (versions?.length) { setFabricVersions(versions); setFabricVersion(versions[0]) }
  }

  async function launch() {
    setLaunching(true); setLogs([]); setProgress(null)
    const res = await api.launch?.({
      auth: user?.auth,
      mcVersion,
      loader: useFabric ? 'fabric' : 'vanilla',
      fabricVersion: useFabric ? fabricVersion : undefined,
      maxRam: ram,
      serverIp: branding?.serverIp,
      serverPort: branding?.serverPort || 25565,
      apiUrl: branding?.apiUrl,
    })
    if (res?.success) { setGameRunning(true) }
    else { setLogs(prev => [...prev, '❌ ' + (res?.error || 'Bilinmeyen hata')]); setLaunching(false) }
  }

  return (
    <div style={{flex:1,overflowY:'auto',padding:28}}>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:1,color:'#8b949e',marginBottom:6}}>OYNA</div>
      <div style={{fontSize:22,fontWeight:700,color:'#e6edf3',marginBottom:24}}>Oyunu Başlat</div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
        {/* MC Sürüm */}
        <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:16}}>
          <label style={{display:'block',fontSize:11,fontWeight:600,letterSpacing:.5,color:'#8b949e',marginBottom:8}}>MC SÜRÜMÜ</label>
          <select value={mcVersion} onChange={e=>{setMcVersion(e.target.value);fetchFabricVersions(e.target.value)}}
            disabled={launching}
            style={{width:'100%',padding:'9px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,color:'#e6edf3',fontSize:14,outline:'none'}}>
            {['1.21.11','1.21.10','1.21.8','1.21.4','1.21.1','1.20.1'].map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Loader toggle + sürüm */}
        <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <label style={{fontSize:11,fontWeight:600,letterSpacing:.5,color:'#8b949e'}}>{useFabric ? 'FABRIC LOADER' : 'LOADER'}</label>
            <div onClick={()=>setUseFabric(!useFabric)} style={{
              width:40,height:22,borderRadius:11,cursor:'pointer',transition:'background .2s',
              background:useFabric?'#2563eb':'rgba(255,255,255,.1)',position:'relative'
            }}>
              <div style={{position:'absolute',top:3,left:useFabric?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
            </div>
          </div>
          {useFabric && (
            fabricVersions.length > 0
              ? <select value={fabricVersion} onChange={e=>setFabricVersion(e.target.value)} disabled={launching}
                  style={{width:'100%',padding:'9px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,color:'#e6edf3',fontSize:14,outline:'none'}}>
                  {fabricVersions.map(v=><option key={v} value={v}>{v}</option>)}
                </select>
              : <input value={fabricVersion} onChange={e=>setFabricVersion(e.target.value)} disabled={launching} placeholder="Önce geçerli bir MC sürümü girin"
                  style={{width:'100%',padding:'9px 12px',background:'#0d1117',border:'1px solid rgba(255,255,255,.08)',borderRadius:7,color:'#e6edf3',fontSize:14,outline:'none'}}/>
          )}
        </div>
      </div>

      {/* RAM */}
      <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:16,marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:10}}>
          <label style={{fontSize:11,fontWeight:600,letterSpacing:.5,color:'#8b949e'}}>RAM</label>
          <span style={{fontSize:13,fontWeight:600,color:'#e6edf3'}}>{ram} MB ({(ram/1024).toFixed(1)} GB)</span>
        </div>
        <input type="range" min={1024} max={16384} step={512} value={ram} onChange={e=>setRam(+e.target.value)}
          disabled={launching} style={{width:'100%',accentColor:'#2563eb'}}/>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#484f58',marginTop:4}}>
          <span>1 GB</span><span>4 GB</span><span>8 GB</span><span>16 GB</span>
        </div>
      </div>

      {/* Sunucu IP */}
      <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:'12px 16px',marginBottom:14,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:13,color:'#8b949e',fontWeight:500}}>Sunucu</span>
        <span style={{fontSize:13,color:'#2563eb',fontWeight:600}}>{branding?.serverIp || 'Yok'}</span>
      </div>

      {/* Progress */}
      {progress && (
        <div style={{background:'#161b22',border:'1px solid rgba(255,255,255,.08)',borderRadius:10,padding:16,marginBottom:14}}>
          <div style={{fontSize:12,color:'#8b949e',marginBottom:8}}>{progress.type} — {progress.task || ''}</div>
          <div style={{height:4,background:'rgba(255,255,255,.08)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',background:'#2563eb',borderRadius:2,width:`${progress.total?Math.round(progress.progress/progress.total*100):0}%`,transition:'width .3s'}}/>
          </div>
        </div>
      )}

      {/* Oyna butonu */}
      <button onClick={launch} disabled={launching||gameRunning} style={{
        width:'100%',padding:'14px',background:gameRunning?'#1c2128':launching?'#1d4ed8':'#2563eb',
        border:'none',borderRadius:10,color:'#fff',fontSize:15,fontWeight:700,
        cursor:launching||gameRunning?'not-allowed':'pointer',
        transition:'background .2s',marginBottom:14,
        boxShadow:launching||gameRunning?'none':'0 4px 16px rgba(37,99,235,.3)'
      }}>
        {gameRunning ? '🎮 Oyun Çalışıyor...' : launching ? 'İndiriliyor / Başlatılıyor...' : `▶ OYNA${useFabric?' (Fabric)':' (Vanilla)'}`}
      </button>

      {/* Konsol */}
      {logs.length > 0 && (
        <div style={{background:'#0d1117',border:'1px solid rgba(255,255,255,.06)',borderRadius:10,padding:14}}>
          <div style={{fontSize:11,fontWeight:600,letterSpacing:.5,color:'#8b949e',marginBottom:8}}>KONSOL</div>
          <div ref={logsRef} style={{maxHeight:160,overflowY:'auto',fontSize:11,fontFamily:'monospace',color:'#8b949e',lineHeight:1.7}}>
            {logs.map((l,i)=><div key={i}>{l}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
