#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;

// Rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270° CW)
uniform int uRotation;

// Layer adjustment uniforms (see layer-adjustments.glsl)
uniform float uExposure;
uniform float uContrast;
uniform float uHighlights;
uniform float uShadows;
uniform float uWhites;
uniform float uBlacks;
uniform float uTemperature;
uniform float uTint;
uniform float uVibrance;
uniform float uSaturation;
uniform float uHslHue[8];
uniform float uHslSat[8];
uniform float uHslLum[8];
uniform float uShadowsHue;
uniform float uShadowsSat;
uniform float uMidtonesHue;
uniform float uMidtonesSat;
uniform float uHighlightsHue;
uniform float uHighlightsSat;

//INCLUDE:layer-adjustments

vec2 rotateUv(vec2 uv, int rot) {
  if (rot == 1) return vec2(uv.y, 1.0 - uv.x);       // 90° CW
  if (rot == 2) return vec2(1.0 - uv.x, 1.0 - uv.y); // 180°
  if (rot == 3) return vec2(1.0 - uv.y, uv.x);        // 270° CW
  return uv; // 0°
}

void main() {
  // Flip Y: image data has row 0 at top, but WebGL texture Y=0 is at bottom.
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  uv = rotateUv(uv, uRotation);
  vec3 color = texture(uImage, uv).rgb;

  color = applyLayerAdjustments(color);

  fragColor = vec4(color, 1.0);
}
