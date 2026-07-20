// Gait event detection and cycle segmentation from MediaPipe pose landmarks.
//
// Heuristic overview (vertical-ankle-motion method, side-view tolerant but also
// valid for front/rear footage since it only uses the vertical component):
//
//   MediaPipe normalized coords have y increasing DOWNWARD, so the foot is at
//   its LOWEST point (touchdown / stance) at MAXIMAL y and highest (mid-swing)
//   at minimal y. For each leg we build an "ankle-y" signal, smooth it, and:
//
//     * FOOT STRIKE = local MAXIMUM of the smoothed ankle-y signal (foot lowest,
//       i.e. on the treadmill belt). The extremum is refined to sub-frame
//       precision with a parabola through the three samples around the peak,
//       because at 15-24 fps the true contact instant falls between samples.
//
//     * TOE OFF = the moment the foot leaves the "ground plateau" after a
//       strike. We take the first sample after the strike where the foot has
//       risen off the belt by more than 15% of the signal's vertical range,
//       i.e. where ankle-y has dropped below (peak - 0.15 * range). The exact
//       crossing time is found by linear interpolation between the bracketing
//       samples. (A vertical-velocity threshold is an equivalent alternative;
//       the plateau-departure fraction is used here because it is scale-relative
//       and needs no fps-dependent velocity tuning.)
//
//   A GaitCycle is footStrike -> toeOff -> next footStrike of the SAME leg.
//   Stance = strike..toeOff, swing = toeOff..next strike.

import type {
  GaitCycle,
  GaitDiagnostics,
  GaitEvent,
  GaitSideDiagnostics,
  LandmarkFrame,
} from '../types';
import { findPeaks, median, movingAverage, parabolicVertex } from '../pose/smoothing';

// MediaPipe Pose landmark indices.
const IDX = {
  left: { hip: 23, knee: 25, ankle: 27, heel: 29, foot: 31 },
  right: { hip: 24, knee: 26, ankle: 28, heel: 30, foot: 32 },
} as const;

type Side = 'left' | 'right';

// --- Tunable heuristic constants -------------------------------------------

/** Heel is only folded into the ankle-y signal when this visible. */
const HEEL_VISIBILITY_MIN = 0.5;
/** Fraction of vertical range the foot must lift past to count as toe-off. */
const TOE_OFF_LIFT_FRACTION = 0.15;
/** Peaks must have at least this fraction of the signal range as prominence. */
const PEAK_PROMINENCE_FRACTION = 0.15;
/** Plausible per-leg gait cycle duration bounds, in seconds. */
const MIN_CYCLE_SEC = 0.4;
const MAX_CYCLE_SEC = 1.6;
/** Mean leg-landmark visibility below this discards a cycle. */
const CYCLE_VISIBILITY_MIN = 0.5;
/** A first/last cycle deviating more than this fraction from the median is
 *  treated as a partial edge stride and dropped. */
const EDGE_PARTIAL_TOLERANCE = 0.3;

// ---------------------------------------------------------------------------

/** Estimate sampling rate from the median inter-frame interval. */
export function estimateFps(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  const diffs: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const dt = timestamps[i] - timestamps[i - 1];
    if (dt > 0) diffs.push(dt);
  }
  const dt = median(diffs);
  return Number.isFinite(dt) && dt > 0 ? 1 / dt : 0;
}

function oddWindow(n: number): number {
  const w = Math.max(3, Math.round(n));
  return w % 2 === 0 ? w + 1 : w;
}

interface SideSignal {
  /** ankle(+heel) y per frame. */
  y: number[];
  /** Mean visibility of ankle+knee per frame (for cycle filtering). */
  legVisibility: number[];
}

/** Build the vertical ankle-motion signal and per-frame leg visibility. */
function buildSideSignal(frames: LandmarkFrame[], side: Side): SideSignal {
  const idx = IDX[side];
  const y: number[] = [];
  const legVisibility: number[] = [];

  for (const frame of frames) {
    const lm = frame.landmarks;
    const ankle = lm[idx.ankle];
    const heel = lm[idx.heel];
    const knee = lm[idx.knee];

    // Ankle averaged with heel when the heel is reliably visible; this steadies
    // the signal because ankle and heel move together vertically. Otherwise use
    // the ankle alone.
    let yVal = ankle ? ankle.y : NaN;
    if (ankle && heel && heel.visibility >= HEEL_VISIBILITY_MIN) {
      yVal = (ankle.y + heel.y) / 2;
    }
    y.push(yVal);

    const av = ankle ? ankle.visibility : 0;
    const kv = knee ? knee.visibility : 0;
    legVisibility.push((av + kv) / 2);
  }

  return { y, legVisibility };
}

