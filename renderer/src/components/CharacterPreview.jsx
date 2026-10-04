import { SkinViewer, WalkingAnimation, IdleAnimation } from 'skinview3d'
import { Points, BufferGeometry, BufferAttribute, PointsMaterial, AdditiveBlending } from 'three'
import { useEffect, useRef, useState } from 'react'
import './character-preview.css'

// One 3D viewer implementation for skins and cosmetics.
//
// Sizing: the canvas is absolutely positioned inside the host and the viewer
// is resized with viewer.setSize(width, height) from a ResizeObserver on the
// host. The canvas is never stretched with CSS, which is what previously made
// the model look squashed.
// Composite an "outfit" cosmetic (a transparent PNG aligned to the standard
// Minecraft skin UV layout, i.e. a skin second/overlay layer) onto a copy of
// the base skin texture, so it renders as clothing worn over the player's
// own skin instead of a separate unattached image. Returns a data URL, or
// the original skin URL if there's no outfit or compositing fails (CORS on
// a remote skin host, etc).
function composeOutfitOnSkin(skinUrl, outfitUrl) {
  return new Promise(resolve => {
    if (!skinUrl || !outfitUrl) return resolve(skinUrl)
    const base = new Image(); base.crossOrigin = 'anonymous'
    const outfit = new Image(); outfit.crossOrigin = 'anonymous'
    let loaded = 0
    const done = () => {
      loaded++
      if (loaded < 2) return
      try {
        const canvas = document.createElement('canvas')
        canvas.width = base.naturalWidth || 64
        canvas.height = base.naturalHeight || 64
        const ctx = canvas.getContext('2d')
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height)
        // The outfit texture uses the same UV layout as the skin itself, so
        // it's drawn at the same size directly on top; transparent pixels
        // let the base skin show through underneath.
        ctx.drawImage(outfit, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        // Likely a cross-origin canvas taint from a remote skin host that
        // doesn't send CORS headers. Fall back to the plain skin rather than
        // breaking the whole preview.
        resolve(skinUrl)
      }
    }
    base.onload = done; base.onerror = done
    outfit.onload = done; outfit.onerror = done
    base.src = skinUrl; outfit.src = outfitUrl
  })
}

