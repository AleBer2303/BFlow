/**
 * Android always draws the vector curve (`skinSpec.curveStage === 'vector'`, ADR 0014), so
 * this loader imports nothing: three.js and expo-gl stay out of the Android module graph.
 *
 * If something ever asks for the 3D stage here, it reports itself unavailable and
 * `MonthlyCurveSection` falls back to the vector curve.
 */

import { useEffect } from 'react';
import type { MonthlyCurveStageProps } from './MonthlyCurveStage';

export function MonthlyCurveStageLoader({ onUnavailable }: MonthlyCurveStageProps): null {
  useEffect(() => {
    onUnavailable();
  }, [onUnavailable]);
  return null;
}
