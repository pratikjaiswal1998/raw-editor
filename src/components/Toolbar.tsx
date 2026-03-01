import { useEditorStore } from '../state/editor-store'
import { loadImageFile } from '../raw/dng-parser'
import { triggerFileInput } from '../utils/file-io'
import { saveRecentFile } from '../utils/recent-files'

// Map EXIF orientation to rotation degrees
function exifOrientationToRotation(orientation: number): number {
  switch (orientation) {
    case 3: return 180
    case 6: return 90
    case 8: return 270
    default: return 0
  }
}

const ACCEPT_TYPES = [{ description: 'Image files', accept: { 'image/*': ['.dng', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.heic'] as `.${string}`[] } }]
const ACCEPT_STRING = '.dng,.DNG,.jpg,.jpeg,.png,.tiff,.tif,.heic'

export function Toolbar() {
  const fileName = useEditorStore((s) => s.fileName)
  const setImage = useEditorStore((s) => s.setImage)
  const setLoading = useEditorStore((s) => s.setLoading)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const historyIndex = useEditorStore((s) => s.historyIndex)
  const historyLength = useEditorStore((s) => s.history.length)
  const toggleHistogram = useEditorStore((s) => s.toggleHistogram)
  const rotateImage = useEditorStore((s) => s.rotateImage)

  const handleOpen = async () => {
    setLoading(true)
    try {
      let file: File
      let handle: FileSystemFileHandle | null = null

      if (window.showOpenFilePicker) {
        try {
          const [h] = await window.showOpenFilePicker({ types: ACCEPT_TYPES })
          handle = h
          file = await h.getFile()
        } catch (e) {
          if ((e as Error).name === 'AbortError') return
          throw e
        }
      } else {
        const f = await triggerFileInput(ACCEPT_STRING)
        if (!f) return
        file = f
      }

      const storeBefore = useEditorStore.getState()
      const isRestore = file.name === storeBefore.fileName && storeBefore.originalImage === null
      const rawImage = await loadImageFile(file)
      setImage(rawImage.data, rawImage.width, rawImage.height, file.name)

      let finalRotation = isRestore ? storeBefore.rotation : 0
      if (!isRestore) {
        const autoRotation = exifOrientationToRotation(rawImage.metadata.orientation)
        if (autoRotation !== 0) {
          useEditorStore.setState({ rotation: autoRotation })
          finalRotation = autoRotation
        }
      }

      // Save/update recent entry
      const storeAfter = useEditorStore.getState()
      await saveRecentFile({
        fileName: file.name,
        openedAt: Date.now(),
        handle,
        adjustments: isRestore ? storeBefore.adjustments : storeAfter.adjustments,
        masks: isRestore ? storeBefore.masks : [],
        rotation: finalRotation,
      })
    } catch (e) {
      alert(`Failed to load image: ${e instanceof Error ? e.message : e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <button className="toolbar-btn toolbar-btn--primary" onClick={() => void handleOpen()} title="Open file">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="toolbar-label">Open</span>
        </button>
      </div>

      <div className="toolbar-center">
        {fileName && <span className="toolbar-filename">{fileName}</span>}
      </div>

      <div className="toolbar-right">
        <button
          className="toolbar-btn"
          onClick={undo}
          disabled={historyIndex < 0}
          title="Undo (Z)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
          </svg>
        </button>
        <button
          className="toolbar-btn"
          onClick={redo}
          disabled={historyIndex >= historyLength - 1}
          title="Redo (X)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: 'scaleX(-1)' }}>
            <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
          </svg>
        </button>
        <button className="toolbar-btn" onClick={rotateImage} title="Rotate 90°">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 2v6h-6" /><path d="M21 8A9 9 0 0 0 6.67 5.27L3 9" /><path d="M3 22v-6h6" /><path d="M3 16a9 9 0 0 0 14.33 2.73L21 15" />
          </svg>
        </button>
        <button className="toolbar-btn" onClick={toggleHistogram} title="Toggle histogram">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="12" width="4" height="8" /><rect x="10" y="6" width="4" height="14" /><rect x="17" y="2" width="4" height="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
