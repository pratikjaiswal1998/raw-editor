import { useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import type { ShapeType, MaskShape, MaskAdjustments } from '../masks/types'

const SHAPE_OPTIONS: { type: ShapeType; label: string; icon: string }[] = [
  { type: 'rectangle', label: 'Rectangle', icon: '▬' },
  { type: 'ellipse', label: 'Ellipse', icon: '⬭' },
  { type: 'linear-gradient', label: 'Linear Grad', icon: '▤' },
  { type: 'radial-gradient', label: 'Radial Grad', icon: '◎' },
]

const MASK_ADJ_SLIDERS: { key: keyof MaskAdjustments; label: string; min: number; max: number; step: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.05 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1 },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1 },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1 },
  { key: 'whites', label: 'Whites', min: -100, max: 100, step: 1 },
  { key: 'blacks', label: 'Blacks', min: -100, max: 100, step: 1 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100, step: 1 },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1 },
]

export function MaskPanel({ showAll = false }: { showAll?: boolean }) {
  const masks = useEditorStore((s) => s.masks)
  const activeMaskId = useEditorStore((s) => s.activeMaskId)
  const addMask = useEditorStore((s) => s.addMask)
  const removeMask = useEditorStore((s) => s.removeMask)
  const setActiveMask = useEditorStore((s) => s.setActiveMask)
  const updateMaskShape = useEditorStore((s) => s.updateMaskShape)
  const toggleMaskInvert = useEditorStore((s) => s.toggleMaskInvert)
  const toggleMaskEnabled = useEditorStore((s) => s.toggleMaskEnabled)
  const duplicateMask = useEditorStore((s) => s.duplicateMask)
  const clearAllMasks = useEditorStore((s) => s.clearAllMasks)
  const updateMaskAdjustment = useEditorStore((s) => s.updateMaskAdjustment)
  const activeTab = useEditorStore((s) => s.activeTab)

  const [shapeOpen, setShapeOpen] = useState(true)
  const [adjOpen, setAdjOpen] = useState(true)

  if (!showAll && activeTab !== 'masks') return null

  const activeMask = masks.find((m) => m.id === activeMaskId)

  const handleAddMask = (type: ShapeType) => {
    const shape: MaskShape = {
      type,
      x: 0.5,
      y: 0.5,
      width: 0.4,
      height: 0.4,
      rotation: 0,
      feather: 0.2,
    }
    addMask(shape)
  }

  return (
    <div className="mask-panel">
      {/* Add mask buttons */}
      <div className="mask-add-section">
        <span className="section-title">Add Mask</span>
        <div className="mask-shape-grid">
          {SHAPE_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className="mask-shape-btn"
              onClick={() => handleAddMask(opt.type)}
            >
              <span className="mask-shape-icon">{opt.icon}</span>
              <span className="mask-shape-label">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mask layer list */}
      {masks.length > 0 && (
        <div className="mask-list">
          <div className="mask-list-header">
            <span className="section-title">Layers ({masks.length})</span>
            <button
              className="mask-clear-all-btn"
              onClick={clearAllMasks}
              title="Remove all masks"
            >
              Clear All
            </button>
          </div>
          {masks.map((mask, i) => (
            <div
              key={mask.id}
              className={`mask-item ${mask.id === activeMaskId ? 'active' : ''} ${!mask.enabled ? 'disabled' : ''}`}
              onClick={() => setActiveMask(mask.id)}
            >
              <div className="mask-item-left">
                <span className="mask-item-index">{i + 1}</span>
                <span className="mask-item-name">
                  {mask.shape.type}
                  {mask.inverted && <span className="mask-inv-badge">INV</span>}
                </span>
              </div>
              <div className="mask-item-actions">
                <button
                  className={`mask-action-btn ${!mask.enabled ? 'toggled-off' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleMaskEnabled(mask.id) }}
                  title={mask.enabled ? 'Hide mask' : 'Show mask'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {mask.enabled ? (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </>
                    ) : (
                      <>
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </>
                    )}
                  </svg>
                </button>
                <button
                  className="mask-action-btn"
                  onClick={(e) => { e.stopPropagation(); toggleMaskInvert(mask.id) }}
                  title="Invert mask"
                >
                  ◑
                </button>
                <button
                  className="mask-action-btn"
                  onClick={(e) => { e.stopPropagation(); duplicateMask(mask.id) }}
                  title="Duplicate mask"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
                <button
                  className="mask-action-btn danger"
                  onClick={(e) => { e.stopPropagation(); removeMask(mask.id) }}
                  title="Delete mask"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active mask: Shape controls (collapsible) */}
      {activeMask && (
        <div className="mask-controls">
          <button className="mask-section-toggle" onClick={() => setShapeOpen(!shapeOpen)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ transform: shapeOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <path d="M8 5l8 7-8 7z"/>
            </svg>
            <span className="section-title">Shape Controls</span>
          </button>

          {shapeOpen && (
            <>
              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">X Position</span>
                  <span className="slider-value">{Math.round(activeMask.shape.x * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={activeMask.shape.x}
                  onChange={(e) => updateMaskShape(activeMask.id, { x: parseFloat(e.target.value) })}
                  className="slider-input"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">Y Position</span>
                  <span className="slider-value">{Math.round(activeMask.shape.y * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={activeMask.shape.y}
                  onChange={(e) => updateMaskShape(activeMask.id, { y: parseFloat(e.target.value) })}
                  className="slider-input"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">Width</span>
                  <span className="slider-value">{Math.round(activeMask.shape.width * 100)}%</span>
                </div>
                <input
                  type="range" min={0.01} max={1} step={0.01}
                  value={activeMask.shape.width}
                  onChange={(e) => updateMaskShape(activeMask.id, { width: parseFloat(e.target.value) })}
                  className="slider-input"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">Height</span>
                  <span className="slider-value">{Math.round(activeMask.shape.height * 100)}%</span>
                </div>
                <input
                  type="range" min={0.01} max={1} step={0.01}
                  value={activeMask.shape.height}
                  onChange={(e) => updateMaskShape(activeMask.id, { height: parseFloat(e.target.value) })}
                  className="slider-input"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">Rotation</span>
                  <span className="slider-value">{Math.round(activeMask.shape.rotation)}°</span>
                </div>
                <input
                  type="range" min={-180} max={180} step={1}
                  value={activeMask.shape.rotation}
                  onChange={(e) => updateMaskShape(activeMask.id, { rotation: parseFloat(e.target.value) })}
                  className="slider-input"
                />
              </div>

              <div className="slider-row">
                <div className="slider-header">
                  <span className="slider-label">Feather</span>
                  <span className="slider-value">{Math.round(activeMask.shape.feather * 100)}%</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={activeMask.shape.feather}
                  onChange={(e) => updateMaskShape(activeMask.id, { feather: parseFloat(e.target.value) })}
                  className="slider-input"
                />
              </div>

              <button
                className={`invert-btn ${activeMask.inverted ? 'active' : ''}`}
                onClick={() => toggleMaskInvert(activeMask.id)}
              >
                ◑ {activeMask.inverted ? 'Mask Inverted' : 'Invert Mask'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Active mask: Adjustment sliders (collapsible) */}
      {activeMask && (
        <div className="mask-controls">
          <button className="mask-section-toggle" onClick={() => setAdjOpen(!adjOpen)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ transform: adjOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <path d="M8 5l8 7-8 7z"/>
            </svg>
            <span className="section-title">Mask Adjustments</span>
          </button>

          {adjOpen && (
            <>
              {MASK_ADJ_SLIDERS.map((s) => {
                const val = activeMask.adjustments[s.key]
                const pct = ((val - s.min) / (s.max - s.min)) * 100
                return (
                  <div key={s.key} className="slider-row">
                    <div className="slider-header">
                      <span className="slider-label">{s.label}</span>
                      <span className="slider-value">{Math.round(val * 10) / 10}</span>
                    </div>
                    <input
                      type="range"
                      min={s.min} max={s.max} step={s.step}
                      value={val}
                      onChange={(e) => updateMaskAdjustment(activeMask.id, s.key, parseFloat(e.target.value))}
                      onDoubleClick={() => updateMaskAdjustment(activeMask.id, s.key, 0)}
                      className="slider-input"
                      style={{
                        background: `linear-gradient(to right, var(--slider-fill) 0%, var(--slider-fill) ${pct}%, var(--slider-track) ${pct}%, var(--slider-track) 100%)`,
                      }}
                    />
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}
    </div>
  )
}
