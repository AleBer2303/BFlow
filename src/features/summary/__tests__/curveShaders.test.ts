/**
 * The 3D curve draws on a transparent canvas so the galaxy behind it shows through: the line
 * and the dot grid write premultiplied color and never paint the page color themselves.
 */

import { AREA_FRAGMENT_SHADER, RIBBON_FRAGMENT_SHADER } from '../scene/curveShaders';

describe('curve shaders on a transparent canvas', () => {
  it.each([
    ['ribbon', RIBBON_FRAGMENT_SHADER],
    ['area', AREA_FRAGMENT_SHADER],
  ])('the %s writes premultiplied color without the backdrop', (_name, shader) => {
    expect(shader).not.toContain('uBackdrop');
    expect(shader).not.toMatch(/gl_FragColor = vec4\([^;]*, 1\.0\);/);
    expect(shader).toMatch(/gl_FragColor = vec4\(\w+ \* alpha, alpha\);/);
  });
});
