import { createProgram, VERTEX_SHADER } from './shader-compiler'
import { createFloatTexture, createMaskTexture, createFramebuffer, updateMaskTexture, type Framebuffer } from './textures'
import type { GlobalAdjustments } from '../state/types'
import type { MaskAdjustments } from '../masks/types'
import layerAdjustmentsShader from './shaders/layer-adjustments.glsl?raw'
import adjustShader from './shaders/adjust.glsl?raw'
import compositeShader from './shaders/composite.glsl?raw'

// Poor-man's #include: both shaders declare a marker comment that we swap
// for the shared applyLayerAdjustments() implementation at module load.
const INCLUDE_MARKER = '//INCLUDE:layer-adjustments'
const injectLayerAdjustments = (src: string): string => src.replace(INCLUDE_MARKER, layerAdjustmentsShader)

const ADJUST_SHADER_SRC = injectLayerAdjustments(adjustShader)
const COMPOSITE_SHADER_SRC = injectLayerAdjustments(compositeShader)

// Uniform names for the shared adjustment stack — identical in both shaders.
const LAYER_UNIFORM_NAMES: string[] = [
  'uExposure', 'uContrast', 'uHighlights', 'uShadows',
  'uWhites', 'uBlacks', 'uTemperature', 'uTint', 'uVibrance', 'uSaturation',
  ...Array.from({ length: 8 }, (_, i) => `uHslHue[${i}]`),
  ...Array.from({ length: 8 }, (_, i) => `uHslSat[${i}]`),
  ...Array.from({ length: 8 }, (_, i) => `uHslLum[${i}]`),
  'uShadowsHue', 'uShadowsSat', 'uMidtonesHue', 'uMidtonesSat',
  'uHighlightsHue', 'uHighlightsSat',
]

export class RenderPipeline {
  private gl: WebGL2RenderingContext
  private adjustProgram: WebGLProgram
  private compositeProgram: WebGLProgram
  private originalTexture: WebGLTexture | null = null
  private adjustFbo: Framebuffer | null = null
  private composeFbo: Framebuffer | null = null
  private defaultMaskTexture: WebGLTexture | null = null
  private maskTextures: WebGLTexture[] = []
  private maskLayerData: Uint8Array[] = []
  private imageWidth = 0
  private imageHeight = 0
  private vao: WebGLVertexArrayObject
  private canvas: HTMLCanvasElement
  private adjustUniforms: Map<string, WebGLUniformLocation | null> = new Map()
  private compositeUniforms: Map<string, WebGLUniformLocation | null> = new Map()
  private histReadBuffer: Uint8Array | null = null

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

    // Required extensions for float textures
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')

    this.adjustProgram = createProgram(gl, VERTEX_SHADER, ADJUST_SHADER_SRC)
    this.compositeProgram = createProgram(gl, VERTEX_SHADER, COMPOSITE_SHADER_SRC)

    // Cache uniform locations to avoid per-frame lookups.
    const adjustUniformNames = ['uImage', 'uRotation', ...LAYER_UNIFORM_NAMES]
    this.cacheUniforms(this.adjustProgram, this.adjustUniforms, adjustUniformNames)

    const compositeUniformNames = [
      'uOriginal', 'uAdjusted', 'uMask', 'uHasMask', 'uInvertMask',
      'uSharpness', 'uRotation', 'uDirectSample', 'uFinalPass',
      ...LAYER_UNIFORM_NAMES,
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
    if (this.composeFbo) {
      gl.deleteFramebuffer(this.composeFbo.fbo)
      gl.deleteTexture(this.composeFbo.texture)
    }

    this.imageWidth = width
    this.imageHeight = height
    this.originalTexture = createFloatTexture(gl, width, height, data)
    this.adjustFbo = createFramebuffer(gl, width, height)
    this.composeFbo = createFramebuffer(gl, width, height)

    // Create a default all-white mask (for no-mask composite pass)
    const maskData = new Uint8Array(width * height).fill(255)
    if (this.defaultMaskTexture) gl.deleteTexture(this.defaultMaskTexture)
    this.defaultMaskTexture = createMaskTexture(gl, width, height, maskData)

    // Clear per-layer mask textures
    for (const tex of this.maskTextures) gl.deleteTexture(tex)
    this.maskTextures = []
    this.maskLayerData = []
  }

