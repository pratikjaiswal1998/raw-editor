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
    self.postMessage({ rasters: [] })
    return
  }

  // Rasterize each mask individually (each gets its own composite pass)
  const rasters: Uint8Array[] = []
  const transfers: ArrayBuffer[] = []

  for (const mask of masks) {
    const rasterized = rasterizeMask(mask.shape, width, height)

    // Apply inversion if needed
    if (mask.inverted) {
      for (let i = 0; i < rasterized.length; i++) {
        rasterized[i] = 255 - rasterized[i]
      }
    }

    rasters.push(rasterized)
    transfers.push(rasterized.buffer as ArrayBuffer)
  }

  self.postMessage({ rasters }, { transfer: transfers as ArrayBuffer[] })
}
