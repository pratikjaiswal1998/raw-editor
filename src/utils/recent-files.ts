import type { GlobalAdjustments } from '../state/types'
import type { Mask } from '../masks/types'

export interface RecentFile {
  fileName: string                      // IndexedDB key
  openedAt: number                      // ms timestamp
  handle: FileSystemFileHandle | null   // null if FSA not available or couldn't be stored
  adjustments: GlobalAdjustments
  masks: Mask[]
  rotation: number
}

const DB_NAME = 'raw-editor-recent'
const STORE_NAME = 'files'
const MAX_RECENT = 10

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'fileName' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, entry: RecentFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(entry)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function idbGetAll(db: IDBDatabase): Promise<RecentFile[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result as RecentFile[])
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function saveRecentFile(entry: RecentFile): Promise<void> {
  const db = await openDb()
  try {
    await idbPut(db, entry)
  } catch {
    // Some browsers can't serialize FileSystemFileHandle — store without it
    await idbPut(db, { ...entry, handle: null })
  }
  // Trim to max entries
  const all = await idbGetAll(db)
  if (all.length > MAX_RECENT) {
    all.sort((a, b) => a.openedAt - b.openedAt)
    for (let i = 0; i < all.length - MAX_RECENT; i++) {
      await idbDelete(db, all[i].fileName)
    }
  }
}

export async function getRecentFiles(): Promise<RecentFile[]> {
  const db = await openDb()
  const all = await idbGetAll(db)
  return all.sort((a, b) => b.openedAt - a.openedAt)
}

export async function updateRecentFileSettings(
  fileName: string,
  settings: Pick<RecentFile, 'adjustments' | 'masks' | 'rotation'>,
): Promise<void> {
  const db = await openDb()
  const all = await idbGetAll(db)
  const existing = all.find((f) => f.fileName === fileName)
  if (existing) {
    await idbPut(db, { ...existing, ...settings })
  }
}

export async function deleteRecentFile(fileName: string): Promise<void> {
  const db = await openDb()
  await idbDelete(db, fileName)
}

export async function getFileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  try {
    if (typeof (handle as unknown as Record<string, unknown>).queryPermission === 'function') {
      const anyHandle = handle as unknown as {
        queryPermission(d: { mode: string }): Promise<string>
        requestPermission(d: { mode: string }): Promise<string>
      }
      const perm = await anyHandle.queryPermission({ mode: 'read' })
      if (perm !== 'granted') {
        const newPerm = await anyHandle.requestPermission({ mode: 'read' })
        if (newPerm !== 'granted') return null
      }
    }
    return handle.getFile()
  } catch {
    return null
  }
}
