// Healthy-range and severity thresholds for every metric.
//
// IMPORTANT: these are coaching guidelines, not clinical or diagnostic
// criteria. Almost everything here is marked `approximate: true` — 2D pose
// estimation from consumer video cannot support tighter claims, and the
// literature itself mostly reports typical ranges for trained runners.
// Severity bands express how far a value sits beyond the healthy range edge
// (in the metric's own unit) before it counts as mild / moderate / notable.

import type { Metric, MetricId } from '../types';

export type ConcernDirection = 'above' | 'below' | 'both' | 'outside';

export interface ThresholdSpec {
  healthyRange: Metric['healthyRange'];
  /** Which side of the healthy range is a concern. */
  concern: ConcernDirection;
  /**
   * Deviation beyond the nearest healthy-range edge (metric units) at which a
   * finding is considered mild / moderate / notable.
   */
  bands: { mild: number; moderate: number; notable: number };
}

export const THRESHOLDS: Record<MetricId, ThresholdSpec> = {
  cadence: {
    healthyRange: {
      min: 160,
      approximate: true,
      source:
        'Higher step rates (~170-180 spm) modestly reduce joint loading (Heiderscheit et al. 2011). Typical coaching range, not a diagnostic cutoff — taller runners run lower cadences comfortably.',
    },
    concern: 'below',
    bands: { mild: 5, moderate: 12, notable: 20 },
  },
  overstriding: {
    healthyRange: {
      max: 0.2,
      approximate: true,
      source:
        'Foot contact close to under the hips is the usual coaching cue; some forward contact is normal at speed. Ratio of ankle-ahead-of-hip distance to leg length, from 2D side view — treat as a rough indicator.',
    },
    concern: 'above',
    bands: { mild: 0.05, moderate: 0.12, notable: 0.2 },
  },
  footStrike: {
    healthyRange: {
      min: -25,
      max: 20,
      approximate: true,
      source:
        'Foot pitch proxy at contact (positive = heel-first). No strike type is inherently wrong; a strongly dorsiflexed heel strike often travels with overstriding, which is the actual concern.',
    },
    concern: 'above',
    bands: { mild: 5, moderate: 12, notable: 20 },
  },
  verticalOscillation: {
    healthyRange: {
      max: 6,
      approximate: true,
      source:
        'Typical vertical oscillation is roughly 6-10 cm (~3-6% of body height) in recreational runners. Camera framing and 2D scaling make this a rough estimate.',
    },
    concern: 'above',
    bands: { mild: 1, moderate: 2.5, notable: 4 },
  },
  trunkLean: {
    healthyRange: {
      min: 3,
      max: 12,
      approximate: true,
      source:
        'A slight whole-body forward lean (~5-10 degrees) is commonly coached; fully upright or backward lean and an excessive hip-hinge lean are both flagged. Measured shoulder-to-hip line vs vertical.',
    },
    concern: 'outside',
    bands: { mild: 2, moderate: 5, notable: 8 },
  },
  armSwing: {
    healthyRange: {
      min: 0.8,
      approximate: true,
      source:
        'Left/right elbow-swing range-of-motion ratio; 1.0 = symmetric. Mild asymmetry is normal — persistent large differences can mirror lower-body asymmetry.',
    },
    concern: 'below',
    bands: { mild: 0.05, moderate: 0.15, notable: 0.3 },
  },
  hipDrop: {
    healthyRange: {
      max: 5,
      approximate: true,
      source:
        'Contralateral pelvic drop under ~5 degrees in single-leg stance is typical; larger drops can indicate hip abductor weakness. 2D front-view estimate — sensitive to camera height and clothing.',
    },
    concern: 'above',
    bands: { mild: 2, moderate: 5, notable: 8 },
  },
  kneeValgus: {
    healthyRange: {
      max: 0.12,
      approximate: true,
      source:
        'Medial knee deviation from the hip-ankle line, as a fraction of hip width, during stance. 2D front-view proxy for dynamic valgus — body rotation and camera angle confound it, so treat gently.',
    },
    concern: 'above',
    bands: { mild: 0.05, moderate: 0.12, notable: 0.2 },
  },
  strideAsymmetry: {
    healthyRange: {
      max: 8,
      approximate: true,
      source:
        'Left/right differences in cycle duration or stance fraction under ~5-10% are common in healthy runners. Larger persistent asymmetry is worth watching, especially post-injury.',
    },
    concern: 'above',
    bands: { mild: 3, moderate: 7, notable: 12 },
  },
};

export function healthyRangeFor(id: MetricId): Metric['healthyRange'] {
  return THRESHOLDS[id].healthyRange;
}
