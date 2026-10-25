// Changes made without a connection (logging food, ratings, shopping ticks…) wait here, on this
// phone, and are sent in the order they were made once we're back (api/client.ts `flushOutbox`).

import { useSyncExternalStore } from 'react'
import { run, type Store } from './idb'

const STORE: Store = { db: 'fb-outbox', store: 'changes', keyPath: 'id', autoIncrement: true }

/** A photo as bytes (IndexedDB can't hold FormData), with the form's other fields. */
export type QueuedForm = { fields: [string, string][]; file: { field: string; name: string; type: string; data: ArrayBuffer } }

export type Change = {
  id?: number
  path: string // as the API client takes it, without /api
  method: string
  json?: string // body
  form?: QueuedForm
  label: string // for people: "Log Pasta pomodoro"
  at: number
}

let count = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

async function recount() {
  try {
    count = (await run<number>(STORE, 'readonly', (s) => s.count())) ?? 0
  } catch {
    count = 0
  }
  emit()
}

export async function enqueue(change: Omit<Change, 'id' | 'at'>, now = Date.now()): Promise<void> {
  await run(STORE, 'readwrite', (s) => s.add({ ...change, at: now }))
  await recount()
}

/** Oldest first, the order they were made in. */
export async function pending(): Promise<Change[]> {
  try {
    return ((await run<Change[]>(STORE, 'readonly', (s) => s.getAll())) ?? []).sort((a, b) => a.id! - b.id!)
  } catch {
    return []
  }
}

export async function drop(id: number): Promise<void> {
  await run(STORE, 'readwrite', (s) => s.delete(id))
  await recount()
}

export function toForm(q: QueuedForm): FormData {
  const form = new FormData()
  form.append(q.file.field, new File([q.file.data], q.file.name, { type: q.file.type }))
  for (const [k, v] of q.fields) form.append(k, v)
  return form
}

export async function fromForm(form: FormData): Promise<QueuedForm> {
  const fields: [string, string][] = []
  let file: QueuedForm['file'] | null = null
  for (const [k, v] of form.entries()) {
    if (typeof v === 'string') fields.push([k, v])
    else file = { field: k, name: v.name, type: v.type || 'image/jpeg', data: await v.arrayBuffer() }
  }
  if (!file) throw new Error('A queued form needs its photo')
  return { fields, file }
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) recount()
  return () => listeners.delete(l)
}

/** How many changes are waiting to be sent. */
export const useOutboxCount = () => useSyncExternalStore(subscribe, () => count)
