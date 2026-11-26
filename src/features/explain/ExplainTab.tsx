import { useEffect, useState } from 'react';
import { useAppState } from '../../state';
import { occlusionSensitivity, type OcclusionResult } from '../../explain/occlusion';
import { NetworkViewer } from '../../components/NetworkViewer/NetworkViewer';
import './ExplainTab.css';

type AnalysisState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'complete'; result: OcclusionResult }
  | { state: 'error'; error: string };

interface ExplainTabProps {
  onBack: () => void;
}

function getStats(values: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let zeros = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    if (value === 0) zeros += 1;
  }
  return { min, max, mean: sum / values.length, zeros };
}

function formatRegion(top: number, left: number): string {
  return `rows ${top}–${top + 3}, columns ${left}–${left + 3}`;
}

export function ExplainTab({ onBack }: ExplainTabProps) {
  const { modelStatus, input, inference } = useAppState();
  const [analysis, setAnalysis] = useState<AnalysisState>({ state: 'idle' });

  useEffect(() => {
    if (!input || inference.state !== 'complete' || modelStatus.state !== 'loaded') {
      setAnalysis({ state: 'idle' });
      return;
    }
    let active = true;
    setAnalysis({ state: 'loading' });
    const timer = window.setTimeout(() => {
      try {
        const result = occlusionSensitivity(modelStatus.model, input.tensor28, inference.trace.predictedClass);
        if (active) setAnalysis({ state: 'complete', result });
      } catch (error: unknown) {
        if (active) setAnalysis({ state: 'error', error: error instanceof Error ? error.message : String(error) });
      }
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [inference, input, modelStatus]);

  const hasInput = Boolean(input);
  const hasInference = inference.state === 'complete';
  const firstLayer = hasInference ? inference.trace.layerResults[0] : null;
  const secondLayer = hasInference ? inference.trace.layerResults[1] : null;
  const outputLayer = hasInference ? inference.trace.layerResults[inference.trace.layerResults.length - 1] : null;
  const firstStats = firstLayer ? getStats(firstLayer.activation) : null;
  const secondStats = secondLayer ? getStats(secondLayer.activation) : null;
  const rankedProbabilities = hasInference
    ? Array.from(inference.trace.probabilities).map((probability, digit) => ({ probability, digit })).sort((a, b) => b.probability - a.probability)
    : [];
  const margin = rankedProbabilities.length > 1
    ? (rankedProbabilities[0]?.probability ?? 0) - (rankedProbabilities[1]?.probability ?? 0)
    : 0;
  const predictedProbability = hasInference ? inference.trace.probabilities[inference.trace.predictedClass] ?? 0 : 0;

  return (
    <main className="explain-page">
      <header className="explain-page-header">
        <div className="explain-wordmark">
          <strong>Neural Lab</strong>
          <span>Prediction Analysis</span>
        </div>
        <button type="button" className="explain-back" onClick={onBack}><span aria-hidden="true">←</span> Return to lab</button>
      </header>

      <div className="explain-page-body">

        {/* ── 00 / INTRODUCTION ─────────────────────────── */}
        <section className="analysis-section nn-intro-section">
          <div className="section-intro">
            <span className="explain-label">Introduction</span>
            <div>
              <h2>Here&rsquo;s what a neural network looks like.</h2>
            </div>
          </div>

          <div className="nn-viewer-wrap">
            <NetworkViewer />
          </div>

          <div className="nn-intro-body">
            <p className="nn-intro-lead">
              A neural network is a computational system inspired by the way biological brains process information.
              It consists of interconnected artificial neurons organized into layers, where each neuron processes
              information and passes it forward. By adjusting the strength of connections between neurons,
              the network gradually learns patterns from data.
            </p>

            <ul className="nn-facts">
              <li>
                <strong>Inspired by the brain, not a replica.</strong>{' '}
                <span>
                  Artificial neural networks take inspiration from biological neurons, but their mathematical
                  operations are much simpler than those of real brains.
                </span>
              </li>
              <li>
                <strong>The idea is older than modern computers.</strong>{' '}
                <span>
                  Warren McCulloch and Walter Pitts published an influential mathematical model of artificial
                  neurons in 1943, laying an early foundation for neural networks.
                </span>
              </li>
              <li>
                <strong>Learning means adjusting connections.</strong>{' '}
                <span>
                  A neural network learns by modifying numerical weights between neurons to improve its predictions.
                </span>
              </li>
              <li>
                <strong>Layers have different jobs.</strong>{' '}
                <span>
                  Earlier layers can detect simpler patterns, while later layers can combine them into more complex
                  representations. What these layers learn depends on the architecture and training.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <header className="explain-hero">
          <span className="explain-eyebrow">Forward Pass · Interpretation</span>
          <h1>How did the network arrive at this prediction?</h1>
          <p>Follow one real input through the 784 → 128 → 64 → 10 model. Every value below comes from the current browser inference or its measured occlusion analysis.</p>
        </header>

        {!hasInput && <div className="explain-state"><span className="explain-state-title">No input selected</span><p>Draw a digit or choose a real MNIST sample, then run inference to analyze it.</p></div>}
        {hasInput && !hasInference && <div className="explain-state"><span className="explain-state-title">{inference.state === 'running' ? 'Inference running' : 'Waiting for inference'}</span><p>{inference.state === 'running' ? 'The explanation becomes available when the forward pass is complete.' : 'Run inference on the current input to measure its influential regions.'}</p></div>}
        {analysis.state === 'loading' && <div className="explain-state"><span className="explain-state-title">Analyzing 169 windows</span><p>Masking 4 × 4 regions and measuring the change in predicted probability.</p></div>}
        {analysis.state === 'error' && <div className="explain-state explain-state-error"><span className="explain-state-title">Analysis unavailable</span><p>{analysis.error}</p></div>}

        {analysis.state === 'complete' && hasInference && input && firstLayer && secondLayer && outputLayer && firstStats && secondStats && (
          <div className="explain-sections">
            <section className="analysis-section">
              <div className="section-intro">
                <span className="explain-label">01 · Input</span>
                <div><h2>One image becomes 784 numbers.</h2><p>The submitted {input.source === 'sample' ? 'MNIST sample' : 'drawing'} is represented as a 28 × 28 grayscale tensor. Values are normalized to [0, 1] and flattened row by row into the vector consumed by the model.</p></div>
              </div>
              <div className="input-analysis-grid">
                <div className="analysis-visual-column"><span className="visual-caption">Processed input · 28 × 28</span><div className="digit-grid large-digit-grid" aria-label="Processed 28 by 28 input">{Array.from(input.tensor28, (value, index) => <i key={index} style={{ opacity: 0.06 + value * 0.94 }} title={`row ${Math.floor(index / 28)}, column ${index % 28}: ${value.toFixed(3)}`} />)}</div></div>
                <dl className="fact-list"><div><dt>features</dt><dd>784</dd></div><div><dt>layout</dt><dd>row-major</dd></div><div><dt>range</dt><dd>[0, 1]</dd></div><div><dt>source</dt><dd>{input.source === 'sample' ? `MNIST sample ${input.label ?? '—'}` : 'browser drawing'}</dd></div></dl>
              </div>
              <p className="analysis-note">The shared experiment state retains the processed tensor used for inference. It does not retain the raw drawing bitmap, so this page shows the exact model input rather than reconstructing an original stroke image.</p>
            </section>

            <section className="analysis-section">
              <div className="section-intro">
                <span className="explain-label">02 · Hidden layers</span>
                <div><h2>Learned transformations, not assigned meanings.</h2><p>Each hidden layer applies z = Wx + b, then ReLU: a = max(0, z). The cells below are the actual post-activation values from this forward pass. A cell is one numerical unit in the learned model, not a named feature.</p></div>
              </div>
              <div className="layer-analysis-grid">
                {[{ name: 'hidden_1', layer: firstLayer, summary: firstStats }, { name: 'hidden_2', layer: secondLayer, summary: secondStats }].map(({ name, layer, summary }) => (
                  <section className="layer-readout" key={name}>
                    <div className="layer-readout-heading"><span className="visual-caption">{name.replace('_', ' ')} · {layer.activation.length} neurons</span><span className="layer-zeros">{summary.zeros} zero</span></div>
                    <div className="activation-matrix" aria-label={`${name} activation values`}>{Array.from(layer.activation, (value, index) => <i key={index} style={{ opacity: 0.08 + Math.min(1, value * 1.8) }} title={`neuron ${index}: z=${layer.preActivation[index]?.toFixed(4)}; a=${value.toFixed(4)}`} />)}</div>
                    <dl className="layer-stats mono"><div><dt>min</dt><dd>{summary.min.toFixed(4)}</dd></div><div><dt>mean</dt><dd>{summary.mean.toFixed(4)}</dd></div><div><dt>max</dt><dd>{summary.max.toFixed(4)}</dd></div></dl>
                  </section>
                ))}
              </div>
            </section>

            <section className="analysis-section">
              <div className="section-intro">
                <span className="explain-label">03 · Output</span>
                <div><h2>Ten logits become a probability distribution.</h2><p>The final layer produces one logit per digit. Softmax converts those logits into probabilities that sum to one. The predicted class is the largest probability, not a guarantee of correctness.</p></div>
              </div>
              <div className="output-readout">
                <div className="output-callouts"><div className="prediction-callout"><span className="visual-caption">Predicted class</span><strong>{inference.trace.predictedClass}</strong><span className="mono">{(predictedProbability * 100).toFixed(2)}%</span></div><div className="margin-callout"><span className="visual-caption">Probability margin</span><strong>{(margin * 100).toFixed(2)} pp</strong><span>highest minus second highest</span></div></div>
                <div className="probability-table">{Array.from(inference.trace.probabilities, (probability, digit) => <div className={`probability-row ${digit === inference.trace.predictedClass ? 'is-predicted' : ''}`} key={digit}><span className="mono">{digit}</span><div className="probability-track"><i style={{ width: `${probability * 100}%` }} /></div><span className="mono">{(probability * 100).toFixed(2)}%</span><span className="logit-value mono">z {(outputLayer?.preActivation[digit] ?? 0).toFixed(3)}</span></div>)}</div>
              </div>
              <p className="equation mono">P(i) = exp(zᵢ) / Σ exp(zⱼ)</p>
            </section>

            <section className="analysis-section">
              <div className="section-intro">
                <span className="explain-label">04 · Input influence</span>
                <div><h2>Which regions change the prediction most?</h2><p>Each 4 × 4 region is temporarily set to the zero background value. The model runs again, and the change in probability for class {analysis.result.targetClass} is measured. Larger decreases indicate greater sensitivity to that region.</p></div>
              </div>
              <div className="influence-analysis-grid">
                <div className="overlay-visual">
                  <span className="visual-caption">Occlusion map · overlap-averaged</span>
                  <div className="digit-grid influence-grid large-digit-grid" aria-label="Occlusion sensitivity map">{Array.from(analysis.result.heatmap, (value, index) => { const intensity = Math.min(1, Math.abs(value) * 2.8); return <i key={index} className={value >= 0 ? 'supports' : 'opposes'} style={{ opacity: 0.06 + intensity * 0.94 }} title={`row ${Math.floor(index / 28)}, column ${index % 28}: change ${value.toFixed(4)}`} />; })}</div>
                  <span className="visual-caption">Input + sensitivity overlay</span>
                  <div className="digit-grid overlay-grid large-digit-grid" aria-label="Input with occlusion sensitivity overlay">{Array.from(analysis.result.heatmap, (value, index) => { const intensity = Math.min(1, Math.abs(value) * 2.8); const base = Math.round((input.tensor28[index] ?? 0) * 255); const tint = value >= 0 ? '201,147,58' : '100,100,100'; return <i key={index} style={{ background: `linear-gradient(rgba(${tint}, ${0.12 + intensity * 0.68}), rgba(${tint}, ${0.12 + intensity * 0.68})), rgb(${base}, ${base}, ${base})` }} title={`row ${Math.floor(index / 28)}, column ${index % 28}: input ${(input.tensor28[index] ?? 0).toFixed(3)}, change ${value.toFixed(4)}`} />; })}</div>
                  <div className="influence-legend"><span><i className="legend-swatch supports" /> masking lowers probability</span><span><i className="legend-swatch opposes" /> masking raises probability</span></div>
                </div>
                <div className="influence-readout"><dl className="fact-list"><div><dt>baseline</dt><dd>{(analysis.result.baselineProbability * 100).toFixed(2)}%</dd></div><div><dt>window</dt><dd>4 × 4 pixels</dd></div><div><dt>stride</dt><dd>2 pixels</dd></div><div><dt>windows</dt><dd>169</dd></div><div><dt>fill value</dt><dd>0 / background</dd></div></dl><span className="visual-caption">Most sensitive windows</span><ol className="region-list">{analysis.result.regions.slice(0, 5).map((region, index) => <li key={`${region.top}-${region.left}`}><span className="region-rank">0{index + 1}</span><span><strong>{formatRegion(region.top, region.left)}</strong><small>{region.change >= 0 ? '−' : '+'}{Math.abs(region.change * 100).toFixed(2)} pp</small></span></li>)}</ol></div>
              </div>
              <p className="analysis-note">Occlusion sensitivity is an approximation of input influence. It does not expose the model’s complete internal reasoning and does not prove that the network recognized a human-defined stroke or semantic feature.</p>
            </section>

            <section className="analysis-section summary-analysis"><span className="explain-label">05 · Summary</span><h2>The complete computational journey.</h2><p>This {input.source === 'sample' ? `MNIST sample labeled ${input.label ?? 'unknown'}` : 'browser drawing'} became 784 normalized input features, passed through ReLU layers of 128 and 64 neurons, and produced ten logits converted by softmax into probabilities. The highest measured probability corresponded to digit {inference.trace.predictedClass}. Occlusion analysis then measured which 4 × 4 regions most changed that probability.</p><button type="button" className="explain-return-link" onClick={onBack}>← Continue exploring the lab</button></section>
          </div>
        )}
      </div>
      <footer className="explain-page-footer"><span>784 → 128 → 64 → 10 · Real forward trace</span><span>Neural Lab</span></footer>
    </main>
  );
}
