import { useRef, useEffect, useCallback } from 'react'
import { RenderPipeline } from '../engine/pipeline'
import { useEditorStore } from '../state/editor-store'
import { MaskOverlay } from './MaskOverlay'
import type { MaskAdjustments } from '../masks/types'

let pipeline: RenderPipeline | null = null

export function getPipeline(): RenderPipeline | null {
  return pipeline
}

// Module-level mask worker
const maskWorker = new Worker(new URL('../masks/mask-worker.ts', import.meta.url), { type: 'module' })

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  const originalImage = useEditorStore((s) => s.originalImage)
  const fileName = useEditorStore((s) => s.fileName)
  const imageWidth = useEditorStore((s) => s.imageWidth)
  const imageHeight = useEditorStore((s) => s.imageHeight)
  const masks = useEditorStore((s) => s.masks)
  const showBeforeAfter = useEditorStore((s) => s.showBeforeAfter)
  const zoom = useEditorStore((s) => s.zoom)
  const panX = useEditorStore((s) => s.panX)
  const panY = useEditorStore((s) => s.panY)

  // Initialize pipeline
  useEffect(() => {
    if (!canvasRef.current) return
    pipeline = new RenderPipeline(canvasRef.current)
    return () => {
      pipeline?.destroy()
      pipeline = null
    }
  }, [])

  // Upload image when it changes
  useEffect(() => {
    if (!pipeline || !originalImage) return
    pipeline.uploadImage(originalImage, imageWidth, imageHeight)
  }, [originalImage, imageWidth, imageHeight])

  // Update mask texture when masks change (offloaded to worker)
  // All enabled masks are combined (union via max blend) into a single texture
  useEffect(() => {
    if (!pipeline || !originalImage) return

    const enabledMasks = masks.filter((m) => m.enabled)

    if (enabledMasks.length === 0) {
      // No enabled masks = full white (everything affected by global adjustments)
      pipeline.updateMask(new Uint8Array(imageWidth * imageHeight).fill(255))
      return
    }

    // Send all enabled masks to worker for combined rasterization
    const handler = (e: MessageEvent) => {
      if (pipeline) {
        pipeline.updateMask(e.data as Uint8Array)
        // Force re-render after mask texture is updated
        cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(render)
      }
    }
    maskWorker.onmessage = handler
    maskWorker.postMessage({
      masks: enabledMasks.map((m) => ({ shape: m.shape, inverted: m.inverted })),
      width: imageWidth,
      height: imageHeight,
    })

    return () => { maskWorker.onmessage = null }
  }, [masks, imageWidth, imageHeight, originalImage])

  // Render loop — reads from store directly to avoid closure dependencies
  const render = useCallback(() => {
    if (!pipeline || !containerRef.current) return

    // Read current state directly from store (no closure dependency)
    const state = useEditorStore.getState()
    if (!state.originalImage) return

    const container = containerRef.current
    const dpr = window.devicePixelRatio || 1
    const { imageWidth, imageHeight, rotation, zoom, masks, adjustments, showBeforeAfter } = state

    const isRotated = rotation === 90 || rotation === 270
    const effectiveW = isRotated ? imageHeight : imageWidth
    const effectiveH = isRotated ? imageWidth : imageHeight
    const containerW = container.clientWidth
    const containerH = container.clientHeight
    const aspectRatio = effectiveW / effectiveH
    let displayW: number, displayH: number

    if (containerW / containerH > aspectRatio) {
      displayH = containerH
      displayW = containerH * aspectRatio
    } else {
      displayW = containerW
      displayH = containerW / aspectRatio
    }

    const canvasW = Math.round(displayW * dpr * zoom)
    const canvasH = Math.round(displayH * dpr * zoom)

    const enabledMasks = masks.filter((m) => m.enabled)
    const hasMasks = enabledMasks.length > 0

    // Compute combined mask adjustments (average of all enabled masks)
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
      // Only pass mask adjustments if any are non-zero
      const hasAdjustments = Object.values(combined).some((v) => v !== 0)
      maskAdjustments = hasAdjustments ? combined : null
    }

    pipeline.render(adjustments, hasMasks, canvasW, canvasH, showBeforeAfter, rotation, maskAdjustments)
  }, []) // Empty deps — reads from store directly

  // Subscribe to store changes and re-render
  useEffect(() => {
    // Render once immediately
    const frame = requestAnimationFrame(render)

    // Subscribe to store changes and re-render
    const unsub = useEditorStore.subscribe(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(render)
    })

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(rafRef.current)
      unsub()
    }
  }, [render])

  // Touch/mouse pan and zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let lastTouchDist = 0
    let lastTouchX = 0
    let lastTouchY = 0
    let isPanning = false

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const store = useEditorStore.getState()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      store.setZoom(store.zoom * delta)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastTouchDist = Math.sqrt(dx * dx + dy * dy)
      } else if (e.touches.length === 1) {
        isPanning = true
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const store = useEditorStore.getState()

      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (lastTouchDist > 0) {
          store.setZoom(store.zoom * (dist / lastTouchDist))
        }
        lastTouchDist = dist
      } else if (e.touches.length === 1 && isPanning && store.zoom > 1) {
        const dx = e.touches[0].clientX - lastTouchX
        const dy = e.touches[0].clientY - lastTouchY
        store.setPan(store.panX + dx, store.panY + dy)
        lastTouchX = e.touches[0].clientX
        lastTouchY = e.touches[0].clientY
      }
    }

    const handleTouchEnd = () => {
      lastTouchDist = 0
      isPanning = false
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  // Long press for before/after
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let pressTimer: ReturnType<typeof setTimeout>

    const handleDown = () => {
      pressTimer = setTimeout(() => {
        useEditorStore.getState().setShowBeforeAfter(true)
      }, 300)
    }

    const handleUp = () => {
      clearTimeout(pressTimer)
      useEditorStore.getState().setShowBeforeAfter(false)
    }

    canvas.addEventListener('mousedown', handleDown)
    canvas.addEventListener('mouseup', handleUp)
    canvas.addEventListener('mouseleave', handleUp)

    return () => {
      canvas.removeEventListener('mousedown', handleDown)
      canvas.removeEventListener('mouseup', handleUp)
      canvas.removeEventListener('mouseleave', handleUp)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        background: 'var(--bg-canvas)',
        touchAction: 'none',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`,
          transformOrigin: 'center',
          imageRendering: zoom > 2 ? 'pixelated' : 'auto',
        }}
      />
      <MaskOverlay containerRef={containerRef} />
      {!originalImage && (
        <div className="canvas-empty-state">
          <svg className="canvas-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          {fileName ? (
            <>
              <span className="canvas-empty-text">Re-open <strong>{fileName}</strong> to restore your edits</span>
              <span className="canvas-empty-subtext">Your adjustments are saved — the image is never stored for privacy</span>
            </>
          ) : (
            <span className="canvas-empty-text">Open a RAW or JPEG file to begin</span>
          )}
        </div>
      )}
      {showBeforeAfter && (
        <div className="canvas-badge">ORIGINAL</div>
      )}
    </div>
  )
}
