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
  adjustments: MaskAdjustments
}

export interface MaskAdjustments {
  exposure: number
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  temperature: number
  tint: number
  saturation: number
  vibrance: number
}

export const DEFAULT_MASK_ADJUSTMENTS: MaskAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
}
