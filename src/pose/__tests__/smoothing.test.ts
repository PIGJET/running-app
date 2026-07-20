import { describe, it, expect } from 'vitest';
import {
  findLocalExtrema,
  findPeaks,
  interpolateAt,
  lerp,
  median,
  movingAverage,
  parabolicVertex,
} from '../smoothing';

describe('movingAverage', () => {
  it('leaves a constant signal unchanged', () => {
    const constant = new Array(20).fill(3.5);
    const out = movingAverage(constant, 5);
    expect(out).toHaveLength(constant.length);
    for (const v of out) expect(v).toBeCloseTo(3.5, 10);
  });

  it('forces an even window to odd and preserves length', () => {
    const out = movingAverage([1, 2, 3, 4, 5], 4);
    expect(out).toHaveLength(5);
  });

  it('reduces the variance of a noisy signal', () => {
    const noisy = Array.from({ length: 100 }, (_, i) => Math.sin(i / 5) + (i % 2 === 0 ? 0.4 : -0.4));
    const smooth = movingAverage(noisy, 5);
    const varOf = (a: number[]) => {
      const m = a.reduce((s, x) => s + x, 0) / a.length;
      return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length;
    };
    expect(varOf(smooth)).toBeLessThan(varOf(noisy));
  });

  it('returns a copy for window <= 1', () => {
    const input = [1, 2, 3];
    const out = movingAverage(input, 1);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });
});

describe('lerp / interpolateAt', () => {
  it('lerp interpolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 1)).toBe(4);
  });

  it('interpolates a value between samples', () => {
    const t = [0, 1, 2, 3];
    const v = [0, 10, 20, 30];
    expect(interpolateAt(t, v, 1.5)).toBeCloseTo(15, 10);
    expect(interpolateAt(t, v, 2.25)).toBeCloseTo(22.5, 10);
  });

  it('clamps outside the range', () => {
    const t = [0, 1, 2];
    const v = [5, 6, 7];
    expect(interpolateAt(t, v, -1)).toBe(5);
    expect(interpolateAt(t, v, 99)).toBe(7);
  });
});

describe('findPeaks / findLocalExtrema', () => {
  it('finds the peaks and troughs of a sinusoid', () => {
    const fs = 100;
    const freq = 2; // Hz -> 2 peaks per second
    const durationSec = 3;
    const n = fs * durationSec;
    const signal = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * freq * i) / fs));

    const { minima, maxima } = findLocalExtrema(signal, 0.5);
    // 2 Hz over ~3 s => ~6 of each.
    expect(maxima.length).toBeGreaterThanOrEqual(5);
    expect(maxima.length).toBeLessThanOrEqual(6);
    expect(minima.length).toBeGreaterThanOrEqual(5);
    expect(minima.length).toBeLessThanOrEqual(6);

    // Each detected maximum should sit near the top of the sinusoid.
    for (const p of maxima) expect(signal[p]).toBeGreaterThan(0.95);
    for (const p of minima) expect(signal[p]).toBeLessThan(-0.95);
  });

  it('rejects small wiggles below the prominence threshold', () => {
    // One big peak plus a tiny ripple.
    const signal = [0, 1, 2, 3, 2, 1, 1.05, 1, 2, 5, 2, 0];
    const withThreshold = findPeaks(signal, 1);
    // The tiny bump at index 6 (prominence ~0.05) must be excluded.
    expect(withThreshold).not.toContain(6);
    // The genuine peaks remain.
    expect(withThreshold).toContain(9);
  });

  it('handles a flat plateau peak', () => {
    const signal = [0, 1, 2, 2, 2, 1, 0];
    const peaks = findPeaks(signal, 0.5);
    expect(peaks).toHaveLength(1);
    expect(peaks[0]).toBeGreaterThanOrEqual(2);
    expect(peaks[0]).toBeLessThanOrEqual(4);
  });
});

describe('parabolicVertex', () => {
  it('locates a symmetric peak at offset 0', () => {
    const { offset } = parabolicVertex(1, 2, 1);
    expect(offset).toBeCloseTo(0, 10);
  });

  it('shifts toward the higher neighbor', () => {
    // Rising to the right -> vertex offset positive.
    const { offset } = parabolicVertex(0, 1, 0.9);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThanOrEqual(1);
  });

  it('returns 0 offset for collinear points', () => {
    const { offset, value } = parabolicVertex(1, 2, 3);
    expect(offset).toBe(0);
    expect(value).toBe(2);
  });
});

describe('median', () => {
  it('computes odd- and even-length medians', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  it('returns NaN for empty input', () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
});
