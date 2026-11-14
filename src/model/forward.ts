/**
 * Custom forward pass — Float32Array matmul + ReLU + softmax (D12).
 *
 * Architecture: 784 → 128 (ReLU) → 64 (ReLU) → 10 (softmax)
 * See MODEL_SPECIFICATION.md for the math.
 *
 * This executes once per explicit Run (D21) and produces a complete
 * ForwardTrace that animation later reveals (D20).
 */

import type { LoadedModel, ForwardTrace, LayerTrace } from './types';

/**
 * Dense layer forward: z = W·x + b, then activation.
 * W is row-major Float32Array of shape [outputUnits, inputUnits].
 */
function denseForward(
  input: Float32Array,
  weights: Float32Array,
  biases: Float32Array,
  inputUnits: number,
  outputUnits: number,
  activation: 'relu' | 'softmax' | 'linear',
): { preActivation: Float32Array; activated: Float32Array } {
  const z = new Float32Array(outputUnits);

  // z = W·x + b
  for (let o = 0; o < outputUnits; o++) {
    let sum = biases[o] ?? 0;
    const rowOffset = o * inputUnits;
    for (let i = 0; i < inputUnits; i++) {
      sum += (weights[rowOffset + i] ?? 0) * (input[i] ?? 0);
    }
    z[o] = sum;
  }

  const a = new Float32Array(outputUnits);

  if (activation === 'relu') {
    for (let i = 0; i < outputUnits; i++) {
      a[i] = Math.max(0, z[i] ?? 0);
    }
  } else if (activation === 'softmax') {
    // Numerically stable softmax: subtract max before exp
    let max = -Infinity;
    for (let i = 0; i < outputUnits; i++) {
      if ((z[i] ?? 0) > max) max = z[i] ?? 0;
    }
    let sumExp = 0;
    for (let i = 0; i < outputUnits; i++) {
      a[i] = Math.exp((z[i] ?? 0) - max);
      sumExp += a[i] ?? 0;
    }
    for (let i = 0; i < outputUnits; i++) {
      a[i] = (a[i] ?? 0) / sumExp;
    }
  } else {
    a.set(z);
  }

  return { preActivation: z, activated: a };
}

/**
 * Run the full forward pass and return a frozen trace (D20).
 * Call this exactly once per Run action (D21).
 */
export function forward(model: LoadedModel, input: Float32Array): ForwardTrace {
  if (input.length !== (model.layers[0]?.inputUnits ?? 784)) {
    throw new Error(
      `Input size ${input.length} does not match expected ${model.layers[0]?.inputUnits ?? 784}.`,
    );
  }

  let current = input;
  const layerResults: LayerTrace[] = [];

  for (const layer of model.layers) {
    const { preActivation, activated } = denseForward(
      current,
      layer.weights,
      layer.biases,
      layer.inputUnits,
      layer.outputUnits,
      layer.activation,
    );
    layerResults.push({
      layerName: layer.name,
      preActivation,
      activation: activated,
    });
    current = activated;
  }

  // Final output is the last layer's activation (softmax probabilities)
  const probabilities = current;
  let predictedClass = 0;
  let maxProb = probabilities[0] ?? 0;
  for (let i = 1; i < probabilities.length; i++) {
    if ((probabilities[i] ?? 0) > maxProb) {
      maxProb = probabilities[i] ?? 0;
      predictedClass = i;
    }
  }

  return {
    input: new Float32Array(input), // defensive copy
    layerResults,
    probabilities,
    predictedClass,
  };
}

