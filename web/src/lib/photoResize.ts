// Shrink photos on the phone before uploading: a 12 MP iPhone photo (3–5 MB, often HEIC) becomes
// a ~1280 px JPEG of a few hundred KB. The server stores 1280 px anyway, so nothing is lost.

export const UPLOAD_MAX_PX = 1280 // = the API's photo_max_px
const QUALITY = 0.85
const SMALL_ENOUGH = 600 * 1024 // a JPEG that already fits and is this small is sent as-is

export type Decoded = { width: number; height: number; source: CanvasImageSource; close?: () => void }

/** Decode with EXIF rotation applied. Safari reads HEIC; anything undecodable throws. */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
    } catch {
      /* older Safari rejects the options or the format: try an <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { width: img.naturalWidth, height: img.naturalHeight, source: img }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(d: Decoded, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(d.source, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
}

export const fitWithin = (width: number, height: number, max = UPLOAD_MAX_PX) => {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

const jpegName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`

/** The photo to upload: shrunk JPEG, or the original whenever shrinking fails or doesn't help
 *  (the server can read HEIC and resizes too). */
export async function shrinkPhoto(file: File, io = { decode, encode }): Promise<File> {
  let d: Decoded
  try {
    d = await io.decode(file)
  } catch {
    return file
  }
  try {
    const size = fitWithin(d.width, d.height)
    const fits = size.width === d.width && size.height === d.height
    if (fits && file.type === 'image/jpeg' && file.size <= SMALL_ENOUGH) return file
    const blob = await io.encode(d, size.width, size.height)
    if (!blob || (blob.size >= file.size && file.type === 'image/jpeg')) return file
    return new File([blob], jpegName(file.name), { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  } finally {
    d.close?.()
  }
}
