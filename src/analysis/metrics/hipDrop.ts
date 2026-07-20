// Contralateral hip (pelvic) drop, front/rear view only, in degrees.
//
// During each cycle's SINGLE-LEG stance (stance frames not overlapped by the
// other leg's stance — running has a flight phase, so overlap is rare) we
// measure the pelvis line (hip 23 - hip 24) angle vs horizontal, signed so
// POSITIVE = the swing-side hip sits LOWER than the stance-side hip (the
// classic Trendelenburg-style drop). Per cycle we keep the maximum drop;
// perSide reports the median of those maxima for stance on each leg.
//
// Confidence is deliberately downgraded one level: a 2D pelvis-line angle is
// confounded by camera height, runner rotation, and clothing.

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

export const hipDropModule: MetricModule = {
  id: 'hipDrop',
  views: ['front', 'rear'],
  compute(input): Metric | null {
    const { frames, cycles } = input;
    if (cycles.length === 0) return null;

    const dropsBySide: Record<Side, number[]> = { left: [], right: [] };
    const perCycle: number[] = [];

    for (const cycle of cycles) {
      const opposite = cycles.filter((c) => c.side !== cycle.side);
      const indices = stanceFrameIndices(frames, cycle).filter((i) => {
        const t = frames[i].timestamp;
        return !opposite.some((c) => t >= c.start.time && t <= c.toeOff.time);
      });

      let maxDrop = -Infinity;
      for (const i of indices) {
        const f = frames[i];
        const stanceHip = f.landmarks[SIDE_LM[cycle.side].hip];
        const swingHip = f.landmarks[SIDE_LM[otherSide(cycle.side)].hip];
        if (!stanceHip || !swingHip) continue;
        if (stanceHip.visibility < VISIBILITY_MIN || swingHip.visibility < VISIBILITY_MIN) continue;
        const dx = Math.abs(swingHip.x - stanceHip.x);
        if (dx < 1e-3) continue; // Hips collapsed to a point (bad detection).
        // y grows downward: positive dy = swing hip lower = drop.
        const deg = (Math.atan2(swingHip.y - stanceHip.y, dx) * 180) / Math.PI;
        if (deg > maxDrop) maxDrop = deg;
      }
      if (maxDrop > -Infinity) {
        dropsBySide[cycle.side].push(maxDrop);
        perCycle.push(maxDrop);
      }
    }
    if (perCycle.length === 0) return null;

    const left = dropsBySide.left.length > 0 ? median(dropsBySide.left) : 0;
    const right = dropsBySide.right.length > 0 ? median(dropsBySide.right) : 0;

    const visibility = meanVisibility(frames, [LM.leftHip, LM.rightHip]);
    const base = confidenceFrom(perCycle.length, visibility, dispersion(perCycle, 2));

    return {
      id: 'hipDrop',
      label: 'Hip drop',
      unit: 'deg',
      value: Math.max(left, right),
      perCycle,
      perSide: { left, right },
      healthyRange: healthyRangeFor('hipDrop'),
      confidence: downgradeConfidence(base),
      sourceView: input.view,
    };
  },
};
