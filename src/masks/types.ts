import type { GlobalAdjustments } from '../state/types'
import { DEFAULT_ADJUSTMENTS } from '../state/types'

export type ShapeType = 'rectangle' | 'ellipse' | 'linear-gradient' | 'radial-gradient'

export interface MaskShape {
  type: ShapeType
  // Position relative to image (0-1 normalized)
  x: number
  y: number
  // Size relative to image (0-1 normalized)
  width: number
  height: number
  rotation: number // degrees
  feather: number  // 0-1, how much to soften edges
}

export interface Mask {
  id: string
  shape: MaskShape
  inverted: boolean
  enabled: boolean
  adjustments: MaskAdjustments
}

// A mask is a layer with the full adjustment stack (light, color, HSL,
// color grading). The `sharpness` field on the type is a no-op on masks —
// sharpening is applied only on the final display pass.
export type MaskAdjustments = GlobalAdjustments

export interface MaskLayerData {
  raster: Uint8Array
  adjustments: MaskAdjustments
}

// Fresh arrays so mutations on one mask's HSL don't leak into another.
export const DEFAULT_MASK_ADJUSTMENTS: MaskAdjustments = {
  ...DEFAULT_ADJUSTMENTS,
  hslHue: [...DEFAULT_ADJUSTMENTS.hslHue],
  hslSaturation: [...DEFAULT_ADJUSTMENTS.hslSaturation],
  hslLuminance: [...DEFAULT_ADJUSTMENTS.hslLuminance],
}
