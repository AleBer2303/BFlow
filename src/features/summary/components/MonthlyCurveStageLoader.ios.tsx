/**
 * iOS is the only skin that draws the three.js scene (`skinSpec.curveStage === 'scene-3d'`),
 * so it is the only native platform whose bundle includes three.js and expo-gl.
 */
export { default as MonthlyCurveStageLoader } from './MonthlyCurveStage';
