// Web Worker for RAW image processing — runs off the main thread
import { parseDng, extractEmbeddedJpeg, SRGB_TO_LINEAR_LUT } from './dng-parser'

export interface WorkerRequest {
  buffer: ArrayBuffer
  fileName: string
}

export interface WorkerSuccessResponse {
  data: Float32Array
  width: number
  height: number
  orientation: number
}

export interface WorkerErrorResponse {
  error: string
}

export type WorkerResponse = WorkerSuccessResponse | WorkerErrorResponse

/**
 * Decode a JPEG/PNG blob using OffscreenCanvas (no DOM needed).
 * Returns RGBA Float32Array in linear light.
 */
// Max pixels to keep load times reasonable on mobile (~8MP)
const MAX_PIXELS = 8_000_000

async function decodeImageBlob(blob: Blob): Promise<{ data: Float32Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  let w = bitmap.width
  let h = bitmap.height

  // Downsample if too large (common for phone photos: 12-48MP)
  const totalPixels = w * h
  if (totalPixels > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / totalPixels)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }

  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const imgData = ctx.getImageData(0, 0, w, h)
  const pixels = imgData.data

  const lut = SRGB_TO_LINEAR_LUT
  const floats = new Float32Array(w * h * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    floats[i] = lut[pixels[i]]
    floats[i + 1] = lut[pixels[i + 1]]
    floats[i + 2] = lut[pixels[i + 2]]
    floats[i + 3] = 1.0
  }

  return { data: floats, width: w, height: h }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const { buffer, fileName } = e.data
    const ext = fileName.toLowerCase().split('.').pop()

    let data: Float32Array | undefined
    let width: number | undefined
    let height: number | undefined
    let orientation = 1

    if (ext === 'dng') {
      // Try 1: Full raw DNG parsing
      try {
        const result = await parseDng(buffer)
        data = result.data
        width = result.width
        height = result.height
        orientation = result.metadata.orientation
      } catch (dngErr) {
        console.warn('DNG raw decode failed in worker:', dngErr)

        // Try 2: Extract embedded JPEG preview
        try {
          const jpegBlob = extractEmbeddedJpeg(buffer)
          if (jpegBlob) {
            console.log('Using embedded JPEG preview from DNG (worker)')
            const decoded = await decodeImageBlob(jpegBlob)
            data = decoded.data
            width = decoded.width
            height = decoded.height
          }
        } catch (jpegErr) {
          console.warn('DNG embedded JPEG extraction failed in worker:', jpegErr)
        }
      }

      if (!data || width === undefined || height === undefined) {
        self.postMessage({ error: 'Could not decode DNG file. The compression format may not be supported.' } satisfies WorkerErrorResponse)
        return
      }
    } else {
      // Regular image (JPEG, PNG, etc): use OffscreenCanvas
      const blob = new Blob([buffer])
      const decoded = await decodeImageBlob(blob)
      data = decoded.data
      width = decoded.width
      height = decoded.height
      orientation = 1
    }

    // Transfer the Float32Array buffer (zero-copy)
    self.postMessage(
      { data, width, height, orientation } satisfies WorkerSuccessResponse,
      { transfer: [data.buffer] },
    )
  } catch (err) {
    self.postMessage({ error: (err as Error).message } satisfies WorkerErrorResponse)
  }
}
