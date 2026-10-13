import { type FormEvent, useEffect, useRef, useState } from 'react'
import { PhotoInput } from '../add/PhotoInput'
import { cleanBarcode } from '../lib/barcode'
import { readBarcode } from '../lib/barcodeReader'
import { Icon } from '../ui/Icon'

const FRAME_EVERY_MS = 250
const FRAME_MAX_PX = 960 // wide enough for a barcode at arm's length, small enough to decode fast

/** The part of the frame around the guide, or null before the first frame.
 *  The video is cropped to fill its box (object-fit: cover), so the band is taken from the visible part. */
function grabFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): ImageData | null {
  const { videoWidth: w, videoHeight: h, clientWidth: boxW, clientHeight: boxH } = video
  if (!w || !h) return null
  const fit = boxW && boxH ? Math.max(boxW / w, boxH / h) : 1
  const vis = { w: (boxW || w) / fit, h: (boxH || h) / fit }
  const left = (w - vis.w) / 2
  const top = (h - vis.h) / 2
  // the guide covers 5–95 % × 25–75 % of the box; decode a little beyond it
  const band = { x: left + vis.w * 0.02, y: top + vis.h * 0.15, w: vis.w * 0.96, h: vis.h * 0.7 }
  const scale = Math.min(1, FRAME_MAX_PX / band.w)
  canvas.width = Math.round(band.w * scale)
  canvas.height = Math.round(band.h * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, band.x, band.y, band.w, band.h, 0, 0, canvas.width, canvas.height)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Live camera scan; a photo of the barcode or the typed number when the camera isn't available. */
export function BarcodeScanner({ busy, onCode }: { busy: boolean; onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState<'starting' | 'on' | 'off'>(typeof navigator.mediaDevices?.getUserMedia === 'function' ? 'starting' : 'off')
  const [error, setError] = useState<string | null>(null)
  const latest = useRef({ busy, onCode })
  latest.current = { busy, onCode }
  const live = camera !== 'off'

  useEffect(() => {
    if (!live) return
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    let last: string | null = null // a code already sent: not again while it stays in view
    const canvas = document.createElement('canvas')
    const scan = async () => {
      if (stopped || !video.current) return
      const frame = latest.current.busy ? null : grabFrame(video.current, canvas)
      const code = frame ? await readBarcode(frame).catch(() => null) : null
      if (stopped) return
      if (code && code !== last) {
        last = code
        latest.current.onCode(code)
      }
      timer = setTimeout(scan, FRAME_EVERY_MS)
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false })
      .then(async (s) => {
        stream = s
        if (stopped || !video.current) return void s.getTracks().forEach((t) => t.stop())
        video.current.srcObject = s
        await video.current.play()
        setCamera('on')
        scan()
      })
      .catch(() => !stopped && setCamera('off'))
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [live])

  const fromPhoto = async (file: File) => {
    setError(null)
    const code = await readBarcode(file).catch(() => null)
    if (code) onCode(code)
    else setError('No barcode found in this photo. Get closer and keep it sharp, or type the number.')
  }
  const typed = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const code = cleanBarcode(String(new FormData(e.currentTarget).get('code') ?? ''))
    if (code) onCode(code)
    else setError('A barcode number has 8 to 14 digits.')
  }

  return (
    <>
      {live && (
        <div className="scanner">
          <video ref={video} playsInline muted aria-label="Camera" />
          <div className="scanner-guide" />
          <p className="scanner-hint">{busy ? 'Looking it up…' : camera === 'starting' ? 'Starting camera…' : 'Hold the barcode inside the frame'}</p>
        </div>
      )}
      {!live && <p className="sub">No live camera here. Take a photo of the barcode or type its number.</p>}
      <PhotoInput camera label="Photo of the barcode" disabled={busy} className="btn ghost" onFile={fromPhoto}>
        <Icon name="camera" size={18} /> Photo of the barcode
      </PhotoInput>
      <form onSubmit={typed} className="row" style={{ gap: 8, marginTop: 8 }}>
        <label className="field sp">
          <span className="visually-hidden">Barcode number</span>
          <input name="code" inputMode="numeric" autoComplete="off" placeholder="Or type the number" maxLength={20} />
        </label>
        <button className="btn" style={{ width: 'auto', padding: '0 18px' }} disabled={busy}>Look up</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  )
}
