// Stride asymmetry: left vs right difference in cycle duration and in stance
// fraction, each expressed as a percentage of the two sides' mean. The metric
// value is the LARGER of the two percentages (worst-case asymmetry).
// perSide carries each side's median cycle duration in seconds for context.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import { LM, confidenceFrom, dispersion, meanVisibility, type MetricModule } from './shared';

function pctDiff(a: number, b: number): number {
  const m = (a + b) / 2;
  if (m <= 0) return 0;
  return (Math.abs(a - b) / m) * 100;
}

export const strideAsymmetryModule: MetricModule = {
  id: 'strideAsymmetry',
  views: ['side', 'front', 'rear'],
  compute(input): Metric | null {
    const left = input.cycles.filter((c) => c.side === 'left');
    const right = input.cycles.filter((c) => c.side === 'right');
    if (left.length < 2 || right.length < 2) return null;

    const duration = (cycles: typeof left) => cycles.map((c) => c.end.time - c.start.time);
    const stanceFrac = (cycles: typeof left) =>
      cycles.map((c) => c.stanceDuration / (c.end.time - c.start.time));

    const durL = median(duration(left));
    const durR = median(duration(right));
    const fracL = median(stanceFrac(left));
    const fracR = median(stanceFrac(right));

    const durationAsym = pctDiff(durL, durR);
    const stanceAsym = pctDiff(fracL, fracR);
    const value = Math.max(durationAsym, stanceAsym);

    const allDurations = [...duration(left), ...duration(right)];
    const visibility = meanVisibility(input.frames, [LM.leftAnkle, LM.rightAnkle]);

    return {
      id: 'strideAsymmetry',
      label: 'Stride asymmetry',
      unit: '%',
      value,
      perSide: { left: durL, right: durR },
      healthyRange: healthyRangeFor('strideAsymmetry'),
      confidence: confidenceFrom(
        Math.min(left.length, right.length),
        visibility,
        dispersion(allDurations, 0.1),
      ),
      sourceView: input.view,
    };
  },
};
