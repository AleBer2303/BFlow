import {
  getPerfMarks,
  getPerfSummary,
  markPerf,
  resetPerfMarks,
  setPerfMarksEnabled,
} from '../perfMarks';

describe('perfMarks instrumentation', () => {
  beforeEach(() => {
    resetPerfMarks();
    setPerfMarksEnabled(true);
  });

  afterEach(() => {
    resetPerfMarks();
    setPerfMarksEnabled(false);
  });

  it('records marks and computes duration relative to first mark', () => {
    markPerf('js_start');
    markPerf('first_render');
    markPerf('cache_applied');

    const marks = getPerfMarks();
    expect(marks).toHaveLength(3);
    expect(marks[0]?.key).toBe('js_start');
    expect(marks[0]?.durationSinceStartMs).toBe(0);
    expect(marks[1]?.key).toBe('first_render');
    expect(marks[2]?.key).toBe('cache_applied');

    const summary = getPerfSummary();
    expect(summary.js_start).toBe(0);
    expect(summary.first_render).toBeDefined();
    expect(summary.cache_applied).toBeDefined();
  });

  it('is inert when disabled', () => {
    setPerfMarksEnabled(false);
    resetPerfMarks();

    markPerf('js_start');
    markPerf('cloud_applied');

    expect(getPerfMarks()).toHaveLength(0);
  });
});
