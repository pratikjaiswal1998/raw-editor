import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditorStore } from '../state/editor-store'
import { Canvas } from './Canvas'
import { Toolbar } from './Toolbar'
import { Histogram } from './Histogram'
import { AdjustmentPanel } from './AdjustmentPanel'
import { ColorGradingPanel } from './ColorGradingPanel'
import { MaskPanel } from './MaskPanel'
import { ExportDialog } from './ExportDialog'
import { updateRecentFileSettings } from '../utils/recent-files'
import type { AdjustmentTab } from '../state/types'

const TABS: { id: AdjustmentTab; label: string }[] = [
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)
  const [bottomHeight, setBottomHeight] = useState<number | null>(null) // null = default CSS

  // Drag handle for mobile bottom panel
  const onDragStart = useCallback((clientY: number) => {
    const el = bottomRef.current
    if (!el) return
    dragRef.current = { startY: clientY, startH: el.offsetHeight }
    el.style.transition = 'none'
  }, [])

  const onDragMove = useCallback((clientY: number) => {
    if (!dragRef.current) return
    const delta = dragRef.current.startY - clientY
    const vh = window.innerHeight
    const minH = 48 // tab bar only
    const maxH = vh * 0.75
    const newH = Math.max(minH, Math.min(maxH, dragRef.current.startH + delta))
    setBottomHeight(newH)
  }, [])

  const onDragEnd = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    const el = bottomRef.current
    if (!el) return
    el.style.transition = ''
    // Snap to nearest: collapsed (48), mid (38vh), expanded (65vh)
    const vh = window.innerHeight
    const h = el.offsetHeight
    const collapsed = 48
    const mid = vh * 0.38
    const expanded = vh * 0.65
    const dists = [
      { h: collapsed, d: Math.abs(h - collapsed) },
      { h: mid, d: Math.abs(h - mid) },
      { h: expanded, d: Math.abs(h - expanded) },
    ]
    dists.sort((a, b) => a.d - b.d)
    setBottomHeight(dists[0].h)
  }, [])

  useEffect(() => {
    const handle = bottomRef.current?.querySelector('.drag-handle') as HTMLElement | null
    if (!handle) return

    const onTouchStart = (e: TouchEvent) => { onDragStart(e.touches[0].clientY) }
    const onTouchMove = (e: TouchEvent) => { e.preventDefault(); onDragMove(e.touches[0].clientY) }
    const onTouchEnd = () => { onDragEnd() }
    const onMouseDown = (e: MouseEvent) => { onDragStart(e.clientY) }
    const onMouseMove = (e: MouseEvent) => { onDragMove(e.clientY) }
    const onMouseUp = () => { onDragEnd() }

    handle.addEventListener('touchstart', onTouchStart, { passive: true })
    handle.addEventListener('touchmove', onTouchMove, { passive: false })
    handle.addEventListener('touchend', onTouchEnd)
    handle.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      handle.removeEventListener('touchstart', onTouchStart)
      handle.removeEventListener('touchmove', onTouchMove)
      handle.removeEventListener('touchend', onTouchEnd)
      handle.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onDragStart, onDragMove, onDragEnd])

  // If 'recent' is stored as activeTab (from old session), reset to 'light'
  useEffect(() => {
    if (activeTab === 'recent') setActiveTab('light')
  }, [activeTab, setActiveTab])

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

        {/* Desktop sidebar — all panels stacked, hidden on mobile via CSS */}
        <div className="editor-sidebar">
          <div className="sidebar-scroll">
            <AdjustmentPanel showAll />
            <span className="sidebar-section-header">Grading</span>
            <div className="sidebar-panel-content">
              <ColorGradingPanel showAll />
            </div>
            <span className="sidebar-section-header">Masks</span>
            <div className="sidebar-panel-content">
              <MaskPanel showAll />
            </div>
            <span className="sidebar-section-header">Export</span>
            <div className="sidebar-panel-content">
              <ExportDialog showAll />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom panel — hidden on desktop via CSS */}
      <div
        className="editor-bottom"
        ref={bottomRef}
        style={bottomHeight != null ? { height: bottomHeight, maxHeight: 'none' } : undefined}
      >
        <div className="drag-handle" onDoubleClick={() => {
          const vh = window.innerHeight
          const current = bottomRef.current?.offsetHeight ?? 0
          setBottomHeight(current < vh * 0.5 ? vh * 0.65 : vh * 0.38)
        }}>
          <div className="drag-handle-bar" />
        </div>
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

        <div className="tab-content">
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
