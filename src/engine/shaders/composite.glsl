#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uOriginal;  // Original image (raw texture, needs flip+rotation)
uniform sampler2D uAdjusted;  // Adjusted image (FBO output OR raw texture)
uniform sampler2D uMask;      // Mask texture (raw data, needs Y-flip)
uniform bool uHasMask;
uniform bool uInvertMask;
uniform float uSharpness;     // 0 to 100

// Rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270° CW)
uniform int uRotation;
// When true, uAdjusted is a raw texture (renderOriginal) and needs flip+rotation
uniform bool uDirectSample;

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

void main() {
  // If uDirectSample, uAdjusted is a raw texture → apply flip+rotation
  // Otherwise, uAdjusted is the FBO output → already correctly oriented
  vec2 adjUv = uDirectSample ? imageUv(vUv) : vUv;
  vec3 adjusted = texture(uAdjusted, adjUv).rgb;

  if (uHasMask) {
    // uOriginal is always a raw texture → apply flip+rotation
    vec3 original = texture(uOriginal, imageUv(vUv)).rgb;
    // Mask data has row 0 at top, texture Y=0 at bottom → flip Y
    float mask = texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
    if (uInvertMask) mask = 1.0 - mask;

    // Convert both to gamma for blending
    vec3 origGamma = linearToSrgb(original);
    vec3 adjGamma = linearToSrgb(adjusted);
    vec3 blended = mix(origGamma, adjGamma, mask);

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
      vec3 sharpened = blended + (blended - blur) * sharp;
      blended = clamp(sharpened, 0.0, 1.0);
    }

    fragColor = vec4(blended, 1.0);
  } else {
    // No mask - just output adjusted with gamma
    vec3 output_color = linearToSrgb(adjusted);

    // Sharpening
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
}
