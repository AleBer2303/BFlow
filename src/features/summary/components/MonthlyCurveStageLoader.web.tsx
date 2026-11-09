/**
 * Web loads three.js as a separate chunk, so the sign-in screen and the first paint
 * never pay for it. Native keeps a direct import because Hermes maps its bytecode lazily.
 */

import React, { Suspense } from 'react';
import type { MonthlyCurveStageProps } from './MonthlyCurveStage';

const LazyMonthlyCurveStage = React.lazy(() => import('./MonthlyCurveStage'));

export function MonthlyCurveStageLoader(props: MonthlyCurveStageProps): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <LazyMonthlyCurveStage {...props} />
    </Suspense>
  );
}
