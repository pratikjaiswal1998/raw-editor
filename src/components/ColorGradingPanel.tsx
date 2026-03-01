import { useRef, useEffect, useCallback } from 'react'
import { useEditorStore } from '../state/editor-store'
import type { GlobalAdjustments } from '../state/types'

interface ColorWheelProps {
  label: string
  hue: number
  saturation: number
  onHueChange: (hue: number) => void
  onSatChange: (sat: number) => void
}

function ColorWheel({ label, hue, saturation, onHueChange, onSatChange }: ColorWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDragging = useRef(false)
  const size = 120
  const center = size / 2
  const radius = size / 2 - 8

  // Draw the color wheel
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    ctx.clearRect(0, 0, size, size)

    // Draw hue ring
    for (let angle = 0; angle < 360; angle++) {
      const rad = (angle - 90) * Math.PI / 180
      ctx.beginPath()
      ctx.arc(center, center, radius, rad, rad + Math.PI / 180 + 0.01)
      ctx.arc(center, center, radius - 16, rad + Math.PI / 180 + 0.01, rad, true)
      ctx.closePath()
      ctx.fillStyle = `hsl(${angle}, 80%, 55%)`
      ctx.fill()
    }

    // Draw center circle (current color preview)
    const previewRadius = radius - 24
    ctx.beginPath()
    ctx.arc(center, center, previewRadius, 0, Math.PI * 2)
    if (saturation > 0) {
      ctx.fillStyle = `hsl(${hue}, ${saturation}%, 50%)`
    } else {
      ctx.fillStyle = '#333'
    }
    ctx.fill()
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 1
    ctx.stroke()

    // Draw indicator dot on the ring
    const indicatorAngle = (hue - 90) * Math.PI / 180
    const indicatorR = radius - 8
    const ix = center + Math.cos(indicatorAngle) * indicatorR
    const iy = center + Math.sin(indicatorAngle) * indicatorR

    ctx.beginPath()
    ctx.arc(ix, iy, 5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [hue, saturation])

  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) * (size / rect.width) - center
    const y = (clientY - rect.top) * (size / rect.height) - center
    const angle = Math.atan2(y, x) * 180 / Math.PI + 90
    const normalizedHue = ((angle % 360) + 360) % 360
    onHueChange(Math.round(normalizedHue))
  }, [onHueChange])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDragging.current = true
    handleInteraction(e.clientX, e.clientY)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return
    handleInteraction(e.clientX, e.clientY)
  }

  const handlePointerUp = () => { isDragging.current = false }

  return (
    <div className="color-wheel-container">
      <span className="color-wheel-label">{label}</span>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="color-wheel-canvas"
        style={{ width: '100%', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      <div className="color-wheel-sliders">
        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Hue</span>
            <span className="slider-value">{hue}°</span>
          </div>
          <input
            type="range" min={0} max={360} step={1}
            value={hue}
            onChange={(e) => onHueChange(parseInt(e.target.value))}
            className="slider-input"
            style={{
              background: `linear-gradient(to right,
                hsl(0,80%,55%), hsl(60,80%,55%), hsl(120,80%,55%),
                hsl(180,80%,55%), hsl(240,80%,55%), hsl(300,80%,55%), hsl(360,80%,55%))`,
            }}
          />
        </div>
        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Amount</span>
            <span className="slider-value">{saturation}</span>
          </div>
          <input
            type="range" min={0} max={100} step={1}
            value={saturation}
            onChange={(e) => onSatChange(parseInt(e.target.value))}
            className="slider-input"
          />
        </div>
      </div>
    </div>
  )
}

export function ColorGradingPanel() {
  const activeTab = useEditorStore((s) => s.activeTab)
  const adjustments = useEditorStore((s) => s.adjustments)
  const setAdjustment = useEditorStore((s) => s.setAdjustment)
  const pushHistory = useEditorStore((s) => s.pushHistory)
  const committed = useRef(false)

  if (activeTab !== 'grading') return null

  const handleChange = <K extends keyof GlobalAdjustments>(key: K, value: GlobalAdjustments[K]) => {
    if (!committed.current) {
      pushHistory()
      committed.current = true
      setTimeout(() => { committed.current = false }, 500)
    }
    setAdjustment(key, value)
  }

  return (
    <div className="color-grading-panel">
      <div className="color-wheels-row">
        <ColorWheel
          label="Shadows"
          hue={adjustments.shadowsHue}
          saturation={adjustments.shadowsSat}
          onHueChange={(v) => handleChange('shadowsHue', v)}
          onSatChange={(v) => handleChange('shadowsSat', v)}
        />
        <ColorWheel
          label="Midtones"
          hue={adjustments.midtonesHue}
          saturation={adjustments.midtonesSat}
          onHueChange={(v) => handleChange('midtonesHue', v)}
          onSatChange={(v) => handleChange('midtonesSat', v)}
        />
        <ColorWheel
          label="Highlights"
          hue={adjustments.highlightsHue}
          saturation={adjustments.highlightsSat}
          onHueChange={(v) => handleChange('highlightsHue', v)}
          onSatChange={(v) => handleChange('highlightsSat', v)}
        />
      </div>
    </div>
  )
}
