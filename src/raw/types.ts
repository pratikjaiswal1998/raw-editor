export interface DngMetadata {
  width: number
  height: number
  bitsPerSample: number
  samplesPerPixel: number
  compression: number
  photometricInterpretation: number
  orientation: number
  blackLevel: number[]
  whiteLevel: number[]
  asShotNeutral: number[]
  colorMatrix1: number[]
  colorMatrix2: number[]
  cfaPattern: number[]
  activeArea: [number, number, number, number] // top, left, bottom, right
  defaultCropOrigin: [number, number]
  defaultCropSize: [number, number]
  stripOffsets: number[]
  stripByteCounts: number[]
  tileOffsets: number[]
  tileByteCounts: number[]
  tileWidth: number
  tileLength: number
  rowsPerStrip: number
  dngVersion: number[]
  isLinearDng: boolean
}

export interface RawImage {
  data: Float32Array // normalized [0,1] RGB float data
  width: number
  height: number
  metadata: DngMetadata
}

export interface TiffIfd {
  entries: Map<number, TiffEntry>
  nextIfdOffset: number
  subIfds: TiffIfd[]
}

export interface TiffEntry {
  tag: number
  type: number
  count: number
  valueOffset: number
  values: number[] | string
}

// TIFF tag constants
export const TIFF_TAGS = {
  ImageWidth: 256,
  ImageLength: 257,
  BitsPerSample: 258,
  Compression: 259,
  PhotometricInterpretation: 262,
  StripOffsets: 273,
  Orientation: 274,
  SamplesPerPixel: 277,
  RowsPerStrip: 278,
  StripByteCounts: 279,
  TileWidth: 322,
  TileLength: 323,
  TileOffsets: 324,
  TileByteCounts: 325,
  SubIFDs: 330,
  CFAPattern2: 33422,
  DNGVersion: 50706,
  DNGBackwardVersion: 50707,
  UniqueCameraModel: 50708,
  ColorMatrix1: 50721,
  ColorMatrix2: 50722,
  AsShotNeutral: 50728,
  ActiveArea: 50829,
  DefaultCropOrigin: 50719,
  DefaultCropSize: 50720,
  BlackLevel: 50714,
  WhiteLevel: 50717,
  CFAPatternDim: 50710,
  CFALayout: 50711,
  LinearizationTable: 50712,
  NewSubfileType: 254,
} as const

export const TIFF_TYPE_SIZES: Record<number, number> = {
  1: 1,  // BYTE
  2: 1,  // ASCII
  3: 2,  // SHORT
  4: 4,  // LONG
  5: 8,  // RATIONAL
  6: 1,  // SBYTE
  7: 1,  // UNDEFINED
  8: 2,  // SSHORT
  9: 4,  // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
}
