/**
 * El cargador del escenario 3D por plataforma: iOS y Android lo importan directo y Web lo carga
 * como un fragmento aparte (ADR 0032).
 */

describe('MonthlyCurveStageLoader por plataforma', () => {
  it('iOS, Android y el respaldo tipado entregan el escenario 3D (ADR 0032)', () => {
    const scene = require('../components/MonthlyCurveStage') as { default: unknown };
    const ios = require('../components/MonthlyCurveStageLoader.ios') as {
      MonthlyCurveStageLoader: unknown;
    };
    const android = require('../components/MonthlyCurveStageLoader.android') as {
      MonthlyCurveStageLoader: unknown;
    };
    expect(android.MonthlyCurveStageLoader).toBe(scene.default);
    const fallback = require('../components/MonthlyCurveStageLoader') as {
      MonthlyCurveStageLoader: unknown;
    };

    expect(ios.MonthlyCurveStageLoader).toBe(scene.default);
    expect(fallback.MonthlyCurveStageLoader).toBe(scene.default);
  });
});
