/**
 * Typed fallback: TypeScript resolves this file, Metro picks the platform variant.
 * - `.ios.tsx` and `.android.tsx`: the three.js scene (ADR 0032).
 * - `.web.tsx`: the scene as a lazy chunk, so sign-in and the first paint never pay for it.
 */
export { default as MonthlyCurveStageLoader } from './MonthlyCurveStage';
