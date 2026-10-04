import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getAccent, setAccent, toggleTheme } from './theme'

beforeEach(() => {
  delete document.documentElement.dataset.theme
  document.documentElement.removeAttribute('style')
})

describe('theme', () => {
  it('defaults to terracotta and persists the chosen accent', () => {
    expect(getAccent()).toBe('terracotta')
    setAccent('teal')
    expect(getAccent()).toBe('teal')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2f7a78')
  })

  it('toggles dark mode with the dark accent variant', () => {
    setAccent('olive')
    toggleTheme() // jsdom: system is light → explicit dark
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#8aa85e')
    toggleTheme()
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('charcoal uses dark ink on its light dark-mode accent', () => {
    setAccent('charcoal')
    toggleTheme()
    applyTheme()
    expect(document.documentElement.style.getPropertyValue('--accent-ink')).toBe('#1f1b17')
  })
})
