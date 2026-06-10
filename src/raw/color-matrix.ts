import type { DngMetadata } from './types'

// Apply DNG color matrix to convert from camera RGB to XYZ to sRGB
export function applyColorMatrix(data: Float32Array, metadata: DngMetadata): void {
  // Prefer ColorMatrix2 (calibration illuminant 2, almost always D65) over
  // ColorMatrix1 (illuminant 1, almost always Standard A / tungsten) — we
  // convert XYZ -> sRGB with a D65 matrix below, so the D65 calibration
  // gives more accurate hues for daylight shots.
  const cm = metadata.colorMatrix2.length >= 9 ? metadata.colorMatrix2 : metadata.colorMatrix1
  if (cm.length < 9) return

  // DNG ColorMatrix maps XYZ -> CameraRGB, so we need its inverse
  // ColorMatrix is 3x3 stored row-major: [Cr_x, Cr_y, Cr_z, Cg_x, Cg_y, Cg_z, Cb_x, Cb_y, Cb_z]
  const camToXyz = invertMatrix3x3([
    cm[0], cm[1], cm[2],
    cm[3], cm[4], cm[5],
    cm[6], cm[7], cm[8],
  ])

  if (!camToXyz) return

  // Apply white balance multipliers
  const wb = metadata.asShotNeutral
  const wbR = wb.length >= 3 ? 1 / wb[0] : 1
  const wbG = wb.length >= 3 ? 1 / wb[1] : 1
  const wbB = wb.length >= 3 ? 1 / wb[2] : 1

  // Normalize WB so green = 1
  const wbScale = wbG
  const wbMul = [wbR / wbScale, wbG / wbScale, wbB / wbScale]

  // XYZ to sRGB matrix (D65)
  const xyzToSrgb = [
    3.2404542, -1.5371385, -0.4985314,
    -0.9692660, 1.8760108, 0.0415560,
    0.0556434, -0.2040259, 1.0572252,
  ]

  // Combined matrix: camera RGB -> XYZ -> sRGB
  const combined = multiplyMatrix3x3(xyzToSrgb, camToXyz)

  // Anchor neutrals: after the WB multipliers a neutral patch is (1,1,1) in
  // camera space, but nothing guarantees this matrix maps (1,1,1) to sRGB
  // white — without normalization every gray picks up a color cast.
  // Normalize each row to sum to 1 (dcraw-style white-point anchoring).
  for (let row = 0; row < 3; row++) {
    const sum = combined[row * 3] + combined[row * 3 + 1] + combined[row * 3 + 2]
    if (Math.abs(sum) > 1e-6) {
      combined[row * 3] /= sum
      combined[row * 3 + 1] /= sum
      combined[row * 3 + 2] /= sum
    }
  }

  const pixelCount = data.length / 4
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    // Apply white balance
    const r = data[idx] * wbMul[0]
    const g = data[idx + 1] * wbMul[1]
    const b = data[idx + 2] * wbMul[2]

    // Apply combined color matrix
    data[idx] = Math.max(0, combined[0] * r + combined[1] * g + combined[2] * b)
    data[idx + 1] = Math.max(0, combined[3] * r + combined[4] * g + combined[5] * b)
    data[idx + 2] = Math.max(0, combined[6] * r + combined[7] * g + combined[8] * b)
    // alpha (idx+3) unchanged
  }
}

function invertMatrix3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-10) return null

  const invDet = 1 / det
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet,
  ]
}

function multiplyMatrix3x3(a: number[], b: number[]): number[] {
  return [
    a[0]*b[0] + a[1]*b[3] + a[2]*b[6], a[0]*b[1] + a[1]*b[4] + a[2]*b[7], a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
    a[3]*b[0] + a[4]*b[3] + a[5]*b[6], a[3]*b[1] + a[4]*b[4] + a[5]*b[7], a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
    a[6]*b[0] + a[7]*b[3] + a[8]*b[6], a[6]*b[1] + a[7]*b[4] + a[8]*b[7], a[6]*b[2] + a[7]*b[5] + a[8]*b[8],
  ]
}
