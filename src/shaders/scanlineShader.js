export const scanlineVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const scanlineFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;

  varying vec2 vUv;

  void main() {
    vec2 center = vec2(0.5);
    float dist = distance(vUv, center);

    // Radiating concentric rings that pulse outward
    float rings = sin((dist * 35.0) - uTime * 3.5);
    rings = smoothstep(0.0, 0.12, rings) * smoothstep(0.5, 0.12, rings);

    // Faint horizontal scanline grid overlay
    float scanlines = sin(vUv.y * 100.0 + uTime * 1.5) * 0.5 + 0.5;
    scanlines = smoothstep(0.4, 0.6, scanlines) * 0.15;

    // Radial falloff — intensity drops from center outward
    float falloff = 1.0 - smoothstep(0.0, 0.48, dist);
    falloff = pow(falloff, 2.0);

    // Time-based pulse breathing
    float pulse = sin(uTime * 2.0) * 0.15 + 0.85;

    // Hot center glow
    float glow = exp(-dist * 10.0) * 0.5;

    // Thin edge ring highlight
    float edgeRing = smoothstep(0.40, 0.44, dist) * (1.0 - smoothstep(0.44, 0.48, dist));

    float alpha = ((rings * 0.6 + scanlines) * falloff + glow + edgeRing * 0.3) * pulse * uIntensity;

    gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  }
`;
