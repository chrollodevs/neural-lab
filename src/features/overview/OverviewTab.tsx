/**
 * Overview tab (D3) — model facts and experiment summary.
 */

import { useAppState } from '../../state';
import './OverviewTab.css';

export function OverviewTab() {
  const { modelStatus, input, inference } = useAppState();

  return (
    <div className="overview-tab">
      <section className="overview-section">
        <h3 className="section-label">Architecture</h3>
        <div className="overview-value">
          {modelStatus.state === 'loaded' ? (
            modelStatus.model.meta.layers.map((l) => l.units).join(' → ')
          ) : (
            <span className="text-muted">784 → 128 → 64 → 10 (expected)</span>
          )}
        </div>
        <div className="overview-detail">
          Dense MLP · ReLU hidden · Softmax output
        </div>
      </section>

      <section className="overview-section">
        <h3 className="section-label">Dataset</h3>
        <div className="overview-value">MNIST</div>
        <div className="overview-detail">28 × 28 grayscale handwritten digits</div>
      </section>

      <section className="overview-section">
        <h3 className="section-label">Parameters</h3>
        <div className="overview-value">
          {modelStatus.state === 'loaded' ? (
            modelStatus.model.meta.totalParameters.toLocaleString()
          ) : modelStatus.state === 'absent' ? (
            <span className="text-muted">— No model artifact loaded</span>
          ) : modelStatus.state === 'loading' ? (
            <span className="text-muted">Loading…</span>
          ) : (
            <span className="text-danger">Error loading model</span>
          )}
        </div>
      </section>

      <section className="overview-section">
        <h3 className="section-label">Performance</h3>
        <div className="overview-value text-muted">
          Not yet evaluated
        </div>
        <div className="overview-detail">
          Accuracy appears here when an evaluated metric is stored with the export.
        </div>
      </section>

      <section className="overview-section">
        <h3 className="section-label">Experiment</h3>
        <div className="overview-detail overview-kv">
          <div>
            <span className="text-dim">Input</span>
            <span>
              {input ? (
                input.source === 'sample' ? `Sample digit ${input.label ?? '?'}` : 'Drawn digit'
              ) : (
                <span className="text-muted">None</span>
              )}
            </span>
          </div>
          <div>
            <span className="text-dim">Inference</span>
            <span>
              {inference.state === 'complete' ? (
                <span className="text-amber">
                  Digit {inference.trace.predictedClass} · {(
                    (inference.trace.probabilities[inference.trace.predictedClass] ?? 0) * 100
                  ).toFixed(1)}%
                </span>
              ) : inference.state === 'running' ? (
                <span>Running…</span>
              ) : inference.state === 'error' ? (
                <span className="text-danger">{inference.error}</span>
              ) : (
                <span className="text-muted">Not run</span>
              )}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
