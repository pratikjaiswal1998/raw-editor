// Bayer demosaicing using bilinear interpolation
// CFA Pattern mapping: 0=Red, 1=Green, 2=Blue
// iPhone typically uses RGGB pattern: [0,1,1,2]

export function demosaic(
  raw: Float32Array,
  width: number,
  height: number,
  cfaPattern: number[],
): Float32Array {
  const output = new Float32Array(width * height * 3)

  // Determine which color each position in the 2x2 pattern represents
  // cfaPattern[0] = top-left, [1] = top-right, [2] = bottom-left, [3] = bottom-right
  const patternMap = new Uint8Array(4)
  for (let i = 0; i < 4; i++) {
    patternMap[i] = cfaPattern[i] || 0
  }

  function getColor(x: number, y: number): number {
    return patternMap[(y % 2) * 2 + (x % 2)]
  }

  function getRaw(x: number, y: number): number {
    x = Math.max(0, Math.min(width - 1, x))
    y = Math.max(0, Math.min(height - 1, y))
    return raw[y * width + x]
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 3
      const color = getColor(x, y)
      const value = getRaw(x, y)

      let r: number, g: number, b: number

      if (color === 0) {
        // Red pixel
        r = value
        // Green: average of 4 neighbors
        g = (getRaw(x - 1, y) + getRaw(x + 1, y) + getRaw(x, y - 1) + getRaw(x, y + 1)) / 4
        // Blue: average of 4 diagonal neighbors
        b = (getRaw(x - 1, y - 1) + getRaw(x + 1, y - 1) + getRaw(x - 1, y + 1) + getRaw(x + 1, y + 1)) / 4
      } else if (color === 2) {
        // Blue pixel
        b = value
        g = (getRaw(x - 1, y) + getRaw(x + 1, y) + getRaw(x, y - 1) + getRaw(x, y + 1)) / 4
        r = (getRaw(x - 1, y - 1) + getRaw(x + 1, y - 1) + getRaw(x - 1, y + 1) + getRaw(x + 1, y + 1)) / 4
      } else {
        // Green pixel
        g = value
        // Determine if we're in a red or blue row
        const leftColor = getColor(x - 1, y)
        const topColor = getColor(x, y - 1)

        if (leftColor === 0 || (x > 0 && getColor(x + 1, y) === 0)) {
          // Red is on the same row
          r = (getRaw(x - 1, y) + getRaw(x + 1, y)) / 2
          b = (getRaw(x, y - 1) + getRaw(x, y + 1)) / 2
        } else if (topColor === 0 || (y > 0 && getColor(x, y + 1) === 0)) {
          // Red is on the same column
          r = (getRaw(x, y - 1) + getRaw(x, y + 1)) / 2
          b = (getRaw(x - 1, y) + getRaw(x + 1, y)) / 2
        } else {
          r = (getRaw(x - 1, y) + getRaw(x + 1, y)) / 2
          b = (getRaw(x, y - 1) + getRaw(x, y + 1)) / 2
        }
      }

      output[idx] = Math.max(0, Math.min(1, r))
      output[idx + 1] = Math.max(0, Math.min(1, g))
      output[idx + 2] = Math.max(0, Math.min(1, b))
    }
  }

  return output
}
