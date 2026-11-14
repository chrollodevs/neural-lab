/**
 * Overview tab (D3) — model facts and experiment summary.
 *
 * Shows:
 * - Architecture (784 → 128 → 64 → 10)
 * - Dataset (MNIST)
 * - Parameter count from the loaded model (not hardcoded — D15)
 * - Model performance only if stored with export (D26 — OPEN)
 * - Current experiment status
 *
 * Does not fabricate accuracy or metrics (D9).
 */

import { useAppState } from '../../state';
import './OverviewTab.css';

export function OverviewTab() {
  const { modelStatus, input, inference } = useAppState();

  return (
    <div className="overview-tab">
      <section className="overview-section">
        <h3 className="section-label mono">Architecture</h3>
        <div className="overview-value mono">
          {modelStatus.state === 'loaded' ? (
            modelStatus.model.meta.layers.map((l) => l.units).join(' → ')
          ) : (
            <span className="text-muted">784 → 128 → 64 → 10 (expected)</span>
          )}
        </div>
        <div className="overview-detail mono">
          Dense MLP · ReLU hidden · Softmax output
        </div>
      </section>

      <section className="overview-section">
        <h3 className="section-label mono">Dataset</h3>
        <div className="overview-value mono">MNIST</div>
        <div className="overview-detail mono">28×28 grayscale handwritten digits</div>
      </section>

      <section className="overview-section">
        <h3 className="section-label mono">Parameters</h3>
        <div className="overview-value mono">
          {modelStatus.state === 'loaded' ? (
            modelStatus.model.meta.totalParameters.toLocaleString()
          ) : modelStatus.state === 'absent' ? (
            <span className="text-muted">—  No model artifact loaded</span>
          ) : modelStatus.state === 'loading' ? (
            <span className="text-muted">Loading…</span>
          ) : (
            <span className="text-danger">Error loading model</span>
          )}
        </div>
      </section>

      <section className="overview-section">
        <h3 className="section-label mono">Performance</h3>
        <div className="overview-value mono text-muted">
          Not yet evaluated
        </div>
        <div className="overview-detail mono">
          Accuracy will appear here when an evaluated metric is stored with the export (D26)
        </div>
      </section>

      <section className="overview-section">
        <h3 className="section-label mono">Experiment</h3>
        <div className="overview-detail mono">
          <div>
            Input: {input ? (
              <span>{input.source === 'sample' ? `Sample digit ${input.label ?? '?'}` : 'Drawn digit'}</span>
            ) : (
              <span className="text-muted">None</span>
            )}
          </div>
          <div>
            Inference: {inference.state === 'complete' ? (
              <span className="text-accent">
                Predicted class {inference.trace.predictedClass}
                {' · '}
                p = {(inference.trace.probabilities[inference.trace.predictedClass] ?? 0).toFixed(4)}
              </span>
            ) : inference.state === 'running' ? (
              <span>Running…</span>
            ) : inference.state === 'error' ? (
              <span className="text-danger">{inference.error}</span>
            ) : (
              <span className="text-muted">Not run</span>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

