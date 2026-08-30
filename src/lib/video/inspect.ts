export interface RegionBox {
  x: number
  y: number
  width: number
  height: number
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = dataUrl
  })
}

/**
 * Crop a normalized region from a frame's data URL and upscale it so the model
 * can inspect small details (e.g. a distant object / a person).
 */
export async function cropRegion(
  dataUrl: string,
  box: RegionBox,
  scale = 2,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const img = await loadImage(dataUrl)
  const x = Math.max(0, Math.min(box.x, 1))
  const y = Math.max(0, Math.min(box.y, 1))
  const w = Math.max(0.01, Math.min(box.width, 1 - x))
  const h = Math.max(0.01, Math.min(box.height, 1 - y))
  const sx = Math.round(x * img.naturalWidth)
  const sy = Math.round(y * img.naturalHeight)
  const sw = Math.round(w * img.naturalWidth)
  const sh = Math.round(h * img.naturalHeight)
  const outW = Math.max(1, Math.round(sw * scale))
  const outH = Math.max(1, Math.round(sh * scale))
  const c = document.createElement('canvas')
  c.width = outW
  c.height = outH
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
  return { dataUrl: c.toDataURL('image/jpeg', 0.85), width: outW, height: outH }
}
