export function triggerFileInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      resolve(input.files?.[0] ?? null)
    }
    input.click()
  })
}

export type ImageFormat = 'jpeg' | 'png' | 'webp'

const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const FORMAT_EXT: Record<ImageFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
}

/**
 * Encode a canvas to a Blob at the requested format/quality.
 * PNG ignores quality (lossless).
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Canvas encode failed')),
      FORMAT_MIME[format],
      format === 'png' ? undefined : quality / 100,
    )
  })
}

/**
 * Direct file download. No Web Share API — that dialog is hostile on Windows.
 * The browser's native "Save As" flow always wins for photo editors.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Give the browser a moment to start the download before revoking the URL
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Encode + download a canvas as an image file.
 */
export async function exportImage(
  canvas: HTMLCanvasElement,
  format: ImageFormat,
  quality: number,
  baseName = 'edited',
): Promise<void> {
  const blob = await canvasToBlob(canvas, format, quality)
  const filename = `${baseName}_${Date.now()}.${FORMAT_EXT[format]}`
  downloadBlob(blob, filename)
}
