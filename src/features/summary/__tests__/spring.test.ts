import { createSpring, isSpringSettled, snapSpring, stepSpring } from '../scene/spring';

const PARAMS = { damping: 24, stiffness: 170, mass: 0.95 };

function settle(refreshRateHz: number, seconds: number) {
  const spring = createSpring(0);
  spring.target = 1;
  const frames = Math.round(refreshRateHz * seconds);
  for (let frame = 0; frame < frames; frame += 1) {
    stepSpring(spring, PARAMS, 1 / refreshRateHz);
  }
  return spring;
}

describe('spring', () => {
  it('starts at rest on its target', () => {
    const spring = createSpring(0.4);

    expect(spring).toEqual({ value: 0.4, velocity: 0, target: 0.4 });
    expect(isSpringSettled(spring)).toBe(true);
  });

  it('converges to the target and reports it as settled', () => {
    const spring = settle(60, 3);

    expect(spring.value).toBeCloseTo(1, 3);
    expect(isSpringSettled(spring)).toBe(true);
  });

  it('follows the same trajectory at 60 Hz and 120 Hz', () => {
    expect(settle(120, 0.25).value).toBeCloseTo(settle(60, 0.25).value, 1);
  });

  it('is not settled while still moving', () => {
    const spring = createSpring(0);
    spring.target = 1;

    stepSpring(spring, PARAMS, 1 / 60);

    expect(isSpringSettled(spring)).toBe(false);
  });

  it('ignores an empty time step', () => {
    const spring = createSpring(0);
    spring.target = 1;

    stepSpring(spring, PARAMS, 0);

    expect(spring.value).toBe(0);
  });

  it('snaps straight to the target without residual velocity', () => {
    const spring = createSpring(0);
    spring.target = 0.8;
    spring.velocity = 5;

    snapSpring(spring);

    expect(spring).toEqual({ value: 0.8, velocity: 0, target: 0.8 });
  });
});