function range(values: number[]): number {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  return max - min;
}

/** Refine a peak's time to sub-frame precision via parabolic interpolation. */
function refinePeakTime(timestamps: number[], y: number[], peak: number): number {
  const n = y.length;
  if (peak <= 0 || peak >= n - 1) return timestamps[peak];
  const { offset } = parabolicVertex(y[peak - 1], y[peak], y[peak + 1]);
  const clamped = Math.max(-1, Math.min(1, offset));
  // Local frame spacing around the peak (may vary slightly frame to frame).
  const dt =
    clamped >= 0 ? timestamps[peak + 1] - timestamps[peak] : timestamps[peak] - timestamps[peak - 1];
  // `clamped` carries the sign; scale by the (positive) local frame spacing.
  return timestamps[peak] + clamped * Math.abs(dt);
}

interface SideEvents {
  strikes: GaitEvent[];
  toeOffs: GaitEvent[];
}

/** Detect foot-strike and toe-off events for one leg. */
function detectSideEvents(
  frames: LandmarkFrame[],
  timestamps: number[],
  side: Side,
  fps: number,
): { events: SideEvents; smoothed: number[]; legVisibility: number[] } {
  const { y, legVisibility } = buildSideSignal(frames, side);

  // Smooth over roughly a sixth of a stride worth of samples (>= 3), enough to
  // reject landmark jitter without flattening the strike peaks.
  const win = oddWindow(fps > 0 ? fps * 0.15 : 5);
  const smoothed = movingAverage(y, win);

  const sigRange = range(smoothed);
  const minProm = sigRange * PEAK_PROMINENCE_FRACTION;

  const peaks = findPeaks(smoothed, minProm);
  const strikes: GaitEvent[] = peaks.map((p) => ({
    type: 'footStrike',
    side,
    time: refinePeakTime(timestamps, smoothed, p),
    frameIndex: p,
  }));

  // Toe-off: first sample after each strike where the foot has lifted past the
  // plateau-departure threshold. Interpolate the exact crossing time.
  const toeOffs: GaitEvent[] = [];
  for (let s = 0; s < peaks.length; s++) {
    const peak = peaks[s];
    const nextPeak = s + 1 < peaks.length ? peaks[s + 1] : smoothed.length;
    const threshold = smoothed[peak] - TOE_OFF_LIFT_FRACTION * sigRange;
    for (let j = peak + 1; j < nextPeak && j < smoothed.length; j++) {
      if (smoothed[j] < threshold) {
        const prev = smoothed[j - 1];
        const denom = prev - smoothed[j];
        const frac = denom === 0 ? 0 : (prev - threshold) / denom;
        const time = timestamps[j - 1] + frac * (timestamps[j] - timestamps[j - 1]);
        toeOffs.push({ type: 'toeOff', side, time, frameIndex: j });
        break;
      }
    }
  }

  return { events: { strikes, toeOffs }, smoothed, legVisibility };
}

