/**
 * src/platform/perf/perfMarks.ts
 *
 * Lightweight performance marks instrumentation for BFlow startup and sync (ADR 0015 / Fase 2).
 * Inert in production and tests unless __DEV__ is true or explicitly enabled.
 * Zero external dependencies and zero console.log statements.
 */

export type PerfMarkKey =
  | 'js_start'
  | 'first_render'
  | 'session_restored'
  | 'cache_applied'
  | 'cloud_applied'
  | 'sync_completed';

export interface PerfMarkEntry {
  key: PerfMarkKey;
  timestamp: number;
  durationSinceStartMs?: number;
}

let perfMarksEnabled = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
const recordedMarks: PerfMarkEntry[] = [];
let initialStartTime: number = Date.now();

export function setPerfMarksEnabled(enabled: boolean): void {
  perfMarksEnabled = enabled;
}

export function resetPerfMarks(): void {
  recordedMarks.length = 0;
  initialStartTime = Date.now();
}

export function markPerf(key: PerfMarkKey): void {
  if (!perfMarksEnabled) {
    return;
  }
  const now = Date.now();
  if (recordedMarks.length === 0) {
    initialStartTime = now;
  }
  recordedMarks.push({
    key,
    timestamp: now,
    durationSinceStartMs: Math.max(0, now - initialStartTime),
  });
}

export function getPerfMarks(): readonly PerfMarkEntry[] {
  return [...recordedMarks];
}

export function getPerfSummary(): Record<PerfMarkKey, number | undefined> {
  const summary: Partial<Record<PerfMarkKey, number>> = {};
  for (const mark of recordedMarks) {
    summary[mark.key] = mark.durationSinceStartMs;
  }
  return summary as Record<PerfMarkKey, number | undefined>;
}
