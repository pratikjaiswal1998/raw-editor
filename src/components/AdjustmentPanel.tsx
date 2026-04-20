import { useCallback, useRef, useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import type { GlobalAdjustments } from '../state/types'

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

// Generic layer-change handler — the same signature works for global
// adjustments (wired to the store) and mask adjustments (wired to a mask id).
export type LayerAdjustOnChange = <K extends keyof GlobalAdjustments>(
  key: K,
  value: GlobalAdjustments[K],
) => void

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  onCommit: () => void
}

export function Slider({ label, value, min, max, step = 1, unit, onChange, onCommit }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  const display = unit ? `${Math.round(value * 10) / 10}${unit}` : Math.round(value * 10) / 10

  return (
    <div className="slider-row">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        onDoubleClick={() => { onChange(0); onCommit() }}
        className="slider-input"
        style={{
          background: `linear-gradient(to right, var(--slider-fill) 0%, var(--slider-fill) ${pct}%, var(--slider-track) ${pct}%, var(--slider-track) 100%)`,
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section components — source-agnostic. Pass any `adjustments` + `onChange`
// and they render the same controls. Used by AdjustmentPanel (global) and
// MaskPanel (per-mask).
// ---------------------------------------------------------------------------

interface SectionProps {
  adjustments: GlobalAdjustments
  onChange: LayerAdjustOnChange
  onCommit: () => void
}

export function LightSliders({ adjustments, onChange, onCommit }: SectionProps) {
  return (
    <>
      <Slider label="Exposure"   value={adjustments.exposure}   min={-5}   max={5}   step={0.05} onChange={(v) => onChange('exposure',   v)} onCommit={onCommit} />
      <Slider label="Contrast"   value={adjustments.contrast}   min={-100} max={100}             onChange={(v) => onChange('contrast',   v)} onCommit={onCommit} />
      <Slider label="Highlights" value={adjustments.highlights} min={-100} max={100}             onChange={(v) => onChange('highlights', v)} onCommit={onCommit} />
      <Slider label="Shadows"    value={adjustments.shadows}    min={-100} max={100}             onChange={(v) => onChange('shadows',    v)} onCommit={onCommit} />
      <Slider label="Whites"     value={adjustments.whites}     min={-100} max={100}             onChange={(v) => onChange('whites',     v)} onCommit={onCommit} />
      <Slider label="Blacks"     value={adjustments.blacks}     min={-100} max={100}             onChange={(v) => onChange('blacks',     v)} onCommit={onCommit} />
    </>
  )
}

export function ColorSliders({ adjustments, onChange, onCommit }: SectionProps) {
  return (
    <>
      <Slider label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={(v) => onChange('temperature', v)} onCommit={onCommit} />
      <Slider label="Tint"        value={adjustments.tint}        min={-100} max={100} onChange={(v) => onChange('tint',        v)} onCommit={onCommit} />
      <Slider label="Vibrance"    value={adjustments.vibrance}    min={-100} max={100} onChange={(v) => onChange('vibrance',    v)} onCommit={onCommit} />
      <Slider label="Saturation"  value={adjustments.saturation}  min={-100} max={100} onChange={(v) => onChange('saturation',  v)} onCommit={onCommit} />
    </>
  )
}

const HSL_CHANNELS = [
  { name: 'Red',     color: '#e74c3c', hue: 0 },
  { name: 'Orange',  color: '#e67e22', hue: 30 },
  { name: 'Yellow',  color: '#f1c40f', hue: 60 },
  { name: 'Green',   color: '#2ecc71', hue: 120 },
  { name: 'Aqua',    color: '#1abc9c', hue: 180 },
  { name: 'Blue',    color: '#3498db', hue: 240 },
  { name: 'Purple',  color: '#9b59b6', hue: 270 },
  { name: 'Magenta', color: '#e84393', hue: 330 },
]

function HueReferenceBar({ baseHue }: { baseHue: number }) {
  // Build a gradient centered on the base hue, spanning -180 to +180 shift.
  const stops: string[] = []
  const numStops = 13
  for (let i = 0; i <= numStops; i++) {
    const t = i / numStops
    const hue = (baseHue - 180 + t * 360 + 360) % 360
    stops.push(`hsl(${hue}, 80%, 55%) ${(t * 100).toFixed(1)}%`)
  }
  const gradient = `linear-gradient(to right, ${stops.join(', ')})`

  return (
    <div className="hue-reference-bar">
      <div className="hue-reference-gradient" style={{ background: gradient }} />
      <div className="hue-reference-center" />
    </div>
  )
}

export function HslSliders({ adjustments, onChange, onCommit }: SectionProps) {
  const [activeChannel, setActiveChannel] = useState(0)
  const ch = HSL_CHANNELS[activeChannel]

  return (
    <>
      <div className="hsl-color-selector">
        {HSL_CHANNELS.map((c, i) => {
          const hasEdits =
            adjustments.hslHue[i] !== 0 ||
            adjustments.hslSaturation[i] !== 0 ||
            adjustments.hslLuminance[i] !== 0
          return (
            <button
              key={c.name}
              className={`hsl-color-btn ${activeChannel === i ? 'active' : ''}`}
              onClick={() => setActiveChannel(i)}
              title={c.name}
            >
              <span className="hsl-color-dot" style={{ background: c.color }} />
              <span className="hsl-color-name">{c.name.slice(0, 3)}</span>
              {hasEdits && <span className="hsl-color-edited" />}
            </button>
          )
        })}
      </div>
      <h4 className="section-title">{ch.name}</h4>
      <HueReferenceBar baseHue={ch.hue} />
      <Slider
        label="Hue"
        value={adjustments.hslHue[activeChannel]}
        min={-180}
        max={180}
        onChange={(v) => {
          const arr = [...adjustments.hslHue]
          arr[activeChannel] = v
          onChange('hslHue', arr)
        }}
        onCommit={onCommit}
      />
      <Slider
        label="Saturation"
        value={adjustments.hslSaturation[activeChannel]}
        min={-100}
        max={100}
        onChange={(v) => {
          const arr = [...adjustments.hslSaturation]
          arr[activeChannel] = v
          onChange('hslSaturation', arr)
        }}
        onCommit={onCommit}
      />
      <Slider
        label="Luminance"
        value={adjustments.hslLuminance[activeChannel]}
        min={-100}
        max={100}
        onChange={(v) => {
          const arr = [...adjustments.hslLuminance]
          arr[activeChannel] = v
          onChange('hslLuminance', arr)
        }}
        onCommit={onCommit}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Global adjustment panel (default export) — wires the sections to the store
// and switches between them via the active tab.
// ---------------------------------------------------------------------------

export function AdjustmentPanel({ showAll = false }: { showAll?: boolean }) {
  const adjustments = useEditorStore((s) => s.adjustments)
  const setAdjustment = useEditorStore((s) => s.setAdjustment)
  const pushHistory = useEditorStore((s) => s.pushHistory)
  const activeTab = useEditorStore((s) => s.activeTab)
  const hasCommitted = useRef(false)

  const handleChange = useCallback<LayerAdjustOnChange>(
    (key, value) => {
      if (!hasCommitted.current) {
        pushHistory()
        hasCommitted.current = true
      }
      setAdjustment(key, value)
    },
    [setAdjustment, pushHistory],
  )

  const handleCommit = useCallback(() => {
    hasCommitted.current = false
  }, [])

  if (!showAll && (activeTab === 'recent' || activeTab === 'masks' || activeTab === 'export' || activeTab === 'grading')) return null

  return (
    <div className="adjustment-panel">
      {(showAll || activeTab === 'light') && (
        <>
          {showAll && <span className="sidebar-section-header">Light</span>}
          <div className="adjustment-section">
            <LightSliders adjustments={adjustments} onChange={handleChange} onCommit={handleCommit} />
            <Slider label="Sharpness" value={adjustments.sharpness} min={0} max={100} onChange={(v) => handleChange('sharpness', v)} onCommit={handleCommit} />
          </div>
        </>
      )}

      {(showAll || activeTab === 'color') && (
        <>
          {showAll && <span className="sidebar-section-header">Color</span>}
          <div className="adjustment-section">
            <ColorSliders adjustments={adjustments} onChange={handleChange} onCommit={handleCommit} />
          </div>
        </>
      )}

      {(showAll || activeTab === 'hsl') && (
        <>
          {showAll && <span className="sidebar-section-header">HSL</span>}
          <div className="adjustment-section">
            <HslSliders adjustments={adjustments} onChange={handleChange} onCommit={handleCommit} />
          </div>
        </>
      )}
    </div>
  )
}
