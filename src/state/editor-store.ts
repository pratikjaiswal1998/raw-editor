import { create } from 'zustand'
import type { EditorState, GlobalAdjustments, HistoryEntry, AdjustmentTab } from './types'
import { DEFAULT_ADJUSTMENTS } from './types'
import type { Mask, MaskShape } from '../masks/types'
import { DEFAULT_MASK_ADJUSTMENTS } from '../masks/types'

interface EditorActions {
  // Image
  setImage: (data: Float32Array, width: number, height: number, fileName: string) => void

  // Adjustments
  setAdjustment: <K extends keyof GlobalAdjustments>(key: K, value: GlobalAdjustments[K]) => void
  resetAdjustments: () => void

  // Masks
  addMask: (shape: MaskShape) => void
  removeMask: (id: string) => void
  setActiveMask: (id: string | null) => void
  updateMaskShape: (id: string, shape: Partial<MaskShape>) => void
  toggleMaskInvert: (id: string) => void
  updateMaskAdjustment: (id: string, key: string, value: number) => void

  // Transform
  rotateImage: () => void

  // UI
  setActiveTab: (tab: AdjustmentTab) => void
  setShowBeforeAfter: (show: boolean) => void
  setZoom: (zoom: number) => void
  setPan: (x: number, y: number) => void
  toggleHistogram: () => void
  setLoading: (loading: boolean) => void

  // History
  pushHistory: () => void
  undo: () => void
  redo: () => void
}

export type EditorStore = EditorState & EditorActions

export const useEditorStore = create<EditorStore>((set, get) => ({
  // Initial state
  originalImage: null,
  imageWidth: 0,
  imageHeight: 0,
  fileName: null,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  masks: [],
  activeMaskId: null,
  rotation: 0,
  activeTab: 'light',
  showBeforeAfter: false,
  zoom: 1,
  panX: 0,
  panY: 0,
  showHistogram: false,
  isLoading: false,
  historyIndex: -1,
  history: [],

  // Actions
  setImage: (data, width, height, fileName) => {
    set({
      originalImage: data,
      imageWidth: width,
      imageHeight: height,
      fileName,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      masks: [],
      activeMaskId: null,
      history: [],
      historyIndex: -1,
      rotation: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
    })
  },

  setAdjustment: (key, value) => {
    const state = get()
    set({
      adjustments: { ...state.adjustments, [key]: value },
    })
  },

  resetAdjustments: () => {
    get().pushHistory()
    set({ adjustments: { ...DEFAULT_ADJUSTMENTS } })
  },

  addMask: (shape) => {
    const id = `mask_${Date.now()}`
    const mask: Mask = {
      id,
      shape,
      inverted: false,
      adjustments: { ...DEFAULT_MASK_ADJUSTMENTS },
    }
    const state = get()
    state.pushHistory()
    set({
      masks: [...state.masks, mask],
      activeMaskId: id,
      activeTab: 'masks',
    })
  },

  removeMask: (id) => {
    const state = get()
    state.pushHistory()
    set({
      masks: state.masks.filter((m) => m.id !== id),
      activeMaskId: state.activeMaskId === id ? null : state.activeMaskId,
    })
  },

  setActiveMask: (id) => set({ activeMaskId: id }),

  updateMaskShape: (id, shapeUpdate) => {
    const state = get()
    set({
      masks: state.masks.map((m) =>
        m.id === id ? { ...m, shape: { ...m.shape, ...shapeUpdate } } : m,
      ),
    })
  },

  toggleMaskInvert: (id) => {
    const state = get()
    set({
      masks: state.masks.map((m) =>
        m.id === id ? { ...m, inverted: !m.inverted } : m,
      ),
    })
  },

  updateMaskAdjustment: (id, key, value) => {
    const state = get()
    set({
      masks: state.masks.map((m) =>
        m.id === id
          ? { ...m, adjustments: { ...m.adjustments, [key]: value } }
          : m,
      ),
    })
  },

  rotateImage: () => {
    const state = get()
    set({ rotation: (state.rotation + 90) % 360 })
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setShowBeforeAfter: (show) => set({ showBeforeAfter: show }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  toggleHistogram: () => set((s) => ({ showHistogram: !s.showHistogram })),
  setLoading: (loading) => set({ isLoading: loading }),

  pushHistory: () => {
    const state = get()
    const entry: HistoryEntry = {
      adjustments: { ...state.adjustments },
      masks: state.masks.map((m) => ({ ...m, shape: { ...m.shape }, adjustments: { ...m.adjustments } })),
    }
    const newHistory = state.history.slice(0, state.historyIndex + 1)
    newHistory.push(entry)
    // Keep max 50 entries
    if (newHistory.length > 50) newHistory.shift()
    set({ history: newHistory, historyIndex: newHistory.length - 1 })
  },

  undo: () => {
    const state = get()
    if (state.historyIndex < 0) return
    const entry = state.history[state.historyIndex]
    set({
      adjustments: { ...entry.adjustments },
      masks: entry.masks.map((m) => ({ ...m })),
      historyIndex: state.historyIndex - 1,
    })
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return
    const entry = state.history[state.historyIndex + 1]
    set({
      adjustments: { ...entry.adjustments },
      masks: entry.masks.map((m) => ({ ...m })),
      historyIndex: state.historyIndex + 1,
    })
  },
}))
