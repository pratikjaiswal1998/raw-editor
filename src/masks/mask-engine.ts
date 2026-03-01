import type { Mask } from './types'
import { rasterizeMask } from './shapes'

export function generateMaskTexture(
  mask: Mask | null,
  imageWidth: number,
  imageHeight: number,
): Uint8Array {
  if (!mask) {
    // No mask = full white (everything affected)
    return new Uint8Array(imageWidth * imageHeight).fill(255)
  }

  return rasterizeMask(mask.shape, imageWidth, imageHeight)
}
