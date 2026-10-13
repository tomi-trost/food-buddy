import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import css from './styles.css?raw'

// jsdom doesn't apply CSS, so guard the iOS "zoomed in, scrolls sideways" fixes at the source.
describe('mobile layout guards', () => {
  it('keeps text inputs at 16px or more so iOS does not zoom on focus', () => {
    const rule = css.match(/\.field input, \.input \{([^}]*)\}/)?.[1] ?? ''
    const size = Number(rule.match(/font-size:\s*(\d+)px/)?.[1])
    expect(size).toBeGreaterThanOrEqual(16)
  })

  it('locks the viewport scale and blocks sideways scrolling', () => {
    expect(html).toMatch(/name="viewport"[^>]*maximum-scale=1/)
    expect(css).toMatch(/html \{[^}]*touch-action: manipulation[^}]*overflow-x: clip/)
  })

  it('top-aligns Today entries so a wrapped name keeps its pencil level with the +', () => {
    const rule = css.match(/\.today-entry \{([^}]*)\}/)?.[1] ?? ''
    expect(rule).toMatch(/align-items: flex-start/)
  })

  it('keeps the update popup a comfortable tap target, clear of the notch', () => {
    const rule = css.match(/\.update \{([^}]*)\}/)?.[1] ?? ''
    expect(Number(rule.match(/min-height:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44)
    expect(rule).toMatch(/top: calc\(env\(safe-area-inset-top\)/)
  })

  it('keeps the pending banner a comfortable tap target', () => {
    const rule = css.match(/\.pending \{([^}]*)\}/)?.[1] ?? ''
    expect(Number(rule.match(/min-height:\s*(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44)
  })
})
