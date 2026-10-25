// A tiny IndexedDB wrapper: one database per use, one object store, one transaction per call.

export type Store = { db: string; store: string; keyPath: string; autoIncrement?: boolean }

function open(s: Store): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(s.db, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(s.store, { keyPath: s.keyPath, autoIncrement: s.autoIncrement })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Run `f` in one transaction; resolves with its request's result once the transaction commits. */
export async function run<T>(s: Store, mode: IDBTransactionMode, f: (os: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open(s)
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(s.store, mode)
      const req = f(tx.objectStore(s.store))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}
