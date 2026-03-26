import { createProgram, VERTEX_SHADER } from './shader-compiler'
import { createFloatTexture, createMaskTexture, createFramebuffer, updateMaskTexture, type Framebuffer } from './textures'
import type { GlobalAdjustments } from '../state/types'
import type { MaskAdjustments } from '../masks/types'
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
  private adjustUniforms: Map<string, WebGLUniformLocation | null> = new Map()
  private compositeUniforms: Map<string, WebGLUniformLocation | null> = new Map()

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

    // Cache uniform locations to avoid per-frame lookups
    const adjustUniformNames = [
      'uImage', 'uExposure', 'uContrast', 'uHighlights', 'uShadows',
      'uWhites', 'uBlacks', 'uTemperature', 'uTint', 'uVibrance', 'uSaturation',
      ...Array.from({ length: 8 }, (_, i) => `uHslHue[${i}]`),
      ...Array.from({ length: 8 }, (_, i) => `uHslSat[${i}]`),
      ...Array.from({ length: 8 }, (_, i) => `uHslLum[${i}]`),
      'uShadowsHue', 'uShadowsSat', 'uMidtonesHue', 'uMidtonesSat',
      'uHighlightsHue', 'uHighlightsSat', 'uRotation',
    ]
    this.cacheUniforms(this.adjustProgram, this.adjustUniforms, adjustUniformNames)

    const compositeUniformNames = [
      'uOriginal', 'uAdjusted', 'uMask', 'uHasMask', 'uInvertMask',
      'uSharpness', 'uRotation', 'uDirectSample',
      'uMaskExposure', 'uMaskContrast', 'uMaskHighlights', 'uMaskShadows',
      'uMaskWhites', 'uMaskBlacks', 'uMaskTemperature', 'uMaskTint',
      'uMaskSaturation', 'uMaskVibrance',
    ]
    this.cacheUniforms(this.compositeProgram, this.compositeUniforms, compositeUniformNames)

    // Empty VAO for full-screen triangle
    this.vao = gl.createVertexArray()!
  }

  private cacheUniforms(program: WebGLProgram, cache: Map<string, WebGLUniformLocation | null>, names: string[]): void {
    for (const name of names) {
      cache.set(name, this.gl.getUniformLocation(program, name))
    }
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
    hasMasks: boolean,
    canvasWidth: number,
    canvasHeight: number,
    showOriginal: boolean,
    rotation: number = 0,
    maskAdjustments: MaskAdjustments | null = null,
  ): void {
    const gl = this.gl
    if (!this.originalTexture || !this.adjustFbo || !this.maskTexture) return

    const rotationSteps = Math.round(rotation / 90) % 4

    if (showOriginal) {
      this.renderOriginal(canvasWidth, canvasHeight, rotationSteps)
      return
    }

    // Pass 1: Apply global adjustments (render to adjustFbo)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.adjustFbo.fbo)
    gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    gl.useProgram(this.adjustProgram)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture)
    gl.uniform1i(this.adjustUniforms.get('uImage')!, 0)

    this.setAdjustmentUniforms(adjustments)
    gl.uniform1i(this.adjustUniforms.get('uRotation')!, rotationSteps)

    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2: Composite (render to screen) — mask adjustments applied in shader
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth
      this.canvas.height = canvasHeight
    }
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.useProgram(this.compositeProgram)
    gl.bindVertexArray(this.vao)

    // Bind original
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture)
    gl.uniform1i(this.compositeUniforms.get('uOriginal')!, 0)

    // Bind global-adjusted
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.adjustFbo.texture)
    gl.uniform1i(this.compositeUniforms.get('uAdjusted')!, 1)

    // Bind mask
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
    gl.uniform1i(this.compositeUniforms.get('uMask')!, 2)

    const hasMaskAdj = hasMasks && maskAdjustments !== null
    gl.uniform1i(this.compositeUniforms.get('uHasMask')!, hasMaskAdj ? 1 : 0)
    gl.uniform1i(this.compositeUniforms.get('uInvertMask')!, 0)
    gl.uniform1f(this.compositeUniforms.get('uSharpness')!, adjustments.sharpness)
    gl.uniform1i(this.compositeUniforms.get('uRotation')!, rotationSteps)
    gl.uniform1i(this.compositeUniforms.get('uDirectSample')!, 0)

    // Set mask adjustment uniforms
    this.setMaskUniforms(maskAdjustments)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // Render at full resolution for export
  renderFullRes(
    adjustments: GlobalAdjustments,
    hasMasks: boolean,
    rotation: number = 0,
    maskAdjustments: MaskAdjustments | null = null,
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

    const origTex = createFloatTexture(gl, this.imageWidth, this.imageHeight, pixels)
    const adjFbo = createFramebuffer(gl, this.imageWidth, this.imageHeight)

    // Copy mask
    const maskData = new Uint8Array(this.imageWidth * this.imageHeight)
    const maskFboRead = mainGl.createFramebuffer()!
    mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, maskFboRead)
    mainGl.framebufferTexture2D(mainGl.FRAMEBUFFER, mainGl.COLOR_ATTACHMENT0, mainGl.TEXTURE_2D, this.maskTexture!, 0)
    mainGl.readPixels(0, 0, this.imageWidth, this.imageHeight, mainGl.RED, mainGl.UNSIGNED_BYTE, maskData)
    mainGl.bindFramebuffer(mainGl.FRAMEBUFFER, null)
    mainGl.deleteFramebuffer(maskFboRead)

    const maskTex = createMaskTexture(gl, this.imageWidth, this.imageHeight, maskData)
    const rotationStepsExport = Math.round(rotation / 90) % 4

    // Pass 1: Global adjust
    gl.bindFramebuffer(gl.FRAMEBUFFER, adjFbo.fbo)
    gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    gl.useProgram(adjProg)
    gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, origTex)
    gl.uniform1i(gl.getUniformLocation(adjProg, 'uImage'), 0)
    this.setAdjustmentUniformsOnProgram(gl, adjProg, adjustments)
    gl.uniform1i(gl.getUniformLocation(adjProg, 'uRotation'), rotationStepsExport)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2: Composite with mask adjustments
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
    const hasMaskAdj = hasMasks && maskAdjustments !== null
    gl.uniform1i(gl.getUniformLocation(compProg, 'uHasMask'), hasMaskAdj ? 1 : 0)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uInvertMask'), 0)
    gl.uniform1f(gl.getUniformLocation(compProg, 'uSharpness'), adjustments.sharpness)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uRotation'), rotationStepsExport)
    gl.uniform1i(gl.getUniformLocation(compProg, 'uDirectSample'), 0)
    this.setMaskUniformsOnProgram(gl, compProg, maskAdjustments)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    return exportCanvas
  }

  // Render just the original with sRGB gamma (for before/after)
  private renderOriginal(canvasWidth: number, canvasHeight: number, rotationSteps: number = 0): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
      this.canvas.width = canvasWidth
      this.canvas.height = canvasHeight
    }
    gl.viewport(0, 0, canvasWidth, canvasHeight)
    gl.useProgram(this.compositeProgram)
    gl.bindVertexArray(this.vao)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture!)
    gl.uniform1i(this.compositeUniforms.get('uOriginal')!, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture!)
    gl.uniform1i(this.compositeUniforms.get('uAdjusted')!, 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture!)
    gl.uniform1i(this.compositeUniforms.get('uMask')!, 2)
    gl.uniform1i(this.compositeUniforms.get('uHasMask')!, 0)
    gl.uniform1i(this.compositeUniforms.get('uInvertMask')!, 0)
    gl.uniform1f(this.compositeUniforms.get('uSharpness')!, 0)
    gl.uniform1i(this.compositeUniforms.get('uRotation')!, rotationSteps)
    gl.uniform1i(this.compositeUniforms.get('uDirectSample')!, 1)
    this.setMaskUniforms(null)

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

  private setAdjustmentUniforms(adj: GlobalAdjustments): void {
    const gl = this.gl
    gl.uniform1f(this.adjustUniforms.get('uExposure')!, adj.exposure)
    gl.uniform1f(this.adjustUniforms.get('uContrast')!, adj.contrast)
    gl.uniform1f(this.adjustUniforms.get('uHighlights')!, adj.highlights)
    gl.uniform1f(this.adjustUniforms.get('uShadows')!, adj.shadows)
    gl.uniform1f(this.adjustUniforms.get('uWhites')!, adj.whites)
    gl.uniform1f(this.adjustUniforms.get('uBlacks')!, adj.blacks)
    gl.uniform1f(this.adjustUniforms.get('uTemperature')!, adj.temperature)
    gl.uniform1f(this.adjustUniforms.get('uTint')!, adj.tint)
    gl.uniform1f(this.adjustUniforms.get('uVibrance')!, adj.vibrance)
    gl.uniform1f(this.adjustUniforms.get('uSaturation')!, adj.saturation)

    for (let i = 0; i < 8; i++) {
      gl.uniform1f(this.adjustUniforms.get(`uHslHue[${i}]`)!, adj.hslHue[i])
      gl.uniform1f(this.adjustUniforms.get(`uHslSat[${i}]`)!, adj.hslSaturation[i])
      gl.uniform1f(this.adjustUniforms.get(`uHslLum[${i}]`)!, adj.hslLuminance[i])
    }

    // Color grading
    gl.uniform1f(this.adjustUniforms.get('uShadowsHue')!, adj.shadowsHue)
    gl.uniform1f(this.adjustUniforms.get('uShadowsSat')!, adj.shadowsSat)
    gl.uniform1f(this.adjustUniforms.get('uMidtonesHue')!, adj.midtonesHue)
    gl.uniform1f(this.adjustUniforms.get('uMidtonesSat')!, adj.midtonesSat)
    gl.uniform1f(this.adjustUniforms.get('uHighlightsHue')!, adj.highlightsHue)
    gl.uniform1f(this.adjustUniforms.get('uHighlightsSat')!, adj.highlightsSat)
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

  private setMaskUniforms(mask: MaskAdjustments | null): void {
    const gl = this.gl
    gl.uniform1f(this.compositeUniforms.get('uMaskExposure')!, mask?.exposure ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskContrast')!, mask?.contrast ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskHighlights')!, mask?.highlights ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskShadows')!, mask?.shadows ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskWhites')!, mask?.whites ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskBlacks')!, mask?.blacks ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskTemperature')!, mask?.temperature ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskTint')!, mask?.tint ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskSaturation')!, mask?.saturation ?? 0)
    gl.uniform1f(this.compositeUniforms.get('uMaskVibrance')!, mask?.vibrance ?? 0)
  }

  private setMaskUniformsOnProgram(gl: WebGL2RenderingContext, program: WebGLProgram, mask: MaskAdjustments | null): void {
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskExposure'), mask?.exposure ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskContrast'), mask?.contrast ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskHighlights'), mask?.highlights ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskShadows'), mask?.shadows ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskWhites'), mask?.whites ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskBlacks'), mask?.blacks ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskTemperature'), mask?.temperature ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskTint'), mask?.tint ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskSaturation'), mask?.saturation ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMaskVibrance'), mask?.vibrance ?? 0)
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
