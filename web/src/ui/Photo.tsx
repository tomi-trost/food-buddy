import { useQuery } from '@tanstack/react-query'
import type { CSSProperties } from 'react'
import { api } from '../api/client'

// The mock's warm gradients for meals without a photo.
const GRADIENTS = [
  ['#d8c3a5', '#b39270'], ['#c5d0cc', '#8fa39d'], ['#d8b8a8', '#a8735f'], ['#e0d0a8', '#b79c55'],
  ['#cfd6b8', '#9aa876'], ['#d6bfa8', '#a58461'], ['#ddd2bd', '#b8a888'], ['#dccdb4', '#b09b78'],
]

/** Photos need the auth header, so they're fetched as blobs and cached per URL. */
export function useAuthedImage(url: string | null | undefined) {
  return useQuery({
    queryKey: ['img', url],
    queryFn: async () => URL.createObjectURL(await api.photoBlob(url!)),
    enabled: !!url,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  }).data
}

export function Photo({ url, emoji, seed = 0, alt, style, className = '' }: {
  url?: string | null
  emoji: string
  seed?: number
  alt: string
  style?: CSSProperties
  className?: string
}) {
  const src = useAuthedImage(url)
  if (src) return <img className={`photo ${className}`} src={src} alt={alt} style={style} />
  const decorative = alt === ''  // thumbnails next to a visible name
  const [a, b] = GRADIENTS[Math.abs(seed) % GRADIENTS.length]
  return (
    <div
      className={`photo ${className}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': alt })}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})`, ...style }}
    >
      {emoji}
    </div>
  )
}
