import { useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import { getPipeline } from './Canvas'
import { exportJpeg } from '../utils/file-io'

export function ExportDialog() {
  const activeTab = useEditorStore((s) => s.activeTab)
  const adjustments = useEditorStore((s) => s.adjustments)
  const masks = useEditorStore((s) => s.masks)
  const activeMaskId = useEditorStore((s) => s.activeMaskId)
  const originalImage = useEditorStore((s) => s.originalImage)
  const imageWidth = useEditorStore((s) => s.imageWidth)
  const imageHeight = useEditorStore((s) => s.imageHeight)
  const rotation = useEditorStore((s) => s.rotation)
  const [quality, setQuality] = useState(92)
  const [exporting, setExporting] = useState(false)

  if (activeTab !== 'export') return null

  const handleExport = async () => {
    const pipeline = getPipeline()
    if (!pipeline || !originalImage) return

    setExporting(true)
    try {
      const activeMask = masks.find((m) => m.id === activeMaskId) ?? null
      const exportCanvas = pipeline.renderFullRes(adjustments, activeMask, rotation)
      await exportJpeg(exportCanvas, quality)
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setExporting(false)
    }
  }

  const estimatedSize = Math.round((imageWidth * imageHeight * 3 * quality) / 100 / 1024 / 6)

  return (
    <div className="export-panel">
      <div className="export-info">
        <div className="export-info-row">
          <span>Dimensions</span>
          <span>{imageWidth} x {imageHeight}</span>
        </div>
        <div className="export-info-row">
          <span>Format</span>
          <span>JPEG</span>
        </div>
        <div className="export-info-row">
          <span>Est. size</span>
          <span>~{estimatedSize > 1024 ? `${(estimatedSize / 1024).toFixed(1)} MB` : `${estimatedSize} KB`}</span>
        </div>
      </div>

      <div className="slider-row">
        <div className="slider-header">
          <span className="slider-label">Quality</span>
          <span className="slider-value">{quality}%</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={quality}
          onChange={(e) => setQuality(parseInt(e.target.value))}
          className="slider-input"
        />
      </div>

      <button
        className="export-btn"
        onClick={handleExport}
        disabled={exporting || !originalImage}
      >
        {exporting ? 'Exporting...' : 'Export JPEG'}
      </button>
    </div>
  )
}
