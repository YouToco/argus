import type { ExtractedFrame } from '../types'

/**
 * Frame payloads live as Blob (binary) instead of base64 dataURL:
 * ~33% smaller in IndexedDB, no multi-MB string churn on every autosave,
 * and object URLs make <img> rendering free of re-decoding base64.
 */

const objectUrlCache = new WeakMap<Blob, string>()

/** sync object URL for <img src> — cached per blob for the page lifetime */
export function frameObjectUrl(f: ExtractedFrame): string {
  let u = objectUrlCache.get(f.blob)
  if (!u) {
    u = URL.createObjectURL(f.blob)
    objectUrlCache.set(f.blob, u)
  }
  return u
}

const dataUrlCache = new WeakMap<Blob, Promise<string>>()

/** async base64 dataURL — only needed when injecting frames into model context */
export function frameDataUrl(f: ExtractedFrame): Promise<string> {
  let p = dataUrlCache.get(f.blob)
  if (!p) {
    p = new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(f.blob)
    })
    dataUrlCache.set(f.blob, p)
  }
  return p
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl)
  if (!m) throw new Error('bad data URL')
  const bin = atob(m[2])
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] })
}

export function canvasToJpegBlob(c: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    c.toBlob(
      (b) => {
        if (b) resolve(b)
        else {
          // toBlob may theoretically return null — fall back via dataURL
          try {
            resolve(dataUrlToBlob(c.toDataURL('image/jpeg', quality)))
          } catch (e) {
            reject(e)
          }
        }
      },
      'image/jpeg',
      quality,
    )
  })
}
