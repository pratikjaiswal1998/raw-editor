import { useEditorStore } from '../state/editor-store'
import type { ShapeType, MaskShape } from '../masks/types'

const SHAPE_OPTIONS: { type: ShapeType; label: string; icon: string }[] = [
  { type: 'rectangle', label: 'Rectangle', icon: '▬' },
  { type: 'ellipse', label: 'Ellipse', icon: '⬭' },
  { type: 'linear-gradient', label: 'Linear Grad', icon: '▤' },
  { type: 'radial-gradient', label: 'Radial Grad', icon: '◎' },
]

export function MaskPanel() {
  const masks = useEditorStore((s) => s.masks)
  const activeMaskId = useEditorStore((s) => s.activeMaskId)
  const addMask = useEditorStore((s) => s.addMask)
  const removeMask = useEditorStore((s) => s.removeMask)
  const setActiveMask = useEditorStore((s) => s.setActiveMask)
  const updateMaskShape = useEditorStore((s) => s.updateMaskShape)
  const toggleMaskInvert = useEditorStore((s) => s.toggleMaskInvert)
  const activeTab = useEditorStore((s) => s.activeTab)

  if (activeTab !== 'masks') return null

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

      {/* Mask list */}
      {masks.length > 0 && (
        <div className="mask-list">
          <span className="section-title">Masks</span>
          {masks.map((mask, i) => (
            <div
              key={mask.id}
              className={`mask-item ${mask.id === activeMaskId ? 'active' : ''}`}
              onClick={() => setActiveMask(mask.id)}
            >
              <span className="mask-item-name">
                {mask.shape.type} #{i + 1}
                {mask.inverted && ' (inv)'}
              </span>
              <div className="mask-item-actions">
                <button
                  className="mask-action-btn"
                  onClick={(e) => { e.stopPropagation(); toggleMaskInvert(mask.id) }}
                  title="Invert mask"
                >
                  ◑
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

      {/* Active mask controls */}
      {activeMask && (
        <div className="mask-controls">
          <span className="section-title">Shape Controls</span>

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
        </div>
      )}
    </div>
  )
}
