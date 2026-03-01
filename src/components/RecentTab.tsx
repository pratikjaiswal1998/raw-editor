import { useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '../state/editor-store'
import { loadImageFile } from '../raw/dng-parser'
import { triggerFileInput } from '../utils/file-io'
import {
  getRecentFiles,
  saveRecentFile,
  deleteRecentFile,
  getFileFromHandle,
  type RecentFile,
} from '../utils/recent-files'

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

export function RecentTab() {
  const activeTab = useEditorStore((s) => s.activeTab)
  const restoreImage = useEditorStore((s) => s.restoreImage)
  const setLoading = useEditorStore((s) => s.setLoading)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)

  const [files, setFiles] = useState<RecentFile[]>([])
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setFiles(await getRecentFiles())
  }, [])

  useEffect(() => {
    if (activeTab === 'recent') void refresh()
  }, [activeTab, refresh])

  if (activeTab !== 'recent') return null

  const handleReload = async (recent: RecentFile) => {
    setLoadingId(recent.fileName)
    setLoading(true)
    try {
      let file: File | null = null

      if (recent.handle) {
        file = await getFileFromHandle(recent.handle)
      }

      if (!file) {
        // Handle unavailable or permission denied — fall back to picker
        file = await triggerFileInput('.dng,.DNG,.jpg,.jpeg,.png,.tiff,.tif,.heic')
        if (!file) return
      }

      const rawImage = await loadImageFile(file)
      restoreImage(rawImage.data, rawImage.width, rawImage.height, recent)

      // Bump openedAt and switch to editing
      await saveRecentFile({ ...recent, openedAt: Date.now() })
      setActiveTab('light')
      await refresh()
    } catch (e) {
      alert(`Failed to load: ${e instanceof Error ? e.message : e}`)
    } finally {
      setLoadingId(null)
      setLoading(false)
    }
  }

  const handleDelete = async (fileName: string) => {
    await deleteRecentFile(fileName)
    await refresh()
  }

  if (files.length === 0) {
    return (
      <div className="recent-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <span>No recent files yet — open an image to get started</span>
      </div>
    )
  }

  return (
    <div className="recent-list">
      {files.map((f) => (
        <div key={f.fileName} className="recent-item">
          <div className="recent-item-info">
            <span className="recent-item-name" title={f.fileName}>{f.fileName}</span>
            <span className="recent-item-time">{relativeTime(f.openedAt)}</span>
          </div>
          <div className="recent-item-actions">
            <button
              className={`recent-btn recent-btn--open${f.handle ? ' has-handle' : ''}`}
              onClick={() => void handleReload(f)}
              disabled={loadingId === f.fileName}
            >
              {loadingId === f.fileName ? '…' : f.handle ? 'Reload' : 'Open'}
            </button>
            <button
              className="recent-btn recent-btn--delete"
              onClick={() => void handleDelete(f.fileName)}
              disabled={loadingId === f.fileName}
              title="Remove from recent"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
