import { describe, it, expect } from 'vitest';
import type {
  GaitCycle,
  GaitDiagnostics,
  GaitEvent,
  Landmark,
  LandmarkFrame,
  ViewAngle,
} from '../../types';
import { segmentGaitCycles } from '../gaitCycles';
import { computeMetrics, type MetricInput } from '../metrics/index';
import { strideAsymmetryModule } from '../metrics/strideAsymmetry';

const DEG = Math.PI / 180;

// --- Deterministic synthetic runner with controllable form parameters -------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGaussian(seed: number): () => number {
  const rand = mulberry32(seed);
  return () => {
    const u = Math.max(1e-9, rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

interface RunnerOpts {
  cadenceSpm?: number;
  fps?: number;
  durationSec?: number;
  view?: 'side' | 'front';
  /** Injected forward trunk lean, degrees. */
  trunkLeanDeg?: number;
  /** Normalized x offset of the ankles ahead of the hip midpoint (side view). */
  overstride?: number;
  /** Foot pitch at all times, degrees; positive = heel below toes. */
  footStrikeDeg?: number;
  /** Peak-to-trough hip vertical oscillation, normalized units. */
  verticalOsc?: number;
  /** Elbow-angle ROM per arm, degrees. */
  armRomDeg?: { left: number; right: number };
  /** Right-hip drop (degrees of pelvis tilt) during left stance (front view). */
  hipDropDeg?: number;
  /** Constant medial x offset of the LEFT knee, normalized (front view). */
  kneeValgusOffset?: number;
  noise?: number;
  seed?: number;
}

function makeRunner(opts: RunnerOpts = {}): LandmarkFrame[] {
  const {
    cadenceSpm = 170,
    fps = 24,
    durationSec = 10,
    view = 'side',
    trunkLeanDeg = 0,
    overstride = 0,
    footStrikeDeg = 0,
    verticalOsc = 0,
    armRomDeg = { left: 30, right: 30 },
    hipDropDeg = 0,
    kneeValgusOffset = 0,
    noise = 0,
    seed = 42,
  } = opts;

  const period = 120 / cadenceSpm; // per-leg stride period, seconds
  const n = Math.round(durationSec * fps);
  const gaussL = makeGaussian(seed);
  const gaussR = makeGaussian(seed + 1);

  const hipHalf = view === 'front' ? 0.05 : 0.01;
  const shoulderHalf = view === 'front' ? 0.06 : 0.01;
  const footLen = 0.06;

  const frames: LandmarkFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const phase = (2 * Math.PI * t) / period;
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
    }));
    const set = (idx: number, x: number, y: number) => {
      lm[idx] = { x, y, z: 0, visibility: 1 };
    };

    // Pelvis. Left ankle strikes at sin(phase) = 1; right-hip drop peaks then.
    const hipBaseY = 0.55 + (verticalOsc / 2) * Math.sin(2 * phase);
    const leftHipY = hipBaseY;
    const rightHipY =
      hipBaseY + Math.tan(hipDropDeg * DEG) * (2 * hipHalf) * Math.max(0, Math.sin(phase));
    set(23, 0.5 - hipHalf, leftHipY);
    set(24, 0.5 + hipHalf, rightHipY);

    // Trunk and head, built from the hip midpoint so lean is exact.
    const hipMidX = 0.5;
    const hipMidY = (leftHipY + rightHipY) / 2;
    const trunkLen = 0.2;
    const shoulderMidX = hipMidX + Math.tan(trunkLeanDeg * DEG) * trunkLen;
    const shoulderMidY = hipMidY - trunkLen;
    set(11, shoulderMidX - shoulderHalf, shoulderMidY);
    set(12, shoulderMidX + shoulderHalf, shoulderMidY);
    set(0, shoulderMidX, shoulderMidY - 0.15); // nose

    // Legs and feet: vertical ankle sinusoids in antiphase.
    const leftAnkY = 0.85 + 0.1 * Math.sin(phase) + (noise ? noise * gaussL() : 0);
    const rightAnkY = 0.85 + 0.1 * Math.sin(phase + Math.PI) + (noise ? noise * gaussR() : 0);
    const leftAnkX = view === 'front' ? 0.5 - hipHalf : hipMidX + overstride;
    const rightAnkX = view === 'front' ? 0.5 + hipHalf : hipMidX + overstride;
    set(27, leftAnkX, leftAnkY);
    set(28, rightAnkX, rightAnkY);

    const footY = (ankY: number) => ankY + 0.005;
    const toeYFor = (heelY: number) => heelY - Math.tan(footStrikeDeg * DEG) * footLen;
    set(29, leftAnkX - footLen / 2, footY(leftAnkY));
    set(31, leftAnkX + footLen / 2, toeYFor(footY(leftAnkY)));
    set(30, rightAnkX - footLen / 2, footY(rightAnkY));
    set(32, rightAnkX + footLen / 2, toeYFor(footY(rightAnkY)));

    // Knees. Front view: optionally push the LEFT knee medially (+x).
    const kneeY = 0.72;
    set(25, view === 'front' ? 0.5 - hipHalf + kneeValgusOffset : leftAnkX, kneeY);
    set(26, view === 'front' ? 0.5 + hipHalf : rightAnkX, kneeY);

    // Arms: forearm swings about the elbow; elbow angle = 180 - alpha, so the
    // elbow-angle ROM equals armRomDeg for each side. Arms in antiphase.
    const upper = 0.15;
    const fore = 0.15;
    const armPhase = { left: phase, right: phase + Math.PI };
    const shoulders = { left: lm[11], right: lm[12] };
    const elbowIdx = { left: 13, right: 14 };
    const wristIdx = { left: 15, right: 16 };
    for (const side of ['left', 'right'] as const) {
      const sh = shoulders[side];
      const elbowX = sh.x;
      const elbowY = sh.y + upper;
      set(elbowIdx[side], elbowX, elbowY);
      const alpha = (60 + (armRomDeg[side] / 2) * Math.sin(armPhase[side])) * DEG;
      set(wristIdx[side], elbowX + fore * Math.sin(alpha), elbowY + fore * Math.cos(alpha));
    }

    frames.push({ timestamp: t, landmarks: lm, worldLandmarks: [] });
  }
  return frames;
}

