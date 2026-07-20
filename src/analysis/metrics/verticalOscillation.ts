// Vertical oscillation: peak-to-trough of the hip-midpoint height per cycle,
// as a percentage of the runner's height in frame.
//
// Height in frame is estimated as nose-to-lowest-foot extent (median across
// frames), which approximates standing height when a foot is on the belt.
// The hip signal is lightly smoothed (3-sample window) — the oscillation runs
// at ~2.5-3 Hz (twice per stride) and a wider window would visibly attenuate
// its amplitude at 15-24 fps.

import type { Metric } from '../../types';
import { median, movingAverage } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import {
  LM,
  VISIBILITY_MIN,
  confidenceFrom,
  dispersion,
  meanVisibility,
  type MetricModule,
} from './shared';

export const verticalOscillationModule: MetricModule = {
  id: 'verticalOscillation',
  views: ['side', 'front', 'rear'],
  compute(input): Metric | null {
    const { frames, cycles } = input;
    if (frames.length < 3 || cycles.length === 0) return null;

    // Hip-midpoint vertical signal.
    const hipY = frames.map((f) => {
      const l = f.landmarks[LM.leftHip];
      const r = f.landmarks[LM.rightHip];
      return l && r ? (l.y + r.y) / 2 : NaN;
    });
    const smoothed = movingAverage(hipY, 3);

    // Runner height in frame: nose to lowest foot point, median over frames.
    const extents: number[] = [];
    for (const f of frames) {
      const nose = f.landmarks[LM.nose];
      if (!nose || nose.visibility < VISIBILITY_MIN) continue;
      let footY = -Infinity;
      for (const idx of [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel]) {
        const lm = f.landmarks[idx];
        if (lm && lm.visibility >= VISIBILITY_MIN && lm.y > footY) footY = lm.y;
      }
      if (footY > -Infinity && footY - nose.y > 0.05) extents.push(footY - nose.y);
    }
    const height = median(extents);
    if (!Number.isFinite(height) || height <= 0) return null;

    const perCycle: number[] = [];
    for (const cycle of cycles) {
      const [from, to] = cycle.frameRange;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = from; i <= to && i < smoothed.length; i++) {
        const v = smoothed[i];
        if (!Number.isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi > lo) perCycle.push(((hi - lo) / height) * 100);
    }
    if (perCycle.length === 0) return null;

    const visibility = meanVisibility(frames, [LM.leftHip, LM.rightHip]);

    return {
      id: 'verticalOscillation',
      label: 'Vertical oscillation',
      unit: '% height',
      value: median(perCycle),
      perCycle,
      healthyRange: healthyRangeFor('verticalOscillation'),
      confidence: confidenceFrom(perCycle.length, visibility, dispersion(perCycle, 2)),
      sourceView: input.view,
    };
  },
};
