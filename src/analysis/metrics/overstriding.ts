// Overstriding: how far ahead of the hips the foot lands, from the side view.
//
// At each cycle's foot-strike frame we take the signed horizontal distance
// from the hip midpoint to the striking ankle, in the direction of motion
// (positive = foot ahead of the hips), normalized by that leg's hip-to-ankle
// distance in the same frame so camera zoom cancels out.
//
// Compromise: normalized image coords mix x/y aspect scaling, so the "leg
// length" denominator is only proportional to true leg length. The ratio is
// still monotonic in real overstride and stable for a fixed camera setup.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import {
  LM,
  SIDE_LM,
  VISIBILITY_MIN,
  confidenceFrom,
  directionOfMotion,
  dispersion,
  dist,
  midpoint,
  type MetricModule,
} from './shared';

export const overstridingModule: MetricModule = {
  id: 'overstriding',
  views: ['side'],
  compute(input): Metric | null {
    if (input.cycles.length === 0) return null;
    const dir = directionOfMotion(input.frames);

    const perCycle: number[] = [];
    for (const cycle of input.cycles) {
      const frame = input.frames[cycle.start.frameIndex];
      if (!frame) continue;
      const idx = SIDE_LM[cycle.side];
      const ankle = frame.landmarks[idx.ankle];
      const hip = frame.landmarks[idx.hip];
      const hipL = frame.landmarks[LM.leftHip];
      const hipR = frame.landmarks[LM.rightHip];
      if (!ankle || !hip || !hipL || !hipR) continue;
      if (ankle.visibility < VISIBILITY_MIN || hip.visibility < VISIBILITY_MIN) continue;

      const legLen = dist(hip, ankle);
      if (legLen < 1e-4) continue;
      const hipMid = midpoint(hipL, hipR);
      perCycle.push(((ankle.x - hipMid.x) * dir) / legLen);
    }
    if (perCycle.length === 0) return null;

    const visibility = input.cycles.length
      ? input.cycles.reduce((s, c) => {
          const f = input.frames[c.start.frameIndex];
          const idx = SIDE_LM[c.side];
          const a = f?.landmarks[idx.ankle];
          const h = f?.landmarks[idx.hip];
          return s + ((a?.visibility ?? 0) + (h?.visibility ?? 0)) / 2;
        }, 0) / input.cycles.length
      : 0;

    return {
      id: 'overstriding',
      label: 'Overstriding',
      unit: 'leg lengths',
      value: median(perCycle),
      perCycle,
      healthyRange: healthyRangeFor('overstriding'),
      confidence: confidenceFrom(perCycle.length, visibility, dispersion(perCycle, 0.1)),
      sourceView: input.view,
    };
  },
};