function meanVisibility(legVisibility: number[], from: number, to: number): number {
  let sum = 0;
  let count = 0;
  for (let i = from; i <= to && i < legVisibility.length; i++) {
    sum += legVisibility[i];
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

interface SideResult {
  cycles: GaitCycle[];
  diagnostics: GaitSideDiagnostics;
}

function segmentSide(
  frames: LandmarkFrame[],
  timestamps: number[],
  side: Side,
  fps: number,
): { result: SideResult; events: GaitEvent[] } {
  const { events, legVisibility } = detectSideEvents(frames, timestamps, side, fps);
  const { strikes, toeOffs } = events;

  const discardReasons: Record<string, number> = {};
  const bump = (reason: string) => {
    discardReasons[reason] = (discardReasons[reason] ?? 0) + 1;
  };

  // Candidate cycles: consecutive same-side strikes with a toe-off in between.
  interface Candidate {
    cycle: GaitCycle;
  }
  const candidates: Candidate[] = [];
  let discarded = 0;

  for (let i = 0; i + 1 < strikes.length; i++) {
    const start = strikes[i];
    const end = strikes[i + 1];
    const cycleDuration = end.time - start.time;

    // Toe-off strictly between the two strikes (by frame index).
    const toeOff = toeOffs.find(
      (t) => t.frameIndex > start.frameIndex && t.frameIndex <= end.frameIndex,
    );
    if (!toeOff) {
      bump('noToeOff');
      discarded += 1;
      continue;
    }

    if (cycleDuration < MIN_CYCLE_SEC || cycleDuration > MAX_CYCLE_SEC) {
      bump('duration');
      discarded += 1;
      continue;
    }

    const vis = meanVisibility(legVisibility, start.frameIndex, end.frameIndex);
    if (vis < CYCLE_VISIBILITY_MIN) {
      bump('visibility');
      discarded += 1;
      continue;
    }

    const cycle: GaitCycle = {
      side,
      start,
      toeOff,
      end,
      frameRange: [start.frameIndex, end.frameIndex],
      stanceDuration: toeOff.time - start.time,
      swingDuration: end.time - toeOff.time,
    };
    candidates.push({ cycle });
  }

  // Drop first/last partial edge strides: with >= 3 candidates a leading or
  // trailing cycle whose duration deviates strongly from the median is likely a
  // window-boundary artifact rather than a real stride.
  let kept = candidates.map((c) => c.cycle);
  if (kept.length >= 3) {
    const med = median(kept.map((c) => c.end.time - c.start.time));
    const isPartial = (c: GaitCycle) =>
      Math.abs(c.end.time - c.start.time - med) > EDGE_PARTIAL_TOLERANCE * med;
    const trimmed: GaitCycle[] = [];
    for (let i = 0; i < kept.length; i++) {
      const edge = i === 0 || i === kept.length - 1;
      if (edge && isPartial(kept[i])) {
        bump('partialEdge');
        discarded += 1;
        continue;
      }
      trimmed.push(kept[i]);
    }
    kept = trimmed;
  }

  const meanCycleDuration =
    kept.length === 0
      ? 0
      : kept.reduce((acc, c) => acc + (c.end.time - c.start.time), 0) / kept.length;

  const diagnostics: GaitSideDiagnostics = {
    side,
    rawFootStrikes: strikes.length,
    rawToeOffs: toeOffs.length,
    keptCycles: kept.length,
    discardedCycles: discarded,
    discardReasons,
    meanCycleDuration,
  };

  const allEvents: GaitEvent[] = [...strikes, ...toeOffs];
  return { result: { cycles: kept, diagnostics }, events: allEvents };
}

export interface GaitSegmentation {
  events: GaitEvent[];
  cycles: GaitCycle[];
  diagnostics: GaitDiagnostics;
}

function qualityFrom(left: number, right: number): GaitDiagnostics['quality'] {
  if (left >= 3 && right >= 3) return 'good';
  if (left >= 2 || right >= 2) return 'marginal';
  return 'poor';
}

/**
 * Segment a series of pose frames into per-leg gait cycles.
 *
 * Returns the raw detected events (both legs, sorted by time), the kept cycles
 * (both legs), and diagnostics describing detection quality.
 */
export function segmentGaitCycles(frames: LandmarkFrame[]): GaitSegmentation {
  const timestamps = frames.map((f) => f.timestamp);
  const fps = estimateFps(timestamps);

  const emptySide = (side: Side): GaitSideDiagnostics => ({
    side,
    rawFootStrikes: 0,
    rawToeOffs: 0,
    keptCycles: 0,
    discardedCycles: 0,
    discardReasons: {},
    meanCycleDuration: 0,
  });

  if (frames.length < 3) {
    return {
      events: [],
      cycles: [],
      diagnostics: { fps, left: emptySide('left'), right: emptySide('right'), quality: 'poor' },
    };
  }

  const left = segmentSide(frames, timestamps, 'left', fps);
  const right = segmentSide(frames, timestamps, 'right', fps);

  const events = [...left.events, ...right.events].sort((a, b) => a.time - b.time);
  const cycles = [...left.result.cycles, ...right.result.cycles];

  const diagnostics: GaitDiagnostics = {
    fps,
    left: left.result.diagnostics,
    right: right.result.diagnostics,
    quality: qualityFrom(left.result.diagnostics.keptCycles, right.result.diagnostics.keptCycles),
  };

  return { events, cycles, diagnostics };
}
