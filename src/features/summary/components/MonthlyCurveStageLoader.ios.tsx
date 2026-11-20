/**
 * iOS draws the three.js scene (`skinSpec.curveStage === 'scene-3d'`). Native keeps a direct
 * import because Hermes maps its bytecode lazily.
 */
export { default as MonthlyCurveStageLoader } from './MonthlyCurveStage';
