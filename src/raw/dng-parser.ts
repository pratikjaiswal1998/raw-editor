import {
  type DngMetadata, type TiffIfd, type TiffEntry, type RawImage,
  TIFF_TAGS, TIFF_TYPE_SIZES,
} from './types'
import { demosaic } from './demosaic'
import { applyColorMatrix } from './color-matrix'

export async function parseDng(buffer: ArrayBuffer): Promise<RawImage> {
  const view = new DataView(buffer)
  const byteOrder = view.getUint16(0)
  const littleEndian = byteOrder === 0x4949 // 'II'

  const magic = view.getUint16(2, littleEndian)
  if (magic !== 42) throw new Error('Not a valid TIFF/DNG file')

  const firstIfdOffset = view.getUint32(4, littleEndian)
  const ifds = parseAllIfds(view, firstIfdOffset, littleEndian, buffer)

  // Find the full-resolution IFD (usually a SubIFD or the main IFD with largest dimensions)
  const rawIfd = findRawIfd(ifds)
  if (!rawIfd) throw new Error('Could not find raw image data in DNG')

  const metadata = extractMetadata(rawIfd, ifds[0], view, littleEndian)

  // Try to decode raw data
  let imageData: Float32Array
  const compression = metadata.compression

  if (compression === 1) {
    // Uncompressed
    imageData = readUncompressed(view, metadata, littleEndian)
  } else if (compression === 7 || compression === 34892) {
    // JPEG lossless or lossy - try lossless JPEG decode
    imageData = decodeLosslessJpeg(buffer, metadata)
  } else if (compression === 8 || compression === 32946) {
    // Deflate/zlib
    imageData = await readDeflateCompressed(buffer, metadata)
  } else {
    // Fallback: try to load embedded preview
    throw new Error(`Unsupported compression: ${compression}. Try loading as regular image.`)
  }

  // If mosaic (Bayer) data, demosaic it
  if (!metadata.isLinearDng && metadata.samplesPerPixel === 1) {
    imageData = demosaic(imageData, metadata.width, metadata.height, metadata.cfaPattern)
  }

  // Apply color matrix
  if (metadata.colorMatrix1.length > 0) {
    applyColorMatrix(imageData, metadata)
  }

  return {
    data: imageData,
    width: metadata.width,
    height: metadata.height,
    metadata,
  }
}

// Also support loading regular image files (JPEG, PNG) as fallback
export async function loadImageFile(file: File): Promise<RawImage> {
  const ext = file.name.toLowerCase().split('.').pop()

  if (ext === 'dng') {
    const buffer = await file.arrayBuffer()

    // Try 1: Full raw DNG parsing
    try {
      return await parseDng(buffer)
    } catch (e) {
      console.warn('DNG raw decode failed:', e)
    }

    // Try 2: Extract embedded JPEG preview from DNG
    try {
      const jpegBlob = extractEmbeddedJpeg(buffer)
      if (jpegBlob) {
        console.log('Using embedded JPEG preview from DNG')
        return await loadImageFromBlob(jpegBlob)
      }
    } catch (e) {
      console.warn('DNG embedded JPEG extraction failed:', e)
    }

    throw new Error('Could not decode DNG file. The compression format may not be supported.')
  }

  return loadAsRegularImage(file)
}

// Extract the embedded JPEG preview from a DNG file
function extractEmbeddedJpeg(buffer: ArrayBuffer): Blob | null {
  const data = new Uint8Array(buffer)

  // Scan for JPEG SOI/EOI markers to find embedded JPEG previews
  // DNG files typically embed a full-size JPEG preview
  // Strategy: find the largest JPEG blob in the file
  const jpegSegments: { start: number; end: number; size: number }[] = []

  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0xFF && data[i + 1] === 0xD8) {
      // Found JPEG SOI - now find corresponding EOI
      for (let j = i + 2; j < data.length - 1; j++) {
        if (data[j] === 0xFF && data[j + 1] === 0xD9) {
          const end = j + 2
          jpegSegments.push({ start: i, end, size: end - i })
          i = end // skip past this JPEG
          break
        }
      }
    }
  }

  if (jpegSegments.length === 0) return null

  // Use the largest JPEG (the full-size preview, not the thumbnail)
  jpegSegments.sort((a, b) => b.size - a.size)
  const best = jpegSegments[0]

  // Sanity check: JPEG should be at least 10KB to be a real preview
  if (best.size < 10240) return null

  const jpegData = buffer.slice(best.start, best.end)
  return new Blob([jpegData], { type: 'image/jpeg' })
}

