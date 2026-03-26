import { rasterizeMask } from './shapes'
import type { MaskShape } from './types'

interface CombinedMaskRequest {
  masks: { shape: MaskShape; inverted: boolean }[]
  width: number
  height: number
}

self.onmessage = (e: MessageEvent) => {
  const { masks, width, height } = e.data as CombinedMaskRequest

  if (masks.length === 0) {
    // No masks = full white (everything affected by global adjustments)
    const result = new Uint8Array(width * height).fill(255)
    self.postMessage(result, { transfer: [result.buffer] })
    return
  }

  // Rasterize each mask and combine with MAX blending (union)
  const combined = new Uint8Array(width * height)

  for (const mask of masks) {
    const rasterized = rasterizeMask(mask.shape, width, height)

    // Apply inversion if needed
    if (mask.inverted) {
      for (let i = 0; i < rasterized.length; i++) {
        rasterized[i] = 255 - rasterized[i]
      }
    }

    // Max blend (union of all masks)
    for (let i = 0; i < combined.length; i++) {
      if (rasterized[i] > combined[i]) {
        combined[i] = rasterized[i]
      }
    }
  }

  self.postMessage(combined, { transfer: [combined.buffer] })
}
