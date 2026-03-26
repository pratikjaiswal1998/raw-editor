import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditorStore } from '../state/editor-store'
import { triggerFileInput } from '../utils/file-io'
import {
  getRecentFiles,
  saveRecentFile,
  deleteRecentFile,
  getFileFromHandle,
  type RecentFile,
} from '../utils/recent-files'
import type { WorkerResponse } from '../raw/raw-worker'

function relativeTime(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export function RecentDropdown() {
  const restoreImage = useEditorStore((s) => s.restoreImage)
  const setLoading = useEditorStore((s) => s.setLoading)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)

  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<RecentFile[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    setFiles(await getRecentFiles())
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleReload = async (recent: RecentFile) => {
    setLoadingId(recent.fileName)
    setLoading(true)
    setOpen(false)
    try {
      let file: File | null = null
      if (recent.handle) file = await getFileFromHandle(recent.handle)
      if (!file) {
        file = await triggerFileInput('.dng,.DNG,.jpg,.jpeg,.png,.tiff,.tif,.heic,.heif,.webp,.avif,.bmp,.gif,.svg')
        if (!file) return
      }
      const worker = new Worker(new URL('../raw/raw-worker.ts', import.meta.url), { type: 'module' })
      const result = await new Promise<{ data: Float32Array; width: number; height: number }>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          worker.terminate()
          if ('error' in e.data) reject(new Error(e.data.error))
          else resolve(e.data)
        }
        worker.onerror = (err) => { worker.terminate(); reject(new Error(err.message || 'Worker error')) }
        file!.arrayBuffer().then((buffer) => {
          worker.postMessage({ buffer, fileName: file!.name }, [buffer])
        }).catch((err) => { worker.terminate(); reject(err) })
      })
      restoreImage(result.data, result.width, result.height, recent)
      await saveRecentFile({ ...recent, openedAt: Date.now() })
      setActiveTab('light')
    } catch (e) {
      alert(`Failed to load: ${e instanceof Error ? e.message : e}`)
    } finally {
      setLoadingId(null)
      setLoading(false)
    }
  }

  const handleDelete = async (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await deleteRecentFile(fileName)
    void refresh()
  }

  return (
    <div className="recent-dd" ref={wrapRef}>
      <button
        className={`toolbar-btn${open ? ' toolbar-btn--active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Recent files"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="toolbar-label">Recent</span>
      </button>

      {open && (
        <div className="recent-dd-menu">
          {files.length === 0 ? (
            <div className="recent-dd-empty">No recent files</div>
          ) : (
            files.map((f) => (
              <div key={f.fileName} className="recent-dd-item">
                <button
                  className="recent-dd-load"
                  onClick={() => void handleReload(f)}
                  disabled={loadingId === f.fileName}
                >
                  <span className="recent-dd-name" title={f.fileName}>{f.fileName}</span>
                  <span className="recent-dd-time">{relativeTime(f.openedAt)}</span>
                </button>
                <button
                  className="recent-dd-del"
                  onClick={(e) => void handleDelete(f.fileName, e)}
                  title="Remove from recent"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
