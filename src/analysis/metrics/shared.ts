// Shared plumbing for metric modules: input/module contracts, landmark
// indices, geometry helpers, and the confidence heuristic.

import type {
  GaitCycle,
  GaitDiagnostics,
  GaitEvent,
  Landmark,
  LandmarkFrame,
  Metric,
  MetricId,
  ViewAngle,
} from '../../types';

/** One processed video's worth of data, offered to the metric orchestrator. */
export interface MetricInput {
  view: ViewAngle;
  frames: LandmarkFrame[];
  cycles: GaitCycle[];
  events: GaitEvent[];
  diagnostics: GaitDiagnostics;
  treadmillSpeed?: number;
}

export interface MetricModule {
  id: MetricId;
  /** Views this metric can be computed from, in preference order. */
  views: ViewAngle[];
  /** Returns null when the input cannot support the metric. */
  compute: (input: MetricInput) => Metric | null;
}

/** MediaPipe Pose landmark indices used by the metrics. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export type Side = 'left' | 'right';

export const SIDE_LM = {
  left: {
    shoulder: LM.leftShoulder,
    elbow: LM.leftElbow,
    wrist: LM.leftWrist,
    hip: LM.leftHip,
    knee: LM.leftKnee,
    ankle: LM.leftAnkle,
    heel: LM.leftHeel,
    footIndex: LM.leftFootIndex,
  },
  right: {
    shoulder: LM.rightShoulder,
    elbow: LM.rightElbow,
    wrist: LM.rightWrist,
    hip: LM.rightHip,
    knee: LM.rightKnee,
    ankle: LM.rightAnkle,
    heel: LM.rightHeel,
    footIndex: LM.rightFootIndex,
  },
} as const;

export const VISIBILITY_MIN = 0.5;

export function otherSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

export function midpoint(a: Landmark, b: Landmark): { x: number; y: number; visibility: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility, b.visibility) };
}

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Interior angle (degrees) at vertex `b` of the triangle a-b-c. */
export function angleAtDeg(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return NaN;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Direction of horizontal motion in image space: +1 means the runner moves
 * toward +x, -1 toward -x. On a treadmill the runner is stationary, so we
 * infer facing from foot orientation (foot_index sits ahead of the heel).
 * Falls back to +1 when ambiguous (e.g. front/rear views).
 */
export function directionOfMotion(frames: LandmarkFrame[]): 1 | -1 {
  let sum = 0;
  for (const frame of frames) {
    for (const side of ['left', 'right'] as const) {
      const heel = frame.landmarks[SIDE_LM[side].heel];
      const toe = frame.landmarks[SIDE_LM[side].footIndex];
      if (
        heel &&
        toe &&
        heel.visibility >= VISIBILITY_MIN &&
        toe.visibility >= VISIBILITY_MIN
      ) {
        sum += Math.sign(toe.x - heel.x);
      }
    }
  }
  return sum >= 0 ? 1 : -1;
}

/** Mean visibility of the given landmark indices across all frames. */
export function meanVisibility(frames: LandmarkFrame[], indices: readonly number[]): number {
  let sum = 0;
  let count = 0;
  for (const frame of frames) {
    for (const idx of indices) {
      const lm = frame.landmarks[idx];
      if (lm) {
        sum += lm.visibility;
        count += 1;
      }
    }
  }
  return count === 0 ? 0 : sum / count;
}

/** Indices of frames whose timestamp lies in [t0, t1]. */
export function frameIndicesInInterval(frames: LandmarkFrame[], t0: number, t1: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const t = frames[i].timestamp;
    if (t >= t0 && t <= t1) out.push(i);
  }
  return out;
}

/** Frame indices within a cycle's stance phase (foot strike -> toe off). */
export function stanceFrameIndices(frames: LandmarkFrame[], cycle: GaitCycle): number[] {
  return frameIndicesInInterval(frames, cycle.start.time, cycle.toeOff.time);
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Relative dispersion of per-cycle values: std-dev divided by
 * max(|mean|, scaleFloor). The floor keeps the ratio meaningful for metrics
 * whose healthy value is near zero (e.g. trunk lean of 0 degrees).
 */
export function dispersion(values: number[], scaleFloor = 0): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const sd = Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
  const denom = Math.max(Math.abs(m), scaleFloor, 1e-9);
  return sd / denom;
}

/**
 * Confidence heuristic combining sample count (cycles or events used),
 * landmark visibility, and per-cycle dispersion. 'high' requires all three to
 * be solid; a shortage anywhere drops to 'medium', two shortages to 'low'.
 */
export function confidenceFrom(
  sampleCount: number,
  visibility: number,
  cv: number,
): Metric['confidence'] {
  let score = 0;
  score += sampleCount >= 6 ? 2 : sampleCount >= 3 ? 1 : 0;
  score += visibility >= 0.8 ? 2 : visibility >= 0.6 ? 1 : 0;
  score += cv <= 0.08 ? 2 : cv <= 0.2 ? 1 : 0;
  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/** Downgrade a confidence one level (used for 2D-limited metrics). */
export function downgradeConfidence(c: Metric['confidence']): Metric['confidence'] {
  return c === 'high' ? 'medium' : 'low';
}
