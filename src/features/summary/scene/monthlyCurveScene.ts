/**
 * src/features/summary/scene/monthlyCurveScene.ts
 *
 * Imperative three.js scene behind the Summary curve: a glowing line over a dot grid,
 * a dashed projection and a marker for the selected day. It renders on demand: the frame
 * loop only runs while something moves, so a resting scene issues no GL calls.
 * See docs/decisions/0008-monthly-curve-replaces-tubes.md.
 */

import type { ExpoWebGLRenderingContext } from 'expo-gl';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ColorManagement,
  CustomBlending,
  DynamicDrawUsage,
  Group,
  LinearSRGBColorSpace,
  MathUtils,
  MaxEquation,
  Mesh,
  MinEquation,
  OneFactor,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  type ColorRepresentation,
} from 'three';
import { springConfigs } from '../../../design-system/tokens';
import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import {
  curveXForDay,
  fillCurveSamples,
  normalizeCurveValue,
  type CurveStop,
} from './curveGeometry';
import {
  AREA_FRAGMENT_SHADER,
  AREA_VERTEX_SHADER,
  POINT_FRAGMENT_SHADER,
  POINT_QUAD_PT,
  QUAD_VERTEX_SHADER,
  RIBBON_FRAGMENT_SHADER,
  RIBBON_VERTEX_SHADER,
  SCRUB_LINE_FRAGMENT_SHADER,
} from './curveShaders';
import type { ScenePalette } from './scenePalette';
import {
  createSpring,
  isSpringSettled,
  snapSpring,
  stepSpring,
  type SpringState,
} from './spring';

const CURVE_SAMPLES = 372;
const DASH_SAMPLES = 24;
const PAD_TOP_PT = 34;
const PAD_BOTTOM_PT = 4;

const GLOW_HALF_WIDTH_PT = 16;
const LINE_HALF_WIDTH_PT = 3.4;
const LINE_CORE_PT = 1.4;
const DASH_HALF_WIDTH_PT = 4;
const DASH_CORE_PT = 1;
/** Below zero the ribbon has no solid center, leaving only its glow. */
const NO_CORE_PT = -2;
const POINT_RADIUS_PT = 5;
const SCRUB_LINE_WIDTH_PT = 1.5;

const CAMERA_FOV_DEGREES = 28;
const SCRUB_TILT_Y = 0.2;
const SCRUB_TILT_X = -0.045;

const REVEAL_SECONDS = 1.5;
const REVEAL_SOLID_SHARE = 0.76;
const REVEAL_EDGE_PT = 7;
const REVEAL_CLEARANCE_PT = 40;
const DASH_REVEAL_INSET_PT = 8;
const MORPH_SECONDS = 0.56;
const PULSE_SECONDS = 1.9;
const PULSE_COUNT = 3;

const FALLBACK_FRAME_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 1 / 20;
/** Native surfaces can drop the very first presented frames right after creation. */
const MIN_PRESENTED_FRAMES = 3;

export interface CurveSceneRenderer {
  setSize(width: number, height: number, updateStyle?: boolean): void;
  setClearColor(color: ColorRepresentation, alpha?: number): void;
  render(scene: Scene, camera: PerspectiveCamera): void;
  dispose(): void;
}

export interface MonthlyCurveSceneOptions {
  gl: ExpoWebGLRenderingContext;
  bufferWidth: number;
  bufferHeight: number;
  /** Device pixels per layout point: lines and dots are sized in points. */
  pixelRatio: number;
  palette: ScenePalette;
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
  reducedMotion: boolean;
  onRenderError?: (error: unknown) => void;
  createRenderer?: (gl: ExpoWebGLRenderingContext) => CurveSceneRenderer;
  requestFrame?: (callback: (timestamp: number) => void) => number;
  cancelFrame?: (handle: number) => void;
}

export interface CurveSceneSnapshot {
  revealProgress: number;
  morphProgress: number;
  pointX: number;
  pointY: number;
  focus: number;
  tiltY: number;
  colorHex: string;
  isDashVisible: boolean;
  isPulsing: boolean;
  blendEquation: number;
}

type NumberUniform = { value: number };
type ColorUniform = { value: Color };

