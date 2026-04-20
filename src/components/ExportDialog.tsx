import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import { getPipeline } from './Canvas'
import { exportImage, type ImageFormat } from '../utils/file-io'
import { exportReelVideo, getReelFileExt, type ReelAspect } from '../utils/video-export'

const FORMAT_LABEL: Record<ImageFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  webp: 'WebP',
}

const REEL_ASPECTS: { value: ReelAspect; label: string; hint: string }[] = [
  { value: '9:16', label: '9:16', hint: 'Reels, TikTok, Shorts' },
  { value: '4:5',  label: '4:5',  hint: 'Instagram feed portrait' },
  { value: '1:1',  label: '1:1',  hint: 'Instagram feed square' },
]

export function ExportDialog({ showAll = false }: { showAll?: boolean }) {
  const activeTab = useEditorStore((s) => s.activeTab)
  const adjustments = useEditorStore((s) => s.adjustments)
  const masks = useEditorStore((s) => s.masks)
  const originalImage = useEditorStore((s) => s.originalImage)
  const fileName = useEditorStore((s) => s.fileName)
  const imageWidth = useEditorStore((s) => s.imageWidth)
  const imageHeight = useEditorStore((s) => s.imageHeight)
  const rotation = useEditorStore((s) => s.rotation)

  const [format, setFormat] = useState<ImageFormat>('jpeg')
  const [quality, setQuality] = useState(92)
  const [reelAspect, setReelAspect] = useState<ReelAspect>('9:16')
  const [reelDuration, setReelDuration] = useState(3)
  const [blurBg, setBlurBg] = useState(true)
  const [busy, setBusy] = useState<null | 'image' | 'video'>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const previewDebounce = useRef<number | null>(null)

  const isVisible = showAll || activeTab === 'export'

  // Regenerate thumbnail from the live canvas whenever the edit changes
  // and the panel is visible. Debounced so dragging a slider doesn't spam.
  useEffect(() => {
    if (!isVisible || !originalImage) return
    if (previewDebounce.current) window.clearTimeout(previewDebounce.current)
    previewDebounce.current = window.setTimeout(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.canvas-container canvas')
      if (!canvas) return
      try {
        setPreviewUrl(canvas.toDataURL('image/jpeg', 0.6))
      } catch {
        // toDataURL can throw if the canvas was tainted — ignore
      }
    }, 200)
    return () => {
      if (previewDebounce.current) window.clearTimeout(previewDebounce.current)
    }
  }, [isVisible, originalImage, adjustments, masks, rotation])

  if (!isVisible) return null

  const baseName = fileName ? fileName.replace(/\.[^.]+$/, '') : 'edited'

  // Render the full-res canvas on demand. Shared by image and video paths.
  const renderFullRes = (): HTMLCanvasElement | null => {
    const pipeline = getPipeline()
    if (!pipeline || !originalImage) return null
    const enabledMasks = masks.filter((m) => m.enabled)
    const maskLayerAdjustments = enabledMasks.map((m) => m.adjustments)
    return pipeline.renderFullRes(adjustments, maskLayerAdjustments, rotation)
  }

  const handleDownloadImage = async () => {
    setBusy('image')
    try {
      const canvas = renderFullRes()
      if (!canvas) throw new Error('No image loaded')
      await exportImage(canvas, format, quality, baseName)
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  const handleDownloadReel = async () => {
    setBusy('video')
    try {
      const canvas = renderFullRes()
      if (!canvas) throw new Error('No image loaded')
      await exportReelVideo(canvas, {
        aspect: reelAspect,
        durationSec: reelDuration,
        blurBackground: blurBg,
      }, baseName)
    } catch (e) {
      alert(`Reel export failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(null)
    }
  }

  // Rough size estimate: 3 bytes/px for lossless → scaled by quality factor for lossy
  const rawBytes = imageWidth * imageHeight * 3
  const estKb = format === 'png'
    ? Math.round(rawBytes / 1024 * 0.7)   // PNG compression ~30%
    : Math.round((rawBytes * quality) / 100 / 1024 / 6)

  const videoExt = getReelFileExt().toUpperCase()

  return (
    <div className="export-panel">
      {/* Live preview */}
      <div className="export-preview">
        {previewUrl ? (
          <img src={previewUrl} alt="Export preview" className="export-preview-img" />
        ) : (
          <div className="export-preview-empty">No image loaded</div>
        )}
      </div>

      {/* IMAGE EXPORT */}
      <div className="export-section">
        <div className="export-section-title">Image</div>

        {/* Format segmented control */}
        <div className="export-format-tabs" role="tablist">
          {(Object.keys(FORMAT_LABEL) as ImageFormat[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={format === f}
              className={`export-format-tab ${format === f ? 'active' : ''}`}
              onClick={() => setFormat(f)}
              disabled={busy !== null}
            >
              {FORMAT_LABEL[f]}
            </button>
          ))}
        </div>

        {/* Quality (hidden for PNG — it's lossless) */}
        {format !== 'png' && (
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
              disabled={busy !== null}
            />
          </div>
        )}

        <div className="export-info">
          <div className="export-info-row">
            <span>Dimensions</span>
            <span>{imageWidth} × {imageHeight}</span>
          </div>
          <div className="export-info-row">
            <span>Est. size</span>
            <span>~{estKb > 1024 ? `${(estKb / 1024).toFixed(1)} MB` : `${estKb} KB`}</span>
          </div>
        </div>

        <button
          className="export-btn primary"
          onClick={handleDownloadImage}
          disabled={busy !== null || !originalImage}
        >
          {busy === 'image' ? 'Rendering…' : `Download ${FORMAT_LABEL[format]}`}
        </button>
      </div>

      {/* VIDEO EXPORT — Reels / Shorts / TikTok */}
      <div className="export-section">
        <div className="export-section-title">Video / Reel</div>

        <div className="export-format-tabs" role="tablist">
          {REEL_ASPECTS.map((a) => (
            <button
              key={a.value}
              role="tab"
              aria-selected={reelAspect === a.value}
              className={`export-format-tab ${reelAspect === a.value ? 'active' : ''}`}
              onClick={() => setReelAspect(a.value)}
              disabled={busy !== null}
              title={a.hint}
            >
              {a.label}
            </button>
          ))}
        </div>

        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Duration</span>
            <span className="slider-value">{reelDuration}s</span>
          </div>
          <input
            type="range"
            min={3}
            max={10}
            step={1}
            value={reelDuration}
            onChange={(e) => setReelDuration(parseInt(e.target.value))}
            className="slider-input"
            disabled={busy !== null}
          />
        </div>

        <label className="export-checkbox">
          <input
            type="checkbox"
            checked={blurBg}
            onChange={(e) => setBlurBg(e.target.checked)}
            disabled={busy !== null}
          />
          <span>Blurred background fill</span>
        </label>

        <div className="export-hint">
          Exports as <strong>{videoExt}</strong>. Works on phones and Insta/TikTok upload.
        </div>

        <button
          className="export-btn secondary"
          onClick={handleDownloadReel}
          disabled={busy !== null || !originalImage}
        >
          {busy === 'video' ? 'Recording…' : `Download as ${reelAspect} Video`}
        </button>
      </div>
    </div>
  )
}
