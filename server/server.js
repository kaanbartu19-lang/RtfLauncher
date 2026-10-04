const http = require('http')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { URL } = require('url')

const PORT = Number(process.env.PORT || 10000)
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json')
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'cordezxM'
// No defaults on purpose: a hardcoded password in source is a public
// credential, and a random ephemeral JWT secret would silently invalidate
// every issued token on restart. Both must come from the deployment
// environment (see server/README.md).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD
const JWT_SECRET = process.env.JWT_SECRET

if (!ADMIN_PASSWORD) {
  console.error('FATAL: ADMIN_PASSWORD environment variable is required. Set it in the deployment environment (Render: envVars -> ADMIN_PASSWORD). Refusing to start with a hardcoded default password.')
  process.exit(1)
}
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is required. Set it in the deployment environment (Render: envVars -> JWT_SECRET; generateValue works). Refusing to start with an ephemeral secret.')
  process.exit(1)
}

const presenceTtlMs = 2 * 60 * 1000

const defaultConfig = {
  serverName: 'RtfSMP', serverIp: 'oyna.rtfsmp.net', serverPort: 25565,
  version: '1.21.11', fabricVersion: '0.18.4',
  discordUrl: 'https://discord.gg/rtfsmp', youtubeUrl: 'https://www.youtube.com/@rtfsmp',
  description: 'Hayatta kal. Keşfet. Eğlen.', news: [], updatedAt: new Date().toISOString(), revision: 1
}

function loadDb() {
  try {
    const x = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return { users: [], cosmetics: [], config: defaultConfig, stats: { onlinePlayers: 0 }, ...x }
  } catch {
    return { users: [], cosmetics: [], config: defaultConfig, stats: { onlinePlayers: 0 } }
  }
}
let db = loadDb()

function isValidPasswordRecord(user) {
  return Boolean(user && typeof user.salt === 'string' && user.salt.length > 0 && typeof user.passwordHash === 'string' && user.passwordHash.length === 128)
}

function migrateLegacyAuthRecords() {
  let changed = false
  for (const user of db.users || []) {
    const legacyPassword = typeof user.plainPassword === 'string' ? user.plainPassword : (typeof user.password === 'string' ? user.password : null)
    if (legacyPassword !== null) {
      if (!isValidPasswordRecord(user) || !verifyPassword(legacyPassword, user)) {
        const hp = hashPassword(legacyPassword)
        user.salt = hp.salt
        user.passwordHash = hp.passwordHash
      }
      delete user.plainPassword
      delete user.password
      changed = true
    }
  }
  if (changed) saveDb()
}

migrateLegacyAuthRecords()

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, DATA_FILE)
}

function send(res, status, data) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Cache-Control': 'no-store'
  })
  res.end(body)
}
function readBody(req, max = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '', size = 0
    req.on('data', c => { size += c.length; if (size > max) { reject(Object.assign(new Error('İstek çok büyük.'), { status: 413 })); req.destroy(); return } raw += c })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch { reject(Object.assign(new Error('Geçersiz JSON.'), { status: 400 })) } })
    req.on('error', reject)
  })
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, passwordHash: crypto.scryptSync(password, salt, 64).toString('hex') }
}
function verifyPassword(password, user) {
  if (!isValidPasswordRecord(user)) return false
  try {
    const actual = crypto.scryptSync(String(password), user.salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(user.passwordHash, 'hex'))
  } catch {
    return false
  }
}
function b64(x) { return Buffer.from(JSON.stringify(x)).toString('base64url') }
function signJwt(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }); const p = b64({ ...payload, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+60*60*24*30 })
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${sig}`
}
function getAuth(req) {
  const raw = req.headers.authorization || ''
  if (!raw.startsWith('Bearer ')) return null
  const token = raw.slice(7).split('.')
  if (token.length !== 3) return null
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${token[0]}.${token[1]}`).digest('base64url')
  const provided = Buffer.from(token[2])
  // Constant-time comparison so the signature cannot be probed byte-by-byte.
  if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(expected), provided)) return null
  try { const p = JSON.parse(Buffer.from(token[1], 'base64url').toString('utf8')); if (!p.exp || p.exp < Date.now()/1000) return null; return p } catch { return null }
}
// 401: no/invalid/expired session. 403: valid session without admin role.
function requireAdmin(req, res) {
  const a = getAuth(req)
  if (!a) { send(res, 401, { success:false, error:'Oturum gerekli veya süresi dolmuş.' }); return null }
  if (a.role !== 'admin') { send(res, 403, { success:false, error:'Bu işlem için admin yetkisi gerekiyor.' }); return null }
  return a
}
// Minimal fixed-window rate limiter (per client IP, in memory) for the
// authentication endpoints. 429 is mapped to a friendly message by the client.
const ipWindows = new Map()
function rateLimited(ip, max, windowMs) {
  const now = Date.now()
  const rec = ipWindows.get(ip)
  if (!rec || now > rec.resetAt) { ipWindows.set(ip, { count: 1, resetAt: now + windowMs }); return false }
  rec.count += 1
  return rec.count > max
}

