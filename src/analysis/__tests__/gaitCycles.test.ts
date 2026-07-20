import { describe, it, expect } from 'vitest';
import type { Landmark, LandmarkFrame } from '../../types';
import { segmentGaitCycles, estimateFps } from '../gaitCycles';

// --- Deterministic synthetic runner -----------------------------------------

/** Seeded PRNG so noisy tests are reproducible. */
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
    // Box-Muller.
    const u = Math.max(1e-9, rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

interface SyntheticOptions {
  /** Total steps per minute (both feet). Per-leg period = 120 / cadenceSpm. */
  cadenceSpm: number;
  fps: number;
  durationSec: number;
  /** Std-dev of gaussian noise added to the ankle-y signal (normalized units). */
  noise?: number;
  /** Visibility of the left ankle+knee landmarks (default 1). */
  leftLegVisibility?: number;
  /** Visibility of the right ankle+knee landmarks (default 1). */
  rightLegVisibility?: number;
  seed?: number;
}

const IDX = {
  left: { hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31 },
  right: { hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32 },
};

const AMP = 0.1;
const BASELINE = 0.8;

/** Per-leg stride period in seconds. */
function periodSec(cadenceSpm: number): number {
  return 120 / cadenceSpm;
}

/**
 * Build a LandmarkFrame[] for a runner whose ankles oscillate vertically in
 * antiphase. Foot strike (foot lowest -> maximal y) occurs at the sine peak.
 */
function makeRunner(opts: SyntheticOptions): LandmarkFrame[] {
  const {
    cadenceSpm,
    fps,
    durationSec,
    noise = 0,
    leftLegVisibility = 1,
    rightLegVisibility = 1,
    seed = 42,
  } = opts;

  const period = periodSec(cadenceSpm);
  const n = Math.round(durationSec * fps);
  const gaussL = makeGaussian(seed);
  const gaussR = makeGaussian(seed + 1);

  const frames: LandmarkFrame[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / fps;
    const leftY = BASELINE + AMP * Math.sin((2 * Math.PI * t) / period) + (noise ? noise * gaussL() : 0);
    const rightY =
      BASELINE + AMP * Math.sin((2 * Math.PI * t) / period + Math.PI) + (noise ? noise * gaussR() : 0);

    const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 1,
    }));

    // Left leg.
    landmarks[IDX.left.ankle] = { x: 0.45, y: leftY, z: 0, visibility: leftLegVisibility };
    landmarks[IDX.left.heel] = { x: 0.44, y: leftY, z: 0, visibility: leftLegVisibility };
    landmarks[IDX.left.knee] = { x: 0.45, y: 0.6, z: 0, visibility: leftLegVisibility };
    landmarks[IDX.left.hip] = { x: 0.45, y: 0.45, z: 0, visibility: 1 };
    // Right leg.
    landmarks[IDX.right.ankle] = { x: 0.55, y: rightY, z: 0, visibility: rightLegVisibility };
    landmarks[IDX.right.heel] = { x: 0.56, y: rightY, z: 0, visibility: rightLegVisibility };
    landmarks[IDX.right.knee] = { x: 0.55, y: 0.6, z: 0, visibility: rightLegVisibility };
    landmarks[IDX.right.hip] = { x: 0.55, y: 0.45, z: 0, visibility: 1 };

    frames.push({ timestamp: t, landmarks, worldLandmarks: [] });
  }
  return frames;
}

/** Expected number of interior sine peaks for phase φ over (0, D). */
function expectedCycles(cadenceSpm: number, durationSec: number, phase: number): number {
  const P = periodSec(cadenceSpm);
  // Peaks where 2π t / P + φ = π/2 + 2πk  =>  t = P*(0.25 - φ/2π) + kP, t in (0, D).
  const t0 = P * (0.25 - phase / (2 * Math.PI));
  let peaks = 0;
  for (let k = -2; ; k++) {
    const t = t0 + k * P;
    if (t <= 0) continue;
    if (t >= durationSec) break;
    peaks++;
  }
  return Math.max(0, peaks - 1);
}

// ---------------------------------------------------------------------------

describe('estimateFps', () => {
  it('recovers the sampling rate from timestamps', () => {
    const frames = makeRunner({ cadenceSpm: 170, fps: 24, durationSec: 2 });
    expect(estimateFps(frames.map((f) => f.timestamp))).toBeCloseTo(24, 4);
  });
});

