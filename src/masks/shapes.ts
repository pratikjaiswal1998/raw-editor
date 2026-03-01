import type { MaskShape } from './types'

// Rasterize a mask shape to a grayscale buffer
export function rasterizeMask(
  shape: MaskShape,
  width: number,
  height: number,
): Uint8Array {
  const data = new Uint8Array(width * height)

  const cx = shape.x * width
  const cy = shape.y * height
  const sw = shape.width * width
  const sh = shape.height * height
  const rot = (shape.rotation * Math.PI) / 180
  const cosR = Math.cos(-rot)
  const sinR = Math.sin(-rot)
  const feather = Math.max(shape.feather * Math.max(width, height) * 0.1, 1)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Transform point to shape's local coordinate system
      const dx = x - cx
      const dy = y - cy
      const lx = dx * cosR - dy * sinR
      const ly = dx * sinR + dy * cosR

      let value: number

      switch (shape.type) {
        case 'rectangle': {
          const halfW = sw / 2
          const halfH = sh / 2
          const distX = Math.abs(lx) - halfW
          const distY = Math.abs(ly) - halfH
          const dist = Math.max(distX, distY)
          value = 1 - smoothstep(-feather, 0, dist)
          break
        }

        case 'ellipse': {
          const rx = sw / 2
          const ry = sh / 2
          if (rx <= 0 || ry <= 0) { value = 0; break }
          const ellipseDist = Math.sqrt((lx / rx) ** 2 + (ly / ry) ** 2) - 1
          const ellipseFeather = feather / Math.min(rx, ry)
          value = 1 - smoothstep(-ellipseFeather, 0, ellipseDist)
          break
        }

        case 'linear-gradient': {
          // Gradient goes from center - half width to center + half width
          const halfW = sw / 2
          if (halfW <= 0) { value = 0.5; break }
          const t = (lx + halfW) / sw
          value = smoothstep(0 - feather / sw, 1 + feather / sw, t)
          break
        }

        case 'radial-gradient': {
          const radius = Math.max(sw, sh) / 2
          if (radius <= 0) { value = 0; break }
          const dist = Math.sqrt(lx * lx + ly * ly)
          const innerRadius = radius * 0.3
          const t = (dist - innerRadius) / (radius - innerRadius)
          value = 1 - smoothstep(-feather / radius, 1 + feather / radius, t)
          break
        }

        default:
          value = 1
      }

      data[y * width + x] = Math.round(Math.max(0, Math.min(1, value)) * 255)
    }
  }

  return data
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
