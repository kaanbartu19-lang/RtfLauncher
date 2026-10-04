// Skin helpers that need pixel access (the main process validates the PNG
// header and size; model detection needs the decoded image).

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Görsel okunamadı.'))
    img.src = src
  })
}

// Slim ("Alex") skins leave a 1px-wide strip of each arm unused. In a 64×64
// skin the right arm's unused columns are x=54..55, y=20..31 (and the left
// arm's x=46..47, y=52..63). If those pixels are fully transparent the skin is
// slim. Some editors fill them with solid black/white instead, which we also
// treat as unused. 64×32 legacy skins are always the default model.
export async function detectSkinModel(dataUrl) {
  const img = await loadImage(dataUrl)
  if (img.naturalWidth !== 64 || (img.naturalHeight !== 64 && img.naturalHeight !== 32)) {
    throw new Error(`Geçersiz Minecraft skin’i: ${img.naturalWidth}×${img.naturalHeight}. 64×64 veya 64×32 olmalı.`)
  }
  if (img.naturalHeight === 32) return 'default'
  const canvas = document.createElement('canvas')
  canvas.width = 64; canvas.height = 64
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const unused = (x0, y0, w, h) => {
    const d = ctx.getImageData(x0, y0, w, h).data
    let allClear = true, allSame = true
    const [r0, g0, b0, a0] = [d[0], d[1], d[2], d[3]]
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] !== 0) allClear = false
      if (d[i] !== r0 || d[i + 1] !== g0 || d[i + 2] !== b0 || d[i + 3] !== a0) allSame = false
    }
    const solidFill = allSame && a0 === 255 && ((r0 === 0 && g0 === 0 && b0 === 0) || (r0 === 255 && g0 === 255 && b0 === 255))
    return allClear || solidFill
  }
  return unused(54, 20, 2, 12) && unused(46, 52, 2, 12) ? 'slim' : 'default'
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Dosya okunamadı.'))
    r.readAsDataURL(file)
  })
}
