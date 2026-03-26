#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uBase;   // Current accumulated result (linear)
uniform sampler2D uLayer;  // Mask-adjusted result (linear)
uniform sampler2D uMask;   // Mask alpha (R8)

void main() {
  vec3 base = texture(uBase, vUv).rgb;
  vec3 layer = texture(uLayer, vUv).rgb;
  // Mask data has row 0 at top, GL texture Y=0 at bottom → flip Y
  float mask = texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).r;
  fragColor = vec4(mix(base, layer, mask), 1.0);
}
