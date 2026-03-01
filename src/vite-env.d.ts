/// <reference types="vite/client" />

declare module '*.glsl?raw' {
  const content: string
  export default content
}

// File System Access API — expose showOpenFilePicker as optional on window
// (TS DOM lib declares it as a global function, not as an optional Window property)
interface Window {
  showOpenFilePicker?: typeof showOpenFilePicker
}
