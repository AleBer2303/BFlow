/**
 * src/features/summary/scene/spring.ts
 *
 * Allocation-free damped spring used by the 3D scene. Fixed sub-steps keep the
 * motion identical on 60 Hz and 120 Hz displays.
 */

export interface SpringParams {
  readonly damping: number;
  readonly stiffness: number;
  readonly mass: number;
}

export interface SpringState {
  value: number;
  velocity: number;
  target: number;
}

const SUBSTEP_SECONDS = 1 / 240;
const SETTLE_VALUE_TOLERANCE = 0.0005;
const SETTLE_VELOCITY_TOLERANCE = 0.005;

export function createSpring(value: number): SpringState {
  return { value, velocity: 0, target: value };
}

export function stepSpring(spring: SpringState, params: SpringParams, deltaSeconds: number): void {
  const steps = Math.ceil(deltaSeconds / SUBSTEP_SECONDS);
  if (steps <= 0) {
    return;
  }

  const stepSeconds = deltaSeconds / steps;
  for (let index = 0; index < steps; index += 1) {
    const force =
      -params.stiffness * (spring.value - spring.target) - params.damping * spring.velocity;
    spring.velocity += (force / params.mass) * stepSeconds;
    spring.value += spring.velocity * stepSeconds;
  }
}

export function isSpringSettled(spring: SpringState): boolean {
  return (
    Math.abs(spring.value - spring.target) < SETTLE_VALUE_TOLERANCE &&
    Math.abs(spring.velocity) < SETTLE_VELOCITY_TOLERANCE
  );
}

export function snapSpring(spring: SpringState): void {
  spring.value = spring.target;
  spring.velocity = 0;
}
