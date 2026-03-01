#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;

// Rotation (0, 1, 2, 3 = 0°, 90°, 180°, 270°)
uniform int uRotation;

// Light adjustments
uniform float uExposure;     // -5 to 5
uniform float uContrast;     // -100 to 100
uniform float uHighlights;   // -100 to 100
uniform float uShadows;      // -100 to 100
uniform float uWhites;       // -100 to 100
uniform float uBlacks;       // -100 to 100

// Color adjustments
uniform float uTemperature;  // -100 to 100
uniform float uTint;         // -100 to 100
uniform float uVibrance;     // -100 to 100
uniform float uSaturation;   // -100 to 100

// Color Grading (split toning)
uniform float uShadowsHue;      // 0-360
uniform float uShadowsSat;      // 0-100
uniform float uMidtonesHue;     // 0-360
uniform float uMidtonesSat;     // 0-100
uniform float uHighlightsHue;   // 0-360
uniform float uHighlightsSat;   // 0-100

// HSL - 8 channels each
uniform float uHslHue[8];
uniform float uHslSat[8];
uniform float uHslLum[8];

vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;

  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);

    if (maxC == c.r) {
      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }

  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;

  if (s == 0.0) {
    return vec3(l);
  }

  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;

  return vec3(
    hue2rgb(p, q, h + 1.0/3.0),
    hue2rgb(p, q, h),
    hue2rgb(p, q, h - 1.0/3.0)
  );
}

// Determine which HSL channel a hue falls into (0-7)
// R=0, O=1, Y=2, G=3, A=4, B=5, P=6, M=7
void getHslChannelWeights(float hue, out float weights[8]) {
  for (int i = 0; i < 8; i++) weights[i] = 0.0;

  float h = hue * 360.0;
  // Channel centers: R=0, O=30, Y=60, G=120, A=180, B=240, P=280, M=320
  float centers[8];
  centers[0] = 0.0;   // Red
  centers[1] = 30.0;  // Orange
  centers[2] = 60.0;  // Yellow
  centers[3] = 120.0; // Green
  centers[4] = 180.0; // Aqua
  centers[5] = 240.0; // Blue
  centers[6] = 280.0; // Purple
  centers[7] = 320.0; // Magenta

  for (int i = 0; i < 8; i++) {
    int next = (i + 1) % 8;
    float c0 = centers[i];
    float c1 = centers[next];
    if (c1 < c0) c1 += 360.0;
    float hh = h;
    if (hh < c0) hh += 360.0;
    float range = c1 - c0;
    if (hh >= c0 && hh < c1) {
      float t = (hh - c0) / range;
      weights[i] += 1.0 - t;
      weights[next] += t;
    }
  }
}

// Apply a color tint at a given hue (0-360) and strength (0-1)
vec3 applyTint(vec3 rgb, float hue, float strength) {
  if (strength <= 0.0) return rgb;
  vec3 tintColor = hslToRgb(vec3(hue / 360.0, 1.0, 0.5));
  return mix(rgb, rgb * tintColor * 2.0, strength * 0.3);
}

vec2 rotateUv(vec2 uv, int rot) {
  if (rot == 1) return vec2(uv.y, 1.0 - uv.x);       // 90° CW
  if (rot == 2) return vec2(1.0 - uv.x, 1.0 - uv.y); // 180°
  if (rot == 3) return vec2(1.0 - uv.y, uv.x);        // 270° CW
  return uv; // 0°
}