interface RibbonUniforms {
  [uniform: string]: NumberUniform | ColorUniform;
  uColor: ColorUniform;
  uBackdrop: ColorUniform;
  uScrubX: NumberUniform;
  uDim: NumberUniform;
  uHalfWidth: NumberUniform;
  uCore: NumberUniform;
  uGlow: NumberUniform;
  uHot: NumberUniform;
  uDashed: NumberUniform;
  uReveal: NumberUniform;
}

interface Ribbon {
  count: number;
  halfWidth: number;
  positions: Float32Array;
  lengths: Float32Array;
  geometry: BufferGeometry;
  material: ShaderMaterial;
  uniforms: RibbonUniforms;
  mesh: Mesh;
}

/** Native GL contexts have no canvas, but WebGLRenderer needs one to attach to. */
function createCanvasAdapter(gl: ExpoWebGLRenderingContext): HTMLCanvasElement {
  const adapter = {
    width: gl.drawingBufferWidth,
    height: gl.drawingBufferHeight,
    style: {},
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return adapter as unknown as HTMLCanvasElement;
}

/**
 * expo-gl before 58.0.4, still shipped inside Expo Go, reports WebGL 2 contexts as
 * `instanceof WebGLRenderingContext`, which three.js rejects as WebGL 1. Hiding that
 * global only while the renderer is built skips the false positive. `supportsWebGL2`
 * exists only on native contexts, so a real WebGL 1 context is still rejected.
 */
function buildRendererForContext(gl: ExpoWebGLRenderingContext): WebGLRenderer {
  const build = () =>
    new WebGLRenderer({
      canvas: (gl.canvas as HTMLCanvasElement | undefined) ?? createCanvasAdapter(gl),
      context: gl,
    });

  if ((gl as unknown as { supportsWebGL2?: boolean }).supportsWebGL2 !== true) {
    return build();
  }

  const scope = globalThis as unknown as { WebGLRenderingContext?: unknown };
  const webGl1Constructor = scope.WebGLRenderingContext;
  scope.WebGLRenderingContext = undefined;
  try {
    return build();
  } finally {
    scope.WebGLRenderingContext = webGl1Constructor;
  }
}

export function createCurveRenderer(gl: ExpoWebGLRenderingContext): CurveSceneRenderer {
  const renderer = buildRendererForContext(gl);
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.setPixelRatio(1);
  return renderer;
}

function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

function createTriangleStripIndices(columnCount: number): BufferAttribute {
  const indices = new Uint16Array((columnCount - 1) * 6);
  for (let column = 0; column < columnCount - 1; column += 1) {
    const first = column * 2;
    indices.set([first, first + 1, first + 2, first + 1, first + 3, first + 2], column * 6);
  }
  return new BufferAttribute(indices, 1);
}

export class MonthlyCurveScene {
  private readonly gl: ExpoWebGLRenderingContext;
  private readonly renderer: CurveSceneRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 1, 4000);
  private readonly pivot = new Group();
  private readonly plane = new Group();
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: ShaderMaterial[] = [];
  private readonly pixelRatio: number;
  private readonly onRenderError?: (error: unknown) => void;
  private readonly requestFrameFn: (callback: (timestamp: number) => void) => number;
  private readonly cancelFrameFn: (handle: number) => void;

  private readonly color: ColorUniform = { value: new Color() };
  private readonly backdrop: ColorUniform = { value: new Color() };
  private readonly scrubX: NumberUniform = { value: 0 };
  private readonly dim: NumberUniform = { value: 0 };
  private readonly fromColor = new Color();
  private readonly toColor = new Color();

  private readonly curveXs = new Float32Array(CURVE_SAMPLES);
  private readonly curveYs = new Float32Array(CURVE_SAMPLES);
  private readonly dashXs = new Float32Array(DASH_SAMPLES);
  private readonly dashYs = new Float32Array(DASH_SAMPLES);
  private readonly currentNorms = new Float32Array(CURVE_SAMPLES);
  private readonly fromNorms = new Float32Array(CURVE_SAMPLES);
  private readonly targetNorms = new Float32Array(CURVE_SAMPLES);

  private readonly glow: Ribbon;
  private readonly line: Ribbon;
  private readonly dash: Ribbon;
  private readonly areaPositions = new Float32Array(CURVE_SAMPLES * 6);
  private readonly areaGeometry = new BufferGeometry();
  private readonly areaUniforms = {
    uColor: this.color,
    uBackdrop: this.backdrop,
    uScrubX: this.scrubX,
    uDim: this.dim,
    uReveal: { value: 0 },
    uStrength: { value: 0 },
  };
  private readonly scrubLineUniforms = { uColor: this.color, uOpacity: { value: 0 } };
  private readonly pointUniforms = {
    uColor: this.color,
    uBackdrop: this.backdrop,
    uShow: { value: 0 },
    uPulse: { value: 0 },
    uPulseOn: { value: 0 },
    uRadius: { value: POINT_RADIUS_PT },
  };
  private readonly scrubLine: Mesh;
  private readonly point: Mesh;

  private readonly pointXSpring = createSpring(0);
  private readonly pointYSpring = createSpring(0);
  private readonly focusSpring = createSpring(0);
  private readonly showSpring = createSpring(0);
  private readonly tiltYSpring = createSpring(0);
  private readonly tiltXSpring = createSpring(0);
  private readonly colorSpring = createSpring(1);

  private palette: ScenePalette;
  private curve: MonthlyCurve;
  private metricId: MonthlyCurveMetricId;
  private reducedMotion: boolean;
  private stop: CurveStop | null = null;
  private width = 1;
  private height = 1;
  private bufferWidth = 0;
  private bufferHeight = 0;
  private currentEndNorm = 0;
  private fromEndNorm = 0;
  private targetEndNorm = 0;
  private revealSeconds = 0;
  private morphSeconds = MORPH_SECONDS;
  private pulseSecondsLeft = 0;
  private isRevealFinished = false;
  private isPointPlaced = false;
  private frameHandle: number | null = null;
  private lastTimestamp: number | null = null;
  private framesToPresent = MIN_PRESENTED_FRAMES;
  private isActive = true;
  private isDisposed = false;

  constructor(options: MonthlyCurveSceneOptions) {
    // Token colors must reach the screen untouched, in both the scene and the page.
    ColorManagement.enabled = false;

    this.gl = options.gl;
    this.pixelRatio = options.pixelRatio;
    this.palette = options.palette;
    this.curve = options.curve;
    this.metricId = options.metricId;
    this.reducedMotion = options.reducedMotion;
    this.onRenderError = options.onRenderError;
    this.renderer = (options.createRenderer ?? createCurveRenderer)(options.gl);
    // Wrapped because browsers reject these functions when called as a method of another object.
    this.requestFrameFn =
      options.requestFrame ?? ((callback) => requestAnimationFrame(callback));
    this.cancelFrameFn = options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle));

    this.pivot.add(this.plane);
    this.scene.add(this.pivot);

    this.buildArea();
    this.glow = this.createRibbon(CURVE_SAMPLES, GLOW_HALF_WIDTH_PT, NO_CORE_PT, false);
    this.line = this.createRibbon(CURVE_SAMPLES, LINE_HALF_WIDTH_PT, LINE_CORE_PT, false);
    this.dash = this.createRibbon(DASH_SAMPLES, DASH_HALF_WIDTH_PT, DASH_CORE_PT, true);
    this.scrubLine = this.createQuad(
      new PlaneGeometry(1, 1),
      SCRUB_LINE_FRAGMENT_SHADER,
      this.scrubLineUniforms,
      2
    );
    this.point = this.createQuad(
      new PlaneGeometry(POINT_QUAD_PT, POINT_QUAD_PT),
      POINT_FRAGMENT_SHADER,
      this.pointUniforms,
      3
    );

    this.dash.mesh.visible = options.curve.hasProjection;
    this.applyPalette();
    this.loadTargets();
    this.currentNorms.set(this.targetNorms);
    this.currentEndNorm = this.targetEndNorm;
    this.snapColor();
    this.resize(options.bufferWidth, options.bufferHeight);
    this.settleIfReducedMotion();
    this.requestRender();
  }

  /** Same month: morphs towards the new data. Another month: replays the entrance. */
  setCurve(curve: MonthlyCurve): void {
    const isSameTimeline =
      curve.monthKey === this.curve.monthKey &&
      curve.cutoffDay === this.curve.cutoffDay &&
      curve.hasProjection === this.curve.hasProjection;

    this.curve = curve;
    this.dash.mesh.visible = curve.hasProjection;
    this.layoutTimeline();

    if (isSameTimeline) {
      this.startMorph();
    } else {
      this.loadTargets();
      this.currentNorms.set(this.targetNorms);
      this.currentEndNorm = this.targetEndNorm;
      this.morphSeconds = MORPH_SECONDS;
      this.revealSeconds = 0;
      this.isRevealFinished = false;
      this.isPointPlaced = false;
      this.showSpring.target = 0;
      snapSpring(this.showSpring);
      this.syncGeometry();
    }
    this.settleIfReducedMotion();
    this.requestRender();
  }

  setMetric(metricId: MonthlyCurveMetricId): void {
    if (metricId === this.metricId) {
      return;
    }
    this.metricId = metricId;
    this.fromColor.copy(this.color.value);
    this.toColor.set(this.palette.metrics[metricId]);
    this.colorSpring.value = 0;
    this.colorSpring.velocity = 0;
    this.startMorph();
    this.settleIfReducedMotion();
    this.requestRender();
  }

  setPalette(palette: ScenePalette): void {
    this.palette = palette;
    this.applyPalette();
    this.snapColor();
    this.requestRender();
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.settleIfReducedMotion();
    this.requestRender();
  }

  /** Stops drawing while the app is not in the foreground; iOS forbids GL work there. */
  setActive(isActive: boolean): void {
    if (isActive === this.isActive) {
      return;
    }
    this.isActive = isActive;
    if (isActive) {
      this.lastTimestamp = null;
      this.framesToPresent = MIN_PRESENTED_FRAMES;
      this.requestRender();
    } else {
      this.cancelPendingFrame();
    }
  }

  /** @param stop the position under the finger, or null to rest on the latest day. */
  setStop(stop: CurveStop | null): void {
    if (stop === this.stop) {
      return;
    }
    if (stop === null) {
      this.wakePulse();
    }
    this.stop = stop;
    this.settleIfReducedMotion();
    this.requestRender();
  }

  resize(bufferWidth: number, bufferHeight: number): void {
    if (
      bufferWidth <= 0 ||
      bufferHeight <= 0 ||
      (bufferWidth === this.bufferWidth && bufferHeight === this.bufferHeight)
    ) {
      return;
    }
    this.bufferWidth = bufferWidth;
    this.bufferHeight = bufferHeight;
    this.width = bufferWidth / this.pixelRatio;
    this.height = bufferHeight / this.pixelRatio;
    this.renderer.setSize(bufferWidth, bufferHeight, false);

    const distance =
      this.height / 2 / Math.tan(MathUtils.degToRad(CAMERA_FOV_DEGREES / 2));
    this.camera.aspect = this.width / this.height;
    this.camera.position.set(0, 0, distance);
    this.camera.near = Math.max(1, distance * 0.3);
    this.camera.far = distance * 3;
    this.camera.updateProjectionMatrix();
    this.plane.position.set(-this.width / 2, -this.height / 2, 0);

    this.scrubLine.scale.set(SCRUB_LINE_WIDTH_PT, this.height, 1);
    this.scrubLine.position.y = this.height / 2;
    this.isPointPlaced = false;
    this.layoutTimeline();
    this.framesToPresent = MIN_PRESENTED_FRAMES;
    this.requestRender();
  }

  isIdle(): boolean {
    return this.frameHandle === null;
  }

  getSnapshot(): CurveSceneSnapshot {
    return {
      revealProgress: this.getRevealProgress(),
      morphProgress: this.morphSeconds / MORPH_SECONDS,
      pointX: this.pointXSpring.value,
      pointY: this.pointYSpring.value,
      focus: this.focusSpring.value,
      tiltY: this.tiltYSpring.value,
      colorHex: `#${this.color.value.getHexString()}`,
      isDashVisible: this.dash.mesh.visible,
      isPulsing: this.pulseSecondsLeft > 0,
      blendEquation: this.line.material.blendEquation,
    };
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.cancelPendingFrame();
    for (const geometry of this.geometries) {
      geometry.dispose();
    }
    for (const material of this.materials) {
      material.dispose();
    }
    this.renderer.dispose();
  }

  private track<T extends ShaderMaterial>(material: T): T {
    this.materials.push(material);
    return material;
  }

  private trackGeometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private addMesh(geometry: BufferGeometry, material: ShaderMaterial, renderOrder: number): Mesh {
    const mesh = new Mesh(geometry, material);
    // Vertices are rewritten by hand, so the geometry's static bounds are not reliable.
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    this.plane.add(mesh);
    return mesh;
  }

  private buildArea(): void {
    const heights = new Float32Array(CURVE_SAMPLES * 2);
    for (let column = 0; column < CURVE_SAMPLES; column += 1) {
      heights[column * 2] = 1;
    }

    this.areaGeometry.setAttribute(
      'position',
      new BufferAttribute(this.areaPositions, 3).setUsage(DynamicDrawUsage)
    );
    this.areaGeometry.setAttribute('aHeight', new BufferAttribute(heights, 1));
    this.areaGeometry.setIndex(createTriangleStripIndices(CURVE_SAMPLES));
    this.trackGeometry(this.areaGeometry);

    const material = this.track(
      new ShaderMaterial({
        vertexShader: AREA_VERTEX_SHADER,
        fragmentShader: AREA_FRAGMENT_SHADER,
        uniforms: this.areaUniforms,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.addMesh(this.areaGeometry, material, 0);
  }

  private createRibbon(
    count: number,
    halfWidth: number,
    core: number,
    isDashed: boolean
  ): Ribbon {
    const positions = new Float32Array(count * 6);
    const lengths = new Float32Array(count * 2);
    const sides = new Float32Array(count * 2);
    for (let index = 0; index < count; index += 1) {
      sides[index * 2] = 1;
      sides[index * 2 + 1] = -1;
    }

    const geometry = this.trackGeometry(new BufferGeometry());
    geometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aLength', new BufferAttribute(lengths, 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
    geometry.setIndex(createTriangleStripIndices(count));

    const uniforms: RibbonUniforms = {
      uColor: this.color,
      uBackdrop: this.backdrop,
      uScrubX: this.scrubX,
      uDim: this.dim,
      uHalfWidth: { value: halfWidth },
      uCore: { value: core },
      uGlow: { value: 0 },
      uHot: { value: 0 },
      uDashed: { value: isDashed ? 1 : 0 },
      uReveal: { value: 0 },
    };
    const material = this.track(
      new ShaderMaterial({
        vertexShader: RIBBON_VERTEX_SHADER,
        fragmentShader: RIBBON_FRAGMENT_SHADER,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneFactor,
      })
    );
    const mesh = this.addMesh(geometry, material, 1);

    return { count, halfWidth, positions, lengths, geometry, material, uniforms, mesh };
  }

  private createQuad(
    geometry: PlaneGeometry,
    fragmentShader: string,
    uniforms: Record<string, NumberUniform | ColorUniform>,
    renderOrder: number
  ): Mesh {
    const material = this.track(
      new ShaderMaterial({
        vertexShader: QUAD_VERTEX_SHADER,
        fragmentShader,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
    );
    return this.addMesh(this.trackGeometry(geometry), material, renderOrder);
  }

  private writeRibbon(ribbon: Ribbon, xs: Float32Array, ys: Float32Array): void {
    const { count, halfWidth, positions, lengths } = ribbon;
    let length = 0;

    for (let index = 0; index < count; index += 1) {
      const previous = Math.max(0, index - 1);
      const next = Math.min(count - 1, index + 1);
      const x = xs[index] as number;
      const y = ys[index] as number;
      const deltaX = (xs[next] as number) - (xs[previous] as number);
      const deltaY = (ys[next] as number) - (ys[previous] as number);
      const magnitude = Math.hypot(deltaX, deltaY) || 1;
      const normalX = (-deltaY / magnitude) * halfWidth;
      const normalY = (deltaX / magnitude) * halfWidth;

      if (index > 0) {
        length += Math.hypot(x - (xs[index - 1] as number), y - (ys[index - 1] as number));
      }

      const offset = index * 6;
      positions[offset] = x + normalX;
      positions[offset + 1] = y + normalY;
      positions[offset + 3] = x - normalX;
      positions[offset + 4] = y - normalY;
      lengths[index * 2] = length;
      lengths[index * 2 + 1] = length;
    }

    (ribbon.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (ribbon.geometry.getAttribute('aLength') as BufferAttribute).needsUpdate = true;
  }

  private loadTargets(): void {
    const series = this.curve.series[this.metricId];
    fillCurveSamples(series, this.curve.cutoffDay, this.targetNorms);
    this.targetEndNorm = normalizeCurveValue(series, series.projectedClose);
  }

  private startMorph(): void {
    this.fromNorms.set(this.currentNorms);
    this.fromEndNorm = this.currentEndNorm;
    this.loadTargets();
    this.morphSeconds = 0;
    this.wakePulse();
  }

  private yForNorm(norm: number): number {
    return PAD_BOTTOM_PT + norm * (this.height - PAD_BOTTOM_PT - PAD_TOP_PT);
  }

  private layoutTimeline(): void {
    const { cutoffDay, daysInMonth } = this.curve;
    for (let index = 0; index < CURVE_SAMPLES; index += 1) {
      const day = (index / (CURVE_SAMPLES - 1)) * cutoffDay;
      this.curveXs[index] = curveXForDay(day, daysInMonth, this.width);
    }
    for (let index = 0; index < DASH_SAMPLES; index += 1) {
      const day = cutoffDay + (daysInMonth - cutoffDay) * (index / (DASH_SAMPLES - 1));
      this.dashXs[index] = curveXForDay(day, daysInMonth, this.width);
    }
    this.syncGeometry();
  }

  private syncGeometry(): void {
    for (let index = 0; index < CURVE_SAMPLES; index += 1) {
      const x = this.curveXs[index] as number;
      const y = this.yForNorm(this.currentNorms[index] as number);
      const offset = index * 6;

      this.curveYs[index] = y;
      this.areaPositions[offset] = x;
      this.areaPositions[offset + 1] = y;
      this.areaPositions[offset + 3] = x;
    }
    (this.areaGeometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.writeRibbon(this.glow, this.curveXs, this.curveYs);
    this.writeRibbon(this.line, this.curveXs, this.curveYs);

    const startY = this.curveYs[CURVE_SAMPLES - 1] as number;
    const endY = this.yForNorm(this.currentEndNorm);
    for (let index = 0; index < DASH_SAMPLES; index += 1) {
      this.dashYs[index] = startY + (endY - startY) * (index / (DASH_SAMPLES - 1));
    }
    this.writeRibbon(this.dash, this.dashXs, this.dashYs);
  }

  private applyPalette(): void {
    const palette = this.palette;
    this.renderer.setClearColor(palette.backdrop, 1);
    this.backdrop.value.set(palette.backdrop);
    this.toColor.set(palette.metrics[this.metricId]);

    // Line colors are brighter than a dark page and darker than a light one.
    const equation = palette.isDark ? MaxEquation : MinEquation;
    this.glow.material.blendEquation = equation;
    this.line.material.blendEquation = equation;
    this.dash.material.blendEquation = equation;

    this.glow.uniforms.uGlow.value = palette.glowStrength;
    this.line.uniforms.uHot.value = palette.lineHeat;
    this.areaUniforms.uStrength.value = palette.areaStrength;
  }

  private snapColor(): void {
    this.color.value.copy(this.toColor);
    this.colorSpring.value = 1;
    this.colorSpring.velocity = 0;
  }

  private wakePulse(): void {
    this.pulseSecondsLeft = this.reducedMotion ? 0 : PULSE_SECONDS * PULSE_COUNT;
  }

  private getRevealProgress(): number {
    return Math.min(1, this.revealSeconds / REVEAL_SECONDS);
  }

  private settleIfReducedMotion(): void {
    if (!this.reducedMotion) {
      return;
    }
    this.revealSeconds = REVEAL_SECONDS;
    this.isRevealFinished = true;
    this.morphSeconds = MORPH_SECONDS;
    this.pulseSecondsLeft = 0;
    this.currentNorms.set(this.targetNorms);
    this.currentEndNorm = this.targetEndNorm;
    this.snapColor();
    this.syncGeometry();

    this.isPointPlaced = false;
    this.showSpring.target = 1;
    this.focusSpring.target = this.stop === null ? 0 : 1;
    this.tiltYSpring.target = 0;
    this.tiltXSpring.target = 0;
    snapSpring(this.showSpring);
    snapSpring(this.focusSpring);
    snapSpring(this.tiltYSpring);
    snapSpring(this.tiltXSpring);
    this.framesToPresent = Math.max(this.framesToPresent, MIN_PRESENTED_FRAMES);
  }

  private requestRender(): void {
    if (this.frameHandle !== null || this.isDisposed || !this.isActive) {
      return;
    }
    this.framesToPresent = Math.max(this.framesToPresent, 1);
    this.frameHandle = this.requestFrameFn(this.handleFrame);
  }

  private cancelPendingFrame(): void {
    if (this.frameHandle !== null) {
      this.cancelFrameFn(this.frameHandle);
      this.frameHandle = null;
    }
    this.lastTimestamp = null;
  }

  private readonly handleFrame = (timestamp: number): void => {
    this.frameHandle = null;
    if (this.isDisposed || !this.isActive) {
      return;
    }

    const deltaSeconds =
      this.lastTimestamp === null
        ? FALLBACK_FRAME_SECONDS
        : MathUtils.clamp((timestamp - this.lastTimestamp) / 1000, 0, MAX_FRAME_SECONDS);
    this.lastTimestamp = timestamp;

    const isMoving = this.advance(deltaSeconds);

    try {
      this.renderer.render(this.scene, this.camera);
      this.gl.endFrameEXP();
    } catch (error) {
      this.dispose();
      this.onRenderError?.(error);
      return;
    }

    this.framesToPresent -= 1;
    if (isMoving || this.framesToPresent > 0) {
      this.frameHandle = this.requestFrameFn(this.handleFrame);
    } else {
      this.lastTimestamp = null;
    }
  };

  private advance(deltaSeconds: number): boolean {
    const isTimelineMoving = this.advanceTimeline(deltaSeconds);
    const solidShare = this.applyReveal();
    const isMarkerMoving = this.advanceMarker(deltaSeconds, solidShare);
    const isPulsing = this.advancePulse(deltaSeconds);
    return isTimelineMoving || isMarkerMoving || isPulsing;
  }

  private advanceTimeline(deltaSeconds: number): boolean {
    let isMoving = false;

    if (this.revealSeconds < REVEAL_SECONDS) {
      this.revealSeconds += deltaSeconds;
      isMoving = true;
    } else if (!this.isRevealFinished) {
      this.isRevealFinished = true;
      this.wakePulse();
    }

    if (this.morphSeconds < MORPH_SECONDS) {
      this.morphSeconds = Math.min(MORPH_SECONDS, this.morphSeconds + deltaSeconds);
      const eased = easeInOutCubic(this.morphSeconds / MORPH_SECONDS);
      for (let index = 0; index < CURVE_SAMPLES; index += 1) {
        const from = this.fromNorms[index] as number;
        this.currentNorms[index] = from + ((this.targetNorms[index] as number) - from) * eased;
      }
      this.currentEndNorm = this.fromEndNorm + (this.targetEndNorm - this.fromEndNorm) * eased;
      this.syncGeometry();
      isMoving = true;
    }

    stepSpring(this.colorSpring, springConfigs.gentle, deltaSeconds);
    this.color.value.lerpColors(
      this.fromColor,
      this.toColor,
      MathUtils.clamp(this.colorSpring.value, 0, 1)
    );
    return isMoving || !isSpringSettled(this.colorSpring);
  }

  /** Draws the line up to today first, then extends the projection. Returns the line's share. */
  private applyReveal(): number {
    const eased = easeInOutCubic(this.getRevealProgress());
    const { hasProjection } = this.curve;
    const solidShare = hasProjection ? Math.min(1, eased / REVEAL_SOLID_SHARE) : eased;
    const dashShare = hasProjection
      ? Math.max(0, (eased - REVEAL_SOLID_SHARE) / (1 - REVEAL_SOLID_SHARE))
      : 0;

    const startX = this.curveXs[0] as number;
    const latestX = this.curveXs[CURVE_SAMPLES - 1] as number;
    const endX = this.dashXs[DASH_SAMPLES - 1] as number;
    const solidReveal =
      startX +
      (latestX - startX) * solidShare +
      REVEAL_EDGE_PT +
      (solidShare >= 1 ? REVEAL_CLEARANCE_PT : 0);

    this.glow.uniforms.uReveal.value = solidReveal;
    this.line.uniforms.uReveal.value = solidReveal;
    this.areaUniforms.uReveal.value = solidReveal;
    this.dash.uniforms.uReveal.value =
      latestX - DASH_REVEAL_INSET_PT + (endX - latestX + DASH_REVEAL_INSET_PT * 2) * dashShare;
    return solidShare;
  }

  private resolvePointTarget(): { x: number; y: number } {
    const { cutoffDay, daysInMonth } = this.curve;

    if (this.stop === 'close') {
      return {
        x: this.dashXs[DASH_SAMPLES - 1] as number,
        y: this.dashYs[DASH_SAMPLES - 1] as number,
      };
    }

    const day = this.stop ?? cutoffDay;
    const position = (day / cutoffDay) * (CURVE_SAMPLES - 1);
    const lower = Math.floor(position);
    const upper = Math.min(CURVE_SAMPLES - 1, lower + 1);
    const lowerY = this.curveYs[lower] as number;
    return {
      x: curveXForDay(day, daysInMonth, this.width),
      y: lowerY + ((this.curveYs[upper] as number) - lowerY) * (position - lower),
    };
  }

  private advanceMarker(deltaSeconds: number, solidShare: number): boolean {
    const target = this.resolvePointTarget();
    const isScrubbing = this.stop !== null;

    this.pointXSpring.target = target.x;
    this.pointYSpring.target = target.y;
    this.focusSpring.target = isScrubbing ? 1 : 0;
    this.showSpring.target = solidShare >= 1 ? 1 : 0;

    if (!this.isPointPlaced) {
      snapSpring(this.pointXSpring);
      snapSpring(this.pointYSpring);
      this.isPointPlaced = true;
    }

    const allowsTilt = isScrubbing && !this.reducedMotion;
    this.tiltYSpring.target = allowsTilt
      ? (this.pointXSpring.value / this.width - 0.5) * SCRUB_TILT_Y
      : 0;
    this.tiltXSpring.target = allowsTilt ? SCRUB_TILT_X : 0;

    const snappy = springConfigs.snappy;
    stepSpring(this.pointXSpring, snappy, deltaSeconds);
    stepSpring(this.pointYSpring, snappy, deltaSeconds);
    stepSpring(this.focusSpring, snappy, deltaSeconds);
    stepSpring(this.showSpring, snappy, deltaSeconds);
    stepSpring(this.tiltYSpring, springConfigs.gentle, deltaSeconds);
    stepSpring(this.tiltXSpring, springConfigs.gentle, deltaSeconds);

    if (this.reducedMotion) {
      snapSpring(this.pointXSpring);
      snapSpring(this.pointYSpring);
      snapSpring(this.focusSpring);
    }

    const pointX = this.pointXSpring.value;
    const focus = MathUtils.clamp(this.focusSpring.value, 0, 1);
    this.point.position.set(pointX, this.pointYSpring.value, 0);
    this.scrubLine.position.x = pointX;
    this.scrubX.value = pointX;
    this.dim.value = focus;
    this.scrubLineUniforms.uOpacity.value = focus;
    this.pointUniforms.uShow.value = MathUtils.clamp(this.showSpring.value, 0, 1);
    this.pivot.rotation.set(this.tiltXSpring.value, this.tiltYSpring.value, 0);

    return [
      this.pointXSpring,
      this.pointYSpring,
      this.focusSpring,
      this.showSpring,
      this.tiltYSpring,
      this.tiltXSpring,
    ].some((spring: SpringState) => !isSpringSettled(spring));
  }

  private advancePulse(deltaSeconds: number): boolean {
    if (this.pulseSecondsLeft <= 0 || this.stop !== null || !this.isRevealFinished) {
      this.pointUniforms.uPulseOn.value = 0;
      return false;
    }

    this.pulseSecondsLeft -= deltaSeconds;
    const elapsed = PULSE_SECONDS * PULSE_COUNT - this.pulseSecondsLeft;
    this.pointUniforms.uPulse.value = (elapsed % PULSE_SECONDS) / PULSE_SECONDS;
    this.pointUniforms.uPulseOn.value = 1;
    return true;
  }
}
