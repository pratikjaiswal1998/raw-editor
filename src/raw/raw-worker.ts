// Web Worker for RAW image processing — runs off the main thread
import { parseDng, extractEmbeddedJpeg, srgbToLinear } from './dng-parser'

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
async function decodeImageBlob(blob: Blob): Promise<{ data: Float32Array; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = imgData.data

  const floats = new Float32Array(canvas.width * canvas.height * 4)
  for (let i = 0; i < pixels.length; i += 4) {
    floats[i] = srgbToLinear(pixels[i] / 255)
    floats[i + 1] = srgbToLinear(pixels[i + 1] / 255)
    floats[i + 2] = srgbToLinear(pixels[i + 2] / 255)
    floats[i + 3] = 1.0
  }

  return { data: floats, width: canvas.width, height: canvas.height }
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const { buffer, fileName } = e.data
    const ext = fileName.toLowerCase().split('.').pop()

    let data: Float32Array
    let width: number
    let height: number
    let orientation = 1

    if (ext === 'dng') {
      // Try 1: Full raw DNG parsing
      let dngParsed = false
      try {
        const result = await parseDng(buffer)
        data = result.data
        width = result.width
        height = result.height
        orientation = result.metadata.orientation
        dngParsed = true
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
            dngParsed = true
          }
        } catch (jpegErr) {
          console.warn('DNG embedded JPEG extraction failed in worker:', jpegErr)
        }
      }

      if (!dngParsed) {
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
      // Regular images have no EXIF orientation from DNG metadata; default is 1
      orientation = 1
    }

    // Transfer the Float32Array buffer (zero-copy)
    self.postMessage(
      { data, width, height, orientation } satisfies WorkerSuccessResponse,
      [data!.buffer],
    )
  } catch (err) {
    self.postMessage({ error: (err as Error).message } satisfies WorkerErrorResponse)
  }
}
