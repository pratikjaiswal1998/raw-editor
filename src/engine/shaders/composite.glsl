#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOriginal;  // Original image (raw texture, needs flip+rotation)
uniform sampler2D uAdjusted;  // Global-only adjusted image (FBO output OR raw texture)
uniform sampler2D uMask;      // Mask texture (raw data, needs Y-flip)
uniform int uHasMask;         // 1 = mask active, 0 = no mask
uniform int uInvertMask;
uniform float uSharpness;     // 0 to 100

// Mask adjustment uniforms (applied on top of global adjustments)
uniform float uMaskExposure;
uniform float uMaskContrast;
uniform float uMaskHighlights;
uniform float uMaskShadows;
uniform float uMaskWhites;
uniform float uMaskBlacks;
uniform float uMaskTemperature;
uniform float uMaskTint;
uniform float uMaskSaturation;
uniform float uMaskVibrance;

// Rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270° CW)
uniform int uRotation;
// When 1, uAdjusted is a raw texture (renderOriginal) and needs flip+rotation
uniform int uDirectSample;
// When 1, apply sRGB gamma + sharpening (final output). When 0, output linear (intermediate pass).
uniform int uFinalPass;

vec2 rotateUv(vec2 uv, int rot) {
  if (rot == 1) return vec2(uv.y, 1.0 - uv.x);       // 90° CW
  if (rot == 2) return vec2(1.0 - uv.x, 1.0 - uv.y); // 180°
  if (rot == 3) return vec2(1.0 - uv.y, uv.x);        // 270° CW
  return uv; // 0°
}

// Map screen UV to raw image texture UV (flip Y + rotation)
vec2 imageUv(vec2 screenUv) {
  vec2 uv = vec2(screenUv.x, 1.0 - screenUv.y);
  return rotateUv(uv, uRotation);
}

// Linear to sRGB gamma
vec3 linearToSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0/2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

// Apply mask adjustments to a linear-space color
vec3 applyMaskAdjustments(vec3 color) {
  // Exposure (linear space) — use exp2 for better GPU compatibility
  color *= exp2(uMaskExposure);

  // White balance (linear space)
  float mTemp = uMaskTemperature / 100.0;
  float mTint = uMaskTint / 100.0;
  color.r *= 1.0 + mTemp * 0.3;
  color.b *= 1.0 - mTemp * 0.3;
  color.g *= 1.0 + mTint * 0.1;
  color.r *= 1.0 - mTint * 0.05;
  color.b *= 1.0 - mTint * 0.05;
  color = max(color, vec3(0.0));

  // Convert to perceptual space for tone adjustments
  vec3 gamma = pow(max(color, vec3(0.0)), vec3(1.0/2.2));
  float lum = dot(gamma, vec3(0.2126, 0.7152, 0.0722));

  // Whites / Blacks / Highlights / Shadows
  gamma += smoothstep(0.5, 1.0, lum) * (uMaskWhites / 200.0);
  gamma += (1.0 - smoothstep(0.0, 0.5, lum)) * (uMaskBlacks / 200.0);
  gamma += smoothstep(0.3, 0.9, lum) * (uMaskHighlights / 200.0);
  gamma += (1.0 - smoothstep(0.1, 0.7, lum)) * (uMaskShadows / 200.0);

  // Contrast
  float contrastFactor = 1.0 + uMaskContrast / 100.0;
  gamma = (gamma - 0.5) * contrastFactor + 0.5;
  gamma = clamp(gamma, 0.0, 1.0);

  // Vibrance (selective saturation)
  float vib = uMaskVibrance / 100.0;
  float maxCh = max(gamma.r, max(gamma.g, gamma.b));
  float minCh = min(gamma.r, min(gamma.g, gamma.b));
  float curSat = (maxCh - minCh) / max(maxCh, 0.001);
  float vibAmt = vib * (1.0 - curSat);
  vec3 vibGray = vec3(lum);
  gamma = mix(vibGray, gamma, 1.0 + vibAmt);

  // Saturation
  float sat = 1.0 + uMaskSaturation / 100.0;
  vec3 gray = vec3(dot(gamma, vec3(0.2126, 0.7152, 0.0722)));
  gamma = mix(gray, gamma, sat);
  gamma = clamp(gamma, 0.0, 1.0);

  // Back to linear
  return pow(gamma, vec3(2.2));
}

void main() {
  // If uDirectSample, uAdjusted is a raw texture → apply flip+rotation
  // Otherwise, uAdjusted is the FBO output → already correctly oriented
  vec2 adjUv = (uDirectSample > 0) ? imageUv(vUv) : vUv;
  vec3 adjusted = texture(uAdjusted, adjUv).rgb;

  // Branchless mask processing — avoids GLSL optimizer issues on some GPUs
  // Mask data has row 0 at top, texture Y=0 at bottom → flip Y
  float rawMask = texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
  float mask = mix(rawMask, 1.0 - rawMask, float(uInvertMask));

  // maskStrength = 0 when no masks, = mask when masks active
  float maskStrength = float(uHasMask) * mask;

  // Apply mask adjustments and blend (when maskStrength=0, result = adjusted)
  vec3 maskResult = applyMaskAdjustments(adjusted);
  vec3 blended = mix(adjusted, maskResult, maskStrength);

  // Intermediate pass: output linear color directly (no sRGB, no sharpening)
  if (uFinalPass == 0) {
    fragColor = vec4(blended, 1.0);
    return;
  }

  // Final pass: Convert to sRGB for display
  vec3 output_color = linearToSrgb(blended);

  // Simple sharpening (unsharp mask)
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
