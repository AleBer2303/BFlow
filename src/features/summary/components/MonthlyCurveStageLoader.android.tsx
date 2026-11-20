/**
 * Android draws the three.js scene like iOS (`skinSpec.curveStage === 'scene-3d'`, ADR 0032).
 * If the GL surface never arrives (`GL_CONTEXT_TIMEOUT_MS`) or the scene fails, it reports
 * itself unavailable and `MonthlyCurveSection` falls back to the vector curve.
 */
export { default as MonthlyCurveStageLoader } from './MonthlyCurveStage';
