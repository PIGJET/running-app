// Cadence (steps per minute) from foot-strike event times.
//
// Both sides' strikes are combined and sorted; each consecutive interval is
// one step. Sub-frame-refined event times from the segmenter are used, so the
// estimate is not quantized to the (15-24 fps) frame grid. Intervals outside
// 0.2-0.8 s (300-75 spm) are treated as artifacts of a missed strike and
// dropped rather than allowed to halve the estimate.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import { LM, confidenceFrom, dispersion, meanVisibility, type MetricModule } from './shared';

const MIN_STEP_SEC = 0.2;
const MAX_STEP_SEC = 0.8;

export const cadenceModule: MetricModule = {
  id: 'cadence',
  views: ['side', 'front', 'rear'],
  compute(input): Metric | null {
    const strikes = input.events
      .filter((e) => e.type === 'footStrike')
      .sort((a, b) => a.time - b.time);
    if (strikes.length < 3) return null;

    const stepRates: number[] = [];
    for (let i = 1; i < strikes.length; i++) {
      const dt = strikes[i].time - strikes[i - 1].time;
      if (dt >= MIN_STEP_SEC && dt <= MAX_STEP_SEC) stepRates.push(60 / dt);
    }
    if (stepRates.length < 2) return null;

    const value = median(stepRates);
    const visibility = meanVisibility(input.frames, [LM.leftAnkle, LM.rightAnkle]);
    const cv = dispersion(stepRates);

    return {
      id: 'cadence',
      label: 'Cadence',
      unit: 'spm',
      value,
      perCycle: stepRates,
      healthyRange: healthyRangeFor('cadence'),
      confidence: confidenceFrom(stepRates.length, visibility, cv),
      sourceView: input.view,
    };
  },
};
