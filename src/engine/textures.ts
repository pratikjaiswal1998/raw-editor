export function createFloatTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Float32Array | null,
): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')

  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  // Try RGBA16F first (better compatibility), fallback to RGBA32F
  const ext = gl.getExtension('EXT_color_buffer_float')
  if (!ext) {
    console.warn('EXT_color_buffer_float not available')
  }

  // Convert RGB float data to RGBA
  let rgba: Float32Array | null = null
  if (data) {
    const pixelCount = width * height
    rgba = new Float32Array(pixelCount * 4)
    for (let i = 0; i < pixelCount; i++) {
      rgba[i * 4] = data[i * 3]
      rgba[i * 4 + 1] = data[i * 3 + 1]
      rgba[i * 4 + 2] = data[i * 3 + 2]
      rgba[i * 4 + 3] = 1.0
    }
  }

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, rgba)

  return tex
}

export function createEmptyTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  return createFloatTexture(gl, width, height, null)
}

export function createMaskTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  data: Uint8Array | null,
): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')

  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, data)

  return tex
}

export function updateMaskTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
  data: Uint8Array,
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, data)
}

export interface Framebuffer {
  fbo: WebGLFramebuffer
  texture: WebGLTexture
}

export function createFramebuffer(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): Framebuffer {
  const texture = createEmptyTexture(gl, width, height)
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('Failed to create framebuffer')

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer not complete: ${status}`)
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  return { fbo, texture }
}