void main() {
  // Flip Y: image data has row 0 at top, but WebGL texture Y=0 is at bottom
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  uv = rotateUv(uv, uRotation);
  vec3 color = texture(uImage, uv).rgb;

  // --- Exposure (in linear space) ---
  color *= pow(2.0, uExposure);

  // --- White Balance (temperature/tint) ---
  float temp = uTemperature / 100.0;
  float tint = uTint / 100.0;
  color.r *= 1.0 + temp * 0.3;
  color.b *= 1.0 - temp * 0.3;
  color.g *= 1.0 + tint * 0.1;
  color.r *= 1.0 - tint * 0.05;
  color.b *= 1.0 - tint * 0.05;

  color = max(color, vec3(0.0));

  // Convert to perceptual space
  vec3 gamma = pow(color, vec3(1.0/2.2));

  // --- Highlights / Shadows / Whites / Blacks ---
  float lum = dot(gamma, vec3(0.2126, 0.7152, 0.0722));

  float whitesMask = smoothstep(0.5, 1.0, lum);
  gamma += whitesMask * (uWhites / 200.0);

  float blacksMask = 1.0 - smoothstep(0.0, 0.5, lum);
  gamma += blacksMask * (uBlacks / 200.0);

  float highlightMask = smoothstep(0.3, 0.9, lum);
  gamma += highlightMask * (uHighlights / 200.0);

  float shadowMask = 1.0 - smoothstep(0.1, 0.7, lum);
  gamma += shadowMask * (uShadows / 200.0);

  // --- Contrast ---
  float contrastFactor = 1.0 + uContrast / 100.0;
  gamma = (gamma - 0.5) * contrastFactor + 0.5;

  gamma = clamp(gamma, 0.0, 1.0);

  // --- HSL Adjustments ---
  vec3 hsl = rgbToHsl(gamma);
  float hslWeights[8];
  getHslChannelWeights(hsl.x, hslWeights);

  float hueShift = 0.0;
  float satShift = 0.0;
  float lumShift = 0.0;
  for (int i = 0; i < 8; i++) {
    hueShift += hslWeights[i] * uHslHue[i] / 360.0;
    satShift += hslWeights[i] * uHslSat[i] / 100.0;
    lumShift += hslWeights[i] * uHslLum[i] / 100.0;
  }

  hsl.x = fract(hsl.x + hueShift);
  hsl.y = clamp(hsl.y + satShift * hsl.y, 0.0, 1.0);
  hsl.z = clamp(hsl.z + lumShift * 0.5, 0.0, 1.0);

  gamma = hslToRgb(hsl);

  // --- Vibrance (selective saturation) ---
  float vib = uVibrance / 100.0;
  float maxChannel = max(gamma.r, max(gamma.g, gamma.b));
  float minChannel = min(gamma.r, min(gamma.g, gamma.b));
  float currentSat = (maxChannel - minChannel) / max(maxChannel, 0.001);
  float vibAmount = vib * (1.0 - currentSat);
  vec3 vibGray = vec3(lum);
  gamma = mix(gamma, mix(vibGray, gamma, 1.0 + vibAmount), 1.0);

  // --- Saturation (global) ---
  float sat = 1.0 + uSaturation / 100.0;
  vec3 gray = vec3(dot(gamma, vec3(0.2126, 0.7152, 0.0722)));
  gamma = mix(gray, gamma, sat);

  gamma = clamp(gamma, 0.0, 1.0);

  // --- Color Grading (Split Toning) ---
  float lumAfter = dot(gamma, vec3(0.2126, 0.7152, 0.0722));

  // Shadows: luminance < 0.33
  float shadowWeight = 1.0 - smoothstep(0.0, 0.4, lumAfter);
  gamma = applyTint(gamma, uShadowsHue, uShadowsSat / 100.0 * shadowWeight);

  // Midtones: luminance 0.2 - 0.8
  float midWeight = smoothstep(0.0, 0.3, lumAfter) * (1.0 - smoothstep(0.7, 1.0, lumAfter));
  gamma = applyTint(gamma, uMidtonesHue, uMidtonesSat / 100.0 * midWeight);

  // Highlights: luminance > 0.6
  float highWeight = smoothstep(0.5, 1.0, lumAfter);
  gamma = applyTint(gamma, uHighlightsHue, uHighlightsSat / 100.0 * highWeight);

  gamma = clamp(gamma, 0.0, 1.0);

  // Convert back to linear for output
  color = pow(gamma, vec3(2.2));

  fragColor = vec4(color, 1.0);
}
