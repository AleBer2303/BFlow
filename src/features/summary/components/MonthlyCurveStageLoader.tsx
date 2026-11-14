/**
 * Typed fallback: TypeScript resolves this file, Metro picks the platform variant.
 * - `.ios.tsx`: the three.js scene.
 * - `.android.tsx`: nothing (Android never draws the 3D scene; keeps three.js out of its bundle).
 * - `.web.tsx`: the scene as a lazy chunk.
 */
export { default as MonthlyCurveStageLoader } from './MonthlyCurveStage';
