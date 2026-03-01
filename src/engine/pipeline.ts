import { createProgram, VERTEX_SHADER } from './shader-compiler'
import { createFloatTexture, createMaskTexture, createFramebuffer, updateMaskTexture, type Framebuffer } from './textures'
import type { GlobalAdjustments } from '../state/types'
import type { Mask } from '../masks/types'
import adjustShader from './shaders/adjust.glsl?raw'
import compositeShader from './shaders/composite.glsl?raw'

export class RenderPipeline {
  private gl: WebGL2RenderingContext
  private adjustProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private originalTexture: WebGLTexture | null = null
  private adjustFbo: Framebuffer | null = null
  private maskTexture: WebGLTexture | null = null
  private imageWidth = 0
  private imageHeight = 0
  private vao: WebGLVertexArrayObject
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    })
    if (!gl) throw new Error('WebGL 2 not supported')
    this.gl = gl

    // Required extension for float textures
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    this.adjustProgram = createProgram(gl, VERTEX_SHADER, adjustShader)
    this.compositeProgram = createProgram(gl, VERTEX_SHADER, compositeShader)

    // Empty VAO for full-screen triangle
    this.vao = gl.createVertexArray()!
  }

  uploadImage(data: Float32Array, width: number, height: number): void {
    const gl = this.gl

    // Clean up old resources
    if (this.originalTexture) gl.deleteTexture(this.originalTexture)
    if (this.adjustFbo) {
      gl.deleteFramebuffer(this.adjustFbo.fbo)
      gl.deleteTexture(this.adjustFbo.texture)
    }

    this.imageWidth = width
    this.imageHeight = height
    this.originalTexture = createFloatTexture(gl, width, height, data)
    this.adjustFbo = createFramebuffer(gl, width, height)

    // Create a default all-white mask
    const maskData = new Uint8Array(width * height).fill(255)
    if (this.maskTexture) gl.deleteTexture(this.maskTexture)
    this.maskTexture = createMaskTexture(gl, width, height, maskData)
  }

  updateMask(maskData: Uint8Array): void {
    if (!this.maskTexture) return
    updateMaskTexture(this.gl, this.maskTexture, this.imageWidth, this.imageHeight, maskData)
  }

  render(
    adjustments: GlobalAdjustments,
    activeMask: Mask | null,
    canvasWidth: number,
    canvasHeight: number,
    showOriginal: boolean,
    rotation: number = 0,
  ): void {
    const gl = this.gl
    if (!this.originalTexture || !this.adjustFbo || !this.maskTexture) return

    const rotationSteps = Math.round(rotation / 90) % 4

    if (showOriginal) {
      this.renderOriginal(canvasWidth, canvasHeight, rotationSteps)
      return
    }

    // Pass 1: Apply adjustments (render to FBO)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.adjustFbo.fbo)
    gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    gl.useProgram(this.adjustProgram)
    gl.bindVertexArray(this.vao)

    // Bind original image
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture)
    gl.uniform1i(gl.getUniformLocation(this.adjustProgram, 'uImage'), 0)

    // Set adjustment uniforms
    this.setAdjustmentUniforms(this.adjustProgram, adjustments)
    // Set rotation
    gl.uniform1i(gl.getUniformLocation(this.adjustProgram, 'uRotation'), rotationSteps)

    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2: Composite (render to screen)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.canvas.width = canvasWidth
    this.canvas.height = canvasHeight
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.useProgram(this.compositeProgram)
    gl.bindVertexArray(this.vao)

    // Bind original
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uOriginal'), 0)

    // Bind adjusted
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.adjustFbo.texture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uAdjusted'), 1)

    // Bind mask
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMask'), 2)

    const hasMask = activeMask !== null
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uHasMask'), hasMask ? 1 : 0)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uInvertMask'), hasMask && activeMask.inverted ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'uSharpness'), adjustments.sharpness)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uRotation'), rotationSteps)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uDirectSample'), 0) // FBO output, already oriented

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // Render at full resolution for export
  renderFullRes(
    adjustments: GlobalAdjustments,
    activeMask: Mask | null,
    rotation: number = 0,
  ): HTMLCanvasElement {
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = this.imageWidth
    exportCanvas.height = this.imageHeight

    const gl = exportCanvas.getContext('webgl2', {
      alpha: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    })
    if (!gl) throw new Error('WebGL 2 not available for export')

    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    // Recreate programs in new context
    const adjProg = createProgram(gl, VERTEX_SHADER, adjustShader)
    const compProg = createProgram(gl, VERTEX_SHADER, compositeShader)
    const vao = gl.createVertexArray()!

    // Read back original data from main context
    const mainGl = this.gl
    const fbo = mainGl.createFramebuffer()!
    mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, fbo)
    mainGl.framebufferTexture2D(mainGl.FRAMEBUFFER, mainGl.COLOR_ATTACHMENT0, mainGl.TEXTURE_2D, this.originalTexture!, 0)
    const pixels = new Float32Array(this.imageWidth * this.imageHeight * 4)
    mainGl.readPixels(0, 0, this.imageWidth, this.imageHeight, mainGl.RGBA, mainGl.FLOAT, pixels)
    mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, null)
    mainGl.deleteFramebuffer(fbo)

    // Convert RGBA back to RGB for upload
    const rgb = new Float32Array(this.imageWidth * this.imageHeight * 3)
    for (let i = 0; i < this.imageWidth * this.imageHeight; i++) {
      rgb[i * 3] = pixels[i * 4]
      rgb[i * 3 + 1] = pixels[i * 4 + 1]
      rgb[i * 3 + 2] = pixels[i * 4 + 2]
    }

    const origTex = createFloatTexture(gl, this.imageWidth, this.imageHeight, rgb)
    const adjFbo = createFramebuffer(gl, this.imageWidth, this.imageHeight)

    // Copy mask
    const maskData = new Uint8Array(this.imageWidth * this.imageHeight)
    // Read mask from main context
    const maskFbo = mainGl.createFramebuffer()!
    mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, maskFbo)
    mainGl.framebufferTexture2D(mainGl.FRAMEBUFFER, mainGl.COLOR_ATTACHMENT0, mainGl.TEXTURE_2D, this.maskTexture!, 0)
    mainGl.readPixels(0, 0, this.imageWidth, this.imageHeight, mainGl.RED, mainGl.UNSIGNED_BYTE, maskData)
    mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, null)
    mainGl.deleteFramebuffer(maskFbo)

    const maskTex = createMaskTexture(gl, this.imageWidth, this.imageHeight, maskData)

    // Pass 1: Adjust
    gl.bindFramebuffer(gl.FRAMEBUFFER, adjFbo.fbo)
    gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    gl.useProgram(adjProg)
    gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, origTex)
    const rotationStepsExport = Math.round(rotation / 90) % 4
    gl.uniform1i(gl.getUniformLocation(adjProg, 'uImage'), 0)
    this.setAdjustmentUniformsOnProgram(gl, adjProg, adjustments)
    gl.uniform1i(gl.getUniformLocation(adjProg, 'uRotation'), rotationStepsExport)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2: Composite
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    gl.useProgram(compProg)
    gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, origTex)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uOriginal'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, adjFbo.texture)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uAdjusted'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uMask'), 2)
    const hasMask = activeMask !== null
    gl.uniform1i(gl.getUniformLocation(compProg, 'uHasMask'), hasMask ? 1 : 0)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uInvertMask'), hasMask && activeMask.inverted ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(compProg, 'uSharpness'), adjustments.sharpness)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uRotation'), rotationStepsExport)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uDirectSample'), 0) // FBO output
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    return exportCanvas
  }

  // Render just the original with sRGB gamma (for before/after)
  private renderOriginal(canvasWidth: number, canvasHeight: number, rotationSteps: number = 0): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.canvas.width = canvasWidth
    this.canvas.height = canvasHeight
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.useProgram(this.compositeProgram)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture!)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uOriginal'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture!)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uAdjusted'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture!)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uMask'), 2)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uHasMask'), 0)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uInvertMask'), 0)
    gl.uniform1f(gl.getUniformLocation(this.compositeProgram, 'uSharpness'), 0)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uRotation'), rotationSteps)
    gl.uniform1i(gl.getUniformLocation(this.compositeProgram, 'uDirectSample'), 1) // Raw texture, needs flip+rotation

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  readHistogramData(): { r: Uint32Array; g: Uint32Array; b: Uint32Array } {
    const gl = this.gl
    const w = Math.min(this.imageWidth, 512)
    const h = Math.min(this.imageHeight, 512)

    // Read back a downsampled version of the display
    const pixels = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    const r = new Uint32Array(256)
    const g = new Uint32Array(256)
    const b = new Uint32Array(256)

    for (let i = 0; i < pixels.length; i += 4) {
      r[pixels[i]]++
      g[pixels[i + 1]]++
      b[pixels[i + 2]]++
    }

    return { r, g, b }
  }

  private setAdjustmentUniforms(program: WebGLProgram, adj: GlobalAdjustments): void {
    this.setAdjustmentUniformsOnProgram(this.gl, program, adj)
  }

  private setAdjustmentUniformsOnProgram(gl: WebGL2RenderingContext, program: WebGLProgram, adj: GlobalAdjustments): void {
    gl.uniform1f(gl.getUniformLocation(program, 'uExposure'), adj.exposure)
    gl.uniform1f(gl.getUniformLocation(program, 'uContrast'), adj.contrast)
    gl.uniform1f(gl.getUniformLocation(program, 'uHighlights'), adj.highlights)
    gl.uniform1f(gl.getUniformLocation(program, 'uShadows'), adj.shadows)
    gl.uniform1f(gl.getUniformLocation(program, 'uWhites'), adj.whites)
    gl.uniform1f(gl.getUniformLocation(program, 'uBlacks'), adj.blacks)
    gl.uniform1f(gl.getUniformLocation(program, 'uTemperature'), adj.temperature)
    gl.uniform1f(gl.getUniformLocation(program, 'uTint'), adj.tint)
    gl.uniform1f(gl.getUniformLocation(program, 'uVibrance'), adj.vibrance)
    gl.uniform1f(gl.getUniformLocation(program, 'uSaturation'), adj.saturation)

    for (let i = 0; i < 8; i++) {
      gl.uniform1f(gl.getUniformLocation(program, `uHslHue[${i}]`), adj.hslHue[i])
      gl.uniform1f(gl.getUniformLocation(program, `uHslSat[${i}]`), adj.hslSaturation[i])
      gl.uniform1f(gl.getUniformLocation(program, `uHslLum[${i}]`), adj.hslLuminance[i])
    }

    // Color grading
    gl.uniform1f(gl.getUniformLocation(program, 'uShadowsHue'), adj.shadowsHue)
    gl.uniform1f(gl.getUniformLocation(program, 'uShadowsSat'), adj.shadowsSat)
    gl.uniform1f(gl.getUniformLocation(program, 'uMidtonesHue'), adj.midtonesHue)
    gl.uniform1f(gl.getUniformLocation(program, 'uMidtonesSat'), adj.midtonesSat)
    gl.uniform1f(gl.getUniformLocation(program, 'uHighlightsHue'), adj.highlightsHue)
    gl.uniform1f(gl.getUniformLocation(program, 'uHighlightsSat'), adj.highlightsSat)
  }

  getImageDimensions(): { width: number; height: number } {
    return { width: this.imageWidth, height: this.imageHeight }
  }

  destroy(): void {
    const gl = this.gl
    if (this.originalTexture) gl.deleteTexture(this.originalTexture)
    if (this.adjustFbo) {
      gl.deleteFramebuffer(this.adjustFbo.fbo)
      gl.deleteTexture(this.adjustFbo.texture)
    }
    if (this.maskTexture) gl.deleteTexture(this.maskTexture)
    gl.deleteProgram(this.adjustProgram)
    gl.deleteProgram(this.compositeProgram)
    gl.deleteVertexArray(this.vao)
  }
}
