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

  // Data is already RGBA Float32Array (w*h*4) — upload directly
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.FLOAT, data)

  return tex
}

export function createEmptyTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  return createFloatTexture(gl, width, height, null)
}

// Expand single-channel mask data to RGBA for maximum GPU compatibility.
// R8 textures have known driver bugs on some mobile GPUs (Mali, Adreno)
// where normalized reads fail for 0/255 boundary values.
function expandMaskToRGBA(data: Uint8Array | null, size: number): Uint8Array {
  const rgba = new Uint8Array(size * 4)
  if (data) {
    for (let i = 0; i < size; i++) {
      const v = data[i]
      const j = i * 4
      rgba[j] = v
      rgba[j + 1] = v
      rgba[j + 2] = v
      rgba[j + 3] = 255
    }
  }
  return rgba
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

  // Use RGBA8 instead of R8 for universal GPU compatibility
  const rgba = expandMaskToRGBA(data, width * height)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)

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
  // Use full texImage2D (not texSubImage2D) for better mobile GPU compatibility
  const rgba = expandMaskToRGBA(data, width * height)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba)
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
