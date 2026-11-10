/**
 * src/features/summary/components/curveFrameProbe.ts
 *
 * Development-only measurement of each animation run of the 3D curve, printed to the Metro
 * terminal. It exists to diagnose devices where the curve jumps instead of animating
 * (Expo Go on Android, ADR 0012 §5): it compares the frame timestamps the scene receives
 * with the wall clock, and counts frames and gaps. Production builds never create it.
 */

export interface CurveFrameRun {
  frames: number;
  /** Wall-clock time between the first and the last frame (Date.now). */
  wallMs: number;
  /** The same span measured with the timestamps passed to requestAnimationFrame. */
  timestampMs: number;
  /** Longest wall-clock gap between two consecutive frames. */
  maxGapMs: number;
}

export function describeCurveFrameRun(run: CurveFrameRun, context: string): string {
  const fps = run.wallMs > 0 ? Math.round(((run.frames - 1) * 1000) / run.wallMs) : 0;
  return (
    `[Curva] ${run.frames} cuadros en ${Math.round(run.wallMs)} ms reales ` +
    `(marcas de tiempo: ${Math.round(run.timestampMs)} ms), ~${fps} fps, ` +
    `hueco máximo ${Math.round(run.maxGapMs)} ms. ${context}`
  );
}

export class CurveFrameProbe {
  private frames = 0;
  private firstWall = 0;
  private lastWall = 0;
  private firstTimestamp = 0;
  private lastTimestamp = 0;
  private maxGap = 0;

  constructor(
    private readonly report: (message: string) => void,
    private readonly now: () => number = Date.now
  ) {}

  record(timestamp: number): void {
    const wall = this.now();
    if (this.frames === 0) {
      this.firstWall = wall;
      this.firstTimestamp = timestamp;
    } else {
      this.maxGap = Math.max(this.maxGap, wall - this.lastWall);
    }
    this.lastWall = wall;
    this.lastTimestamp = timestamp;
    this.frames += 1;
  }

  /** Reports the run that just ended (if it had motion) and starts a new one. */
  finish(context: string): void {
    if (this.frames > 1) {
      this.report(
        describeCurveFrameRun(
          {
            frames: this.frames,
            wallMs: this.lastWall - this.firstWall,
            timestampMs: this.lastTimestamp - this.firstTimestamp,
            maxGapMs: this.maxGap,
          },
          context
        )
      );
    }
    this.frames = 0;
    this.maxGap = 0;
  }
}
