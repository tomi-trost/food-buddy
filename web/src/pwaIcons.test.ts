import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import config from '../vite.config.ts?raw'

// Icons are drawn in icons/*.svg and rendered into public/ by icons/render.sh.
const pngs = import.meta.glob<string>('../public/*.png', { query: '?inline', import: 'default', eager: true })
const sources = import.meta.glob('../icons/*', { query: '?raw', eager: true })

/** Width and height from a PNG's IHDR chunk; null when the file isn't there. */
function pngSize(name: string) {
  const data = pngs[`../public/${name}`]
  if (!data) return null
  const bytes = Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  expect(String.fromCharCode(...bytes.subarray(1, 4))).toBe('PNG')
  return [view.getUint32(16), view.getUint32(20)]
}

const manifestIcons = [...config.matchAll(/\{ src: '([^']+\.png)', sizes: '(\d+)x(\d+)'(?:[^}]*?purpose: '([^']+)')?[^}]*\}/g)]

describe('app icons', () => {
  it('every manifest icon exists at the size it claims', () => {
    expect(manifestIcons).toHaveLength(3)
    for (const [, src, w, h] of manifestIcons) expect(pngSize(src)).toEqual([+w, +h])
  })

  it('has a separate maskable icon, so Android cropping never cuts the plain one', () => {
    const purposes = manifestIcons.map((m) => m[4])
    expect(purposes).toContain('any')
    expect(purposes).toContain('maskable')
    expect(purposes).not.toContain('any maskable')
  })

  it('has the 180 px Home Screen icon for iPhone', () => {
    expect(html).toContain('href="/apple-touch-icon.png"')
    expect(pngSize('apple-touch-icon.png')).toEqual([180, 180])
  })

  it('keeps the icon sources next to the renderer', () => {
    expect(Object.keys(sources).sort()).toEqual(['../icons/icon-maskable.svg', '../icons/icon.svg', '../icons/render.sh'])
  })
})
