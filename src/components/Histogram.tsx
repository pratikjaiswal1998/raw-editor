import { useEffect, useRef, useState } from 'react'
import { getPipeline } from './Canvas'
import { useEditorStore } from '../state/editor-store'

export function Histogram() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const show = useEditorStore((s) => s.showHistogram)
  const adjustments = useEditorStore((s) => s.adjustments)
  const [data, setData] = useState<{ r: Uint32Array; g: Uint32Array; b: Uint32Array } | null>(null)

  useEffect(() => {
    if (!show) return
    const timer = setTimeout(() => {
      const p = getPipeline()
      if (p) setData(p.readHistogramData())
    }, 100)
    return () => clearTimeout(timer)
  }, [show, adjustments])

  useEffect(() => {
    if (!data || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    const maxVal = Math.max(
      ...Array.from(data.r).slice(1, 254),
      ...Array.from(data.g).slice(1, 254),
      ...Array.from(data.b).slice(1, 254),
      1,
    )

    const drawChannel = (channel: Uint32Array, color: string) => {
      ctx.beginPath()
      ctx.moveTo(0, h)
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * w
        const y = h - (channel[i] / maxVal) * h
        ctx.lineTo(x, y)
      }
      ctx.lineTo(w, h)
      ctx.closePath()
      ctx.fillStyle = color
      ctx.fill()
    }

    ctx.globalCompositeOperation = 'screen'
    drawChannel(data.r, 'rgba(255,60,60,0.5)')
    drawChannel(data.g, 'rgba(60,255,60,0.5)')
    drawChannel(data.b, 'rgba(60,60,255,0.5)')
  }, [data])

  if (!show) return null

  return (
    <div className="histogram">
      <canvas ref={canvasRef} width={256} height={80} />
    </div>
  )
}
