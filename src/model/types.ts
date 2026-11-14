/**
 * Model types — JSON export schema and forward-pass trace.
 *
 * These match the Python export format (D13):
 *   - Dense layers export weight matrices (row-major) and bias vectors as number[][].
 *   - Architecture is 784 → 128 → 64 → 10 (D4).
 *
 * Inspected MODEL_SPECIFICATION.md before defining.
 */

/** A single dense layer as exported from Python JSON */
export interface ExportedLayer {
  /** Human-readable name, e.g. "dense_1" */
  name: string;
  /** Weight matrix: rows = output units, cols = input units */
  weights: number[][];
  /** Bias vector: length = output units */
  biases: number[];
}

/**
 * Top-level JSON export from the Python training script.
 * Placed in model/exported/ (D13).
 */
export interface ModelArtifact {
  /** Architecture description for display */
  architecture: {
    layers: { name: string; units: number; activation: string }[];
  };
  /** Ordered dense layers with weights and biases */
  layers: ExportedLayer[];
  /** Metadata from training — may be absent or partial */
  metadata?: {
    dataset?: string;
    exportedAt?: string;
    /** Accuracy is OPEN (D26) — only present if evaluation was stored with export */
    accuracy?: number;
  };
}

/** Layer topology for rendering — derived from a loaded ModelArtifact */
export interface LayerInfo {
  name: string;
  units: number;
  activation: string;
}

/** Network metadata derived from a loaded model */
export interface NetworkMeta {
  layers: LayerInfo[];
  totalParameters: number;
}

/**
 * Internal representation of loaded weights as typed arrays
 * for efficient forward-pass computation (D12).
 */
export interface LoadedLayer {
  name: string;
  inputUnits: number;
  outputUnits: number;
  /** Row-major weight matrix: Float32Array of size outputUnits × inputUnits */
  weights: Float32Array;
  /** Bias vector: Float32Array of size outputUnits */
  biases: Float32Array;
  activation: 'relu' | 'softmax' | 'linear';
}

export interface LoadedModel {
  layers: LoadedLayer[];
  meta: NetworkMeta;
}

/**
 * Forward-pass trace for a single inference run (D20).
 * Computed once, then animation reveals the stored values.
 */
export interface ForwardTrace {
  /** Input tensor (784 values, flattened 28×28) */
  input: Float32Array;
  /** Per-layer intermediate results */
  layerResults: LayerTrace[];
  /** Final softmax probabilities (10 values) */
  probabilities: Float32Array;
  /** Predicted class: argmax of probabilities */
  predictedClass: number;
}

export interface LayerTrace {
  layerName: string;
  /** Pre-activation values z = Wx + b */
  preActivation: Float32Array;
  /** Post-activation values a = activation(z) */
  activation: Float32Array;
}

/**
 * Input sample — either drawn or loaded from preset MNIST digits (D17).
 */
export interface InputSample {
  source: 'draw' | 'sample';
  /** Label (0–9) if this is a sample digit */
  label?: number;
  /** Preprocessed 28×28 flattened tensor, MNIST-compatible values */
  tensor28: Float32Array;
}

