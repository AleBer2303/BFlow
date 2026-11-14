/**
 * El cargador del escenario 3D por plataforma: Android no debe arrastrar three.js ni expo-gl
 * a su bundle, porque allí la curva siempre es vectorial (ADR 0014).
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import type { MonthlyCurveStageProps } from '../components/MonthlyCurveStage';

describe('MonthlyCurveStageLoader por plataforma', () => {
  afterEach(() => {
    jest.dontMock('three');
    jest.dontMock('expo-gl');
  });

  it('la variante de Android carga sin three.js ni expo-gl', () => {
    jest.doMock('three', () => {
      throw new Error('three.js must not load on Android');
    });
    jest.doMock('expo-gl', () => {
      throw new Error('expo-gl must not load on Android');
    });

    jest.isolateModules(() => {
      expect(() => require('../components/MonthlyCurveStageLoader.android')).not.toThrow();
      // La misma trampa sí salta con el escenario 3D: prueba que el test detecta la carga.
      expect(() => require('../components/MonthlyCurveStage')).toThrow();
    });
  });

  it('si algo pide el escenario 3D en Android, no pinta nada y avisa para usar la curva vectorial', () => {
    const { MonthlyCurveStageLoader } =
      require('../components/MonthlyCurveStageLoader.android') as {
        MonthlyCurveStageLoader: React.ComponentType<MonthlyCurveStageProps>;
      };
    const onUnavailable = jest.fn();
    const props = {
      curve: {},
      metricId: 'flow',
      reducedMotion: false,
      onScrub: jest.fn(),
      onUnavailable,
    } as unknown as MonthlyCurveStageProps;

    const view = render(<MonthlyCurveStageLoader {...props} />);

    expect(view.toJSON()).toBeNull();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });

  it('iOS y el respaldo tipado siguen entregando el escenario 3D', () => {
    const scene = require('../components/MonthlyCurveStage') as { default: unknown };
    const ios = require('../components/MonthlyCurveStageLoader.ios') as {
      MonthlyCurveStageLoader: unknown;
    };
    const fallback = require('../components/MonthlyCurveStageLoader') as {
      MonthlyCurveStageLoader: unknown;
    };

    expect(ios.MonthlyCurveStageLoader).toBe(scene.default);
    expect(fallback.MonthlyCurveStageLoader).toBe(scene.default);
  });
});