function sanitizeConfig(x) {
  const allowed = ['serverName','serverIp','serverPort','version','fabricVersion','discordUrl','youtubeUrl','description','news']
  const out = {}; for (const k of allowed) if (x[k] !== undefined) out[k] = x[k]
  return out
}

if (ADMIN_PASSWORD) {
  let admin = db.users.find(u => u.username.toLowerCase() === ADMIN_USERNAME.toLowerCase())
  if (!admin) {
    const hp = hashPassword(ADMIN_PASSWORD)
    admin = { id: crypto.randomUUID(), username: ADMIN_USERNAME, email: '', role: 'admin', banned: false, ...hp, createdAt: new Date().toISOString(), lastSeen: null }
    db.users.push(admin); saveDb()
  } else if (admin.role !== 'admin') { admin.role='admin'; saveDb() }
}

async function route(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const p = url.pathname
  try {
    if (req.method === 'GET' && p === '/health') return send(res, 200, { success:true, service:'rtfsmp-launcher-api', time:new Date().toISOString() })
    if (req.method === 'GET' && p === '/api/config') return send(res, 200, { success:true, config:db.config })
    if (req.method === 'PUT' && p === '/api/config') {
      if (!requireAdmin(req,res)) return
      const body=await readBody(req, 512*1024); db.config={...db.config,...sanitizeConfig(body),updatedAt:new Date().toISOString(),revision:Number(db.config.revision||0)+1}; saveDb()
      return send(res,200,{success:true,config:db.config})
    }
    if (req.method === 'GET' && p === '/api/cosmetics') return send(res,200,{success:true,cosmetics:db.cosmetics})
    if (req.method === 'POST' && p === '/api/cosmetics') {
      if (!requireAdmin(req,res)) return
      const b=await readBody(req, 8*1024*1024)
      if (!b.name || !b.imageUrl) return send(res,400,{success:false,error:'İsim ve görsel gerekli.'})
      if (String(b.imageUrl).length > 6*1024*1024) return send(res,413,{success:false,error:'Görsel çok büyük. 6 MB altında bir görsel kullan.'})
      const cosmetic={id:crypto.randomUUID(),name:String(b.name).slice(0,80),type:String(b.type||'cape'),imageUrl:String(b.imageUrl),description:String(b.description||'').slice(0,300),createdAt:new Date().toISOString()}
      db.cosmetics.unshift(cosmetic); saveDb(); return send(res,201,{success:true,cosmetic})
    }
    const cm = p.match(/^\/api\/cosmetics\/([^/]+)$/)
    if (req.method === 'DELETE' && cm) { if (!requireAdmin(req,res)) return; const before=db.cosmetics.length; db.cosmetics=db.cosmetics.filter(c=>c.id!==cm[1]); saveDb(); return send(res,before===db.cosmetics.length?404:200,{success:before!==db.cosmetics.length,error:before===db.cosmetics.length?'Kozmetik bulunamadı.':undefined}) }

    if (req.method === 'POST' && p === '/api/auth/register') {
      if (rateLimited(req.socket.remoteAddress || '', 5, 60 * 1000)) return send(res, 429, { success:false, error:'Çok fazla deneme. Biraz sonra tekrar dene.' })
      const b=await readBody(req); const username=String(b.username||'').trim(); const email=String(b.email||'').trim(); const password=String(b.password||'')
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) return send(res,400,{success:false,error:'Geçersiz kullanıcı adı.'})
      if (password.length<6) return send(res,400,{success:false,error:'Şifre en az 6 karakter.'})
      if (db.users.some(u=>u.username.toLowerCase()===username.toLowerCase())) return send(res,409,{success:false,code:'ACCOUNT_EXISTS',error:'Bu kullanıcı adı zaten kayıtlı.',username})
      const hp=hashPassword(password); const user={id:crypto.randomUUID(),username,email,role:'player',banned:false,...hp,createdAt:new Date().toISOString(),lastSeen:null,rcBalance:0,inventory:{skins:[],cosmetics:[],outfits:[]},transactions:[],premium:false,lastIp:req.socket.remoteAddress||''}; db.users.push(user); saveDb(); return send(res,201,{success:true})
    }
    if (req.method === 'POST' && p === '/api/auth/login') {
      if (rateLimited(req.socket.remoteAddress || '', 10, 60 * 1000)) return send(res, 429, { success:false, error:'Çok fazla deneme. Biraz sonra tekrar dene.' })
      const b=await readBody(req); const user=db.users.find(u=>u.username.toLowerCase()===String(b.username||'').trim().toLowerCase())
      if (!user || !verifyPassword(String(b.password||''),user)) return send(res,401,{success:false,error:'Kullanıcı adı veya şifre hatalı.'})
      if (user.banned) return send(res,403,{success:false,error:'Bu hesap yasaklı.'})
      user.lastSeen=new Date().toISOString(); user.lastIp=req.socket.remoteAddress||user.lastIp||''; saveDb(); const token=signJwt({sub:user.id,username:user.username,role:user.role}); return send(res,200,{success:true,token,user:{id:user.id,username:user.username,email:user.email,role:user.role,lastSeen:user.lastSeen}})
    }
    if (req.method === 'GET' && p === '/api/admin/players') { if (!requireAdmin(req,res)) return; return send(res,200,{success:true,players:db.users.map(({passwordHash,salt,plainPassword,password,lastIp,...u})=>({...u,lastIp:u.premium?undefined:lastIp}))}) }
    const pm=p.match(/^\/api\/admin\/players\/([^/]+)\/(ban|unban)$/)
    if (req.method==='POST' && pm) { if (!requireAdmin(req,res)) return; const u=db.users.find(x=>x.id===pm[1]); if(!u) return send(res,404,{success:false,error:'Oyuncu bulunamadı.'}); u.banned=pm[2]==='ban'; saveDb(); return send(res,200,{success:true,banned:u.banned}) }
    const profileMatch=p.match(/^\/api\/profile\/([^/]+)$/)
    if (req.method==='GET' && profileMatch) {
      const a=getAuth(req)
      if (!a) return send(res,401,{success:false,error:'Oturum gerekli veya süresi dolmuş.'})
      const id=String(profileMatch[1])
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return send(res,400,{success:false,error:'Geçersiz profil kimliği.'})
      const u=db.users.find(x=>x.id===id || x.minecraftUuid===id)
      if(!u) return send(res,404,{success:false,error:'Profil bulunamadı.'})
      return send(res,200,{success:true,profile:{id:u.id,username:u.username,uuid:u.minecraftUuid||id},balance:{balance:Number(u.rcBalance||0)},inventory:u.inventory||{skins:[],cosmetics:[],outfits:[]}})
    }
    const balanceMatch=p.match(/^\/api\/balance\/([^/]+)$/)
    if (req.method==='GET' && balanceMatch) {
      const a=getAuth(req)
      if (!a) return send(res,401,{success:false,error:'Oturum gerekli veya süresi dolmuş.'})
      const id=String(balanceMatch[1])
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return send(res,400,{success:false,error:'Geçersiz hesap kimliği.'})
      const u=db.users.find(x=>x.id===id || x.minecraftUuid===id)
      if(!u) return send(res,404,{success:false,error:'Hesap bulunamadı.'})
      return send(res,200,{success:true,balance:{balance:Number(u.rcBalance||0)}})
    }
    if (req.method==='POST' && p==='/api/rc/mock-purchase') {
      // Test-only endpoint: never available in production. Opt in explicitly
      // with RC_MOCK_PURCHASE=1, or run with NODE_ENV=development.
      if (process.env.RC_MOCK_PURCHASE !== '1' && process.env.NODE_ENV !== 'development') {
        return send(res,403,{success:false,error:'Bu endpoint yalnızca geliştirme/test ortamında etkindir.'})
      }
      const a=getAuth(req); if(!a) return send(res,401,{success:false,error:'Giriş gerekli.'}); const b=await readBody(req,64*1024); const amount=Math.max(0,Math.min(1000000,Number(b.amount)||0)); const u=db.users.find(x=>x.id===a.sub); if(!u) return send(res,404,{success:false,error:'Hesap bulunamadı.'}); u.rcBalance=Number(u.rcBalance||0)+amount; u.transactions=u.transactions||[]; u.transactions.unshift({id:crypto.randomUUID(),type:'mock_credit',amount,createdAt:new Date().toISOString()}); saveDb(); return send(res,200,{success:true,balance:{balance:u.rcBalance}}) }
    if (req.method==='POST' && p==='/api/presence/register') {
      const a=getAuth(req)
      if (!a) return send(res,401,{success:false,error:'Oturum gerekli veya süresi dolmuş.'})
      const b=await readBody(req,64*1024)
      const uuid=String(b.uuid||''), username=String(b.username||'')
      if (!/^[0-9a-fA-F-]{36}$/.test(uuid)) return send(res,400,{success:false,error:'Geçersiz oyuncu kimliği.'})
      if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) return send(res,400,{success:false,error:'Geçersiz kullanıcı adı.'})
      const u=db.users.find(x=>x.minecraftUuid===uuid || x.username.toLowerCase()===username.toLowerCase())
      if(u){u.minecraftUuid=uuid;u.lastSeen=new Date().toISOString();saveDb()}
      return send(res,200,{success:true,marker:'◆',launcher:'RtfLauncher'})
    }
    if (req.method==='GET' && p === '/api/stats') return send(res,200,{success:true,onlinePlayers:Number(db.stats?.onlinePlayers||0)})
    return send(res,404,{success:false,error:'Endpoint bulunamadı.'})
  } catch (e) { if (!e.status) console.error(e); return send(res, e.status || 500, { success:false, error: e.status ? e.message : 'Sunucu hatası.' }) }
}

http.createServer(route).listen(PORT, '0.0.0.0', () => console.log(`RtfSMP API listening on ${PORT}`))
