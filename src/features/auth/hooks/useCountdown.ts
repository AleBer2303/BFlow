/**
 * src/features/auth/hooks/useCountdown.ts
 *
 * Seconds left of a limit kept outside React: the wait between account emails or the
 * lockout after too many wrong passwords (`platform/auth/authRateLimiter`). It reads the
 * limit when the screen mounts, so a wait started before still shows, and ticks once a
 * second only while it runs.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 1000;

export interface Countdown {
  /** Whole seconds left, rounded up; 0 when nothing is waiting. */
  secondsLeft: number;
  /** Reads the limit again, after an action that may have started or cleared it. */
  refresh: () => void;
}

export function useCountdown(readRemainingMs: () => number): Countdown {
  const readRef = useRef(readRemainingMs);
  readRef.current = readRemainingMs;

  const [remainingMs, setRemainingMs] = useState(readRemainingMs);
  const refresh = useCallback(() => setRemainingMs(readRef.current()), []);

  const isRunning = remainingMs > 0;
  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }
    const handle = setInterval(refresh, TICK_MS);
    return () => clearInterval(handle);
  }, [isRunning, refresh]);

  return { secondsLeft: Math.ceil(remainingMs / 1000), refresh };
}
