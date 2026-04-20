import { downloadBlob } from './file-io'

export type ReelAspect = '9:16' | '1:1' | '4:5'

export interface ReelOptions {
  aspect: ReelAspect
  durationSec: number    // 3–10 reasonable
  blurBackground: boolean // Instagram-style blurred fill for letterboxed area
}

// Pick target pixels based on source. We upscale past the Reels minimum
// (1080-wide) only when the source has the pixels to back it — going wider
// on a low-res source just wastes bitrate on upscaled mush. 1440-wide hits
// the Instagram upload sweet spot without triggering their harsher re-encode.
const BASE_ASPECT: Record<ReelAspect, { w: number; h: number }> = {
  '9:16': { w: 1080, h: 1920 }, // Instagram Reels, TikTok, YouTube Shorts
  '1:1':  { w: 1080, h: 1080 }, // Instagram feed square
  '4:5':  { w: 1080, h: 1350 }, // Instagram feed portrait
}

function targetDims(aspect: ReelAspect, src: { w: number; h: number }): { w: number; h: number } {
  const base = BASE_ASPECT[aspect]
  // Scale the target up if the source has more than ~1.33x linear resolution
  // to spare (fit-scale of the source). Max 1440-wide to keep file size sane.
  const fitPx = Math.min(src.w / base.w, src.h / base.h)
  if (fitPx >= 1.8) return { w: Math.round(base.w * 1.33), h: Math.round(base.h * 1.33) }
  return base
}

/**
 * Try to pick the best MediaRecorder mimeType the browser supports.
 * Priority: MP4/H.264 (Instagram-ready) → WebM/VP9 → WebM/VP8.
 */
function pickRecorderMime(): { mimeType: string; ext: string } {
  // Priority: high-profile H.264 (sharper 1080p) → mid → baseline → VP9 → VP8.
  // Instagram/TikTok re-encode on upload, but giving them a cleaner source
  // avoids generation loss. VP9 tends to look better than H.264 for static
  // content at the same bitrate, so we prefer it over baseline H.264.
  const candidates: { mimeType: string; ext: string }[] = [
    { mimeType: 'video/mp4;codecs=avc1.640028', ext: 'mp4' },  // H.264 High 4.0
    { mimeType: 'video/mp4;codecs=avc1.64001f', ext: 'mp4' },  // H.264 High 3.1
    { mimeType: 'video/mp4;codecs=avc1.4d0028', ext: 'mp4' },  // H.264 Main 4.0
    { mimeType: 'video/mp4;codecs=avc1.4d001f', ext: 'mp4' },  // H.264 Main 3.1
    { mimeType: 'video/webm;codecs=vp9',        ext: 'webm' }, // better than baseline H.264
    { mimeType: 'video/mp4;codecs=avc1.42001f', ext: 'mp4' },  // H.264 Baseline 3.1
    { mimeType: 'video/mp4;codecs=avc1',        ext: 'mp4' },
    { mimeType: 'video/mp4',                    ext: 'mp4' },
    { mimeType: 'video/webm;codecs=vp8',        ext: 'webm' },
    { mimeType: 'video/webm',                   ext: 'webm' },
  ]
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c
    }
  }
  return { mimeType: '', ext: 'webm' }
}

/**
 * Paint the source image into a target canvas sized for the chosen aspect.
 * The source is letterboxed/pillarboxed into the center; the negative space is
 * filled with a blurred, scaled copy of the source (the standard Insta-style
 * background fill) or solid black if blurBackground is false.
 */
function composeReelFrame(
  dest: HTMLCanvasElement,
  source: HTMLCanvasElement,
  blurBackground: boolean,
): void {
  const ctx = dest.getContext('2d')!
  // Re-assert quality settings — MediaRecorder's captureStream can reset
  // them on some browsers between frames.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const { width: dw, height: dh } = dest
  const sw = source.width
  const sh = source.height

  // Background
  if (blurBackground) {
    ctx.save()
    ctx.filter = 'blur(40px) brightness(0.6)'
    // Scale source to cover destination
    const coverScale = Math.max(dw / sw, dh / sh)
    const bw = sw * coverScale
    const bh = sh * coverScale
    ctx.drawImage(source, (dw - bw) / 2, (dh - bh) / 2, bw, bh)
    ctx.restore()
  } else {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, dw, dh)
  }

  // Foreground: scale source to fit inside dest (contain, not cover)
  const fitScale = Math.min(dw / sw, dh / sh)
  const fw = sw * fitScale
  const fh = sh * fitScale
  ctx.drawImage(source, (dw - fw) / 2, (dh - fh) / 2, fw, fh)
}

/**
 * Encode a still image as a short video file, suitable for Instagram
 * Reels / TikTok / Shorts upload.
 *
 * The target canvas is painted once with the composed frame, then fed
 * into MediaRecorder via captureStream(). Every ~100ms we redraw the
 * same frame so the captured stream keeps advancing — some browsers
 * will stop emitting frames on a static canvas otherwise.
 */
export async function exportReelVideo(
  sourceCanvas: HTMLCanvasElement,
  options: ReelOptions,
  baseName = 'reel',
): Promise<void> {
  const { w, h } = targetDims(options.aspect, { w: sourceCanvas.width, h: sourceCanvas.height })
  const target = document.createElement('canvas')
  target.width = w
  target.height = h
  // Sharper downscale than the browser default — photo detail survives
  // the 1:N scale-to-fit better with 'high' quality interpolation.
  const tctx = target.getContext('2d')
  if (tctx) {
    tctx.imageSmoothingEnabled = true
    tctx.imageSmoothingQuality = 'high'
  }

  composeReelFrame(target, sourceCanvas, options.blurBackground)

  const { mimeType, ext } = pickRecorderMime()
  if (!mimeType) {
    throw new Error('This browser does not support MediaRecorder video export')
  }

  // Lower fps for a still-image reel — fewer frames means each one gets
  // a bigger slice of the bitrate budget. Instagram plays back at whatever
  // fps the file carries, so 24fps is safe. Also tighter keyframe cadence
  // (MediaRecorder.start() chunk size) means each segment starts with an
  // I-frame, keeping quality high across the whole clip.
  const stream = target.captureStream(24)
  const recorder = new MediaRecorder(stream, {
    mimeType,
    // 20 Mbps at 1080p for a static image is effectively transparent —
    // previous 8 Mbps caused visible H.264 blocking on smooth gradients,
    // especially with the blurred background fill.
    videoBitsPerSecond: 20_000_000,
  })
  const chunks: Blob[] = []

  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  const done = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = (e) => reject(new Error(`Recorder error: ${(e as any).error?.message ?? e}`))
  })

  // Tickle the canvas on every frame so captureStream has something to pull.
  // Without this, some browsers emit a single frame and then go quiet.
  let tickleHandle: number | null = null
  const tickle = () => {
    composeReelFrame(target, sourceCanvas, options.blurBackground)
    tickleHandle = requestAnimationFrame(tickle)
  }
  tickle()

  recorder.start(100)
  await new Promise((r) => setTimeout(r, options.durationSec * 1000))
  recorder.stop()
  if (tickleHandle !== null) cancelAnimationFrame(tickleHandle)
  await done

  const blob = new Blob(chunks, { type: mimeType.split(';')[0] })
  downloadBlob(blob, `${baseName}_${Date.now()}.${ext}`)
}

/** Expose the ext that will actually be produced, for UI labelling */
export function getReelFileExt(): string {
  return pickRecorderMime().ext
}
