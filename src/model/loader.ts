/**
 * Model loader — parse JSON export into typed arrays (D12, D13).
 *
 * Fails closed: if the artifact is missing or malformed, returns an error.
 * Does not fabricate any weights or parameters (D9).
 */

import type {
  ModelArtifact,
  LoadedModel,
  LoadedLayer,
  NetworkMeta,
  LayerInfo,
} from './types';

export type LoadResult =
  | { ok: true; model: LoadedModel }
  | { ok: false; error: string };

/** Activation name mapping from export to internal enum */
function parseActivation(act: string): LoadedLayer['activation'] | null {
  const lower = typeof act === 'string' ? act.toLowerCase() : '';
  if (lower === 'relu') return 'relu';
  if (lower === 'softmax') return 'softmax';
  if (lower === 'linear') return 'linear';
  return null;
}

/**
 * Parse a JSON model artifact into typed arrays ready for forward pass.
 * Validates structure but does not validate numerical parity (D27 — NOT YET VALIDATED).
 */
export function loadModelFromJSON(artifact: ModelArtifact): LoadResult {
  try {
    if (!artifact || !Array.isArray(artifact.layers) || artifact.layers.length === 0) {
      return { ok: false, error: 'Model artifact contains no layers.' };
    }

    const archLayers = artifact.architecture?.layers;
    if (!Array.isArray(archLayers) || archLayers.length !== artifact.layers.length + 1) {
      return { ok: false, error: 'Model architecture does not match its dense layers.' };
    }
    const loadedLayers: LoadedLayer[] = [];
    let totalParameters = 0;
    const architectureInputUnits = archLayers[0]?.units ?? 0;
    if (!Number.isInteger(architectureInputUnits) || architectureInputUnits <= 0) {
      return { ok: false, error: 'Model architecture has an invalid input size.' };
    }
    let expectedInputUnits = architectureInputUnits;

    for (let i = 0; i < artifact.layers.length; i++) {
      const exported = artifact.layers[i];
      if (!exported) {
        return { ok: false, error: `Layer ${i} is undefined.` };
      }

      const { weights, biases, name } = exported;

      if (!Array.isArray(weights) || !Array.isArray(biases) || typeof name !== 'string') {
        return { ok: false, error: `Layer "${name}" missing weights or biases.` };
      }

      const outputUnits = weights.length;
      if (outputUnits === 0) {
        return { ok: false, error: `Layer "${name}" has zero output units.` };
      }

      const firstRow = weights[0];
      if (!firstRow) {
        return { ok: false, error: `Layer "${name}" has empty weight rows.` };
      }
      const inputUnits = firstRow.length;
      if (inputUnits !== expectedInputUnits) {
        return {
          ok: false,
          error: `Layer "${name}" expects ${expectedInputUnits} inputs, got ${inputUnits}.`,
        };
      }

      if (biases.length !== outputUnits) {
        return {
          ok: false,
          error: `Layer "${name}": bias length ${biases.length} ≠ output units ${outputUnits}.`,
        };
      }

      // Flatten row-major weight matrix into Float32Array
      const flatWeights = new Float32Array(outputUnits * inputUnits);
      for (let r = 0; r < outputUnits; r++) {
        const row = weights[r];
        if (!row || row.length !== inputUnits) {
          return {
            ok: false,
            error: `Layer "${name}" row ${r}: expected ${inputUnits} columns, got ${row?.length ?? 0}.`,
          };
        }
        if (!row.every(Number.isFinite)) {
          return { ok: false, error: `Layer "${name}" contains a non-finite weight.` };
        }
        flatWeights.set(row, r * inputUnits);
      }

      if (!biases.every(Number.isFinite)) {
        return { ok: false, error: `Layer "${name}" contains a non-finite bias.` };
      }
      const flatBiases = new Float32Array(biases);

      // Determine activation from architecture metadata or default
      const archInfo = archLayers?.[i + 1]; // +1 because arch[0] is input
      const activation = archInfo ? parseActivation(archInfo.activation) : null;
      if (!activation) return { ok: false, error: `Layer "${name}" has an unsupported activation.` };
      if (archInfo?.units !== outputUnits) {
        return { ok: false, error: `Layer "${name}" does not match its architecture units.` };
      }

      loadedLayers.push({
        name,
        inputUnits,
        outputUnits,
        weights: flatWeights,
        biases: flatBiases,
        activation,
      });

      totalParameters += outputUnits * inputUnits + outputUnits;
      expectedInputUnits = outputUnits;
    }

    if (loadedLayers[loadedLayers.length - 1]?.activation !== 'softmax') {
      return { ok: false, error: 'Output layer must use softmax.' };
    }

    const layers: LayerInfo[] = [
      { name: 'input', units: loadedLayers[0]?.inputUnits ?? 784, activation: 'none' },
      ...loadedLayers.map((l) => ({
        name: l.name,
        units: l.outputUnits,
        activation: l.activation,
      })),
    ];

    const meta: NetworkMeta = { layers, totalParameters };

    return { ok: true, model: { layers: loadedLayers, meta } };
  } catch (e) {
    return {
      ok: false,
      error: `Failed to parse model artifact: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
