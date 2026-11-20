/**
 * The galaxy's motion, described once (DESIGN.md §6.6): native interpolates these tracks and
 * Web plays them as CSS keyframes, so both must read the same numbers.
 */

import {
  meteorEase,
  meteorMotion,
  particleMotion,
  sampleTrack,
  starHaloMotion,
  starMotion,
  toCssKeyframes,
} from '../motion/ambientMotion';
import {
  buildAmbientParticles,
  buildAmbientStars,
} from '../motion/ambientParticles';
import { ambientParticlesBySkin } from '../tokens';

const SPEC = ambientParticlesBySkin.ios;

describe('sampleTrack', () => {
  const track = { input: [0, 0.5, 1], output: [0, 10, 4] };

  it('interpolates linearly between stops and clamps outside them', () => {
    expect(sampleTrack(track, 0.25)).toBe(5);
    expect(sampleTrack(track, 0.75)).toBe(7);
    expect(sampleTrack(track, -1)).toBe(0);
    expect(sampleTrack(track, 2)).toBe(4);
    expect(sampleTrack({ input: [], output: [] }, 0.5)).toBe(0);
  });
});

describe('ambient motion tracks', () => {
  const [particle] = buildAmbientParticles(SPEC, 1);
  const stars = buildAmbientStars(SPEC);

  it('rises a dot by the rise distance and fades it at both ends', () => {
    if (!particle) throw new Error('expected a particle');
    const motion = particleMotion(particle, 0.3, SPEC.riseDistance);
    expect(sampleTrack(motion.opacity, 0)).toBe(0);
    expect(sampleTrack(motion.opacity, 0.5)).toBeCloseTo(0.3 * particle.intensity);
    expect(sampleTrack(motion.opacity, 1)).toBe(0);
    expect(
      sampleTrack(motion.translateY!, 0) - sampleTrack(motion.translateY!, 1)
    ).toBe(SPEC.riseDistance);
  });

  it('floats a star within its float distance and flares only the flaring halos', () => {
    for (const star of stars) {
      const motion = starMotion(star, 0.8, SPEC.stars.floatDistance);
      expect(Math.max(...motion.translateY!.output.map(Math.abs))).toBe(SPEC.stars.floatDistance);
      const halo = starHaloMotion(star, SPEC.stars);
      expect(Math.max(...halo.scale!.output)).toBe(star.flares ? 1.5 : 1.08);
    }
  });

  it('eases a meteor out and carries it the whole travel distance', () => {
    expect(meteorEase(0)).toBe(0);
    expect(meteorEase(0.5)).toBe(0.75);
    expect(meteorEase(1)).toBe(1);
    expect(meteorEase(2)).toBe(1);
    const motion = meteorMotion(SPEC.shootingStars, 0.7);
    expect(sampleTrack(motion.translateX!, 1)).toBe(SPEC.shootingStars.travelDistance);
  });
});

describe('toCssKeyframes (Web)', () => {
  it('puts one keyframe on each track stop, with the transforms as CSS', () => {
    const motion = {
      opacity: { input: [0, 0.25, 1], output: [0, 0.4, 0] },
      translateY: { input: [0, 1], output: [10, -10] },
    };
    const keyframes = toCssKeyframes(motion);
    expect(Object.keys(keyframes)).toEqual(['0%', '25%', '100%']);
    expect(keyframes['25%']).toEqual({ opacity: 0.4, transform: 'translateY(5px)' });
  });

  it('plays an eased motion in the active share and holds the last frame for the rest', () => {
    const keyframes = toCssKeyframes(meteorMotion(SPEC.shootingStars, 0.7), {
      transformPrefix: 'rotate(24deg)',
      activeShare: 0.1,
      ease: meteorEase,
      steps: 4,
    });
    expect(Object.keys(keyframes)).toEqual(['0%', '2.5%', '5%', '7.5%', '10%', '100%']);
    expect(keyframes['10%']).toEqual(keyframes['100%']);
    expect(keyframes['100%']?.opacity).toBe(0);
    expect(keyframes['5%']?.transform).toBe(
      `rotate(24deg) translateX(${SPEC.shootingStars.travelDistance * 0.75}px)`
    );
  });

  it('omits the transform when nothing moves', () => {
    expect(toCssKeyframes({ opacity: { input: [0, 1], output: [0.2, 0.2] } })['0%']).toEqual({
      opacity: 0.2,
    });
  });
});
