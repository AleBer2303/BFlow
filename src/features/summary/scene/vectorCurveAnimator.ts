/**
 * src/features/summary/scene/vectorCurveAnimator.ts
 *
 * Motion of the vector (SVG) curve, free of React so it can be stepped by hand in tests.
 * It follows the same timeline as the three.js scene (`curveMotion.ts`): the line draws in
 * up to today, the projection extends to the month end, the marker pops in and pulses a
 * few times, a metric change morphs the shape and blends the color, and the marker glides
 * to the scrubbed day. It has no glow, tilt or other effect the web system rules out.
 *
 * The owner calls `advance` once per frame while it returns true, then stops: a resting
 * curve schedules no frames. See docs/decisions/0012-animated-vector-curve.md.
 */

import { springConfigs } from '../../../design-system/tokens';
import type {
  MonthlyCurve,
  MonthlyCurveMetricId,
} from '../../../domain/overview/monthlyCurve';
import { curveXForDay, type CurveStop } from './curveGeometry';
import {
  CURVE_MORPH_SECONDS,
  CURVE_PULSE_COUNT,
  CURVE_PULSE_SECONDS,
  CURVE_REVEAL_SECONDS,
  easeInOutCubic,
  resolveCurveRevealShares,
} from './curveMotion';
import { createSpring, isSpringSettled, snapSpring, stepSpring, type SpringState } from './spring';
import {
  buildVectorAreaPath,
  buildVectorCurveGeometry,
  buildVectorLinePath,
  clipVectorPoints,
  type VectorPoint,
} from './vectorCurveGeometry';

export type MetricColors = Record<MonthlyCurveMetricId, string>;

export interface VectorCurveFrame {
  width: number;
  height: number;
  /** Empty while the entrance has not drawn a segment yet. */
  linePath: string;
  areaPath: string;
  /** Null when the month has no projection; empty while it has not been drawn yet. */
  projectionPath: string | null;
  gridLineYs: number[];
  baselineY: number;
  marker: VectorPoint;
  /** 0 hidden, 1 shown; the pop-in may overshoot slightly above 1. */
  markerScale: number;
  /** 0..1 progress of the current pulse ring, or null when the marker rests. */
  pulse: number | null;
  /** 0..1 strength of the scrub guide and of the dimming after the chosen day. */
  focus: number;
  color: string;
}

export interface VectorCurveAnimatorOptions {
  curve: MonthlyCurve;
  metricId: MonthlyCurveMetricId;
  colors: MetricColors;
  reducedMotion: boolean;
}

const MAX_MARKER_SCALE = 1.25;
const HEX_COLOR = /^#([0-9a-f]{6})$/i;