  updateMaskLayers(layers: Uint8Array[]): void {
    const gl = this.gl

    // Delete excess textures
    while (this.maskTextures.length > layers.length) {
      gl.deleteTexture(this.maskTextures.pop()!)
    }

    // Update existing or create new textures
    for (let i = 0; i < layers.length; i++) {
      if (i < this.maskTextures.length) {
        updateMaskTexture(gl, this.maskTextures[i], this.imageWidth, this.imageHeight, layers[i])
      } else {
        this.maskTextures.push(createMaskTexture(gl, this.imageWidth, this.imageHeight, layers[i]))
      }
    }

    // Store copies for full-res export
    this.maskLayerData = layers.map((l) => new Uint8Array(l))
  }

  render(
    adjustments: GlobalAdjustments,
    maskLayerAdjustments: MaskAdjustments[],
    canvasWidth: number,
    canvasHeight: number,
    showOriginal: boolean,
    rotation: number = 0,
  ): void {
    const gl = this.gl
    if (!this.originalTexture || !this.adjustFbo || !this.composeFbo || !this.defaultMaskTexture) return

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

    this.setLayerUniforms(this.adjustUniforms, adjustments)
    gl.uniform1i(this.adjustUniforms.get('uRotation')!, rotationSteps)

    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Pass 2+: Composite with mask layers (or no-mask finalize)
    gl.useProgram(this.compositeProgram)
    gl.bindVertexArray(this.vao)

    const numLayers = Math.min(this.maskTextures.length, maskLayerAdjustments.length)

    if (numLayers === 0) {
      // No masks — single final composite (sRGB + sharpening only)
      this.drawCompositePass(
        this.adjustFbo.texture, this.defaultMaskTexture,
        null, 0, adjustments.sharpness, rotationSteps, 1,
        null, canvasWidth, canvasHeight,
      )
    } else {
      // Multi-layer mask compositing with ping-pong FBOs
      let sourceTex = this.adjustFbo.texture
      const pingPong = [this.composeFbo, this.adjustFbo]

      for (let i = 0; i < numLayers; i++) {
        const isFinal = i === numLayers - 1

        this.drawCompositePass(
          sourceTex, this.maskTextures[i],
          maskLayerAdjustments[i], 1,
          adjustments.sharpness, rotationSteps, isFinal ? 1 : 0,
          isFinal ? null : pingPong[i % 2],
          canvasWidth, canvasHeight,
        )

        if (!isFinal) {
          sourceTex = pingPong[i % 2].texture
        }
      }
    }
  }

