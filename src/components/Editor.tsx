import { useEffect, useRef } from 'react'
import { useEditorStore } from '../state/editor-store'
import { Canvas } from './Canvas'
import { Toolbar } from './Toolbar'
import { Histogram } from './Histogram'
import { AdjustmentPanel } from './AdjustmentPanel'
import { ColorGradingPanel } from './ColorGradingPanel'
import { MaskPanel } from './MaskPanel'
import { ExportDialog } from './ExportDialog'
import { RecentTab } from './RecentTab'
import { updateRecentFileSettings } from '../utils/recent-files'
import type { AdjustmentTab } from '../state/types'

const TABS: { id: AdjustmentTab; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'light', label: 'Light' },
  { id: 'color', label: 'Color' },
  { id: 'hsl', label: 'HSL' },
  { id: 'grading', label: 'Grading' },
  { id: 'masks', label: 'Masks' },
  { id: 'export', label: 'Export' },
]

export function Editor() {
  const activeTab = useEditorStore((s) => s.activeTab)
  const setActiveTab = useEditorStore((s) => s.setActiveTab)
  const isLoading = useEditorStore((s) => s.isLoading)
  const resetAdjustments = useEditorStore((s) => s.resetAdjustments)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)

  // For debounced auto-save to recent files
  const adjustments = useEditorStore((s) => s.adjustments)
  const masks = useEditorStore((s) => s.masks)
  const rotation = useEditorStore((s) => s.rotation)
  const fileName = useEditorStore((s) => s.fileName)
  const originalImage = useEditorStore((s) => s.originalImage)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced save of current settings to IndexedDB recent entry (2s after last change)
  useEffect(() => {
    if (!fileName || !originalImage) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void updateRecentFileSettings(fileName, { adjustments, masks, rotation })
    }, 2000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [adjustments, masks, rotation, fileName, originalImage])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.key.toLowerCase()) {
        case 'z':
          if (e.ctrlKey || e.metaKey) {
            e.shiftKey ? redo() : undo()
          } else {
            undo()
          }
          break
        case 'x':
          redo()
          break
        case 'r':
          if (!e.ctrlKey && !e.metaKey) resetAdjustments()
          break
        case '1': setActiveTab('light'); break
        case '2': setActiveTab('color'); break
        case '3': setActiveTab('hsl'); break
        case '4': setActiveTab('grading'); break
        case '5': setActiveTab('masks'); break
        case '6': setActiveTab('export'); break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, resetAdjustments, setActiveTab])

  return (
    <div className="editor">
      <Toolbar />

      <div className="editor-main">
        <div className="editor-canvas-area">
          <Canvas />
          <Histogram />
        </div>
      </div>

      <div className="editor-bottom">
        {/* Tab bar */}
        <div className="tab-bar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="tab-content">
          <RecentTab />
          <AdjustmentPanel />
          <ColorGradingPanel />
          <MaskPanel />
          <ExportDialog />
        </div>
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <span>Loading image...</span>
        </div>
      )}
    </div>
  )
}
