import { CurveFrameProbe, describeCurveFrameRun } from '../components/curveFrameProbe';

describe('CurveFrameProbe (development diagnostics)', () => {
  it('compares frame timestamps with the wall clock and reports one line per run', () => {
    const lines: string[] = [];
    let wall = 1_000;
    const probe = new CurveFrameProbe((line) => lines.push(line), () => wall);

    // Timestamps that run three times faster than the wall clock, with one long gap.
    for (const [gap, timestamp] of [
      [0, 0],
      [16, 48],
      [16, 96],
      [120, 456],
    ] as const) {
      wall += gap;
      probe.record(timestamp);
    }
    probe.finish('Reducir movimiento: no.');

    expect(lines).toEqual([
      '[Curva] 4 cuadros en 152 ms reales (marcas de tiempo: 456 ms), ~20 fps, hueco máximo 120 ms. Reducir movimiento: no.',
    ]);
  });

  it('stays silent for a single frame and starts every run from zero', () => {
    const lines: string[] = [];
    let wall = 0;
    const probe = new CurveFrameProbe((line) => lines.push(line), () => wall);

    probe.record(0);
    probe.finish('a');
    wall = 500;
    probe.record(10);
    wall = 516;
    probe.record(26);
    probe.finish('b');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('2 cuadros en 16 ms reales');
    expect(lines[0]).toContain('hueco máximo 16 ms');
  });

  it('describes a run without elapsed time', () => {
    expect(
      describeCurveFrameRun({ frames: 1, wallMs: 0, timestampMs: 0, maxGapMs: 0 }, 'x')
    ).toContain('~0 fps');
  });
});
