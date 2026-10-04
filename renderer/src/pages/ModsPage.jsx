import { useEffect,useMemo,useState } from 'react'
import PacksPage from './PacksPage.jsx'
import { useI18n } from '../services/i18n.js'
import './profile-instance.css'

const tabLabels={search:(l)=>'Modrinth',profiles:(l)=>'Modrinth App',import:(l)=>l==='en'?'Import':'Aktar',packs:(l)=>l==='en'?'Packs':'Paketler',installed:(l)=>l==='en'?'Installed':'Yüklü'}
const tabs=[['search'],['profiles'],['import'],['packs'],['installed']]
const fallback='./rtf-fallback.svg'

export default function ModsPage({branding,onOpenProfiles}){
 const { t, language } = useI18n()
 const api=window.api||{}; const mcVersion=branding?.version||'1.21.11'
 const [tab,setTab]=useState('search'),[query,setQuery]=useState(''),[results,setResults]=useState([]),[mods,setMods]=useState([])
 const [loading,setLoading]=useState(false),[page,setPage]=useState(0),[downloads,setDownloads]=useState({}),[msg,setMsg]=useState(null)
 const [profiles,setProfiles]=useState([]),[instances,setInstances]=useState([]),[scanning,setScanning]=useState(false),[importing,setImporting]=useState(null)
 const [packUrl,setPackUrl]=useState(''),[profileName,setProfileName]=useState(''),[selected,setSelected]=useState([]),[creating,setCreating]=useState(false),[profileMode,setProfileMode]=useState('choose'),[profileVersion,setProfileVersion]=useState(mcVersion),[profileLoader,setProfileLoader]=useState('fabric'),[profileFabric,setProfileFabric]=useState(''),[fabricVersions,setFabricVersions]=useState([]),[playingProfile,setPlayingProfile]=useState(null)
 const [detail,setDetail]=useState(null),[selectedProfile,setSelectedProfile]=useState(null)

 const notify=(text,type='ok')=>{setMsg({text,type});setTimeout(()=>setMsg(null),3500)}
 const loadMods=async()=>setMods(await api.listMods?.()||[])
 const loadProfileFabric=async(version)=>{const list=await api.getFabricVersions?.(version);setFabricVersions(list||[]);setProfileFabric(list?.[0]||'')}
 useEffect(()=>{loadMods();discover('',0)},[mcVersion])

 async function discover(term='',p=0){setPage(p);setLoading(true);try{
  const facets=encodeURIComponent(JSON.stringify([['project_type:mod'],[`versions:${mcVersion}`],['categories:fabric']]))
  const r=await fetch(`https://api.modrinth.com/v2/search?query=${encodeURIComponent(term)}&facets=${facets}&index=downloads&limit=20&offset=${p*20}`)
  if(!r.ok)throw new Error(`Modrinth HTTP ${r.status}`); const d=await r.json();setResults(d.hits||[])
 }catch(e){notify('Modrinth verilerine ulaşılamadı. İnternet bağlantını kontrol et.','err')}finally{setLoading(false)}}
 async function search(e){e?.preventDefault();setPage(0);await discover(query.trim(),0)}
 async function install(mod){setDownloads(x=>({...x,[mod.project_id]:true}));try{
  const r=await fetch(`https://api.modrinth.com/v2/project/${mod.project_id}/version`);if(!r.ok)throw new Error(`Sürüm bilgisi alınamadı (${r.status})`)
  const versions=await r.json();const v=versions.find(x=>x.game_versions?.includes(mcVersion)&&x.loaders?.includes('fabric'))
  const file=v?.files?.find(f=>f.primary&&f.filename.endsWith('.jar'))||v?.files?.find(f=>f.filename.endsWith('.jar'));if(!file)throw new Error('Bu Minecraft/Fabric sürümü için uygun jar bulunamadı.')
  const out=await api.downloadMod?.({url:file.url,filename:file.filename});if(!out?.success)throw new Error(out?.error||'İndirme başarısız.')
  await loadMods();notify(`${mod.title} yüklendi.`)
 }catch(e){notify(e.message,'err')}finally{setDownloads(x=>({...x,[mod.project_id]:false}))}}
 async function remove(file){if(!confirm(`${file} silinsin mi?`))return;const r=await api.deleteMod?.(file);if(r?.success!==false) {await loadMods();notify('Mod kaldırıldı.')} else notify(r.error||'Mod kaldırılamadı.','err')}
 async function scan(){setScanning(true);try{const r=await api.listModrinthInstances?.();if(!r?.success)throw new Error(r?.error||'Tarama başarısız.');setInstances(r.instances||[]);if(!r.instances?.length)notify('Yerel Modrinth App profili bulunamadı.','err')}catch(e){notify(e.message,'err')}finally{setScanning(false)}}
 async function importInstance(i){setImporting(i.id);try{const r=await api.importModrinthInstance?.({instancePath:i.path});if(!r?.success)throw new Error(r?.error||'Aktarım başarısız.');await loadMods();notify(`${i.name}: ${r.count} mod aktarıldı.`)}catch(e){notify(e.message,'err')}finally{setImporting(null)}}
 async function importPack(e){e.preventDefault();if(!packUrl.trim())return;const r=await api.importModpack?.({url:packUrl.trim(),mcVersion});if(r?.success){await loadMods();setPackUrl('');notify(`${r.count||0} mod aktarıldı.`)}else notify(r?.error||'Modpack aktarımı başarısız.','err')}

 const installedSet=useMemo(()=>new Set(mods.map(x=>x.toLowerCase())),[mods])
 return <div className="page-scroll mods-page">
  <div className="page-kicker">{t('nav.mods').toUpperCase()} / FABRIC {mcVersion}</div>
  <div className="mods-title-row"><div><h1>{t('mods.title')}</h1><p className="muted">{language === 'en' ? 'Discover, download and manage Minecraft mods from one place.' : "Modrinth'ten keşfet, güvenli şekilde indir ve Minecraft profilini tek yerden yönet."}</p></div><div className="mods-stat"><b>{mods.length}</b><span>{language === 'en' ? 'Installed mods' : 'Yüklü mod'}</span></div></div>
  {msg&&<div className={`notice ${msg.type==='err'?'error':''}`}>{msg.text}</div>}
  <div className="mods-tabs">{tabs.map(([id])=><button className={tab===id?'active':''} key={id} onClick={()=>setTab(id)}>{tabLabels[id](language)}{id==='installed'&&<em>{mods.length}</em>}</button>)}</div>

  {tab==='search'&&<section className="mod-hub">
   <form className="mod-search" onSubmit={search}><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('mods.search')}/><button disabled={loading}>{loading ? t('mods.searching') : t('mods.searchButton')}</button></form>
   <div className="mod-section-head"><div><b>{query ? `“${query}” ${language === 'en' ? 'results' : 'sonuçları'}` : (language === 'en' ? 'Popular Fabric mods' : 'Popüler Fabric modları')}</b><small>Minecraft {mcVersion} · Fabric</small></div><button className="ghost" onClick={()=>discover(query,Math.max(0,page-1))} disabled={page===0}>‹</button><span>{page+1}</span><button className="ghost" onClick={()=>discover(query,page+1)}>›</button></div>
   {loading?<div className="mod-skeleton-list">{[1,2,3,4,5].map(x=><div className="mod-skeleton" key={x}/>)}</div>:results.length?<div className="mod-list">{results.map(m=>{const isInstalled=[...installedSet].some(x=>x.includes((m.slug||'').toLowerCase()));return <article className="mod-card" key={m.project_id} onClick={()=>setDetail(m)}>
    <div className="mod-icon"><img src={m.icon_url||fallback} onError={e=>{if(e.currentTarget.src.endsWith(fallback))return;e.currentTarget.src=fallback}}/></div>
    <div className="mod-info"><div className="mod-name">{m.title}</div><div className="mod-author">{m.author||(language === 'en' ? 'Modrinth developer' : 'Modrinth geliştiricisi')}</div><p>{m.description||(language === 'en' ? 'No description available.' : 'Açıklama bulunmuyor.')}</p><div className="mod-tags"><span>↓ {Intl.NumberFormat(language === 'en' ? 'en-US' : 'tr-TR',{notation:'compact'}).format(m.downloads||0)}</span>{(m.categories||[]).slice(0,3).map(c=><i key={c}>{c}</i>)}</div></div>
    <div className="mod-action">{isInstalled?<span className="installed">{t('mods.installed')}</span>:<button onClick={e=>{e.stopPropagation();install(m)}} disabled={!!downloads[m.project_id]}>{downloads[m.project_id]?t('mods.installing'):t('mods.install')}</button>}</div>
   </article>})}</div>:<div className="empty-card"><b>{t('mods.notFound')}</b><span>{language === 'en' ? 'Try another search term or Minecraft/Fabric version.' : 'Arama terimini veya Minecraft/Fabric sürümünü değiştir.'}</span></div>}
  </section>}

  {tab==='profiles'&&<section>
   <div className="mod-feature"><div><b>Modrinth App profillerini aktar</b><p>Bilgisayarındaki profilleri tara. URL yapıştırmadan seçtiğin profili RtfLauncher mod klasörüne aktar.</p></div><button onClick={scan} disabled={scanning}>{scanning?'Taranıyor…':'Profilleri Tara'}</button></div>
   {instances.length>0&&<div className="profile-grid">{instances.map(i=><div className="profile-card" key={i.id}><div className="profile-icon">M</div><div><b>{i.name}</b><span>{i.mods?.length||0} mod · Yerel Modrinth App</span></div><button onClick={()=>importInstance(i)} disabled={importing===i.id}>{importing===i.id?'Aktarılıyor…':'Aktar'}</button></div>)}</div>}
   <div className="mod-feature compact"><div><b>{language === 'en' ? 'Profile content is managed in Profiles' : 'Profil bazlı modlar Profiller sayfasında'}</b><p>{language === 'en' ? 'Each profile manages its own mods, packs and worlds from the Profiles page.' : 'Her profilin kendi modları, paketleri ve dünyaları artık Profiller sayfasından yönetiliyor.'}</p></div><button onClick={()=>onOpenProfiles?.()}>{language === 'en' ? 'Go to Profiles' : 'Profillere git'}</button></div>
  </section>}

  {tab==='import'&&<section className="import-card"><b>{language === 'en' ? 'Import Modrinth modpack' : 'Modrinth modpack aktar'}</b><p>{language === 'en' ? 'Enter a Modrinth modpack URL to download compatible Fabric mods.' : 'Modrinth modpack bağlantısını girerek uyumlu Fabric modlarını indir.'}</p><form onSubmit={importPack}><input value={packUrl} onChange={e=>setPackUrl(e.target.value)} placeholder="https://modrinth.com/modpack/..."/><button>Modpack'i Aktar</button></form></section>}
  {tab==='packs'&&<PacksPage embedded/>}
  {tab==='installed'&&<section className="installed-list">{mods.length?mods.map(m=><div className="installed-row" key={m}><div><b>{m}</b><span>mods klasöründe · .jar</span></div><button className="danger" onClick={()=>remove(m)}>Kaldır</button></div>):<div className="empty-card"><b>Henüz mod yok</b><span>Modrinth sekmesinden bir mod yükleyebilirsin.</span></div>}</section>}

  {detail&&<div className="mod-modal-backdrop" onClick={()=>setDetail(null)}><div className="mod-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setDetail(null)}>×</button><div className="modal-icon"><img src={detail.icon_url||fallback}/></div><h2>{detail.title}</h2><div className="mod-author">{detail.author}</div><p>{detail.description}</p><div className="detail-grid"><span>Downloads<b>{Intl.NumberFormat('tr-TR').format(detail.downloads||0)}</b></span><span>Loader<b>Fabric</b></span><span>Minecraft<b>{mcVersion}</b></span></div><button className="primary wide" onClick={()=>{install(detail);setDetail(null)}} disabled={!!downloads[detail.project_id]}>{downloads[detail.project_id]?'İndiriliyor…':'Modu Yükle'}</button></div></div>}
 </div>
}