async function loadImageFromBlob(blob: Blob): Promise<RawImage> {
  const url = URL.createObjectURL(blob)
  try {
    return await loadImageFromUrl(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function loadImageFromUrl(url: string): Promise<RawImage> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      const pixels = imgData.data
      const floats = new Float32Array(canvas.width * canvas.height * 3)
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
        floats[j] = srgbToLinear(pixels[i] / 255)
        floats[j + 1] = srgbToLinear(pixels[i + 1] / 255)
        floats[j + 2] = srgbToLinear(pixels[i + 2] / 255)
      }

      resolve({
        data: floats,
        width: canvas.width,
        height: canvas.height,
        metadata: createDefaultMetadata(canvas.width, canvas.height),
      })
    }
    img.onerror = () => reject(new Error('Failed to decode image'))
    img.src = url
  })
}

async function loadAsRegularImage(file: File): Promise<RawImage> {
  // Method 1: URL.createObjectURL + Image (most compatible)
  const url = URL.createObjectURL(file)
  try {
    return await loadImageFromUrl(url)
  } catch {
    // Method 2: Try createImageBitmap as fallback
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height)

      const pixels = imgData.data
      const floats = new Float32Array(bitmap.width * bitmap.height * 3)
      for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
        floats[j] = srgbToLinear(pixels[i] / 255)
        floats[j + 1] = srgbToLinear(pixels[i + 1] / 255)
        floats[j + 2] = srgbToLinear(pixels[i + 2] / 255)
      }

      return {
        data: floats,
        width: bitmap.width,
        height: bitmap.height,
        metadata: createDefaultMetadata(bitmap.width, bitmap.height),
      }
    } catch {
      throw new Error('Could not decode image file. Supported formats: JPEG, PNG, TIFF, DNG')
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function createDefaultMetadata(width: number, height: number): DngMetadata {
  return {
    width, height,
    bitsPerSample: 8,
    samplesPerPixel: 3,
    compression: 1,
    photometricInterpretation: 2,
    orientation: 1,
    blackLevel: [0],
    whiteLevel: [255],
    asShotNeutral: [1, 1, 1],
    colorMatrix1: [],
    colorMatrix2: [],
    cfaPattern: [0, 1, 1, 2],
    activeArea: [0, 0, height, width],
    defaultCropOrigin: [0, 0],
    defaultCropSize: [width, height],
    stripOffsets: [],
    stripByteCounts: [],
    tileOffsets: [],
    tileByteCounts: [],
    tileWidth: 0,
    tileLength: 0,
    rowsPerStrip: height,
    dngVersion: [1, 4, 0, 0],
    isLinearDng: true,
  }
}

function parseAllIfds(view: DataView, offset: number, le: boolean, buffer: ArrayBuffer): TiffIfd[] {
  const ifds: TiffIfd[] = []
  let currentOffset = offset

  while (currentOffset > 0 && currentOffset < view.byteLength - 2) {
    const ifd = parseIfd(view, currentOffset, le, buffer)
    ifds.push(ifd)
    currentOffset = ifd.nextIfdOffset
  }

  return ifds
}

function parseIfd(view: DataView, offset: number, le: boolean, buffer: ArrayBuffer): TiffIfd {
  const entryCount = view.getUint16(offset, le)
  const entries = new Map<number, TiffEntry>()
  let pos = offset + 2

  for (let i = 0; i < entryCount; i++) {
    if (pos + 12 > view.byteLength) break
    const tag = view.getUint16(pos, le)
    const type = view.getUint16(pos + 2, le)
    const count = view.getUint32(pos + 4, le)
    const typeSize = TIFF_TYPE_SIZES[type] || 1
    const totalSize = count * typeSize
    let valueOffset: number

    if (totalSize <= 4) {
      valueOffset = pos + 8
    } else {
      valueOffset = view.getUint32(pos + 8, le)
    }

    const values = readTagValues(view, valueOffset, type, count, le)
    entries.set(tag, { tag, type, count, valueOffset, values })
    pos += 12
  }

  const nextIfdOffset = pos < view.byteLength - 4 ? view.getUint32(pos, le) : 0

  // Parse SubIFDs if present
  const subIfds: TiffIfd[] = []
  const subIfdEntry = entries.get(TIFF_TAGS.SubIFDs)
  if (subIfdEntry && Array.isArray(subIfdEntry.values)) {
    for (const subOffset of subIfdEntry.values) {
      if (subOffset > 0 && subOffset < view.byteLength) {
        subIfds.push(parseIfd(view, subOffset, le, buffer))
      }
    }
  }

  return { entries, nextIfdOffset, subIfds }
}

function readTagValues(view: DataView, offset: number, type: number, count: number, le: boolean): number[] | string {
  if (type === 2) {
    // ASCII
    const bytes: number[] = []
    for (let i = 0; i < count - 1; i++) {
      if (offset + i < view.byteLength) bytes.push(view.getUint8(offset + i))
    }
    return String.fromCharCode(...bytes)
  }

  const values: number[] = []
  const typeSize = TIFF_TYPE_SIZES[type] || 1

  for (let i = 0; i < count; i++) {
    const pos = offset + i * typeSize
    if (pos + typeSize > view.byteLength) break

    switch (type) {
      case 1: case 7: // BYTE, UNDEFINED
        values.push(view.getUint8(pos))
        break
      case 3: // SHORT
        values.push(view.getUint16(pos, le))
        break
      case 4: // LONG
        values.push(view.getUint32(pos, le))
        break
      case 5: // RATIONAL
        values.push(view.getUint32(pos, le) / view.getUint32(pos + 4, le))
        break
      case 6: // SBYTE
        values.push(view.getInt8(pos))
        break
      case 8: // SSHORT
        values.push(view.getInt16(pos, le))
        break
      case 9: // SLONG
        values.push(view.getInt32(pos, le))
        break
      case 10: // SRATIONAL
        values.push(view.getInt32(pos, le) / view.getInt32(pos + 4, le))
        break
      case 11: // FLOAT
        values.push(view.getFloat32(pos, le))
        break
      case 12: // DOUBLE
        values.push(view.getFloat64(pos, le))
        break
      default:
        values.push(view.getUint8(pos))
    }
  }
  return values
}

function getNumericValues(entry: TiffEntry | undefined): number[] {
  if (!entry) return []
  return Array.isArray(entry.values) ? entry.values : []
}

function getNumericValue(entry: TiffEntry | undefined, defaultVal: number): number {
  const vals = getNumericValues(entry)
  return vals.length > 0 ? vals[0] : defaultVal
}

function findRawIfd(ifds: TiffIfd[]): TiffIfd | null {
  // Check SubIFDs first - they usually contain full-res raw data
  for (const ifd of ifds) {
    for (const sub of ifd.subIfds) {
      const newSubType = getNumericValue(sub.entries.get(TIFF_TAGS.NewSubfileType), -1)
      if (newSubType === 0) return sub // Full-resolution image
    }
  }

  // Check SubIFDs for largest image
  let best: TiffIfd | null = null
  let bestPixels = 0

  for (const ifd of ifds) {
    for (const sub of ifd.subIfds) {
      const w = getNumericValue(sub.entries.get(TIFF_TAGS.ImageWidth), 0)
      const h = getNumericValue(sub.entries.get(TIFF_TAGS.ImageLength), 0)
      if (w * h > bestPixels) {
        bestPixels = w * h
        best = sub
      }
    }
  }

  if (best) return best

  // Fallback: use IFD0
  return ifds.length > 0 ? ifds[0] : null
}

function extractMetadata(rawIfd: TiffIfd, mainIfd: TiffIfd, _view: DataView, _le: boolean): DngMetadata {
  const e = rawIfd.entries
  const m = mainIfd.entries

  const width = getNumericValue(e.get(TIFF_TAGS.ImageWidth), 0)
  const height = getNumericValue(e.get(TIFF_TAGS.ImageLength), 0)
  const bitsPerSample = getNumericValue(e.get(TIFF_TAGS.BitsPerSample), 16)
  const samplesPerPixel = getNumericValue(e.get(TIFF_TAGS.SamplesPerPixel), 1)
  const compression = getNumericValue(e.get(TIFF_TAGS.Compression), 1)
  const photoInterp = getNumericValue(e.get(TIFF_TAGS.PhotometricInterpretation), 32803)
  const orientation = getNumericValue(m.get(TIFF_TAGS.Orientation), 1)

  const isLinearDng = photoInterp === 34892 || samplesPerPixel === 3

  const blackLevel = getNumericValues(e.get(TIFF_TAGS.BlackLevel))
  const whiteLevel = getNumericValues(e.get(TIFF_TAGS.WhiteLevel))
  const asShotNeutral = getNumericValues(m.get(TIFF_TAGS.AsShotNeutral))
  const colorMatrix1 = getNumericValues(m.get(TIFF_TAGS.ColorMatrix1))
  const colorMatrix2 = getNumericValues(m.get(TIFF_TAGS.ColorMatrix2))
  const cfaPattern = getNumericValues(e.get(TIFF_TAGS.CFAPattern2))

  const activeArea = getNumericValues(e.get(TIFF_TAGS.ActiveArea))
  const cropOrigin = getNumericValues(e.get(TIFF_TAGS.DefaultCropOrigin))
  const cropSize = getNumericValues(e.get(TIFF_TAGS.DefaultCropSize))

  return {
    width, height, bitsPerSample, samplesPerPixel, compression,
    photometricInterpretation: photoInterp,
    orientation,
    blackLevel: blackLevel.length ? blackLevel : [0],
    whiteLevel: whiteLevel.length ? whiteLevel : [(1 << bitsPerSample) - 1],
    asShotNeutral: asShotNeutral.length ? asShotNeutral : [1, 1, 1],
    colorMatrix1, colorMatrix2,
    cfaPattern: cfaPattern.length >= 4 ? cfaPattern : [0, 1, 1, 2],
    activeArea: activeArea.length >= 4
      ? [activeArea[0], activeArea[1], activeArea[2], activeArea[3]]
      : [0, 0, height, width],
    defaultCropOrigin: cropOrigin.length >= 2 ? [cropOrigin[0], cropOrigin[1]] : [0, 0],
    defaultCropSize: cropSize.length >= 2 ? [cropSize[0], cropSize[1]] : [width, height],
    stripOffsets: getNumericValues(e.get(TIFF_TAGS.StripOffsets)),
    stripByteCounts: getNumericValues(e.get(TIFF_TAGS.StripByteCounts)),
    tileOffsets: getNumericValues(e.get(TIFF_TAGS.TileOffsets)),
    tileByteCounts: getNumericValues(e.get(TIFF_TAGS.TileByteCounts)),
    tileWidth: getNumericValue(e.get(TIFF_TAGS.TileWidth), 0),
    tileLength: getNumericValue(e.get(TIFF_TAGS.TileLength), 0),
    rowsPerStrip: getNumericValue(e.get(TIFF_TAGS.RowsPerStrip), height),
    dngVersion: getNumericValues(m.get(TIFF_TAGS.DNGVersion)),
    isLinearDng,
  }
}

function readUncompressed(view: DataView, meta: DngMetadata, le: boolean): Float32Array {
  const { width, height, bitsPerSample, samplesPerPixel } = meta
  const blackLevel = meta.blackLevel[0] || 0
  const whiteLevel = meta.whiteLevel[0] || ((1 << bitsPerSample) - 1)
  const range = whiteLevel - blackLevel

  const pixelCount = width * height
  const channels = samplesPerPixel === 1 ? 1 : 3
  const output = new Float32Array(pixelCount * (channels === 1 ? 1 : 3))

  const offsets = meta.stripOffsets.length ? meta.stripOffsets : meta.tileOffsets
  if (offsets.length === 0) throw new Error('No strip or tile offsets found')

  let srcOffset = offsets[0]
  const bytesPerSample = Math.ceil(bitsPerSample / 8)

  for (let i = 0; i < pixelCount * channels; i++) {
    let value: number
    if (bytesPerSample === 1) {
      value = view.getUint8(srcOffset)
    } else if (bytesPerSample === 2) {
      value = view.getUint16(srcOffset, le)
    } else {
      value = view.getUint32(srcOffset, le)
    }
    srcOffset += bytesPerSample

    output[i] = Math.max(0, Math.min(1, (value - blackLevel) / range))
  }

  return output
}

// Lossless JPEG decoder for DNG (ITU-T T.81 Annex H)
function decodeLosslessJpeg(buffer: ArrayBuffer, meta: DngMetadata): Float32Array {
  const offsets = meta.stripOffsets.length ? meta.stripOffsets : meta.tileOffsets
  const counts = meta.stripByteCounts.length ? meta.stripByteCounts : meta.tileByteCounts

  if (offsets.length === 0) throw new Error('No data offsets for JPEG decode')

  const { width, height, samplesPerPixel } = meta
  const channels = samplesPerPixel === 1 ? 1 : 3
  const blackLevel = meta.blackLevel[0] || 0
  const whiteLevel = meta.whiteLevel[0] || ((1 << meta.bitsPerSample) - 1)
  const range = whiteLevel - blackLevel
  const output = new Float32Array(width * height * (channels === 1 ? 1 : 3))

  if (meta.tileWidth > 0 && meta.tileLength > 0) {
    // Tiled data
    const tilesX = Math.ceil(width / meta.tileWidth)
    for (let t = 0; t < offsets.length; t++) {
      const tileX = (t % tilesX) * meta.tileWidth
      const tileY = Math.floor(t / tilesX) * meta.tileLength
      const tileData = new Uint8Array(buffer, offsets[t], counts[t])
      const decoded = decodeLosslessJpegData(tileData, meta.tileWidth, meta.tileLength, channels)
      // Copy tile into output
      for (let y = 0; y < meta.tileLength && tileY + y < height; y++) {
        for (let x = 0; x < meta.tileWidth && tileX + x < width; x++) {
          for (let c = 0; c < (channels === 1 ? 1 : 3); c++) {
            const si = (y * meta.tileWidth + x) * channels + c
            const di = ((tileY + y) * width + (tileX + x)) * (channels === 1 ? 1 : 3) + c
            output[di] = Math.max(0, Math.min(1, (decoded[si] - blackLevel) / range))
          }
        }
      }
    }
  } else {
    // Strip data - decode each strip
    let row = 0
    for (let s = 0; s < offsets.length; s++) {
      const stripRows = Math.min(meta.rowsPerStrip, height - row)
      const stripData = new Uint8Array(buffer, offsets[s], counts[s])
      const decoded = decodeLosslessJpegData(stripData, width, stripRows, channels)
      for (let i = 0; i < decoded.length; i++) {
        const outIdx = row * width * (channels === 1 ? 1 : 3) + i
        if (outIdx < output.length) {
          output[outIdx] = Math.max(0, Math.min(1, (decoded[i] - blackLevel) / range))
        }
      }
      row += stripRows
    }
  }

  return output
}

interface HuffmanTable {
  maxCode: Int32Array
  valPtr: Int32Array
  values: Uint8Array
  minCode: Int32Array
}

function buildHuffmanTable(bits: Uint8Array, values: Uint8Array): HuffmanTable {
  const maxCode = new Int32Array(17)
  const valPtr = new Int32Array(17)
  const minCode = new Int32Array(17)

  let code = 0
  let ptr = 0
  for (let i = 1; i <= 16; i++) {
    minCode[i] = code
    valPtr[i] = ptr
    for (let j = 0; j < bits[i]; j++) {
      code++
      ptr++
    }
    maxCode[i] = code - 1
    code <<= 1
  }

  return { maxCode, valPtr, values, minCode }
}

function decodeLosslessJpegData(
  data: Uint8Array,
  _width: number,
  _height: number,
  _components: number,
): Int32Array {
  let pos = 0
  let precision = 16
  let frameWidth = _width
  let frameHeight = _height
  let frameComponents = _components
  const huffTables: HuffmanTable[] = []
  let predictor = 1
  let pointTransform = 0

  // Parse JPEG markers
  while (pos < data.length - 1) {
    if (data[pos] !== 0xFF) { pos++; continue }
    const marker = data[pos + 1]
    pos += 2

    if (marker === 0xD8) continue // SOI
    if (marker === 0xD9) break // EOI

    if (marker === 0xC3) {
      // SOF3 - lossless
      const len = (data[pos] << 8) | data[pos + 1]
      precision = data[pos + 2]
      frameHeight = (data[pos + 3] << 8) | data[pos + 4]
      frameWidth = (data[pos + 5] << 8) | data[pos + 6]
      frameComponents = data[pos + 7]
      pos += len
    } else if (marker === 0xC4) {
      // DHT
      const len = (data[pos] << 8) | data[pos + 1]
      let dhtPos = pos + 2
      const endPos = pos + len
      while (dhtPos < endPos) {
        const tableInfo = data[dhtPos++]
        const tableId = tableInfo & 0x0F
        const bits = new Uint8Array(17)
        let totalSymbols = 0
        for (let i = 1; i <= 16; i++) {
          bits[i] = data[dhtPos++]
          totalSymbols += bits[i]
        }
        const values = data.slice(dhtPos, dhtPos + totalSymbols)
        dhtPos += totalSymbols
        huffTables[tableId] = buildHuffmanTable(bits, values)
      }
      pos += len
    } else if (marker === 0xDA) {
      // SOS
      const len = (data[pos] << 8) | data[pos + 1]
      const compCount = data[pos + 2]
      // Skip component selectors
      const sosEnd = pos + 3 + compCount * 2
      predictor = data[sosEnd]
      pointTransform = data[sosEnd + 2]
      pos += len

      // Now decode the scan data
      return decodeScanData(
        data, pos, frameWidth, frameHeight, frameComponents,
        precision, predictor, pointTransform, huffTables,
      )
    } else {
      // Skip unknown marker
      if (pos + 1 < data.length) {
        const len = (data[pos] << 8) | data[pos + 1]
        pos += len
      }
    }
  }

  // Fallback - return zeros
  return new Int32Array(frameWidth * frameHeight * frameComponents)
}

function decodeScanData(
  data: Uint8Array, startPos: number,
  width: number, height: number, components: number,
  precision: number, predictor: number, pointTransform: number,
  huffTables: HuffmanTable[],
): Int32Array {
  const output = new Int32Array(width * height * components)
  let bitBuffer = 0
  let bitsInBuffer = 0
  let pos = startPos

  function nextBit(): number {
    if (bitsInBuffer === 0) {
      if (pos >= data.length) return 0
      bitBuffer = data[pos++]
      if (bitBuffer === 0xFF && pos < data.length && data[pos] === 0x00) {
        pos++ // skip stuff byte
      }
      bitsInBuffer = 8
    }
    bitsInBuffer--
    return (bitBuffer >> bitsInBuffer) & 1
  }

  function readBits(n: number): number {
    let value = 0
    for (let i = 0; i < n; i++) {
      value = (value << 1) | nextBit()
    }
    return value
  }

  function decodeHuffman(table: HuffmanTable): number {
    let code = 0
    for (let len = 1; len <= 16; len++) {
      code = (code << 1) | nextBit()
      if (code <= table.maxCode[len]) {
        const idx = table.valPtr[len] + (code - table.minCode[len])
        return table.values[idx]
      }
    }
    return 0
  }

  function decodeDifference(table: HuffmanTable): number {
    const category = decodeHuffman(table)
    if (category === 0) return 0
    const bits = readBits(category)
    // Sign extend
    if (bits < (1 << (category - 1))) {
      return bits - (1 << category) + 1
    }
    return bits
  }

  const initialPredictor = 1 << (precision - pointTransform - 1)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < components; c++) {
        const tableIdx = Math.min(c, huffTables.length - 1)
        const table = huffTables[tableIdx]
        if (!table) {
          output[(y * width + x) * components + c] = 0
          continue
        }

        const diff = decodeDifference(table)
        let pred: number

        if (x === 0 && y === 0) {
          pred = initialPredictor
        } else if (y === 0) {
          pred = output[(y * width + x - 1) * components + c]
        } else if (x === 0) {
          pred = output[((y - 1) * width + x) * components + c]
        } else {
          const ra = output[(y * width + x - 1) * components + c] // left
          const rb = output[((y - 1) * width + x) * components + c] // above
          const rc = output[((y - 1) * width + x - 1) * components + c] // upper-left

          switch (predictor) {
            case 1: pred = ra; break
            case 2: pred = rb; break
            case 3: pred = rc; break
            case 4: pred = ra + rb - rc; break
            case 5: pred = ra + ((rb - rc) >> 1); break
            case 6: pred = rb + ((ra - rc) >> 1); break
            case 7: pred = (ra + rb) >> 1; break
            default: pred = ra
          }
        }

        output[(y * width + x) * components + c] = (pred + diff) & ((1 << precision) - 1)
      }
    }
  }

  return output
}

