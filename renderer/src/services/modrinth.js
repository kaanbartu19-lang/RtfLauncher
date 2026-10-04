// Modrinth read API for the renderer (search/browse). Responses are cached
// briefly; installed state is never cached here — it always comes from the
// profile store in the main process.
const BASE = 'https://api.modrinth.com/v2'
const cache = new Map()
const TTL = 3 * 60 * 1000

export class ModrinthError extends Error {
  constructor(message, status = 0) { super(message); this.status = status }
}

async function getJson(url, { signal, ttl = TTL } = {}) {
  const hit = cache.get(url)
  if (hit && hit.expires > Date.now()) return hit.value
  let r
  try { r = await fetch(url, { signal, headers: { Accept: 'application/json' } }) }
  catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ModrinthError('Modrinth’e ulaşılamadı. İnternet bağlantını kontrol et.', 0)
  }
  if (!r.ok) {
    if (r.status === 429) throw new ModrinthError('Modrinth istek limiti aşıldı. Biraz sonra tekrar dene.', 429)
    if (r.status === 404) throw new ModrinthError('İçerik bulunamadı.', 404)
    if (r.status >= 500) throw new ModrinthError('Modrinth şu anda yanıt vermiyor.', r.status)
    throw new ModrinthError(`Modrinth isteği başarısız (HTTP ${r.status}).`, r.status)
  }
  const value = await r.json()
  cache.set(url, { value, expires: Date.now() + ttl })
  if (cache.size > 300) cache.delete(cache.keys().next().value)
  return value
}

export const PROJECT_TYPES = {
  mod: { label: 'Mods', singular: 'mod', search: 'Search mods...' },
  resourcepack: { label: 'Resource Packs', singular: 'resource pack', search: 'Search resource packs...' },
  datapack: { label: 'Data Packs', singular: 'data pack', search: 'Search data packs...' },
  shader: { label: 'Shaders', singular: 'shader', search: 'Search shaders...' },
}

export const SORTS = [
  ['relevance', 'Relevance'],
  ['downloads', 'Downloads'],
  ['follows', 'Followers'],
  ['newest', 'Newest'],
  ['updated', 'Updated'],
]

// Loader categories Modrinth uses for each content type in a given profile.
export function loaderCategories(profile, type) {
  if (type === 'mod') return profile.loader === 'fabric' ? ['fabric'] : []
  if (type === 'shader') return profile.loader === 'vanilla' ? [] : ['iris']
  if (type === 'datapack') return ['datapack']
  return []
}

export function compatibility(hit, profile, type) {
  if (type === 'mod' && profile.loader === 'vanilla') return { ok: false, reason: 'Vanilla profiller mod yükleyemez.' }
  if (type === 'shader' && profile.loader === 'vanilla') return { ok: false, reason: 'Shader’lar Iris (Fabric/Quilt) gerektirir.' }
  const versions = hit.versions || hit.game_versions || []
  if (versions.length && !versions.includes(profile.minecraftVersion)) return { ok: false, reason: `Minecraft ${profile.minecraftVersion} desteklenmiyor.` }
  const needed = loaderCategories(profile, type)
  const cats = [...(hit.categories || []), ...(hit.loaders || [])]
  if (needed.length && !needed.some(c => cats.includes(c))) return { ok: false, reason: `${type === 'shader' ? 'Iris' : profile.loader} desteklenmiyor.` }
  return { ok: true, reason: '' }
}

export async function search({ type, profile, query = '', sort = 'relevance', limit = 20, page = 0, categories = [], environment = '', compatibleOnly = true, signal }) {
  const facets = [[`project_type:${type}`]]
  if (compatibleOnly) {
    facets.push([`versions:${profile.minecraftVersion}`])
    const loaders = loaderCategories(profile, type)
    if (loaders.length) facets.push(loaders.map(l => `categories:${l}`))
  }
  for (const c of categories) facets.push([`categories:${c}`])
  if (environment === 'client') facets.push(['client_side:required', 'client_side:optional'])
  if (environment === 'server') facets.push(['server_side:required', 'server_side:optional'])
  const q = new URLSearchParams({ query: query.trim(), facets: JSON.stringify(facets), index: sort, limit: String(limit), offset: String(page * limit) })
  const data = await getJson(`${BASE}/search?${q}`, { signal, ttl: 60 * 1000 })
  return { hits: data.hits || [], total: Number(data.total_hits) || 0 }
}

export const getProject = (id, signal) => getJson(`${BASE}/project/${encodeURIComponent(id)}`, { signal })
export const getMembers = (id, signal) => getJson(`${BASE}/project/${encodeURIComponent(id)}/members`, { signal })

let categoriesPromise = null
export function getCategories() {
  categoriesPromise = categoriesPromise || getJson(`${BASE}/tag/category`, { ttl: 60 * 60 * 1000 }).catch(e => { categoriesPromise = null; throw e })
  return categoriesPromise
}

export function formatCount(n) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n) || 0)
}

export function timeAgo(value) {
  if (!value) return ''
  const t = typeof value === 'number' ? value : Date.parse(value)
  if (!t) return ''
  const s = Math.max(1, Math.round((Date.now() - t) / 1000))
  const units = [[31536000, 'year'], [2592000, 'month'], [604800, 'week'], [86400, 'day'], [3600, 'hour'], [60, 'minute']]
  for (const [sec, unit] of units) if (s >= sec) { const n = Math.floor(s / sec); return `${n} ${unit}${n > 1 ? 's' : ''} ago` }
  return 'just now'
}
