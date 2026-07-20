// Metric orchestrator: offers every processed video (view + frames + gait
// segmentation) to each metric module and collects the results.
//
// Selection rules:
//   * Inputs with 'poor' gait quality or no frames are never used.
//   * Each module declares the views it supports in preference order (side
//     first where both work); the first available matching input wins.
//   * Modules return null when the data cannot support them; those metrics
//     are simply omitted.

import type { Metric } from '../../types';
import type { MetricInput, MetricModule } from './shared';
import { cadenceModule } from './cadence';
import { overstridingModule } from './overstriding';
import { footStrikeModule } from './footStrike';
import { verticalOscillationModule } from './verticalOscillation';
import { trunkLeanModule } from './trunkLean';
import { armSwingModule } from './armSwing';
import { hipDropModule } from './hipDrop';
import { kneeValgusModule } from './kneeValgus';
import { strideAsymmetryModule } from './strideAsymmetry';

export type { MetricInput, MetricModule } from './shared';

const MODULES: MetricModule[] = [
  cadenceModule,
  overstridingModule,
  footStrikeModule,
  verticalOscillationModule,
  trunkLeanModule,
  armSwingModule,
  hipDropModule,
  kneeValgusModule,
  strideAsymmetryModule,
];

export function computeMetrics(inputs: MetricInput[]): Metric[] {
  const usable = inputs.filter(
    (input) => input.frames.length > 0 && input.diagnostics.quality !== 'poor',
  );
  if (usable.length === 0) return [];

  const metrics: Metric[] = [];
  for (const module of MODULES) {
    let chosen: MetricInput | undefined;
    for (const view of module.views) {
      chosen = usable.find((input) => input.view === view);
      if (chosen) break;
    }
    if (!chosen) continue;
    const metric = module.compute(chosen);
    if (metric) metrics.push(metric);
  }
  return metrics;
}
