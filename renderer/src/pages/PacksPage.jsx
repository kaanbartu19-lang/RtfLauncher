import { useEffect, useState } from 'react'

const TYPES = {
  texture: { title: 'Texture Pack', label: 'Texture Pack Ara', folder: 'resourcepacks', projectType: 'resourcepack', icon: '▦' },
  shader: { title: 'Shader', label: 'Shader Ara', folder: 'shaderpacks', projectType: 'shader', icon: '✦' },
}

export default function PacksPage({ embedded = false }) {
  const [type, setType] = useState('texture')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [installed, setInstalled] = useState([])
  const [busy, setBusy] = useState({})
  const [message, setMessage] = useState('')
  const [view, setView] = useState('discover')
  const [page, setPage] = useState(0)
  const api = window.api || {}
  const meta = TYPES[type]
  const totalPopular = type === 'texture' ? 76 : 34
  const lastPageItems = totalPopular % 20 || 20
  const visibleResults = !query && page === Math.ceil(totalPopular / 20) - 1 ? results.slice(0, lastPageItems) : results

  const notify = text => { setMessage(text); setTimeout(() => setMessage(''), 3500) }
  const loadInstalled = async nextType => setInstalled(await api.listPacks?.(nextType || type) || [])
  useEffect(() => { setQuery(''); setPage(0); loadInstalled(type); loadPopular(type, 0) }, [type])

  async function loadPopular(nextType=type, nextPage=0) {
    setBusy(p => ({ ...p, search: true })); setPage(nextPage)
    try {
      const nextMeta = TYPES[nextType]
      const facets = encodeURIComponent(JSON.stringify([[`project_type:${nextMeta.projectType}`]]))
      const data = await fetch(`https://api.modrinth.com/v2/search?facets=${facets}&index=downloads&limit=20&offset=${nextPage * 20}`).then(r=>r.json())
      setResults(data.hits || [])
    } catch { notify('En çok indirilenler yüklenemedi.') }
    setBusy(p => ({ ...p, search: false }))
  }

  async function search(e) {
    e.preventDefault(); if (!query.trim()) return
    setPage(0); setBusy(p => ({ ...p, search: true }))
    try {
      const facets = encodeURIComponent(JSON.stringify([[`project_type:${meta.projectType}`]]))
      const data = await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${facets}&index=relevance&limit=20&offset=0`).then(r => r.json())
      setResults(data.hits || [])
    } catch { notify('Arama başarısız oldu.') }
    setBusy(p => ({ ...p, search: false }))
  }

  async function download(item) {
    setBusy(p => ({ ...p, [item.project_id]: true }))
    try {
      const versions = await fetch(`https://api.modrinth.com/v2/project/${item.project_id}/version`).then(r => r.json())
      const file = versions.flatMap(v => v.files || []).find(f => f.filename?.endsWith('.zip') && f.primary) || versions.flatMap(v => v.files || []).find(f => f.filename?.endsWith('.zip'))
      if (!file) throw new Error('İndirilebilir .zip dosyası bulunamadı.')
      const result = await api.downloadPack?.({ type, url: file.url, filename: file.filename })
      if (!result?.success) throw new Error(result?.error || 'İndirme başarısız.')
      await loadInstalled(); notify(`${item.title} indirildi.`)
    } catch (e) { notify(e.message) }
    setBusy(p => ({ ...p, [item.project_id]: false }))
  }

  return <div style={{flex:1,overflowY:'auto',padding:embedded?0:28}}>
    {!embedded && <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:'#8b949e',marginBottom:6}}>GÖRSEL PAKETLER</div>}
    <div style={{fontSize:24,fontWeight:800,color:'#f0f6fc',marginBottom:8}}>Texture Pack & Shader</div>
    <p style={{fontSize:13,color:'#8b949e',marginBottom:20}}>Modrinth üzerinden güvenle indir. Dosyalar Minecraft'ın <b>{meta.folder}</b> klasörüne eklenir. En çok indirilen ilk {totalPopular} paket listelenir.</p>
    <div style={{display:'flex',gap:8,marginBottom:10}}>{Object.entries(TYPES).map(([id, x]) => <button key={id} onClick={() => setType(id)} style={{padding:'9px 16px',borderRadius:8,border:'1px solid '+(id===type?'#4f8cff':'rgba(255,255,255,.09)'),background:id===type?'rgba(59,130,246,.18)':'#161b22',color:id===type?'#cfe0ff':'#8b949e',fontWeight:700}}>{x.icon} {x.title}</button>)}</div>
    <div style={{display:'flex',gap:7,marginBottom:16}}>{[['discover','En Çok İndirilenler'],['installed',`Yüklü (${installed.length})`]].map(([id,label])=><button key={id} onClick={()=>setView(id)} style={{padding:'7px 12px',borderRadius:7,border:'1px solid '+(view===id?'#2563eb':'rgba(255,255,255,.08)'),background:view===id?'rgba(37,99,235,.16)':'#111722',color:view===id?'#cfe0ff':'#8b949e',fontWeight:700}}>{label}</button>)}</div>
    {message && <div style={{padding:'10px 12px',marginBottom:12,borderRadius:8,background:'rgba(63,185,80,.1)',border:'1px solid rgba(63,185,80,.25)',color:'#7ee787',fontSize:13}}>{message}</div>}
    {view==='discover' && <><form onSubmit={search} style={{display:'flex',gap:10,marginBottom:18}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={`${meta.title} ara...`} style={{flex:1,padding:'11px 13px',background:'#111722',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,color:'#e6edf3',outline:'none'}}/><button style={{padding:'0 20px',border:0,borderRadius:8,background:'#3b82f6',color:'#fff',fontWeight:700}}>{busy.search?'Aranıyor...':'Ara'}</button></form>{visibleResults.map(item => <div key={item.project_id} style={{display:'flex',gap:14,alignItems:'center',padding:14,marginBottom:8,background:'#161b22',border:'1px solid rgba(255,255,255,.07)',borderRadius:10}}><div style={{width:46,height:46,background:'#222b38',borderRadius:8,overflow:'hidden',display:'grid',placeItems:'center',fontSize:20}}>{item.icon_url?<img src={item.icon_url} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:meta.icon}</div><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,color:'#e6edf3'}}>{item.title}</div><div style={{fontSize:12,color:'#8b949e',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:4}}>{item.description}</div></div><button onClick={()=>download(item)} disabled={busy[item.project_id]} style={{padding:'8px 14px',border:0,borderRadius:7,background:'#3b82f6',color:'#fff',fontWeight:700}}>{busy[item.project_id]?'...':'İndir'}</button></div>)}{!query&&<div style={{display:'flex',justifyContent:'center',gap:6,marginTop:16}}>{Array.from({length:Math.ceil(totalPopular/20)},(_,p)=><button key={p} onClick={()=>loadPopular(type,p)} style={{width:32,height:32,borderRadius:7,border:'1px solid '+(page===p?'#2563eb':'rgba(255,255,255,.1)'),background:page===p?'#2563eb':'#161b22',color:page===p?'#fff':'#8b949e'}}>{p+1}</button>)}</div>}</>}
    {view==='installed' && <div style={{marginTop:10}}>{installed.length ? installed.map(name => <div key={name} style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',marginBottom:6,background:'#161b22',borderRadius:8,color:'#aab5c4',fontSize:13}}>{name}<button onClick={async()=>{await api.deletePack?.({type,filename:name});loadInstalled()}} style={{color:'#ff7b72',background:'none',border:0}}>Sil</button></div>) : <span style={{color:'#697386',fontSize:13}}>Henüz yüklü paket yok.</span>}</div>}
  </div>
}
