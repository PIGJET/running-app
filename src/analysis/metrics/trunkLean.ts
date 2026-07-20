// Trunk lean: angle of the shoulder-midpoint -> hip-midpoint line vs vertical,
// in degrees, positive = leaning FORWARD (toward the direction of motion).
// Sampled over stance frames of every kept cycle (lean during flight varies
// more), aggregated per cycle by median and overall by median-of-cycles.
// Side view only — a front/rear camera cannot see sagittal lean.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import {
  LM,
  VISIBILITY_MIN,
  confidenceFrom,
  directionOfMotion,
  dispersion,
  meanVisibility,
  midpoint,
  stanceFrameIndices,
  type MetricModule,
} from './shared';

export const trunkLeanModule: MetricModule = {
  id: 'trunkLean',
  views: ['side'],
  compute(input): Metric | null {
    const { frames, cycles } = input;
    if (cycles.length === 0) return null;
    const dir = directionOfMotion(frames);

    const perCycle: number[] = [];
    for (const cycle of cycles) {
      const leans: number[] = [];
      for (const i of stanceFrameIndices(frames, cycle)) {
        const f = frames[i];
        const sL = f.landmarks[LM.leftShoulder];
        const sR = f.landmarks[LM.rightShoulder];
        const hL = f.landmarks[LM.leftHip];
        const hR = f.landmarks[LM.rightHip];
        if (!sL || !sR || !hL || !hR) continue;
        const shoulder = midpoint(sL, sR);
        const hip = midpoint(hL, hR);
        if (shoulder.visibility < VISIBILITY_MIN || hip.visibility < VISIBILITY_MIN) continue;

        const dy = hip.y - shoulder.y; // > 0: shoulders above hips (y down).
        if (dy <= 0) continue;
        const dx = (shoulder.x - hip.x) * dir; // > 0: shoulders ahead of hips.
        leans.push((Math.atan2(dx, dy) * 180) / Math.PI);
      }
      if (leans.length > 0) perCycle.push(median(leans));
    }
    if (perCycle.length === 0) return null;

    const visibility = meanVisibility(frames, [
      LM.leftShoulder,
      LM.rightShoulder,
      LM.leftHip,
      LM.rightHip,
    ]);

    return {
      id: 'trunkLean',
      label: 'Trunk lean',
      unit: 'deg',
      value: median(perCycle),
      perCycle,
      healthyRange: healthyRangeFor('trunkLean'),
      confidence: confidenceFrom(perCycle.length, visibility, dispersion(perCycle, 5)),
      sourceView: input.view,
    };
  },
};
