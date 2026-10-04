// Accent colours from the mock's Settings (decision 0006). Per device: stored in localStorage.

export const ACCENTS = {
  terracotta: { name: 'Terracotta', light: '#b9532f', dark: '#d0704b' },
  olive: { name: 'Olive', light: '#5f7a3c', dark: '#8aa85e' },
  teal: { name: 'Teal', light: '#2f7a78', dark: '#4fb0ac' },
  indigo: { name: 'Indigo', light: '#4a5aa8', dark: '#8392e0' },
  plum: { name: 'Plum', light: '#8a4a78', dark: '#c077aa' },
  mustard: { name: 'Mustard', light: '#a8761a', dark: '#d9a640' },
  charcoal: { name: 'Charcoal', light: '#2b2b2b', dark: '#e6e1d8', darkInk: '#1f1b17' },
} as const

export type Accent = keyof typeof ACCENTS
export type Theme = 'light' | 'dark'

const ACCENT_KEY = 'fb.accent'
const THEME_KEY = 'fb.theme'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage blocked: setting just won't persist */
  }
}

export function getAccent(): Accent {
  const a = read(ACCENT_KEY)
  return a && a in ACCENTS ? (a as Accent) : 'terracotta'
}

/** Explicit choice, or null when following the system setting. */
export function getThemeOverride(): Theme | null {
  const t = read(THEME_KEY)
  return t === 'light' || t === 'dark' ? t : null
}

export function effectiveTheme(): Theme {
  const override = getThemeOverride()
  if (override) return override
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme() {
  const root = document.documentElement
  const override = getThemeOverride()
  if (override) root.dataset.theme = override
  else delete root.dataset.theme
  const accent = ACCENTS[getAccent()]
  const dark = effectiveTheme() === 'dark'
  root.style.setProperty('--accent', dark ? accent.dark : accent.light)
  root.style.setProperty('--accent-ink', dark && 'darkInk' in accent ? accent.darkInk : '#fff')
}

export function setAccent(accent: Accent) {
  write(ACCENT_KEY, accent)
  applyTheme()
}

export function toggleTheme() {
  write(THEME_KEY, effectiveTheme() === 'dark' ? 'light' : 'dark')
  applyTheme()
}
