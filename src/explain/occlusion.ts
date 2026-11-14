import { forward } from '../model/forward';
import type { LoadedModel } from '../model/types';

export interface OcclusionResult {
  heatmap: Float32Array;
  targetClass: number;
  baselineProbability: number;
  regions: OcclusionRegion[];
}

export interface OcclusionRegion {
  top: number;
  left: number;
  change: number;
}

export function occlusionSensitivity(
  model: LoadedModel,
  input: Float32Array,
  targetClass: number,
): OcclusionResult {
  const baseline = forward(model, input).probabilities[targetClass] ?? 0;
  const totals = new Float32Array(28 * 28);
  const counts = new Uint16Array(28 * 28);
  const regions: OcclusionRegion[] = [];

  for (let top = 0; top <= 24; top += 2) {
    for (let left = 0; left <= 24; left += 2) {
      const masked = new Float32Array(input);
      for (let y = top; y < top + 4; y++) {
        for (let x = left; x < left + 4; x++) masked[y * 28 + x] = 0;
      }
      const changed = baseline - (forward(model, masked).probabilities[targetClass] ?? 0);
      regions.push({ top, left, change: changed });
      for (let y = top; y < top + 4; y++) {
        for (let x = left; x < left + 4; x++) {
          const index = y * 28 + x;
          totals[index] = (totals[index] ?? 0) + changed;
          counts[index] = (counts[index] ?? 0) + 1;
        }
      }
    }
  }

  const heatmap = new Float32Array(28 * 28);
  for (let i = 0; i < heatmap.length; i++) heatmap[i] = (totals[i] ?? 0) / (counts[i] || 1);
  regions.sort((a, b) => b.change - a.change);
  return { heatmap, targetClass, baselineProbability: baseline, regions };
}
