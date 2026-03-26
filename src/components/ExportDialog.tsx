import { useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import { getPipeline } from './Canvas'
import { exportJpeg } from '../utils/file-io'
import type { MaskAdjustments } from '../masks/types'

export function ExportDialog({ showAll = false }: { showAll?: boolean }) {
  const activeTab = useEditorStore((s) => s.activeTab)
  const adjustments = useEditorStore((s) => s.adjustments)
  const masks = useEditorStore((s) => s.masks)
  const originalImage = useEditorStore((s) => s.originalImage)
  const imageWidth = useEditorStore((s) => s.imageWidth)
  const imageHeight = useEditorStore((s) => s.imageHeight)
  const rotation = useEditorStore((s) => s.rotation)
  const [quality, setQuality] = useState(92)
  const [exporting, setExporting] = useState(false)

  if (!showAll && activeTab !== 'export') return null

  const handleExport = async () => {
    const pipeline = getPipeline()
    if (!pipeline || !originalImage) return

    setExporting(true)
    try {
      const enabledMasks = masks.filter((m) => m.enabled)
      const hasMasks = enabledMasks.length > 0

      let maskAdjustments: MaskAdjustments | null = null
      if (hasMasks) {
        const combined: MaskAdjustments = {
          exposure: 0, contrast: 0, highlights: 0, shadows: 0,
          whites: 0, blacks: 0, temperature: 0, tint: 0,
          saturation: 0, vibrance: 0,
        }
        for (const m of enabledMasks) {
          for (const k of Object.keys(combined) as (keyof MaskAdjustments)[]) {
            combined[k] += m.adjustments[k]
          }
        }
        for (const k of Object.keys(combined) as (keyof MaskAdjustments)[]) {
          combined[k] /= enabledMasks.length
        }
        const hasAdj = Object.values(combined).some((v) => v !== 0)
        maskAdjustments = hasAdj ? combined : null
      }

      const exportCanvas = pipeline.renderFullRes(adjustments, hasMasks, rotation, maskAdjustments)
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