describe('segmentGaitCycles - clean signal', () => {
  const cadence = 170;
  const fps = 24;
  const duration = 10;
  const frames = makeRunner({ cadenceSpm: cadence, fps, durationSec: duration });
  const { cycles, diagnostics } = segmentGaitCycles(frames);

  const left = cycles.filter((c) => c.side === 'left');
  const right = cycles.filter((c) => c.side === 'right');

  it('detects the expected number of cycles per side (+/-1)', () => {
    const expL = expectedCycles(cadence, duration, 0);
    const expR = expectedCycles(cadence, duration, Math.PI);
    expect(Math.abs(left.length - expL)).toBeLessThanOrEqual(1);
    expect(Math.abs(right.length - expR)).toBeLessThanOrEqual(1);
  });

  it('has mean cycle duration within 5% of ground truth', () => {
    const truth = periodSec(cadence);
    expect(diagnostics.left.meanCycleDuration).toBeGreaterThan(truth * 0.95);
    expect(diagnostics.left.meanCycleDuration).toBeLessThan(truth * 1.05);
    expect(diagnostics.right.meanCycleDuration).toBeGreaterThan(truth * 0.95);
    expect(diagnostics.right.meanCycleDuration).toBeLessThan(truth * 1.05);
  });

  it('produces stance shorter than the full cycle, with positive swing', () => {
    for (const c of cycles) {
      const cycleDur = c.end.time - c.start.time;
      expect(c.stanceDuration).toBeGreaterThan(0);
      expect(c.stanceDuration).toBeLessThan(cycleDur);
      expect(c.swingDuration).toBeGreaterThan(0);
      expect(c.stanceDuration + c.swingDuration).toBeCloseTo(cycleDur, 6);
    }
  });

  it('reports frame ranges that bracket the cycle', () => {
    for (const c of cycles) {
      expect(c.frameRange[0]).toBe(c.start.frameIndex);
      expect(c.frameRange[1]).toBe(c.end.frameIndex);
      expect(c.frameRange[1]).toBeGreaterThan(c.frameRange[0]);
    }
  });

  it('rates a full clean recording as good quality', () => {
    expect(diagnostics.quality).toBe('good');
    expect(diagnostics.left.keptCycles).toBeGreaterThanOrEqual(3);
    expect(diagnostics.right.keptCycles).toBeGreaterThanOrEqual(3);
  });
});

describe('segmentGaitCycles - noisy signal', () => {
  it('still yields good quality with small gaussian noise', () => {
    const frames = makeRunner({
      cadenceSpm: 170,
      fps: 24,
      durationSec: 10,
      noise: 0.004,
      seed: 7,
    });
    const { diagnostics } = segmentGaitCycles(frames);
    expect(diagnostics.quality).toBe('good');
    expect(diagnostics.left.keptCycles).toBeGreaterThanOrEqual(3);
    expect(diagnostics.right.keptCycles).toBeGreaterThanOrEqual(3);
  });
});

describe('segmentGaitCycles - insufficient data', () => {
  it('rates a 1 second clip as poor', () => {
    const frames = makeRunner({ cadenceSpm: 170, fps: 24, durationSec: 1 });
    const { diagnostics } = segmentGaitCycles(frames);
    expect(diagnostics.quality).toBe('poor');
  });

  it('returns poor with no cycles for near-empty input', () => {
    const { cycles, diagnostics } = segmentGaitCycles([]);
    expect(cycles).toHaveLength(0);
    expect(diagnostics.quality).toBe('poor');
  });
});

describe('segmentGaitCycles - low visibility', () => {
  it('discards cycles on a leg with poor landmark visibility', () => {
    const frames = makeRunner({
      cadenceSpm: 170,
      fps: 24,
      durationSec: 10,
      leftLegVisibility: 0.3,
      rightLegVisibility: 1,
    });
    const { cycles, diagnostics } = segmentGaitCycles(frames);

    const left = cycles.filter((c) => c.side === 'left');
    const right = cycles.filter((c) => c.side === 'right');

    expect(left).toHaveLength(0);
    expect(diagnostics.left.keptCycles).toBe(0);
    expect(diagnostics.left.discardReasons.visibility ?? 0).toBeGreaterThan(0);
    // The healthy leg is unaffected.
    expect(right.length).toBeGreaterThanOrEqual(3);
  });
});