  // Draw a single composite pass to either an FBO or the screen
  private drawCompositePass(
    sourceTex: WebGLTexture,
    maskTex: WebGLTexture,
    maskAdj: MaskAdjustments | null,
    hasMask: number,
    sharpness: number,
    rotationSteps: number,
    finalPass: number,
    destFbo: Framebuffer | null,  // null = screen
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const gl = this.gl

    if (destFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, destFbo.fbo)
      gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      if (this.canvas.width !== canvasWidth || this.canvas.height !== canvasHeight) {
        this.canvas.width = canvasWidth
        this.canvas.height = canvasHeight
      }
      gl.viewport(0, 0, canvasWidth, canvasHeight)
    }

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.originalTexture!)
    gl.uniform1i(this.compositeUniforms.get('uOriginal')!, 0)

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(this.compositeUniforms.get('uAdjusted')!, 1)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(this.compositeUniforms.get('uMask')!, 2)

    gl.uniform1i(this.compositeUniforms.get('uHasMask')!, hasMask)
    gl.uniform1i(this.compositeUniforms.get('uInvertMask')!, 0)
    gl.uniform1f(this.compositeUniforms.get('uSharpness')!, sharpness)
    gl.uniform1i(this.compositeUniforms.get('uRotation')!, rotationSteps)
    gl.uniform1i(this.compositeUniforms.get('uDirectSample')!, 0)
    gl.uniform1i(this.compositeUniforms.get('uFinalPass')!, finalPass)

    this.setLayerUniforms(this.compositeUniforms, maskAdj)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  // Render at full resolution for export
  renderFullRes(
    adjustments: GlobalAdjustments,
    maskLayerAdjustments: MaskAdjustments[],
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

    // Recreate programs in new context (uses the same injected shader sources)
    const adjProg = createProgram(gl, VERTEX_SHADER, ADJUST_SHADER_SRC)
    const compProg = createProgram(gl, VERTEX_SHADER, COMPOSITE_SHADER_SRC)
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
    const rotationStepsExport = Math.round(rotation / 90) % 4

    // Pass 1: Global adjust
    gl.bindFramebuffer(gl.FRAMEBUFFER, adjFbo.fbo)
    gl.viewport(0, 0, this.imageWidth, this.imageHeight)
    gl.useProgram(adjProg)
    gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, origTex)
    gl.uniform1i(gl.getUniformLocation(adjProg, 'uImage'), 0)
    this.setLayerUniformsOnProgram(gl, adjProg, adjustments)
    gl.uniform1i(gl.getUniformLocation(adjProg, 'uRotation'), rotationStepsExport)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Create per-layer mask textures from stored raster data
    const numLayers = Math.min(this.maskLayerData.length, maskLayerAdjustments.length)
    const exportMaskTextures: WebGLTexture[] = []
    for (let i = 0; i < numLayers; i++) {
      exportMaskTextures.push(createMaskTexture(gl, this.imageWidth, this.imageHeight, this.maskLayerData[i]))
    }

    // Pass 2+: Composite with mask layers
    gl.useProgram(compProg)
    gl.bindVertexArray(vao)

    if (numLayers === 0) {
      // No masks — finalize with sRGB + sharpening
      const defaultMask = createMaskTexture(gl, this.imageWidth, this.imageHeight,
        new Uint8Array(this.imageWidth * this.imageHeight).fill(255))

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, this.imageWidth, this.imageHeight)
      this.setCompositePassOnProgram(gl, compProg, origTex, adjFbo.texture, defaultMask,
        null, 0, adjustments.sharpness, rotationStepsExport, 1)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.deleteTexture(defaultMask)
    } else {
      // Multi-layer compositing
      let sourceTex = adjFbo.texture
      const compFbo = numLayers > 1 ? createFramebuffer(gl, this.imageWidth, this.imageHeight) : null
      const pingPong = compFbo ? [compFbo, adjFbo] : [adjFbo]

      for (let i = 0; i < numLayers; i++) {
        const isFinal = i === numLayers - 1

        if (isFinal) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null)
          gl.viewport(0, 0, this.imageWidth, this.imageHeight)
        } else {
          const dest = pingPong[i % 2]
          gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo)
          gl.viewport(0, 0, this.imageWidth, this.imageHeight)
        }

        this.setCompositePassOnProgram(gl, compProg, origTex, sourceTex, exportMaskTextures[i],
          maskLayerAdjustments[i], 1, adjustments.sharpness, rotationStepsExport, isFinal ? 1 : 0)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        if (!isFinal) {
          sourceTex = pingPong[i % 2].texture
        }
      }

      if (compFbo) {
        gl.deleteFramebuffer(compFbo.fbo)
        gl.deleteTexture(compFbo.texture)
      }
    }

    // Cleanup export resources
    for (const tex of exportMaskTextures) gl.deleteTexture(tex)

    return exportCanvas
  }

  // Set all composite uniforms on a given program (for export context)
  private setCompositePassOnProgram(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    origTex: WebGLTexture,
    sourceTex: WebGLTexture,
    maskTex: WebGLTexture,
    maskAdj: MaskAdjustments | null,
    hasMask: number,
    sharpness: number,
    rotationSteps: number,
    finalPass: number,
  ): void {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, origTex)
    gl.uniform1i(gl.getUniformLocation(program, 'uOriginal'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, sourceTex)
    gl.uniform1i(gl.getUniformLocation(program, 'uAdjusted'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, maskTex)
    gl.uniform1i(gl.getUniformLocation(program, 'uMask'), 2)

    gl.uniform1i(gl.getUniformLocation(program, 'uHasMask'), hasMask)
    gl.uniform1i(gl.getUniformLocation(program, 'uInvertMask'), 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uSharpness'), sharpness)
    gl.uniform1i(gl.getUniformLocation(program, 'uRotation'), rotationSteps)
    gl.uniform1i(gl.getUniformLocation(program, 'uDirectSample'), 0)
    gl.uniform1i(gl.getUniformLocation(program, 'uFinalPass'), finalPass)

    this.setLayerUniformsOnProgram(gl, program, maskAdj)
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
    gl.bindTexture(gl.TEXTURE_2D, this.defaultMaskTexture!)
    gl.uniform1i(this.compositeUniforms.get('uMask')!, 2)
    gl.uniform1i(this.compositeUniforms.get('uHasMask')!, 0)
    gl.uniform1i(this.compositeUniforms.get('uInvertMask')!, 0)
    gl.uniform1f(this.compositeUniforms.get('uSharpness')!, 0)
    gl.uniform1i(this.compositeUniforms.get('uRotation')!, rotationSteps)
    gl.uniform1i(this.compositeUniforms.get('uDirectSample')!, 1)
    gl.uniform1i(this.compositeUniforms.get('uFinalPass')!, 1)
    this.setLayerUniforms(this.compositeUniforms, null)

    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  readHistogramData(): { r: Uint32Array; g: Uint32Array; b: Uint32Array } {
    const gl = this.gl
    // Read the entire drawing buffer — the canvas backing store contains only
    // the image (no letterbox), so a full read is representative. A fixed-size
    // corner read crops the image and can sample out-of-bounds black.
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight

    const byteLen = w * h * 4
    if (!this.histReadBuffer || this.histReadBuffer.length !== byteLen) {
      this.histReadBuffer = new Uint8Array(byteLen)
    }
    const pixels = this.histReadBuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    const r = new Uint32Array(256)
    const g = new Uint32Array(256)
    const b = new Uint32Array(256)

    // Point-sample at a pixel stride so we accumulate at most ~256k samples;
    // point sampling keeps the histogram a true sample of the distribution
    // (unlike averaging, which suppresses the extremes).
    const pixelStep = Math.max(1, Math.floor((w * h) / (512 * 512)))
    const step = pixelStep * 4

    for (let i = 0; i < pixels.length; i += step) {
      r[pixels[i]]++
      g[pixels[i + 1]]++
      b[pixels[i + 2]]++
    }

    return { r, g, b }
  }

  // Shared layer-uniform setter — drives both adjust and composite programs.
  // `adj === null` zeroes everything (for no-mask compositing and renderOriginal).
  private setLayerUniforms(cache: Map<string, WebGLUniformLocation | null>, adj: GlobalAdjustments | null): void {
    const gl = this.gl
    gl.uniform1f(cache.get('uExposure')!, adj?.exposure ?? 0)
    gl.uniform1f(cache.get('uContrast')!, adj?.contrast ?? 0)
    gl.uniform1f(cache.get('uHighlights')!, adj?.highlights ?? 0)
    gl.uniform1f(cache.get('uShadows')!, adj?.shadows ?? 0)
    gl.uniform1f(cache.get('uWhites')!, adj?.whites ?? 0)
    gl.uniform1f(cache.get('uBlacks')!, adj?.blacks ?? 0)
    gl.uniform1f(cache.get('uTemperature')!, adj?.temperature ?? 0)
    gl.uniform1f(cache.get('uTint')!, adj?.tint ?? 0)
    gl.uniform1f(cache.get('uVibrance')!, adj?.vibrance ?? 0)
    gl.uniform1f(cache.get('uSaturation')!, adj?.saturation ?? 0)

    for (let i = 0; i < 8; i++) {
      gl.uniform1f(cache.get(`uHslHue[${i}]`)!, adj?.hslHue?.[i] ?? 0)
      gl.uniform1f(cache.get(`uHslSat[${i}]`)!, adj?.hslSaturation?.[i] ?? 0)
      gl.uniform1f(cache.get(`uHslLum[${i}]`)!, adj?.hslLuminance?.[i] ?? 0)
    }

    gl.uniform1f(cache.get('uShadowsHue')!, adj?.shadowsHue ?? 0)
    gl.uniform1f(cache.get('uShadowsSat')!, adj?.shadowsSat ?? 0)
    gl.uniform1f(cache.get('uMidtonesHue')!, adj?.midtonesHue ?? 0)
    gl.uniform1f(cache.get('uMidtonesSat')!, adj?.midtonesSat ?? 0)
    gl.uniform1f(cache.get('uHighlightsHue')!, adj?.highlightsHue ?? 0)
    gl.uniform1f(cache.get('uHighlightsSat')!, adj?.highlightsSat ?? 0)
  }

  // Uniform setter for the export context (no uniform cache available —
  // programs are created fresh on a one-shot GL context).
  private setLayerUniformsOnProgram(gl: WebGL2RenderingContext, program: WebGLProgram, adj: GlobalAdjustments | null): void {
    gl.uniform1f(gl.getUniformLocation(program, 'uExposure'), adj?.exposure ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uContrast'), adj?.contrast ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uHighlights'), adj?.highlights ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uShadows'), adj?.shadows ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uWhites'), adj?.whites ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uBlacks'), adj?.blacks ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uTemperature'), adj?.temperature ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uTint'), adj?.tint ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uVibrance'), adj?.vibrance ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uSaturation'), adj?.saturation ?? 0)

    for (let i = 0; i < 8; i++) {
      gl.uniform1f(gl.getUniformLocation(program, `uHslHue[${i}]`), adj?.hslHue?.[i] ?? 0)
      gl.uniform1f(gl.getUniformLocation(program, `uHslSat[${i}]`), adj?.hslSaturation?.[i] ?? 0)
      gl.uniform1f(gl.getUniformLocation(program, `uHslLum[${i}]`), adj?.hslLuminance?.[i] ?? 0)
    }

    gl.uniform1f(gl.getUniformLocation(program, 'uShadowsHue'), adj?.shadowsHue ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uShadowsSat'), adj?.shadowsSat ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMidtonesHue'), adj?.midtonesHue ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uMidtonesSat'), adj?.midtonesSat ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uHighlightsHue'), adj?.highlightsHue ?? 0)
    gl.uniform1f(gl.getUniformLocation(program, 'uHighlightsSat'), adj?.highlightsSat ?? 0)
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
    if (this.composeFbo) {
      gl.deleteFramebuffer(this.composeFbo.fbo)
      gl.deleteTexture(this.composeFbo.texture)
    }
    if (this.defaultMaskTexture) gl.deleteTexture(this.defaultMaskTexture)
    for (const tex of this.maskTextures) gl.deleteTexture(tex)
    gl.deleteProgram(this.adjustProgram)
    gl.deleteProgram(this.compositeProgram)
    gl.deleteVertexArray(this.vao)
  }
}