function inputFor(view: ViewAngle, frames: LandmarkFrame[]): MetricInput {
  const seg = segmentGaitCycles(frames);
  return {
    view,
    frames,
    cycles: seg.cycles,
    events: seg.events,
    diagnostics: seg.diagnostics,
  };
}

function metricById(metrics: ReturnType<typeof computeMetrics>, id: string) {
  return metrics.find((m) => m.id === id);
}

// ---------------------------------------------------------------------------

describe('computeMetrics - cadence', () => {
  it('recovers a 170 spm cadence within 3 spm with high confidence', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ cadenceSpm: 170 }))]);
    const cadence = metricById(metrics, 'cadence');
    expect(cadence).toBeDefined();
    expect(cadence!.value).toBeGreaterThan(167);
    expect(cadence!.value).toBeLessThan(173);
    expect(cadence!.confidence).toBe('high');
    expect(cadence!.perCycle!.length).toBeGreaterThan(10);
  });

  it('downgrades confidence when only a couple of cycles exist', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ durationSec: 2.2 }))]);
    const cadence = metricById(metrics, 'cadence');
    expect(cadence).toBeDefined();
    expect(cadence!.confidence).not.toBe('high');
  });
});

describe('computeMetrics - overstriding', () => {
  it('recovers the injected ankle-ahead-of-hip ratio', () => {
    const ov = 0.15;
    const metrics = computeMetrics([inputFor('side', makeRunner({ overstride: ov }))]);
    const m = metricById(metrics, 'overstriding');
    expect(m).toBeDefined();
    // Ankle at hip + 0.15, vertical hip-to-ankle ~0.40 at strike:
    // expected ratio ~ 0.15 / hypot(~0.15, 0.40) ~ 0.35.
    expect(m!.value).toBeGreaterThan(0.31);
    expect(m!.value).toBeLessThan(0.39);
  });

  it('reports near-zero when the foot lands under the hips', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ overstride: 0 }))]);
    const m = metricById(metrics, 'overstriding');
    expect(m).toBeDefined();
    expect(Math.abs(m!.value)).toBeLessThan(0.05);
  });
});

