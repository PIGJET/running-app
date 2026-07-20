// Small, generic signal utilities used by the gait analysis pipeline.
//
// Everything here operates on plain `number[]` arrays (optionally aligned with a
// `timestamps: number[]` of the same length) so the functions stay pure and
// trivially unit-testable, independent of MediaPipe or React.

/** Linear interpolation between `a` and `b` at fraction `t` (t in [0, 1]). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Moving-average smoothing with a symmetric window.
 *
 * `window` is a sample count and is forced odd (an even value is bumped up by
 * one) so the window is centered. Near the edges the window shrinks to whatever
 * samples exist, so the output length always matches the input and a constant
 * input maps to an identical constant output.
 */
export function movingAverage(values: number[], window: number): number[] {
  const n = values.length;
  if (n === 0) return [];
  let w = Math.max(1, Math.floor(window));
  if (w % 2 === 0) w += 1;
  if (w === 1) return values.slice();

  const half = (w - 1) / 2;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    const lo = Math.max(0, i - half);
    const hi = Math.min(n - 1, i + half);
    for (let k = lo; k <= hi; k++) {
      sum += values[k];
      count += 1;
    }
    out[i] = sum / count;
  }
  return out;
}

/**
 * Linearly interpolate a value at time `t` from a series of (timestamps,
 * values) pairs. `timestamps` must be sorted ascending. Values of `t` outside
 * the range clamp to the first/last sample.
 */
export function interpolateAt(timestamps: number[], values: number[], t: number): number {
  const n = timestamps.length;
  if (n === 0) return NaN;
  if (n === 1 || t <= timestamps[0]) return values[0];
  if (t >= timestamps[n - 1]) return values[n - 1];

  // Binary search for the bracketing interval [lo, hi].
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (timestamps[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = timestamps[hi] - timestamps[lo];
  const frac = span === 0 ? 0 : (t - timestamps[lo]) / span;
  return lerp(values[lo], values[hi], frac);
}

export interface LocalExtrema {
  /** Indices of local minima, ascending. */
  minima: number[];
  /** Indices of local maxima, ascending. */
  maxima: number[];
}

/**
 * Topographic prominence of the peak at `index`: how far the signal must
 * descend from the peak before it can climb to a point higher than the peak, in
 * either direction. This is the standard definition used to reject small noise
 * wiggles. If no higher point exists on a side, that side descends to the array
 * boundary.
 */
function peakProminence(values: number[], index: number): number {
  const height = values[index];

  let leftMin = height;
  for (let i = index - 1; i >= 0; i--) {
    if (values[i] > height) break;
    if (values[i] < leftMin) leftMin = values[i];
  }
  let rightMin = height;
  for (let i = index + 1; i < values.length; i++) {
    if (values[i] > height) break;
    if (values[i] < rightMin) rightMin = values[i];
  }
  // The relevant base is the higher of the two surrounding valleys.
  const base = Math.max(leftMin, rightMin);
  return height - base;
}

/**
 * Find indices of local maxima whose prominence is at least `minProminence`.
 * Handles flat plateaus by reporting the plateau's middle index.
 */
export function findPeaks(values: number[], minProminence = 0): number[] {
  const n = values.length;
  if (n < 3) return [];
  const peaks: number[] = [];

  let i = 1;
  while (i < n - 1) {
    if (values[i] > values[i - 1]) {
      // Ascending into i; walk across any flat plateau at this height.
      let j = i;
      while (j < n - 1 && values[j + 1] === values[j]) j++;
      if (j < n - 1 && values[j + 1] < values[j]) {
        // Rose, then fell => it's a peak. Report the plateau midpoint.
        peaks.push(Math.floor((i + j) / 2));
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  if (minProminence <= 0) return peaks;
  return peaks.filter((p) => peakProminence(values, p) >= minProminence);
}

/**
 * Find local minima and maxima. Minima are computed as the peaks of the negated
 * signal, so `minProminence` has the same meaning (in signal units) for both.
 */
export function findLocalExtrema(values: number[], minProminence = 0): LocalExtrema {
  const maxima = findPeaks(values, minProminence);
  const negated = values.map((v) => -v);
  const minima = findPeaks(negated, minProminence);
  return { minima, maxima };
}

export interface ParabolicVertex {
  /** Sub-sample offset from the center index, in [-1, 1]. */
  offset: number;
  /** Interpolated extremum value. */
  value: number;
}

/**
 * Fit a parabola through three equally spaced samples (yPrev, yCenter, yNext)
 * and return the vertex. Used to refine the location of a discrete extremum to
 * sub-frame precision. If the three points are collinear the offset is 0.
 */
export function parabolicVertex(yPrev: number, yCenter: number, yNext: number): ParabolicVertex {
  const denom = yPrev - 2 * yCenter + yNext;
  if (denom === 0) return { offset: 0, value: yCenter };
  const offset = (0.5 * (yPrev - yNext)) / denom;
  const value = yCenter - 0.25 * (yPrev - yNext) * offset;
  return { offset, value };
}

/** Median of a numeric array (does not mutate the input). Returns NaN if empty. */
export function median(values: number[]): number {
  const n = values.length;
  if (n === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = n >> 1;
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