/** Blends two `#RRGGBB` colors; anything else switches at the halfway point. */
export function mixHexColors(from: string, to: string, amount: number): string {
  const share = Math.min(1, Math.max(0, amount));
  const fromMatch = HEX_COLOR.exec(from);
  const toMatch = HEX_COLOR.exec(to);
  if (!fromMatch || !toMatch) {
    return share < 0.5 ? from : to;
  }
  const fromValue = parseInt(fromMatch[1] as string, 16);
  const toValue = parseInt(toMatch[1] as string, 16);
  const channel = (shift: number) => {
    const start = (fromValue >> shift) & 0xff;
    const end = (toValue >> shift) & 0xff;
    return Math.round(start + (end - start) * share);
  };
  const mixed = (channel(16) << 16) | (channel(8) << 8) | channel(0);
  return `#${mixed.toString(16).padStart(6, '0').toUpperCase()}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export class VectorCurveAnimator {
  private curve: MonthlyCurve;
  private metricId: MonthlyCurveMetricId;
  private colors: MetricColors;
  private reducedMotion: boolean;
  private stop: CurveStop | null = null;

  private width = 0;
  private height = 0;
  private xs: number[] = [];
  private targetYs: number[] = [];
  private fromYs: number[] = [];
  private currentYs: number[] = [];
  private projectedX = 0;
  private targetProjectedY = 0;
  private fromProjectedY = 0;
  private currentProjectedY = 0;
  private baselineY = 0;
  private gridLineYs: number[] = [];
  private hasGeometry = false;

  private revealSeconds = 0;
  private isRevealFinished = false;
  private morphSeconds = CURVE_MORPH_SECONDS;
  private pulseSecondsLeft = 0;

  private readonly markerX = createSpring(0);
  private readonly markerY = createSpring(0);
  private readonly focus = createSpring(0);
  private readonly show = createSpring(0);
  private readonly colorBlend = createSpring(1);
  private isMarkerPlaced = false;
  private fromColor: string;
  private toColor: string;

  constructor(options: VectorCurveAnimatorOptions) {
    this.curve = options.curve;
    this.metricId = options.metricId;
    this.colors = options.colors;
    this.reducedMotion = options.reducedMotion;
    this.toColor = options.colors[options.metricId];
    this.fromColor = this.toColor;
    this.settleIfReducedMotion();
  }

  /** @returns true when the size changed and the frame must be redrawn. */
  setSize(width: number, height: number): boolean {
    if (width === this.width && height === this.height) {
      return false;
    }
    this.width = width;
    this.height = height;
    this.loadTargets();
    this.snapShape();
    this.isMarkerPlaced = false;
    this.settleIfReducedMotion();
    return true;
  }

  /** Same month: morphs towards the new data. Another month: replays the entrance. */
  setCurve(curve: MonthlyCurve): void {
    if (curve === this.curve) {
      return;
    }
    const isSameTimeline =
      curve.monthKey === this.curve.monthKey &&
      curve.cutoffDay === this.curve.cutoffDay &&
      curve.daysInMonth === this.curve.daysInMonth &&
      curve.hasProjection === this.curve.hasProjection;

    this.curve = curve;
    if (isSameTimeline) {
      this.startMorph();
    } else {
      this.loadTargets();
      this.snapShape();
      this.revealSeconds = 0;
      this.isRevealFinished = false;
      this.isMarkerPlaced = false;
      this.show.target = 0;
      snapSpring(this.show);
    }
    this.settleIfReducedMotion();
  }

  setMetric(metricId: MonthlyCurveMetricId): void {
    if (metricId === this.metricId) {
      return;
    }
    this.fromColor = this.getColor();
    this.metricId = metricId;
    this.toColor = this.colors[metricId];
    this.colorBlend.value = 0;
    this.colorBlend.velocity = 0;
    this.startMorph();
    this.settleIfReducedMotion();
  }

  /** A theme change swaps the colors at once; only a metric change blends them. */
  setColors(colors: MetricColors): void {
    this.colors = colors;
    this.toColor = colors[this.metricId];
    this.fromColor = this.toColor;
    this.colorBlend.target = 1;
    snapSpring(this.colorBlend);
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.reducedMotion = reducedMotion;
    this.settleIfReducedMotion();
  }

  /** @param stop the day under the pointer, or null to rest on the latest day. */
  setStop(stop: CurveStop | null): void {
    if (stop === this.stop) {
      return;
    }
    if (stop === null) {
      this.wakePulse();
    }
    this.stop = stop;
    this.settleIfReducedMotion();
  }

  /** Steps every motion by `deltaSeconds`. @returns true while something still moves. */
  advance(deltaSeconds: number): boolean {
    // Nothing is visible yet, so the entrance waits for the first layout.
    if (!this.hasGeometry) {
      return false;
    }
    let isMoving = false;

    if (this.revealSeconds < CURVE_REVEAL_SECONDS) {
      this.revealSeconds = Math.min(CURVE_REVEAL_SECONDS, this.revealSeconds + deltaSeconds);
      isMoving = true;
    } else if (!this.isRevealFinished) {
      this.isRevealFinished = true;
      this.wakePulse();
    }

    if (this.morphSeconds < CURVE_MORPH_SECONDS) {
      this.morphSeconds = Math.min(CURVE_MORPH_SECONDS, this.morphSeconds + deltaSeconds);
      const eased = easeInOutCubic(this.morphSeconds / CURVE_MORPH_SECONDS);
      for (let index = 0; index < this.currentYs.length; index += 1) {
        const from = this.fromYs[index] as number;
        this.currentYs[index] = from + ((this.targetYs[index] as number) - from) * eased;
      }
      this.currentProjectedY =
        this.fromProjectedY + (this.targetProjectedY - this.fromProjectedY) * eased;
      isMoving = true;
    }

    stepSpring(this.colorBlend, springConfigs.gentle, deltaSeconds);

    this.updateMarkerTargets();
    if (!this.isMarkerPlaced) {
      snapSpring(this.markerX);
      snapSpring(this.markerY);
      this.isMarkerPlaced = true;
    }
    for (const spring of [this.markerX, this.markerY, this.focus, this.show]) {
      stepSpring(spring, springConfigs.snappy, deltaSeconds);
    }

    if (this.pulseSecondsLeft > 0 && this.stop === null && this.isRevealFinished) {
      this.pulseSecondsLeft = Math.max(0, this.pulseSecondsLeft - deltaSeconds);
      isMoving = isMoving || this.pulseSecondsLeft > 0;
    }

    return (
      isMoving ||
      [this.colorBlend, this.markerX, this.markerY, this.focus, this.show].some(
        (spring: SpringState) => !isSpringSettled(spring)
      )
    );
  }

  /** What to draw now, or null while the stage has no usable size. */
  getFrame(): VectorCurveFrame | null {
    if (!this.hasGeometry) {
      return null;
    }

    const points = this.xs.map((x, index) => ({ x, y: this.currentYs[index] as number }));
    const first = points[0] as VectorPoint;
    const cutoff = points[points.length - 1] as VectorPoint;
    const shares = resolveCurveRevealShares(
      this.revealSeconds / CURVE_REVEAL_SECONDS,
      this.curve.hasProjection
    );
    const visible =
      shares.solid >= 1 ? points : clipVectorPoints(points, first.x + (cutoff.x - first.x) * shares.solid);

    let projectionPath: string | null = null;
    if (this.curve.hasProjection) {
      const endX = cutoff.x + (this.projectedX - cutoff.x) * shares.projection;
      const endY = cutoff.y + (this.currentProjectedY - cutoff.y) * shares.projection;
      projectionPath =
        shares.projection > 0 ? buildVectorLinePath([cutoff, { x: endX, y: endY }]) : '';
    }

    const isPulsing = this.pulseSecondsLeft > 0 && this.stop === null && this.isRevealFinished;
    const pulseElapsed = CURVE_PULSE_SECONDS * CURVE_PULSE_COUNT - this.pulseSecondsLeft;

    return {
      width: this.width,
      height: this.height,
      linePath: buildVectorLinePath(visible),
      areaPath: buildVectorAreaPath(visible, this.baselineY),
      projectionPath,
      gridLineYs: this.gridLineYs,
      baselineY: this.baselineY,
      marker: { x: this.markerX.value, y: this.markerY.value },
      markerScale: clamp(this.show.value, 0, MAX_MARKER_SCALE),
      pulse: isPulsing ? (pulseElapsed % CURVE_PULSE_SECONDS) / CURVE_PULSE_SECONDS : null,
      focus: clamp(this.focus.value, 0, 1),
      color: this.getColor(),
    };
  }

  private getColor(): string {
    return isSpringSettled(this.colorBlend)
      ? this.toColor
      : mixHexColors(this.fromColor, this.toColor, this.colorBlend.value);
  }

  private loadTargets(): void {
    const geometry = buildVectorCurveGeometry(this.curve, this.metricId, this.width, this.height);
    this.hasGeometry = geometry !== null;
    if (geometry === null) {
      return;
    }
    this.xs = geometry.points.map((point) => point.x);
    this.targetYs = geometry.points.map((point) => point.y);
    this.baselineY = geometry.baselineY;
    this.gridLineYs = geometry.gridLineYs;
    this.projectedX = geometry.projectedPoint?.x ?? geometry.cutoffPoint.x;
    this.targetProjectedY = geometry.projectedPoint?.y ?? geometry.cutoffPoint.y;
  }

  private snapShape(): void {
    this.currentYs = [...this.targetYs];
    this.currentProjectedY = this.targetProjectedY;
    this.morphSeconds = CURVE_MORPH_SECONDS;
  }

  private startMorph(): void {
    const canMorph = this.hasGeometry && this.currentYs.length > 0;
    this.fromYs = [...this.currentYs];
    this.fromProjectedY = this.currentProjectedY;
    this.loadTargets();
    if (!canMorph || this.fromYs.length !== this.targetYs.length) {
      this.snapShape();
    } else {
      this.morphSeconds = 0;
    }
    this.wakePulse();
  }

  private wakePulse(): void {
    this.pulseSecondsLeft = this.reducedMotion ? 0 : CURVE_PULSE_SECONDS * CURVE_PULSE_COUNT;
  }

  private resolveMarkerTarget(): VectorPoint {
    const lastIndex = this.currentYs.length - 1;
    if (this.stop === 'close') {
      return { x: this.projectedX, y: this.currentProjectedY };
    }
    if (this.stop === null) {
      return { x: this.xs[lastIndex] ?? 0, y: this.currentYs[lastIndex] ?? 0 };
    }

    const { cutoffDay, daysInMonth } = this.curve;
    const position = (this.stop / cutoffDay) * lastIndex;
    const lower = Math.floor(position);
    const upper = Math.min(lastIndex, lower + 1);
    const lowerY = this.currentYs[lower] ?? 0;
    return {
      x: curveXForDay(this.stop, daysInMonth, this.width),
      y: lowerY + ((this.currentYs[upper] ?? lowerY) - lowerY) * (position - lower),
    };
  }

  private updateMarkerTargets(): void {
    const target = this.resolveMarkerTarget();
    const solidShare = resolveCurveRevealShares(
      this.revealSeconds / CURVE_REVEAL_SECONDS,
      this.curve.hasProjection
    ).solid;
    this.markerX.target = target.x;
    this.markerY.target = target.y;
    this.focus.target = this.stop === null ? 0 : 1;
    this.show.target = solidShare >= 1 ? 1 : 0;
  }

  private settleIfReducedMotion(): void {
    if (!this.reducedMotion) {
      return;
    }
    this.revealSeconds = CURVE_REVEAL_SECONDS;
    this.isRevealFinished = true;
    this.pulseSecondsLeft = 0;
    this.snapShape();
    this.colorBlend.target = 1;
    snapSpring(this.colorBlend);
    this.fromColor = this.toColor;

    this.updateMarkerTargets();
    for (const spring of [this.markerX, this.markerY, this.focus, this.show]) {
      snapSpring(spring);
    }
    this.isMarkerPlaced = true;
  }
}
