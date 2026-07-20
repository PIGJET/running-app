// Dynamic knee valgus proxy, front/rear view only.
//
// During each cycle's stance we measure how far the knee deviates MEDIALLY
// (toward the body midline) from the straight hip->ankle line at the knee's
// height, normalized by hip width so the number is camera-distance-invariant.
// Positive = medial collapse (valgus); negative = varus/outward. Per cycle we
// keep the peak medial deviation; perSide is the median of those peaks.
//
// Confidence is downgraded one level by default: a 2D projection cannot
// separate true frontal-plane collapse from hip internal rotation or a
// slightly rotated runner.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import {
  LM,
  SIDE_LM,
  VISIBILITY_MIN,
  confidenceFrom,
  dispersion,
  downgradeConfidence,
  meanVisibility,
  otherSide,
  stanceFrameIndices,
  type MetricModule,
  type Side,
} from './shared';

export const kneeValgusModule: MetricModule = {
  id: 'kneeValgus',
  views: ['front', 'rear'],
  compute(input): Metric | null {
    const { frames, cycles } = input;
    if (cycles.length === 0) return null;

    const bySide: Record<Side, number[]> = { left: [], right: [] };
    const perCycle: number[] = [];

    for (const cycle of cycles) {
      const idx = SIDE_LM[cycle.side];
      const otherHipIdx = SIDE_LM[otherSide(cycle.side)].hip;
      let peak = -Infinity;

      for (const i of stanceFrameIndices(frames, cycle)) {
        const f = frames[i];
        const hip = f.landmarks[idx.hip];
        const knee = f.landmarks[idx.knee];
        const ankle = f.landmarks[idx.ankle];
        const otherHip = f.landmarks[otherHipIdx];
        if (!hip || !knee || !ankle || !otherHip) continue;
        if (
          hip.visibility < VISIBILITY_MIN ||
          knee.visibility < VISIBILITY_MIN ||
          ankle.visibility < VISIBILITY_MIN
        ) {
          continue;
        }

        const hipWidth = Math.abs(otherHip.x - hip.x);
        const dy = ankle.y - hip.y;
        if (hipWidth < 1e-3 || Math.abs(dy) < 1e-3) continue;

        // x of the hip->ankle line at the knee's height.
        const s = (knee.y - hip.y) / dy;
        const lineX = hip.x + s * (ankle.x - hip.x);
        // Medial = toward the other hip.
        const medialSign = Math.sign(otherHip.x - hip.x);
        const valgus = ((knee.x - lineX) * medialSign) / hipWidth;
        if (valgus > peak) peak = valgus;
      }
      if (peak > -Infinity) {
        bySide[cycle.side].push(peak);
        perCycle.push(peak);
      }
    }
    if (perCycle.length === 0) return null;

    const left = bySide.left.length > 0 ? median(bySide.left) : 0;
    const right = bySide.right.length > 0 ? median(bySide.right) : 0;

    const visibility = meanVisibility(frames, [
      LM.leftHip,
      LM.rightHip,
      LM.leftKnee,
      LM.rightKnee,
      LM.leftAnkle,
      LM.rightAnkle,
    ]);
    const base = confidenceFrom(perCycle.length, visibility, dispersion(perCycle, 0.05));

    return {
      id: 'kneeValgus',
      label: 'Knee valgus',
      unit: 'x hip width',
      value: Math.max(left, right),
      perCycle,
      perSide: { left, right },
      healthyRange: healthyRangeFor('kneeValgus'),
      confidence: downgradeConfidence(base),
      sourceView: input.view,
    };
  },
};
