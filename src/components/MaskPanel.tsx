import { useCallback, useRef, useState } from 'react'
import { useEditorStore } from '../state/editor-store'
import type { ShapeType, MaskShape, MaskAdjustments } from '../masks/types'
import { LightSliders, ColorSliders, HslSliders, type LayerAdjustOnChange } from './AdjustmentPanel'
import { ColorGradingWheels } from './ColorGradingPanel'

const SHAPE_OPTIONS: { type: ShapeType; label: string; icon: string }[] = [
  { type: 'rectangle', label: 'Rectangle', icon: '▬' },
  { type: 'ellipse', label: 'Ellipse', icon: '⬭' },
  { type: 'linear-gradient', label: 'Linear Grad', icon: '▤' },
  { type: 'radial-gradient', label: 'Radial Grad', icon: '◎' },
]

function SectionToggle({ open, title, onClick }: { open: boolean; title: string; onClick: () => void }) {
  return (
    <button className="mask-section-toggle" onClick={onClick}>
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="currentColor"
        style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
      >
        <path d="M8 5l8 7-8 7z"/>
      </svg>
      <span className="section-title">{title}</span>
    </button>
  )
}

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
  const pushHistory = useEditorStore((s) => s.pushHistory)
  const activeTab = useEditorStore((s) => s.activeTab)

  const [shapeOpen, setShapeOpen] = useState(true)
  const [lightOpen, setLightOpen] = useState(true)
  const [colorOpen, setColorOpen] = useState(true)
  const [hslOpen, setHslOpen] = useState(false)
  const [gradingOpen, setGradingOpen] = useState(false)

  // Push history once per interaction (drag start), cleared on mouseup.
  const hasCommittedRef = useRef(false)

  const handleMaskChange = useCallback<LayerAdjustOnChange>(
    (key, value) => {
      if (!activeMaskId) return
      if (!hasCommittedRef.current) {
        pushHistory()
        hasCommittedRef.current = true
      }
      updateMaskAdjustment(activeMaskId, key as keyof MaskAdjustments, value)
    },
    [activeMaskId, updateMaskAdjustment, pushHistory],
  )

  const handleMaskCommit = useCallback(() => {
    hasCommittedRef.current = false
  }, [])

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
          <SectionToggle open={shapeOpen} title="Shape Controls" onClick={() => setShapeOpen(!shapeOpen)} />

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

      {/* Active mask: Light (collapsible) */}
      {activeMask && (
        <div className="mask-controls">
          <SectionToggle open={lightOpen} title="Light" onClick={() => setLightOpen(!lightOpen)} />
          {lightOpen && (
            <LightSliders
              adjustments={activeMask.adjustments}
              onChange={handleMaskChange}
              onCommit={handleMaskCommit}
            />
          )}
        </div>
      )}

      {/* Active mask: Color (collapsible) */}
      {activeMask && (
        <div className="mask-controls">
          <SectionToggle open={colorOpen} title="Color" onClick={() => setColorOpen(!colorOpen)} />
          {colorOpen && (
            <ColorSliders
              adjustments={activeMask.adjustments}
              onChange={handleMaskChange}
              onCommit={handleMaskCommit}
            />
          )}
        </div>
      )}

      {/* Active mask: HSL (collapsible) */}
      {activeMask && (
        <div className="mask-controls">
          <SectionToggle open={hslOpen} title="HSL" onClick={() => setHslOpen(!hslOpen)} />
          {hslOpen && (
            <HslSliders
              adjustments={activeMask.adjustments}
              onChange={handleMaskChange}
              onCommit={handleMaskCommit}
            />
          )}
        </div>
      )}

      {/* Active mask: Color Grading (collapsible) */}
      {activeMask && (
        <div className="mask-controls">
          <SectionToggle open={gradingOpen} title="Color Grading" onClick={() => setGradingOpen(!gradingOpen)} />
          {gradingOpen && (
            <ColorGradingWheels
              adjustments={activeMask.adjustments}
              onChange={handleMaskChange}
            />
          )}
        </div>
      )}
    </div>
  )
}
