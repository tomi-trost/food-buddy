import { afterEach, describe, expect, it, vi } from 'vitest'
import { dropOriginal, getOriginal, keepOriginal, KEEP_DAYS, pruneOriginals, savePhotosOn, setSavePhotos, shareOriginal } from './originals'

const photo = () => new File(['jpeg bytes'], 'IMG_1.JPG', { type: 'image/jpeg' })

afterEach(async () => {
  await dropOriginal(1)
  await dropOriginal(2)
  vi.unstubAllGlobals()
})

describe('original photos', () => {
  it('keeps nothing while the switch is off', async () => {
    expect(savePhotosOn()).toBe(false)
    await keepOriginal(1, photo())
    expect(await getOriginal(1)).toBeNull()
  })

  it('keeps the original per analysis until dropped', async () => {
    setSavePhotos(true)
    await keepOriginal(1, photo())
    const kept = await getOriginal(1)
    expect(kept?.name).toBe('food-buddy-1.jpg')
    expect(kept?.type).toBe('image/jpeg')
    expect(await kept!.text()).toBe('jpeg bytes')
    await dropOriginal(1)
    expect(await getOriginal(1)).toBeNull()
    setSavePhotos(false)
    expect(savePhotosOn()).toBe(false)
  })

  it(`drops unsaved originals after ${KEEP_DAYS} days`, async () => {
    setSavePhotos(true)
    const day = 86_400_000
    await keepOriginal(1, photo(), 0)
    await keepOriginal(2, photo(), 2 * day)
    await pruneOriginals(3.5 * day)
    expect(await getOriginal(1)).toBeNull()
    expect(await getOriginal(2)).not.toBeNull()
  })

  it('hands the photo to the share sheet; false when cancelled or not possible', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })
    expect(await shareOriginal(photo())).toBe(true)
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] })
    share.mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    expect(await shareOriginal(photo())).toBe(false)
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => false })
    expect(await shareOriginal(photo())).toBe(false)
    vi.stubGlobal('navigator', { ...navigator, share: undefined })
    expect(await shareOriginal(photo())).toBe(false)
  })
})
