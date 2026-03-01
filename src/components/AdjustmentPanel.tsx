import { useCallback, useRef } from 'react'
import { useEditorStore } from '../state/editor-store'
import type { GlobalAdjustments } from '../state/types'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  onCommit: () => void
}

function Slider({ label, value, min, max, step = 1, onChange, onCommit }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100

  return (
    <div className="slider-row">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{Math.round(value * 10) / 10}</span>
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

export function AdjustmentPanel() {
  const adjustments = useEditorStore((s) => s.adjustments)
  const setAdjustment = useEditorStore((s) => s.setAdjustment)
  const pushHistory = useEditorStore((s) => s.pushHistory)
  const activeTab = useEditorStore((s) => s.activeTab)
  const hasCommitted = useRef(false)

  const handleChange = useCallback(
    <K extends keyof GlobalAdjustments>(key: K, value: GlobalAdjustments[K]) => {
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

  if (activeTab === 'recent' || activeTab === 'masks' || activeTab === 'export') return null

  const HSL_CHANNELS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta']

  return (
    <div className="adjustment-panel">
      {activeTab === 'light' && (
        <div className="adjustment-section">
          <Slider label="Exposure" value={adjustments.exposure} min={-5} max={5} step={0.05} onChange={(v) => handleChange('exposure', v)} onCommit={handleCommit} />
          <Slider label="Contrast" value={adjustments.contrast} min={-100} max={100} onChange={(v) => handleChange('contrast', v)} onCommit={handleCommit} />
          <Slider label="Highlights" value={adjustments.highlights} min={-100} max={100} onChange={(v) => handleChange('highlights', v)} onCommit={handleCommit} />
          <Slider label="Shadows" value={adjustments.shadows} min={-100} max={100} onChange={(v) => handleChange('shadows', v)} onCommit={handleCommit} />
          <Slider label="Whites" value={adjustments.whites} min={-100} max={100} onChange={(v) => handleChange('whites', v)} onCommit={handleCommit} />
          <Slider label="Blacks" value={adjustments.blacks} min={-100} max={100} onChange={(v) => handleChange('blacks', v)} onCommit={handleCommit} />
          <Slider label="Sharpness" value={adjustments.sharpness} min={0} max={100} onChange={(v) => handleChange('sharpness', v)} onCommit={handleCommit} />
        </div>
      )}

      {activeTab === 'color' && (
        <div className="adjustment-section">
          <Slider label="Temperature" value={adjustments.temperature} min={-100} max={100} onChange={(v) => handleChange('temperature', v)} onCommit={handleCommit} />
          <Slider label="Tint" value={adjustments.tint} min={-100} max={100} onChange={(v) => handleChange('tint', v)} onCommit={handleCommit} />
          <Slider label="Vibrance" value={adjustments.vibrance} min={-100} max={100} onChange={(v) => handleChange('vibrance', v)} onCommit={handleCommit} />
          <Slider label="Saturation" value={adjustments.saturation} min={-100} max={100} onChange={(v) => handleChange('saturation', v)} onCommit={handleCommit} />
        </div>
      )}

      {activeTab === 'hsl' && (
        <div className="adjustment-section">
          <h4 className="section-title">Hue</h4>
          {HSL_CHANNELS.map((ch, i) => (
            <Slider
              key={`hue-${ch}`}
              label={ch}
              value={adjustments.hslHue[i]}
              min={-180}
              max={180}
              onChange={(v) => {
                const arr = [...adjustments.hslHue]
                arr[i] = v
                handleChange('hslHue', arr)
              }}
              onCommit={handleCommit}
            />
          ))}
          <h4 className="section-title" style={{ marginTop: 16 }}>Saturation</h4>
          {HSL_CHANNELS.map((ch, i) => (
            <Slider
              key={`sat-${ch}`}
              label={ch}
              value={adjustments.hslSaturation[i]}
              min={-100}
              max={100}
              onChange={(v) => {
                const arr = [...adjustments.hslSaturation]
                arr[i] = v
                handleChange('hslSaturation', arr)
              }}
              onCommit={handleCommit}
            />
          ))}
          <h4 className="section-title" style={{ marginTop: 16 }}>Luminance</h4>
          {HSL_CHANNELS.map((ch, i) => (
            <Slider
              key={`lum-${ch}`}
              label={ch}
              value={adjustments.hslLuminance[i]}
              min={-100}
              max={100}
              onChange={(v) => {
                const arr = [...adjustments.hslLuminance]
                arr[i] = v
                handleChange('hslLuminance', arr)
              }}
              onCommit={handleCommit}
            />
          ))}
        </div>
      )}
    </div>
  )
}