async function readDeflateCompressed(buffer: ArrayBuffer, meta: DngMetadata): Promise<Float32Array> {
  const offsets = meta.stripOffsets.length ? meta.stripOffsets : meta.tileOffsets
  const counts = meta.stripByteCounts.length ? meta.stripByteCounts : meta.tileByteCounts
  const { width, height, samplesPerPixel, bitsPerSample } = meta
  const channels = samplesPerPixel === 1 ? 1 : 3
  const blackLevel = meta.blackLevel[0] || 0
  const whiteLevel = meta.whiteLevel[0] || ((1 << bitsPerSample) - 1)
  const range = whiteLevel - blackLevel
  const output = new Float32Array(width * height * (channels === 1 ? 1 : 3))

  let outIdx = 0
  for (let s = 0; s < offsets.length; s++) {
    const compressed = new Uint8Array(buffer, offsets[s], counts[s])
    const ds = new DecompressionStream('deflate')
    const writer = ds.writable.getWriter()
    writer.write(compressed)
    writer.close()
    const reader = ds.readable.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    const decompressed = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      decompressed.set(chunk, offset)
      offset += chunk.length
    }
    const dv = new DataView(decompressed.buffer)
    const bytesPerSample = Math.ceil(bitsPerSample / 8)
    for (let i = 0; i < decompressed.length; i += bytesPerSample) {
      const value = bytesPerSample === 1 ? dv.getUint8(i) : dv.getUint16(i, true)
      if (outIdx < output.length) {
        output[outIdx++] = Math.max(0, Math.min(1, (value - blackLevel) / range))
      }
    }
  }

  return output
}
