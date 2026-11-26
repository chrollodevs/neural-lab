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
        <p className="empty-message">
          {inference.state === 'running'
            ? 'Computing activations…'
            : 'Run inference to inspect activation values across every layer.'}
        </p>
      </div>
    );
  }

  const { trace } = inference;

  return (
    <div className="activations-tab">
      <section className="activation-section">
        <h3 className="section-label">Input · 784</h3>
        <div className="activation-grid" aria-label="28 by 28 input intensity grid">
          {Array.from(trace.input.slice(0, 784)).map((val, i) => (
            <span
              key={i}
              className="activation-cell"
              style={{ opacity: 0.14 + val * 0.86 }}
              title={`[${Math.floor(i / 28)}, ${i % 28}] = ${val.toFixed(3)}`}
            />
          ))}
        </div>
      </section>

      {trace.layerResults.map((layer) => (
        <section key={layer.layerName} className="activation-section">
          <h3 className="section-label">
            {layer.layerName.replace('_', ' ')} · {layer.activation.length}
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

      <section className="activation-section">
        <h3 className="section-label">Probabilities · 10</h3>
        <div className="probability-list">
          {Array.from(trace.probabilities).map((p, i) => (
            <div
              key={i}
              className={`prob-row ${i === trace.predictedClass ? 'predicted' : ''}`}
            >
              <span className="prob-digit mono">{i}</span>
              <div className="prob-bar-bg">
                <div className="prob-bar" style={{ width: `${p * 100}%` }} />
              </div>
              <span className="prob-value mono">{(p * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
