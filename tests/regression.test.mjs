import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const artifact = JSON.parse(fs.readFileSync('model/exported/mnist-mlp.json', 'utf8'));
const samples = JSON.parse(fs.readFileSync('model/exported/samples.json', 'utf8'));
const fixtures = JSON.parse(fs.readFileSync('model/exported/parity-fixtures.json', 'utf8'));

function forward(input) {
  let current = Float32Array.from(input);
  const trace = [];
  for (let layerIndex = 0; layerIndex < artifact.layers.length; layerIndex += 1) {
    const layer = artifact.layers[layerIndex];
    const z = new Float32Array(layer.weights.length);
    for (let output = 0; output < z.length; output += 1) {
      let sum = layer.biases[output];
      for (let inputIndex = 0; inputIndex < layer.weights[output].length; inputIndex += 1) {
        sum += layer.weights[output][inputIndex] * current[inputIndex];
      }
      z[output] = sum;
    }
    const activation = new Float32Array(z);
    if (layerIndex < 2) {
      for (let index = 0; index < activation.length; index += 1) {
        activation[index] = Math.max(0, activation[index]);
      }
    } else {
      let max = -Infinity;
      for (const value of activation) max = Math.max(max, value);
      let sum = 0;
      for (let index = 0; index < activation.length; index += 1) {
        activation[index] = Math.exp(activation[index] - max);
        sum += activation[index];
      }
      for (let index = 0; index < activation.length; index += 1) activation[index] /= sum;
    }
    trace.push({ z, activation });
    current = activation;
  }
  return trace;
}

test('artifact schema and parameter count', () => {
  assert.deepEqual(artifact.architecture.layers.map((layer) => layer.units), [784, 128, 64, 10]);
  assert.deepEqual(artifact.layers.map((layer) => [layer.weights.length, layer.weights[0].length]), [
    [128, 784], [64, 128], [10, 64],
  ]);
  const count = artifact.layers.reduce((total, layer) => total + layer.weights.length * layer.weights[0].length + layer.biases.length, 0);
  assert.equal(count, 109386);
  assert.equal(artifact.metadata.parameterCount, count);
  assert.equal(artifact.metadata.epochs, artifact.metadata.history.length);
});

test('sample schema covers every class and model output', () => {
  assert.deepEqual(samples.map((sample) => sample.label), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const sample of samples) {
    assert.equal(sample.tensor.length, 784);
    assert.ok(sample.tensor.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
    const probabilities = forward(sample.tensor).at(-1).activation;
    assert.equal(probabilities.indexOf(Math.max(...probabilities)), sample.label);
  }
});

test('parity fixtures match hidden layers, logits, probabilities, and class', () => {
  for (const fixture of fixtures) {
    const trace = forward(fixture.input);
    const expected = [
      fixture.firstPreActivations,
      fixture.firstActivations,
      fixture.secondPreActivations,
      fixture.secondActivations,
      fixture.logits,
      fixture.probabilities,
    ];
    const actual = [
      trace[0].z, trace[0].activation, trace[1].z,
      trace[1].activation, trace[2].z, trace[2].activation,
    ];
    const tolerance = [1e-5, 1e-5, 2e-5, 2e-5, 3e-5, 1e-6];
    for (let layer = 0; layer < expected.length; layer += 1) {
      const error = Math.max(...actual[layer].map((value, index) => Math.abs(value - expected[layer][index])));
      assert.ok(error <= tolerance[layer], `${fixture.name} layer ${layer} error ${error}`);
    }
    assert.equal(actual[5].indexOf(Math.max(...actual[5])), fixture.predictedClass);
  }
});

test('softmax remains finite for large logits', () => {
  const values = [1000, 999, -1000];
  const max = Math.max(...values);
  const exponentials = values.map((value) => Math.exp(value - max));
  const total = exponentials.reduce((sum, value) => sum + value, 0);
  const probabilities = exponentials.map((value) => value / total);
  assert.ok(probabilities.every(Number.isFinite));
  assert.ok(Math.abs(probabilities.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test('occlusion uses 169 windows and overlap averaging', () => {
  const sample = samples[9];
  const baseline = forward(sample.tensor).at(-1).activation;
  const target = sample.label;
  const totals = new Float32Array(784);
  const counts = new Uint16Array(784);
  let windows = 0;
  for (let top = 0; top <= 24; top += 2) {
    for (let left = 0; left <= 24; left += 2) {
      windows += 1;
      const masked = Float32Array.from(sample.tensor);
      for (let y = top; y < top + 4; y += 1) {
        for (let x = left; x < left + 4; x += 1) masked[y * 28 + x] = 0;
      }
      const changed = baseline[target] - forward(masked).at(-1).activation[target];
      for (let y = top; y < top + 4; y += 1) {
        for (let x = left; x < left + 4; x += 1) {
          totals[y * 28 + x] += changed;
          counts[y * 28 + x] += 1;
        }
      }
    }
  }
  assert.equal(windows, 169);
  assert.ok(counts.every((count) => count > 0));
  const heatmap = totals.map((value, index) => value / counts[index]);
  assert.ok(Math.max(...heatmap) > 0.69);
  assert.ok(Math.min(...heatmap) < 0);
});
