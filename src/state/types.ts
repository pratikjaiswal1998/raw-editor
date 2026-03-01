import type { Mask } from '../masks/types'

export interface GlobalAdjustments {
  // Light
  exposure: number     // -5 to 5
  contrast: number     // -100 to 100
  highlights: number   // -100 to 100
  shadows: number      // -100 to 100
  whites: number       // -100 to 100
  blacks: number       // -100 to 100

  // Color
  temperature: number  // -100 to 100 (maps to kelvin shift)
  tint: number         // -100 to 100
  vibrance: number     // -100 to 100
  saturation: number   // -100 to 100

  // HSL (per channel: R, O, Y, G, A, B, P, M)
  hslHue: number[]        // 8 channels, -180 to 180
  hslSaturation: number[] // 8 channels, -100 to 100
  hslLuminance: number[]  // 8 channels, -100 to 100

  // Color Grading (split toning)
  shadowsHue: number       // 0 to 360
  shadowsSat: number       // 0 to 100
  midtonesHue: number      // 0 to 360
  midtonesSat: number      // 0 to 100
  highlightsHue: number    // 0 to 360
  highlightsSat: number    // 0 to 100

  // Detail
  sharpness: number    // 0 to 100
}

export const DEFAULT_ADJUSTMENTS: GlobalAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  hslHue: [0, 0, 0, 0, 0, 0, 0, 0],
  hslSaturation: [0, 0, 0, 0, 0, 0, 0, 0],
  hslLuminance: [0, 0, 0, 0, 0, 0, 0, 0],
  shadowsHue: 220,
  shadowsSat: 0,
  midtonesHue: 0,
  midtonesSat: 0,
  highlightsHue: 40,
  highlightsSat: 0,
  sharpness: 0,
}

export type AdjustmentTab = 'light' | 'color' | 'hsl' | 'grading' | 'masks' | 'export'

export interface EditorState {
  // Image data
  originalImage: Float32Array | null
  imageWidth: number
  imageHeight: number
  fileName: string | null

  // Adjustments
  adjustments: GlobalAdjustments
  masks: Mask[]
  activeMaskId: string | null

  // Transform
  rotation: number  // 0, 90, 180, 270

  // UI
  activeTab: AdjustmentTab
  showBeforeAfter: boolean
  zoom: number
  panX: number
  panY: number
  showHistogram: boolean
  isLoading: boolean

  // History
  historyIndex: number
  history: HistoryEntry[]
}

export interface HistoryEntry {
  adjustments: GlobalAdjustments
  masks: Mask[]
}
