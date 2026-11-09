/**
 * src/features/summary/scene/curveShaders.ts
 *
 * Unlit GLSL for the monthly curve, with no lights, textures or `discard`. Lengths are
 * in layout points. Ribbons output opaque colors and rely on MAX/MIN blending, so a
 * ribbon folding over itself on a tight corner never gets brighter.
 */

export const POINT_QUAD_PT = 88;

export const RIBBON_VERTEX_SHADER = /* glsl */ `
  attribute float aSide;
  attribute float aLength;

  varying float vSide;
  varying float vLength;
  varying float vX;

  void main() {
    vSide = aSide;
    vLength = aLength;
    vX = position.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const RIBBON_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBackdrop;
  uniform float uHalfWidth;
  uniform float uCore;
  uniform float uGlow;
  uniform float uHot;
  uniform float uDashed;
  uniform float uReveal;
  uniform float uScrubX;
  uniform float uDim;

  varying float vSide;
  varying float vLength;
  varying float vX;

  void main() {
    float distanceToCenter = abs(vSide) * uHalfWidth;
    float core = 1.0 - smoothstep(uCore - 0.8, uCore + 0.8, distanceToCenter);

    float sigma = uHalfWidth * 0.36;
    float falloff = exp(-distanceToCenter * distanceToCenter / (2.0 * sigma * sigma));
    float edge = 1.0 - smoothstep(uHalfWidth * 0.7, uHalfWidth, distanceToCenter);
    float alpha = max(core, falloff * uGlow * edge);

    if (uDashed > 0.5) {
      float phase = fract(vLength / 11.0);
      alpha *= smoothstep(0.0, 0.08, phase) * (1.0 - smoothstep(0.5, 0.58, phase));
    }

    alpha *= 1.0 - smoothstep(uReveal - 6.0, uReveal, vX);
    alpha *= mix(1.0, 0.28, uDim * smoothstep(uScrubX, uScrubX + 6.0, vX));

    vec3 color = mix(uColor, vec3(1.0), uHot * core * 0.42);
    gl_FragColor = vec4(mix(uBackdrop, color, alpha), 1.0);
  }
`;

export const AREA_VERTEX_SHADER = /* glsl */ `
  attribute float aHeight;

  varying float vHeight;
  varying vec2 vPlane;

  void main() {
    vHeight = aHeight;
    vPlane = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Dot grid fixed to the plane: brightest under the curve, fading towards the base. */
export const AREA_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBackdrop;
  uniform float uReveal;
  uniform float uScrubX;
  uniform float uDim;
  uniform float uStrength;

  varying float vHeight;
  varying vec2 vPlane;

  void main() {
    float cell = 7.0;
    vec2 grid = mod(vPlane, cell) - cell * 0.5;
    float radius = mix(0.55, 1.6, vHeight);
    float dots = 1.0 - smoothstep(radius - 0.55, radius + 0.55, length(grid));

    float alpha = (dots * pow(vHeight, 1.7) + pow(vHeight, 3.0) * 0.12) * uStrength;
    alpha *= 1.0 - smoothstep(uReveal - 22.0, uReveal, vPlane.x);
    alpha *= mix(1.0, 0.22, uDim * smoothstep(uScrubX, uScrubX + 6.0, vPlane.x));

    gl_FragColor = vec4(mix(uBackdrop, uColor, alpha), 1.0);
  }
`;

export const QUAD_VERTEX_SHADER = /* glsl */ `
  varying vec2 vQuad;

  void main() {
    vQuad = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SCRUB_LINE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec2 vQuad;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity * 0.5 * smoothstep(0.0, 0.35, vQuad.y));
  }
`;

export const POINT_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBackdrop;
  uniform float uShow;
  uniform float uPulse;
  uniform float uPulseOn;
  uniform float uRadius;

  varying vec2 vQuad;

  void main() {
    float distanceToCenter = length((vQuad - 0.5) * ${POINT_QUAD_PT.toFixed(1)});
    float core = 1.0 - smoothstep(uRadius - 0.8, uRadius + 0.8, distanceToCenter);
    float ring = 1.0 - smoothstep(uRadius + 2.0, uRadius + 3.0, distanceToCenter);
    float halo = exp(-distanceToCenter * distanceToCenter / 338.0) * 0.36;

    float pulseRadius = mix(uRadius + 2.0, 38.0, uPulse);
    float pulseBand = 1.0 - smoothstep(0.8, 2.2, abs(distanceToCenter - pulseRadius));
    float pulse = pulseBand * pow(1.0 - uPulse, 2.0) * 0.7 * uPulseOn;

    vec3 color = mix(mix(uColor, uBackdrop, ring), uColor, core);
    gl_FragColor = vec4(color, max(max(halo, pulse), ring) * uShow);
  }
`;
