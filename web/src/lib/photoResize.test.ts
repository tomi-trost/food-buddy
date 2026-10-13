import { describe, expect, it, vi } from 'vitest'
import { fitWithin, shrinkPhoto, UPLOAD_MAX_PX } from './photoResize'

const file = (bytes: number, type = 'image/jpeg', name = 'IMG_0001.jpg') =>
  new File([new Uint8Array(bytes)], name, { type })

function fakeIo(width: number, height: number, out: number | null = 250_000) {
  const close = vi.fn()
  return {
    close,
    io: {
      decode: vi.fn(async () => ({ width, height, source: {} as CanvasImageSource, close })),
      encode: vi.fn(async () => (out === null ? null : new Blob([new Uint8Array(out)], { type: 'image/jpeg' }))),
    },
  }
}

describe('photo resize before upload', () => {
  it('fits the long side into the upload size, never upscaling', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: UPLOAD_MAX_PX, height: 960 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 960, height: UPLOAD_MAX_PX })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('shrinks a big iPhone HEIC into a 1280 px JPEG', async () => {
    const { io, close } = fakeIo(3024, 4032)
    const out = await shrinkPhoto(file(3_500_000, 'image/heic', 'IMG_0001.HEIC'), io)
    expect(io.encode).toHaveBeenCalledWith(expect.anything(), 960, 1280)
    expect(out.type).toBe('image/jpeg')
    expect(out.name).toBe('IMG_0001.jpg')
    expect(out.size).toBe(250_000)
    expect(close).toHaveBeenCalled()
  })

  it('sends a small JPEG that already fits untouched', async () => {
    const { io } = fakeIo(1000, 750)
    const original = file(200_000)
    expect(await shrinkPhoto(original, io)).toBe(original)
    expect(io.encode).not.toHaveBeenCalled()
  })

  it('re-encodes a heavy JPEG that fits, but keeps the original when that is not smaller', async () => {
    const heavy = file(2_000_000)
    expect((await shrinkPhoto(heavy, fakeIo(1200, 900, 300_000).io)).size).toBe(300_000)
    const big = file(400_000)
    expect(await shrinkPhoto(big, fakeIo(4000, 3000, 500_000).io)).toBe(big)
  })

  it('falls back to the original when the phone cannot decode or encode it', async () => {
    const heic = file(3_000_000, 'image/heic', 'a.heic')
    const broken = { decode: vi.fn(async () => { throw new Error('no HEIC here') }), encode: vi.fn() }
    expect(await shrinkPhoto(heic, broken)).toBe(heic) // the server reads HEIC itself
    expect(await shrinkPhoto(heic, fakeIo(4032, 3024, null).io)).toBe(heic)
    const failing = fakeIo(4032, 3024)
    failing.io.encode.mockRejectedValue(new Error('canvas too big'))
    expect(await shrinkPhoto(heic, failing.io)).toBe(heic)
    expect(failing.close).toHaveBeenCalled()
  })

  it('works without a decoder in the browser (falls back to the original)', async () => {
    const original = file(10, 'image/png', 'x.png')
    expect(await shrinkPhoto(original)).toBe(original) // jsdom: no createImageBitmap / img.decode
  })
})
