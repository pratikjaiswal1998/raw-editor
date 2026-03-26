# RAW Editor

A browser-based RAW photo editor inspired by Adobe Lightroom Classic, built with React, TypeScript, and WebGL 2.

**[Open App](https://pratikjaiswal1998.github.io/raw-editor/)**

## Features

- Open DNG, JPEG, PNG, TIFF, HEIC, WebP, AVIF, BMP, GIF, and SVG files
- Non-destructive editing with full undo/redo history
- WebGL 2 GPU-accelerated processing pipeline
- Works offline as a PWA — installable on mobile and desktop

### Adjustments

- Exposure, Contrast, Highlights, Shadows, Whites, Blacks
- White Balance (Temperature & Tint)
- Vibrance & Saturation
- HSL (Hue, Saturation, Luminance) per 8 color channels
- Color Grading with shadow/midtone/highlight color wheels
- Sharpening

### Masks

- Rectangle, Ellipse, Linear Gradient, Radial Gradient shapes
- Per-mask local adjustments (exposure, contrast, color, etc.)
- Mask inversion, feathering, rotation
- Interactive drag handles for positioning and resizing

### Other

- Live histogram
- Image rotation
- Before/after comparison (long press)
- JPEG export with quality control and mobile share sheet
- Recent files with saved edit settings
- Responsive: desktop sidebar layout + mobile tab bar

## Privacy

Everything runs 100% in your browser. No images are uploaded anywhere. The app never stores your photos — only edit settings are saved locally.

## Tech Stack

- React 19 + TypeScript + Vite
- WebGL 2 with GLSL shaders (2-pass rendering pipeline)
- Zustand for state management
- Web Workers for off-thread image decoding and mask rasterization
- PWA with offline support
