/**
 * src/design-system/components/charts/chartTransition.ts
 *
 * Motion of every chart, free of React so tests can step it by hand. A chart hands over
 * the numbers it draws (bar heights, line points, donut angles) and reads back the values
 * to draw on this frame:
 * - Entrance: each value grows from zero, one after another (a short stagger).
 * - New data (another month, a completed movement): values move from where they are to the
 *   new targets, so a change reads as a change instead of a redraw.
 * The easing has no overshoot, which keeps the web skin's no-bounce rule (DESIGN.md §10.4)
 * on every platform. The owner steps it once per frame while `advance` returns true, then
 * stops: a resting chart schedules no frames (same contract as the vector curve, ADR 0012).
 */

/** Entrance of a chart that appears on screen. */
export const CHART_ENTRANCE_SECONDS = 0.7;
/** Transition between two data sets of the same chart. */
export const CHART_MORPH_SECONDS = 0.45;
/** Delay between consecutive values of the entrance. */
export const CHART_STAGGER_SECONDS = 0.04;
/** The stagger never makes the entrance last longer than this in total. */
export const CHART_MAX_STAGGER_SECONDS = 0.32;

/** First frame and frame-gap limits: a stalled frame never jumps the animation forward. */
export const CHART_FALLBACK_FRAME_SECONDS = 1 / 60;
export const CHART_MAX_FRAME_SECONDS = 1 / 20;

export function easeOutCubic(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return 1 - (1 - t) ** 3;
}

/** Seconds between two frame timestamps, or the fallback for the first frame of a run. */
export function resolveChartFrameSeconds(timestamp: number, lastTimestamp: number | null): number {
  if (lastTimestamp === null) {
    return CHART_FALLBACK_FRAME_SECONDS;
  }
  const seconds = (timestamp - lastTimestamp) / 1000;
  return Number.isFinite(seconds)
    ? Math.min(CHART_MAX_FRAME_SECONDS, Math.max(0, seconds))
    : CHART_FALLBACK_FRAME_SECONDS;
}

export interface ChartTransitionOptions {
  /** False draws the targets at once (Reduce Motion). */
  animate: boolean;
  /** False for charts whose values must stay ordered (cumulative donut angles). */
  stagger?: boolean;
}

function sameValues(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export class ChartTransition {
  private from: number[];
  private to: number[];
  private current: number[];
  private elapsed = 0;
  private duration = CHART_MORPH_SECONDS;
  private staggerStep = 0;
  private animate: boolean;
  private readonly stagger: boolean;

  constructor(targets: readonly number[], options: ChartTransitionOptions) {
    this.animate = options.animate;
    this.stagger = options.stagger ?? true;
    this.to = [...targets];
    this.from = targets.map(() => 0);
    this.current = [...this.from];
    this.start(CHART_ENTRANCE_SECONDS);
    if (!this.animate) {
      this.settle();
    }
  }

  /**
   * Moves towards new targets from wherever the values are now.
   * @returns true when the values to draw changed.
   */
  retarget(targets: readonly number[]): boolean {
    if (sameValues(targets, this.to)) {
      return false;
    }
    // A value that did not exist yet (a new month) grows from zero.
    this.from = targets.map((_, index) => this.current[index] ?? 0);
    this.to = [...targets];
    this.current = [...this.from];
    this.start(CHART_MORPH_SECONDS);
    if (!this.animate) {
      this.settle();
    }
    return true;
  }

  /** @returns true when turning motion off jumped the values to their targets. */
  setAnimate(animate: boolean): boolean {
    this.animate = animate;
    if (animate || this.isSettled()) {
      return false;
    }
    this.settle();
    return true;
  }

  /** Jumps to the targets. */
  settle(): void {
    this.elapsed = this.totalSeconds();
    this.current = [...this.to];
  }

  isSettled(): boolean {
    return this.elapsed >= this.totalSeconds();
  }

  /** Steps the motion by `deltaSeconds`. @returns true while something still moves. */
  advance(deltaSeconds: number): boolean {
    if (this.isSettled()) {
      return false;
    }
    this.elapsed = Math.min(this.totalSeconds(), this.elapsed + Math.max(0, deltaSeconds));
    this.current = this.to.map((target, index) => {
      const start = this.from[index] ?? 0;
      const local = (this.elapsed - index * this.staggerStep) / this.duration;
      return start + (target - start) * easeOutCubic(local);
    });
    if (this.isSettled()) {
      this.current = [...this.to];
      return false;
    }
    return true;
  }

  getValues(): readonly number[] {
    return this.current;
  }

  private start(duration: number): void {
    this.elapsed = 0;
    this.duration = duration;
    const count = this.to.length;
    this.staggerStep =
      this.stagger && count > 1
        ? Math.min(CHART_STAGGER_SECONDS, CHART_MAX_STAGGER_SECONDS / (count - 1))
        : 0;
    // Nothing to move (no data, or zeros growing to zeros): rest at once, no frames.
    if (sameValues(this.from, this.to)) {
      this.elapsed = this.totalSeconds();
    }
  }

  private totalSeconds(): number {
    return this.duration + Math.max(0, this.to.length - 1) * this.staggerStep;
  }
}