describe('computeMetrics - footStrike', () => {
  it('recovers a 12 degree heel strike and classifies it', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ footStrikeDeg: 12 }))]);
    const m = metricById(metrics, 'footStrike');
    expect(m).toBeDefined();
    expect(m!.value).toBeGreaterThan(10.5);
    expect(m!.value).toBeLessThan(13.5);
    expect(m!.label.toLowerCase()).toContain('heel');
    expect(m!.keyMoments!.length).toBeGreaterThanOrEqual(2);
    expect(m!.keyMoments!.length).toBeLessThanOrEqual(3);
  });

  it('classifies a negative pitch as forefoot', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ footStrikeDeg: -10 }))]);
    const m = metricById(metrics, 'footStrike');
    expect(m).toBeDefined();
    expect(m!.value).toBeLessThan(-5);
    expect(m!.label.toLowerCase()).toContain('forefoot');
  });
});

describe('computeMetrics - verticalOscillation', () => {
  it('recovers an injected 0.02-unit hip oscillation as % of height', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ verticalOsc: 0.02 }))]);
    const m = metricById(metrics, 'verticalOscillation');
    expect(m).toBeDefined();
    // Height in frame ~0.72 units -> ~2.8% raw; light smoothing attenuates
    // the 2.8 Hz oscillation somewhat at 24 fps.
    expect(m!.value).toBeGreaterThan(1.8);
    expect(m!.value).toBeLessThan(3.2);
  });
});

describe('computeMetrics - trunkLean', () => {
  it('recovers an injected 8 degree forward lean', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ trunkLeanDeg: 8 }))]);
    const m = metricById(metrics, 'trunkLean');
    expect(m).toBeDefined();
    expect(m!.value).toBeGreaterThan(6.8);
    expect(m!.value).toBeLessThan(9.2);
  });
});

describe('computeMetrics - armSwing', () => {
  it('recovers per-side ROM and the symmetry ratio', () => {
    const metrics = computeMetrics([
      inputFor('side', makeRunner({ armRomDeg: { left: 40, right: 20 } })),
    ]);
    const m = metricById(metrics, 'armSwing');
    expect(m).toBeDefined();
    expect(m!.perSide!.left).toBeGreaterThan(35);
    expect(m!.perSide!.left).toBeLessThan(42);
    expect(m!.perSide!.right).toBeGreaterThan(16);
    expect(m!.perSide!.right).toBeLessThan(22);
    expect(m!.value).toBeGreaterThan(0.42);
    expect(m!.value).toBeLessThan(0.58);
  });
});

describe('computeMetrics - hipDrop (front view)', () => {
  it('recovers an injected 8 degree contralateral drop on the left-stance side', () => {
    const frames = makeRunner({ view: 'front', hipDropDeg: 8 });
    const metrics = computeMetrics([inputFor('front', frames)]);
    const m = metricById(metrics, 'hipDrop');
    expect(m).toBeDefined();
    expect(m!.perSide!.left).toBeGreaterThan(6.2);
    expect(m!.perSide!.left).toBeLessThan(8.8);
    expect(m!.perSide!.right).toBeLessThan(2);
    expect(m!.value).toBeGreaterThan(6.2);
    // 2D pelvis angle is confounded; confidence must never report high.
    expect(m!.confidence).not.toBe('high');
  });
});

describe('computeMetrics - kneeValgus (front view)', () => {
  it('recovers an injected medial knee deviation of 0.2 hip widths', () => {
    const frames = makeRunner({ view: 'front', kneeValgusOffset: 0.02 });
    const metrics = computeMetrics([inputFor('front', frames)]);
    const m = metricById(metrics, 'kneeValgus');
    expect(m).toBeDefined();
    expect(m!.perSide!.left).toBeGreaterThan(0.15);
    expect(m!.perSide!.left).toBeLessThan(0.25);
    expect(m!.perSide!.right).toBeLessThan(0.05);
    expect(m!.value).toBeGreaterThan(0.15);
    expect(m!.confidence).not.toBe('high');
  });
});

