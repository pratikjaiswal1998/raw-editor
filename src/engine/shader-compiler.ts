export function compileShader(gl: WebGL2RenderingContext, source: string, type: number): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info}`)
  }

  return shader
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vs = compileShader(gl, vertexSource, gl.VERTEX_SHADER)
  const fs = compileShader(gl, fragmentSource, gl.FRAGMENT_SHADER)

  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')

  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`Program link error: ${info}`)
  }

  gl.deleteShader(vs)
  gl.deleteShader(fs)

  return program
}

// Full-screen quad vertex shader (shared by all passes)
export const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;

void main() {
  // Full-screen triangle trick (no vertex buffer needed)
  float x = float((gl_VertexID & 1) << 2) - 1.0;
  float y = float((gl_VertexID & 2) << 1) - 1.0;
  vUv = vec2(x * 0.5 + 0.5, y * 0.5 + 0.5);
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`
