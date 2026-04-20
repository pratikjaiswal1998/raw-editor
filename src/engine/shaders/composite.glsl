#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOriginal;  // Original image (raw texture, needs flip+rotation)
uniform sampler2D uAdjusted;  // Global-only adjusted image (FBO output OR raw texture)
uniform sampler2D uMask;      // Mask texture (raw data, needs Y-flip)
uniform int uHasMask;         // 1 = mask active, 0 = no mask
uniform int uInvertMask;
uniform float uSharpness;     // 0 to 100 (only applied on final pass)

// Rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270° CW)
uniform int uRotation;
// When 1, uAdjusted is a raw texture (renderOriginal) and needs flip+rotation.
uniform int uDirectSample;
// When 1, apply sRGB gamma + sharpening (final output). When 0, output linear
// (intermediate ping-pong pass in multi-mask compositing).
uniform int uFinalPass;

// Per-layer adjustment uniforms — same names as adjust.glsl so the shared
// applyLayerAdjustments() helper works in both programs.
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

// Map screen UV to raw image texture UV (flip Y + rotation).
vec2 imageUv(vec2 screenUv) {
  vec2 uv = vec2(screenUv.x, 1.0 - screenUv.y);
  return rotateUv(uv, uRotation);
}

// Linear → sRGB gamma.
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

void main() {
  // If uDirectSample, uAdjusted is a raw texture → apply flip+rotation.
  // Otherwise, uAdjusted is the FBO output → already correctly oriented.
  vec2 adjUv = (uDirectSample > 0) ? imageUv(vUv) : vUv;
  vec3 adjusted = texture(uAdjusted, adjUv).rgb;

  // Branchless mask processing — avoids GLSL optimizer issues on some GPUs.
  // Mask data has row 0 at top, texture Y=0 at bottom → flip Y.
  float rawMask = texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
  float mask = mix(rawMask, 1.0 - rawMask, float(uInvertMask));

  // maskStrength = 0 when no masks active, = mask when masks active.
  float maskStrength = float(uHasMask) * mask;

  // Apply full layer adjustments under the mask, then blend with unmasked source.
  vec3 maskResult = applyLayerAdjustments(adjusted);
  vec3 blended = mix(adjusted, maskResult, maskStrength);

  // Intermediate pass: output linear color directly (no sRGB, no sharpening).
  if (uFinalPass == 0) {
    fragColor = vec4(blended, 1.0);
    return;
  }

  // Final pass: Convert to sRGB for display.
  vec3 output_color = linearToSrgb(blended);

  // Simple sharpening (unsharp mask) — only on final pass.
  if (uSharpness > 0.0) {
    vec2 texelSize = 1.0 / vec2(textureSize(uAdjusted, 0));
    float sharp = uSharpness / 100.0 * 1.5;
    vec3 blur = vec3(0.0);
    blur += linearToSrgb(texture(uAdjusted, adjUv + vec2(-texelSize.x, 0.0)).rgb);
    blur += linearToSrgb(texture(uAdjusted, adjUv + vec2(texelSize.x, 0.0)).rgb);
    blur += linearToSrgb(texture(uAdjusted, adjUv + vec2(0.0, -texelSize.y)).rgb);
    blur += linearToSrgb(texture(uAdjusted, adjUv + vec2(0.0, texelSize.y)).rgb);
    blur *= 0.25;
    output_color = clamp(output_color + (output_color - blur) * sharp, 0.0, 1.0);
  }

  fragColor = vec4(output_color, 1.0);
}
