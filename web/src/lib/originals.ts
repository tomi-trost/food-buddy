// Saving our camera photos to the phone's Photos (Settings switch, per device). A web app can't
// write to Photos or an album, so we keep the original (not the resized upload) in IndexedDB until
// it's handed to the share sheet; there "Save Image" or our "Save to Food Buddy" Shortcut saves it.

const SETTING = 'fb.savePhotos'
const DB = 'fb-originals'
const STORE = 'photos'
export const KEEP_DAYS = 3 // unsaved originals go after this

export function savePhotosOn(): boolean {
  try {
    return localStorage.getItem(SETTING) === '1'
  } catch {
    return false
  }
}

export function setSavePhotos(on: boolean) {
  try {
    if (on) localStorage.setItem(SETTING, '1')
    else localStorage.removeItem(SETTING)
  } catch {
    // private mode: stays off
  }
}

type Kept = { id: number; data: ArrayBuffer; type: string; at: number } // bytes, not a Blob: older iOS lost Blobs in IndexedDB

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = f(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

/** Keep the camera's original for analysis `id` (only while the switch is on). */
export async function keepOriginal(id: number, file: Blob, now = Date.now()): Promise<void> {
  if (!savePhotosOn()) return
  try {
    const data = await file.arrayBuffer()
    await run('readwrite', (s) => s.put({ id, data, type: file.type || 'image/jpeg', at: now } satisfies Kept))
  } catch {
    // storage full or blocked: the photo just can't be saved later
  }
}

export async function getOriginal(id: number): Promise<File | null> {
  try {
    const kept = (await run<Kept>('readonly', (s) => s.get(id))) ?? null
    if (!kept) return null
    const ext = kept.type.includes('heic') ? 'heic' : kept.type.includes('png') ? 'png' : 'jpg'
    return new File([kept.data], `food-buddy-${id}.${ext}`, { type: kept.type })
  } catch {
    return null
  }
}

export async function dropOriginal(id: number): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(id))
  } catch {
    // nothing to drop
  }
}

/** Originals kept longer than KEEP_DAYS (never saved) go. */
export async function pruneOriginals(now = Date.now()): Promise<void> {
  try {
    const all = (await run<Kept[]>('readonly', (s) => s.getAll())) ?? []
    const old = all.filter((k) => now - k.at > KEEP_DAYS * 86_400_000)
    if (old.length) await run('readwrite', (s) => { old.forEach((k) => s.delete(k.id)) })
  } catch {
    // storage blocked: nothing kept anyway
  }
}

/** The share sheet with the photo ("Save Image", or the Shortcut). false = cancelled / can't. */
export async function shareOriginal(file: File): Promise<boolean> {
  const data = { files: [file] }
  if (typeof navigator.share !== 'function' || (navigator.canShare && !navigator.canShare(data))) return false
  try {
    await navigator.share(data)
    return true
  } catch {
    return false // cancelled
  }
}
