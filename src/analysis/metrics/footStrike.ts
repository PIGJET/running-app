// Foot-strike pattern from foot pitch at contact (side view).
//
// At each cycle's strike frame we compute a pitch proxy: the angle of the
// heel -> foot_index line relative to horizontal, signed so POSITIVE means the
// heel is BELOW the toes (dorsiflexed, i.e. heel strike; remember image y
// grows downward). Classification: > +5 deg heel, < -5 deg forefoot, else
// midfoot. The median angle is the metric value; the classification goes in
// the label, with a few example strikes exposed as keyMoments.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import {
  SIDE_LM,
  VISIBILITY_MIN,
  confidenceFrom,
  dispersion,
  type MetricModule,
} from './shared';

const HEEL_DEG = 5;
const FOREFOOT_DEG = -5;

function classify(angleDeg: number): 'heel' | 'midfoot' | 'forefoot' {
  if (angleDeg > HEEL_DEG) return 'heel';
  if (angleDeg < FOREFOOT_DEG) return 'forefoot';
  return 'midfoot';
}

export const footStrikeModule: MetricModule = {
  id: 'footStrike',
  views: ['side'],
  compute(input): Metric | null {
    const perCycle: number[] = [];
    const moments: { time: number; label: string }[] = [];
    let visSum = 0;

    for (const cycle of input.cycles) {
      const frame = input.frames[cycle.start.frameIndex];
      if (!frame) continue;
      const idx = SIDE_LM[cycle.side];
      const heel = frame.landmarks[idx.heel];
      const toe = frame.landmarks[idx.footIndex];
      if (!heel || !toe) continue;
      if (heel.visibility < VISIBILITY_MIN || toe.visibility < VISIBILITY_MIN) continue;

      const footLen = Math.abs(toe.x - heel.x);
      if (footLen < 1e-3) continue; // Foot seen end-on; angle would be garbage.

      // Positive = heel below toe (y grows downward) = heel-first contact.
      const angle = (Math.atan2(heel.y - toe.y, footLen) * 180) / Math.PI;
      perCycle.push(angle);
      visSum += (heel.visibility + toe.visibility) / 2;
      if (moments.length < 3) {
        moments.push({
          time: cycle.start.time,
          label: `${cycle.side} ${classify(angle)} strike (${angle.toFixed(0)} deg)`,
        });
      }
    }
    if (perCycle.length === 0) return null;

    const value = median(perCycle);
    const visibility = visSum / perCycle.length;

    return {
      id: 'footStrike',
      label: `Foot strike (${classify(value)})`,
      unit: 'deg',
      value,
      perCycle,
      healthyRange: healthyRangeFor('footStrike'),
      confidence: confidenceFrom(perCycle.length, visibility, dispersion(perCycle, 5)),
      sourceView: input.view,
      keyMoments: moments,
    };
  },
};
