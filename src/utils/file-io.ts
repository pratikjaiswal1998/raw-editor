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

export async function exportJpeg(canvas: HTMLCanvasElement, quality: number): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { resolve(); return }

        // Try Web Share API first (mobile)
        if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'photo.jpg', { type: 'image/jpeg' })] })) {
          const file = new File([blob], 'photo.jpg', { type: 'image/jpeg' })
          navigator.share({ files: [file] }).catch(() => {
            downloadBlob(blob)
          })
        } else {
          downloadBlob(blob)
        }
        resolve()
      },
      'image/jpeg',
      quality / 100,
    )
  })
}

function downloadBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `edited_${Date.now()}.jpg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