describe('computeMetrics - strideAsymmetry', () => {
  it('reports near-zero asymmetry for a symmetric runner', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({}))]);
    const m = metricById(metrics, 'strideAsymmetry');
    expect(m).toBeDefined();
    expect(m!.value).toBeLessThan(3);
  });

  it('recovers a fabricated 13.3% duration asymmetry', () => {
    const fakeCycle = (side: 'left' | 'right', start: number, dur: number, stance: number): GaitCycle => {
      const s: GaitEvent = { type: 'footStrike', side, time: start, frameIndex: 0 };
      const to: GaitEvent = { type: 'toeOff', side, time: start + stance, frameIndex: 0 };
      const e: GaitEvent = { type: 'footStrike', side, time: start + dur, frameIndex: 1 };
      return {
        side,
        start: s,
        toeOff: to,
        end: e,
        frameRange: [0, 1],
        stanceDuration: stance,
        swingDuration: dur - stance,
      };
    };
    // Equal stance FRACTIONS (0.375) so the duration difference dominates:
    // |0.8 - 0.7| / 0.75 = 13.33%.
    const cycles: GaitCycle[] = [
      fakeCycle('left', 0, 0.8, 0.3),
      fakeCycle('left', 1, 0.8, 0.3),
      fakeCycle('left', 2, 0.8, 0.3),
      fakeCycle('right', 0.4, 0.7, 0.2625),
      fakeCycle('right', 1.4, 0.7, 0.2625),
      fakeCycle('right', 2.4, 0.7, 0.2625),
    ];
    const emptySide = (side: 'left' | 'right') => ({
      side,
      rawFootStrikes: 4,
      rawToeOffs: 3,
      keptCycles: 3,
      discardedCycles: 0,
      discardReasons: {},
      meanCycleDuration: 0.75,
    });
    const diagnostics: GaitDiagnostics = {
      fps: 24,
      left: emptySide('left'),
      right: emptySide('right'),
      quality: 'good',
    };
    const metric = strideAsymmetryModule.compute({
      view: 'side',
      frames: [],
      cycles,
      events: [],
      diagnostics,
    });
    expect(metric).not.toBeNull();
    expect(metric!.value).toBeGreaterThan(12.3);
    expect(metric!.value).toBeLessThan(14.3);
  });
});

describe('computeMetrics - view selection and skipping', () => {
  it('skips front/rear-only metrics when only a side view is provided', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({}))]);
    const ids = metrics.map((m) => m.id);
    expect(ids).not.toContain('hipDrop');
    expect(ids).not.toContain('kneeValgus');
    expect(ids).toContain('cadence');
    expect(ids).toContain('trunkLean');
  });

  it('skips side-only metrics when only a front view is provided', () => {
    const metrics = computeMetrics([inputFor('front', makeRunner({ view: 'front' }))]);
    const ids = metrics.map((m) => m.id);
    expect(ids).not.toContain('overstriding');
    expect(ids).not.toContain('footStrike');
    expect(ids).not.toContain('trunkLean');
    expect(ids).toContain('cadence');
    expect(ids).toContain('hipDrop');
  });

  it('prefers the side view for shared metrics when both views exist', () => {
    const metrics = computeMetrics([
      inputFor('side', makeRunner({})),
      inputFor('front', makeRunner({ view: 'front' })),
    ]);
    expect(metricById(metrics, 'cadence')!.sourceView).toBe('side');
    expect(metricById(metrics, 'hipDrop')!.sourceView).toBe('front');
  });

  it('returns no metrics when gait quality is poor', () => {
    const metrics = computeMetrics([inputFor('side', makeRunner({ durationSec: 1 }))]);
    expect(metrics).toHaveLength(0);
  });

  it('every metric embeds an approximate healthy range with a source note', () => {
    const metrics = computeMetrics([
      inputFor('side', makeRunner({})),
      inputFor('front', makeRunner({ view: 'front' })),
    ]);
    expect(metrics.length).toBeGreaterThanOrEqual(8);
    for (const m of metrics) {
      expect(m.healthyRange.approximate).toBe(true);
      expect(m.healthyRange.source.length).toBeGreaterThan(20);
    }
  });
});