export default function CharacterPreview({
  username,
  skinUrl,
  model = 'auto-detect', // 'default' | 'slim' | 'auto-detect'
  capeUrl = null,
  backEquipment = 'cape', // 'cape' | 'elytra'
  outfitUrl = null, // clothing cosmetic composited onto the skin, Essential-style
  effect = null, // null | 'glow' | 'rainbow' | 'particles' — applied to the cape/wing mesh
  animation = 'walk', // 'walk' | 'idle' | 'none'
  showOuterLayer = true,
  zoom = 0.8,
  className = '',
}) {
  const hostRef = useRef(null)
  const canvasRef = useRef(null)
  const viewerRef = useRef(null)
  const [status, setStatus] = useState('loading') // loading | ready | failed
  const [skinError, setSkinError] = useState('')
  const baseTexture = skinUrl || (username ? `https://mc-heads.net/skin/${encodeURIComponent(username)}` : null)
  const [texture, setTexture] = useState(baseTexture)

  // Recompute the composited texture whenever the base skin or the outfit
  // cosmetic changes. Without an outfit, this just passes the base through.
  useEffect(() => {
    let cancelled = false
    composeOutfitOnSkin(baseTexture, outfitUrl).then(t => { if (!cancelled) setTexture(t) })
    return () => { cancelled = true }
  }, [baseTexture, outfitUrl])

  // Mount / unmount: create the viewer once, keep it sized to the host.
  useEffect(() => {
    const host = hostRef.current, canvas = canvasRef.current
    if (!host || !canvas) return
    let viewer
    try {
      const { width, height } = host.getBoundingClientRect()
      viewer = new SkinViewer({ canvas, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) })
    } catch {
      setStatus('failed')
      return
    }
    viewerRef.current = viewer
    viewer.fov = 50
    viewer.zoom = zoom
    viewer.globalLight.intensity = 3
    viewer.cameraLight.intensity = 0.6
    if (viewer.controls) {
      viewer.controls.enableRotate = true
      viewer.controls.enableZoom = true
      viewer.controls.enablePan = false
    }
    let frame = 0
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const w = Math.round(rect.width), h = Math.round(rect.height)
        if (w > 0 && h > 0 && viewerRef.current === viewer) viewer.setSize(w, h)
      })
    })
    observer.observe(host)
    setStatus('ready')
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      viewerRef.current = null
      try { viewer.dispose() } catch {}
    }
  }, [])

  useEffect(() => { if (viewerRef.current) viewerRef.current.zoom = zoom }, [zoom, status])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.animation = animation === 'walk' ? new WalkingAnimation() : animation === 'idle' ? new IdleAnimation() : null
    if (viewer.animation && animation === 'walk') viewer.animation.speed = 0.6
  }, [animation, status])

  // Skin texture + model. Stale loads (after unmount or a newer skin) are ignored.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !texture) return
    let cancelled = false
    setSkinError('')
    const options = model === 'slim' || model === 'default' ? { model } : {}
    Promise.resolve(viewer.loadSkin(texture, options)).catch(() => {
      if (!cancelled && viewerRef.current === viewer) setSkinError('Skin yüklenemedi')
    })
    return () => { cancelled = true }
  }, [texture, model, status])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let cancelled = false
    if (!capeUrl) { viewer.resetCape(); return }
    Promise.resolve(viewer.loadCape(capeUrl, { backEquipment })).catch(() => { if (!cancelled && viewerRef.current === viewer) viewer.resetCape() })
    return () => { cancelled = true }
  }, [capeUrl, backEquipment, status])

  useEffect(() => {
    const skin = viewerRef.current?.playerObject?.skin
    if (skin?.setOuterLayerVisible) skin.setOuterLayerVisible(showOuterLayer)
  }, [showOuterLayer, status, texture])

  // Cape/wing effects (glow, rainbow, particle trail). Runs its own
  // requestAnimationFrame loop rather than piggybacking on skinview3d's
  // WalkingAnimation/IdleAnimation object, because that object gets replaced
  // whenever the `animation` prop changes (and is entirely absent when
  // animation === 'none'), which would silently kill the effect.
  useEffect(() => {
    const viewer = viewerRef.current
    const player = viewer?.playerObject
    if (!viewer || !player || !effect) return

    const capeMat = player.cape?.material
    const elytraMat = player.elytra?.material
    const materials = [capeMat, elytraMat].filter(Boolean)

    // One shared particle system, parented to the cape group so it inherits
    // the character's rotation automatically. Each particle drifts down and
    // back, fading as it ages, then respawns near the cape's hem — giving a
    // continuous "shedding" trail rather than a one-shot burst.
    let points = null
    let velocities = null
    let ages = null
    const PARTICLE_COUNT = 36
    if (effect === 'particles') {
      const geometry = new BufferGeometry()
      const positions = new Float32Array(PARTICLE_COUNT * 3)
      const colors = new Float32Array(PARTICLE_COUNT * 3)
      velocities = new Float32Array(PARTICLE_COUNT * 3)
      ages = new Float32Array(PARTICLE_COUNT)
      const respawn = i => {
        positions[i * 3] = (Math.random() - 0.5) * 7
        positions[i * 3 + 1] = 14 + Math.random() * 6
        positions[i * 3 + 2] = 1.5 + Math.random() * 1.5
        velocities[i * 3] = (Math.random() - 0.5) * 0.4
        velocities[i * 3 + 1] = -(0.4 + Math.random() * 0.5)
        velocities[i * 3 + 2] = Math.random() * 0.3
        ages[i] = 0
        const c = 0.7 + Math.random() * 0.3
        colors[i * 3] = c; colors[i * 3 + 1] = c * 0.85; colors[i * 3 + 2] = 0.4 + Math.random() * 0.3
      }
      for (let i = 0; i < PARTICLE_COUNT; i++) respawn(i)
      geometry.setAttribute('position', new BufferAttribute(positions, 3))
      geometry.setAttribute('color', new BufferAttribute(colors, 3))
      const material = new PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending })
      points = new Points(geometry, material)
      points.userData.respawn = respawn
      ;(player.cape || player).add(points)
    }

    let raf = null
    const start = performance.now()
    const tick = now => {
      const t = (now - start) / 1000
      if (effect === 'glow') {
        for (const m of materials) {
          if (!m.emissiveMap && m.map) m.emissiveMap = m.map
          m.emissive.set('#fff6d8')
          m.emissiveIntensity = 0.25 + Math.sin(t * 2.4) * 0.22
          m.needsUpdate = true
        }
      } else if (effect === 'rainbow') {
        const hue = (t * 0.12) % 1
        for (const m of materials) { m.color.setHSL(hue, 0.85, 0.55); m.needsUpdate = true }
      } else if (effect === 'particles' && points) {
        const pos = points.geometry.attributes.position
        const dt = 1 / 60
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          ages[i] += dt
          pos.array[i * 3] += velocities[i * 3]
          pos.array[i * 3 + 1] += velocities[i * 3 + 1]
          pos.array[i * 3 + 2] += velocities[i * 3 + 2]
          if (ages[i] > 2.2) points.userData.respawn(i)
        }
        pos.needsUpdate = true
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      for (const m of materials) { m.emissiveIntensity = 0; m.color.set(0xffffff); m.needsUpdate = true }
      if (points) {
        points.parent?.remove(points)
        points.geometry.dispose()
        points.material.dispose()
      }
    }
  }, [effect, capeUrl, backEquipment, status])

  return (
    <div className={`character-preview-v2 ${className}`} ref={hostRef}>
      <canvas ref={canvasRef} />
      {status === 'failed' && <div className="character-preview-msg">3D önizleme başlatılamadı (WebGL kullanılamıyor).</div>}
      {skinError && <div className="character-preview-msg small">{skinError}</div>}
    </div>
  )
}
