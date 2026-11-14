/**
 * Activations tab — numeric activation vectors per layer.
 * Empty until inference has run (D20 — no placeholder demo values).
 */

import { useAppState } from '../../state';
import './ActivationsTab.css';

export function ActivationsTab() {
  const { inference } = useAppState();

  if (inference.state !== 'complete') {
    return (
      <div className="activations-tab">
        <p className="empty-message mono">
          {inference.state === 'running'
            ? 'Computing…'
            : 'Run inference to see activation values.'}
        </p>
      </div>
    );
  }

  const { trace } = inference;

  return (
    <div className="activations-tab">
      {/* Input tensor as 28×28 grid preview */}
      <section className="activation-section">
        <h3 className="section-label mono">Input (784)</h3>
        <div className="activation-grid mono">
          {Array.from(trace.input.slice(0, 784)).map((val, i) => (
            <span
              key={i}
              className="activation-cell"
              style={{
                opacity: 0.2 + val * 0.8,
              }}
              title={`[${Math.floor(i / 28)},${i % 28}] = ${val.toFixed(3)}`}
            >
              ·
            </span>
          ))}
        </div>
      </section>

      {/* Each layer's activations */}
      {trace.layerResults.map((layer) => (
        <section key={layer.layerName} className="activation-section">
          <h3 className="section-label mono">
            {layer.layerName} ({layer.activation.length})
          </h3>
          <div className="activation-values mono">
            {Array.from(layer.activation).map((val, i) => (
              <span
                key={i}
                className="activation-value"
                title={`z=${layer.preActivation[i]?.toFixed(4)} → a=${val.toFixed(4)}`}
              >
                {val.toFixed(3)}
              </span>
            ))}
          </div>
        </section>
      ))}

      {/* Output probabilities */}
      <section className="activation-section">
        <h3 className="section-label mono">Probabilities (10)</h3>
        <div className="probability-list mono">
          {Array.from(trace.probabilities).map((p, i) => (
            <div
              key={i}
              className={`prob-row ${i === trace.predictedClass ? 'predicted' : ''}`}
            >
              <span className="prob-digit">{i}</span>
              <div className="prob-bar-bg">
                <div
                  className="prob-bar"
                  style={{ width: `${p * 100}%` }}
                />
              </div>
              <span className="prob-value">{p.toFixed(4)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

