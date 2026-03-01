import { useRef, useEffect, useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import type { MaskShape } from '../masks/types'

interface Props {
  containerRef: React.RefObject<HTMLDivElement | null>
}

type DragHandle =
  | { type: 'move' }
  | { type: 'corner'; index: 0 | 1 | 2 | 3 }
  | { type: 'edge'; index: 0 | 1 | 2 | 3 }
  | { type: 'rotation' }
  | { type: 'feather' }

interface DragState {
  handle: DragHandle
  startSvgX: number
  startSvgY: number
  startShape: MaskShape
}

function rotPt(lx: number, ly: number, rad: number, cx: number, cy: number) {
  return {
    x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function polyPoints(pts: { x: number; y: number }[]) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ')
}

export function MaskOverlay({ containerRef }: Props) {
  const masks = useEditorStore((s) => s.masks)
  const activeMaskId = useEditorStore((s) => s.activeMaskId)
  const imageWidth = useEditorStore((s) => s.imageWidth)
  const imageHeight = useEditorStore((s) => s.imageHeight)
  const zoom = useEditorStore((s) => s.zoom)
  const panX = useEditorStore((s) => s.panX)
  const panY = useEditorStore((s) => s.panY)
  const rotation = useEditorStore((s) => s.rotation)
  const activeTab = useEditorStore((s) => s.activeTab)
  const updateMaskShape = useEditorStore((s) => s.updateMaskShape)
  const pushHistory = useEditorStore((s) => s.pushHistory)

  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<DragState | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ w: width, h: height })
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [containerRef])

  if (activeTab !== 'masks' || !activeMaskId || !imageWidth) return null

  const activeMask = masks.find((m) => m.id === activeMaskId)
  if (!activeMask) return null

  const { w: containerW, h: containerH } = containerSize
  if (!containerW || !containerH) return null

  const shape = activeMask.shape

  // Canvas display size (CSS pixels, letterboxed)
  const isRotated = rotation === 90 || rotation === 270
  const imageAR = isRotated ? imageHeight / imageWidth : imageWidth / imageHeight
  const containerAR = containerW / containerH
  let canvasDisplayW: number, canvasDisplayH: number
  if (containerAR > imageAR) {
    canvasDisplayH = containerH
    canvasDisplayW = canvasDisplayH * imageAR
  } else {
    canvasDisplayW = containerW
    canvasDisplayH = canvasDisplayW / imageAR
  }

  // Group transform: maps canvas-px space → SVG space (matching canvas CSS transform)
  const groupTransform = [
    `translate(${containerW / 2}, ${containerH / 2})`,
    `scale(${zoom})`,
    `translate(${panX}, ${panY})`,
    `translate(${-canvasDisplayW / 2}, ${-canvasDisplayH / 2})`,
  ].join(' ')

  // Current shape geometry in canvas display pixels
  const cx = shape.x * canvasDisplayW
  const cy = shape.y * canvasDisplayH
  const hw = (shape.width * canvasDisplayW) / 2
  const hh = (shape.height * canvasDisplayH) / 2
  const rad = (shape.rotation * Math.PI) / 180
  const featherPx = shape.feather * Math.min(hw * 2, hh * 2)

  const isRect = shape.type === 'rectangle' || shape.type === 'linear-gradient'
  const isEllipse = shape.type === 'ellipse' || shape.type === 'radial-gradient'

  // Corners: TL, TR, BR, BL
  const corners = [
    rotPt(-hw, -hh, rad, cx, cy),
    rotPt(hw, -hh, rad, cx, cy),
    rotPt(hw, hh, rad, cx, cy),
    rotPt(-hw, hh, rad, cx, cy),
  ]

  // Rect edge midpoints: T, R, B, L
  const edges = [
    rotPt(0, -hh, rad, cx, cy),
    rotPt(hw, 0, rad, cx, cy),
    rotPt(0, hh, rad, cx, cy),
    rotPt(-hw, 0, rad, cx, cy),
  ]

  // Ellipse axis handles: T, R, B, L (same index as edges)
  const axisHandles = [
    rotPt(0, -hh, rad, cx, cy),
    rotPt(hw, 0, rad, cx, cy),
    rotPt(0, hh, rad, cx, cy),
    rotPt(-hw, 0, rad, cx, cy),
  ]

  // Rotation handle
  const rotLineStart = rotPt(0, -hh, rad, cx, cy)
  const rotHandle = rotPt(0, -hh - 32, rad, cx, cy)

  // Feather outline corners (rect)
  const featherCorners = [
    rotPt(-(hw + featherPx), -(hh + featherPx), rad, cx, cy),
    rotPt(hw + featherPx, -(hh + featherPx), rad, cx, cy),
    rotPt(hw + featherPx, hh + featherPx, rad, cx, cy),
    rotPt(-(hw + featherPx), hh + featherPx, rad, cx, cy),
  ]

  // Feather handle for ellipse
  const ellipseFeatherHandle = rotPt(hw + featherPx, 0, rad, cx, cy)

  // Handle radius compensated for zoom so handles appear constant size
  const hr = 5 / zoom
  const hrCenter = 6 / zoom

  // --- SVG point → canvas-px local coords ---
  const svgToCanvas = (svgX: number, svgY: number) => ({
    lx: (svgX - containerW / 2) / zoom - panX + canvasDisplayW / 2,
    ly: (svgY - containerH / 2) / zoom - panY + canvasDisplayH / 2,
  })

  // --- Event handlers ---

  const getSvgXY = (e: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { svgX: e.clientX - rect.left, svgY: e.clientY - rect.top }
  }

  const handlePointerDown = (handle: DragHandle) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    // Capture pointer on the SVG so pointermove/up fire even outside its bounds
    svgRef.current?.setPointerCapture(e.pointerId)
    const { svgX, svgY } = getSvgXY(e)
    setDragging({ handle, startSvgX: svgX, startSvgY: svgY, startShape: { ...shape } })
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging) return
    const { svgX, svgY } = getSvgXY(e)
    const { handle, startSvgX, startSvgY, startShape } = dragging

    const startCanvas = svgToCanvas(startSvgX, startSvgY)
    const curr = svgToCanvas(svgX, svgY)

    const startCx = startShape.x * canvasDisplayW
    const startCy = startShape.y * canvasDisplayH
    const startHw = (startShape.width * canvasDisplayW) / 2
    const startHh = (startShape.height * canvasDisplayH) / 2
    const startRad = (startShape.rotation * Math.PI) / 180

    // Local (unrotated) coords of current mouse relative to shape center
    const toLocal = (px: number, py: number) => ({
      lx: (px - startCx) * Math.cos(-startRad) - (py - startCy) * Math.sin(-startRad),
      ly: (px - startCx) * Math.sin(-startRad) + (py - startCy) * Math.cos(-startRad),
    })

    if (handle.type === 'move') {
      const dx = (curr.lx - startCanvas.lx) / canvasDisplayW
      const dy = (curr.ly - startCanvas.ly) / canvasDisplayH
      updateMaskShape(activeMaskId, {
        x: clamp(startShape.x + dx, 0, 1),
        y: clamp(startShape.y + dy, 0, 1),
      })

    } else if (handle.type === 'corner') {
      // Signs per corner: TL(-1,-1) TR(1,-1) BR(1,1) BL(-1,1)
      const signs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
      const [sx, sy] = signs[handle.index]
      // Opposite corner in canvas px
      const opp = rotPt(-sx * startHw, -sy * startHh, startRad, startCx, startCy)
      const local = toLocal(curr.lx, curr.ly)
      const newHw = Math.max(0.01 * canvasDisplayW, Math.abs(local.lx))
      const newHh = Math.max(0.01 * canvasDisplayH, Math.abs(local.ly))
      // New center = midpoint of opposite corner and current mouse
      const newCx = (opp.x + curr.lx) / 2
      const newCy = (opp.y + curr.ly) / 2
      updateMaskShape(activeMaskId, {
        x: clamp(newCx / canvasDisplayW, 0, 1),
        y: clamp(newCy / canvasDisplayH, 0, 1),
        width: (newHw * 2) / canvasDisplayW,
        height: (newHh * 2) / canvasDisplayH,
      })

    } else if (handle.type === 'edge') {
      const local = toLocal(curr.lx, curr.ly)

      if (isEllipse) {
        // Ellipse axis handles: keep center fixed, change rx or ry
        if (handle.index === 0 || handle.index === 2) {
          const newHh = Math.max(0.01 * canvasDisplayH, Math.abs(local.ly))
          updateMaskShape(activeMaskId, { height: (newHh * 2) / canvasDisplayH })
        } else {
          const newHw = Math.max(0.01 * canvasDisplayW, Math.abs(local.lx))
          updateMaskShape(activeMaskId, { width: (newHw * 2) / canvasDisplayW })
        }
      } else {
        // Rect edge: opposite edge stays fixed
        if (handle.index === 0 || handle.index === 2) {
          // T(0) / B(2): resize height
          const newHh = Math.max(0.01 * canvasDisplayH, Math.abs(local.ly))
          const oppSign = handle.index === 0 ? 1 : -1
          const opp = rotPt(0, oppSign * startHh, startRad, startCx, startCy)
          const newCy = (opp.y + curr.ly) / 2
          updateMaskShape(activeMaskId, {
            y: clamp(newCy / canvasDisplayH, 0, 1),
            height: (newHh * 2) / canvasDisplayH,
          })
        } else {
          // R(1) / L(3): resize width
          const newHw = Math.max(0.01 * canvasDisplayW, Math.abs(local.lx))
          const oppSign = handle.index === 1 ? -1 : 1
          const opp = rotPt(oppSign * startHw, 0, startRad, startCx, startCy)
          const newCx = (opp.x + curr.lx) / 2
          updateMaskShape(activeMaskId, {
            x: clamp(newCx / canvasDisplayW, 0, 1),
            width: (newHw * 2) / canvasDisplayW,
          })
        }
      }

    } else if (handle.type === 'rotation') {
      const angle = Math.atan2(curr.ly - startCy, curr.lx - startCx)
      const startAngle = Math.atan2(startCanvas.ly - startCy, startCanvas.lx - startCx)
      updateMaskShape(activeMaskId, {
        rotation: startShape.rotation + (angle - startAngle) * (180 / Math.PI),
      })

    } else if (handle.type === 'feather') {
      const dist = Math.sqrt((curr.lx - startCx) ** 2 + (curr.ly - startCy) ** 2)
      const innerDist = isEllipse
        ? Math.max(startHw, startHh)
        : Math.sqrt(startHw ** 2 + startHh ** 2)
      const newFeatherPx = Math.max(0, dist - innerDist)
      const newFeather = clamp(newFeatherPx / Math.min(startHw * 2, startHh * 2), 0, 0.99)
      updateMaskShape(activeMaskId, { feather: newFeather })
    }
  }

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging) {
      svgRef.current?.releasePointerCapture(e.pointerId)
      pushHistory()
      setDragging(null)
    }
  }

  return (
    <svg
      ref={svgRef}
      className="mask-overlay"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <g transform={groupTransform}>

        {/* Mask outline */}
        {isRect && (
          <polygon className="mask-outline" points={polyPoints(corners)} />
        )}
        {isEllipse && (
          <ellipse
            className="mask-outline"
            cx={cx} cy={cy} rx={hw} ry={hh}
            transform={`rotate(${shape.rotation}, ${cx}, ${cy})`}
          />
        )}

        {/* Feather outline */}
        {isRect && featherPx > 1 && (
          <polygon className="mask-feather-outline" points={polyPoints(featherCorners)} />
        )}
        {isEllipse && featherPx > 1 && (
          <ellipse
            className="mask-feather-outline"
            cx={cx} cy={cy} rx={hw + featherPx} ry={hh + featherPx}
            transform={`rotate(${shape.rotation}, ${cx}, ${cy})`}
          />
        )}

        {/* Rotation line */}
        <line
          className="mask-rotation-line"
          x1={rotLineStart.x} y1={rotLineStart.y}
          x2={rotHandle.x} y2={rotHandle.y}
        />

        {/* Center / move handle */}
        <circle
          className="mask-handle mask-handle--center"
          cx={cx} cy={cy} r={hrCenter}
          onPointerDown={handlePointerDown({ type: 'move' })}
        />

        {/* Corner handles (rect only) */}
        {isRect && corners.map((pt, i) => (
          <circle
            key={`corner-${i}`}
            className="mask-handle"
            cx={pt.x} cy={pt.y} r={hr}
            onPointerDown={handlePointerDown({ type: 'corner', index: i as 0 | 1 | 2 | 3 })}
          />
        ))}

        {/* Edge handles (rect only) */}
        {isRect && edges.map((pt, i) => (
          <circle
            key={`edge-${i}`}
            className="mask-handle"
            cx={pt.x} cy={pt.y} r={hr * 0.8}
            onPointerDown={handlePointerDown({ type: 'edge', index: i as 0 | 1 | 2 | 3 })}
          />
        ))}

        {/* Axis handles (ellipse only) */}
        {isEllipse && axisHandles.map((pt, i) => (
          <circle
            key={`axis-${i}`}
            className="mask-handle"
            cx={pt.x} cy={pt.y} r={hr}
            onPointerDown={handlePointerDown({ type: 'edge', index: i as 0 | 1 | 2 | 3 })}
          />
        ))}

        {/* Rotation handle */}
        <circle
          className="mask-handle mask-handle--rotate"
          cx={rotHandle.x} cy={rotHandle.y} r={hr}
          onPointerDown={handlePointerDown({ type: 'rotation' })}
        />

        {/* Feather handle */}
        {isRect && (
          <circle
            className="mask-handle mask-handle--feather"
            cx={featherCorners[1].x} cy={featherCorners[1].y} r={hr * 0.8}
            onPointerDown={handlePointerDown({ type: 'feather' })}
          />
        )}
        {isEllipse && (
          <circle
            className="mask-handle mask-handle--feather"
            cx={ellipseFeatherHandle.x} cy={ellipseFeatherHandle.y} r={hr * 0.8}
            onPointerDown={handlePointerDown({ type: 'feather' })}
          />
        )}

      </g>
    </svg>
  )
}
