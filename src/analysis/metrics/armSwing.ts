// Arm swing: per-side elbow-angle (shoulder-elbow-wrist) range of motion per
// cycle, plus a midline-crossing check. The metric VALUE is the left/right
// ROM symmetry ratio (min/max; 1 = perfectly symmetric); perSide carries each
// arm's median ROM in degrees.
//
// Midline crossing: in front/rear views the wrist crossing the body midline
// (hip-midpoint x) is a common cue; in side view the shoulder-midpoint x is
// used instead (wrist swinging past the torso line). When detected, the first
// crossing per side is surfaced as a keyMoment rather than folded into the
// value, since ROM symmetry is the primary signal.

import type { Metric } from '../../types';
import { median } from '../../pose/smoothing';
import { healthyRangeFor } from '../thresholds';
import {
  LM,
  SIDE_LM,
  VISIBILITY_MIN,
  angleAtDeg,
  confidenceFrom,
  dispersion,
  meanVisibility,
  midpoint,
  type MetricModule,
  type Side,
} from './shared';

export const armSwingModule: MetricModule = {
  id: 'armSwing',
  views: ['side', 'front', 'rear'],
  compute(input): Metric | null {
    const { frames, cycles } = input;
    if (cycles.length === 0 || frames.length === 0) return null;

    const romsBySide: Record<Side, number[]> = { left: [], right: [] };
    const perCycle: number[] = [];
    const keyMoments: { time: number; label: string }[] = [];
    const crossingSeen: Record<Side, boolean> = { left: false, right: false };

    for (const cycle of cycles) {
      const [from, to] = cycle.frameRange;
      for (const side of ['left', 'right'] as const) {
        const idx = SIDE_LM[side];
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = from; i <= to && i < frames.length; i++) {
          const f = frames[i];
          const shoulder = f.landmarks[idx.shoulder];
          const elbow = f.landmarks[idx.elbow];
          const wrist = f.landmarks[idx.wrist];
          if (!shoulder || !elbow || !wrist) continue;
          if (
            shoulder.visibility < VISIBILITY_MIN ||
            elbow.visibility < VISIBILITY_MIN ||
            wrist.visibility < VISIBILITY_MIN
          ) {
            continue;
          }
          const angle = angleAtDeg(shoulder, elbow, wrist);
          if (!Number.isFinite(angle)) continue;
          if (angle < lo) lo = angle;
          if (angle > hi) hi = angle;

          // Midline / torso-line crossing check.
          if (!crossingSeen[side]) {
            const hL = f.landmarks[LM.leftHip];
            const hR = f.landmarks[LM.rightHip];
            const sL = f.landmarks[LM.leftShoulder];
            const sR = f.landmarks[LM.rightShoulder];
            if (hL && hR && sL && sR) {
              const refX =
                input.view === 'side' ? midpoint(sL, sR).x : midpoint(hL, hR).x;
              const shoulderOffset = shoulder.x - refX;
              const wristOffset = wrist.x - refX;
              // Wrist on the opposite side of the reference line from its own
              // shoulder = crossing.
              if (Math.abs(shoulderOffset) > 1e-3 && wristOffset * shoulderOffset < 0) {
                crossingSeen[side] = true;
                keyMoments.push({
                  time: f.timestamp,
                  label: `${side} wrist crosses ${input.view === 'side' ? 'torso line' : 'midline'}`,
                });
              }
            }
          }
        }
        if (hi > lo) {
          romsBySide[side].push(hi - lo);
          perCycle.push(hi - lo);
        }
      }
    }

    if (romsBySide.left.length === 0 || romsBySide.right.length === 0) return null;

    const leftRom = median(romsBySide.left);
    const rightRom = median(romsBySide.right);
    const maxRom = Math.max(leftRom, rightRom);
    if (maxRom < 1e-3) return null;
    const symmetry = Math.min(leftRom, rightRom) / maxRom;

    const visibility = meanVisibility(frames, [
      LM.leftShoulder,
      LM.rightShoulder,
      LM.leftElbow,
      LM.rightElbow,
      LM.leftWrist,
      LM.rightWrist,
    ]);

    return {
      id: 'armSwing',
      label: 'Arm swing symmetry',
      unit: 'ratio',
      value: symmetry,
      perCycle,
      perSide: { left: leftRom, right: rightRom },
      healthyRange: healthyRangeFor('armSwing'),
      confidence: confidenceFrom(
        Math.min(romsBySide.left.length, romsBySide.right.length),
        visibility,
        dispersion(perCycle, 10),
      ),
      sourceView: input.view,
      keyMoments: keyMoments.length > 0 ? keyMoments : undefined,
    };
  },
};
