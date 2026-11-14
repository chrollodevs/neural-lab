/**
 * Run control — explicit inference trigger (D21).
 *
 * Disabled when:
 * - No model is loaded (model absent or error)
 * - No input is set
 * - Inference is already running
 *
 * Does NOT auto-execute on page load or when selecting a sample.
 */

import { useAppState, useAppDispatch } from '../../state';
import { forward } from '../../model';
import './RunControl.css';

export function RunControl() {
  const { modelStatus, input, inference } = useAppState();
  const dispatch = useAppDispatch();

  const modelLoaded = modelStatus.state === 'loaded';
  const hasInput = input !== null;
  const isRunning = inference.state === 'running';
  const canRun = modelLoaded && hasInput && !isRunning;

  const handleRun = () => {
    if (!canRun || modelStatus.state !== 'loaded' || !input) return;

    dispatch({ type: 'INFERENCE_START' });

    try {
      const trace = forward(modelStatus.model, input.tensor28);
      dispatch({ type: 'INFERENCE_COMPLETE', trace });
    } catch (e) {
      dispatch({
        type: 'INFERENCE_ERROR',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // Reason why run is disabled, for the label
  const disabledReason = !modelLoaded
    ? 'No model loaded'
    : !hasInput
      ? 'No input selected'
      : isRunning
        ? 'Running…'
        : null;

  return (
    <div className="run-control">
      <button
        className="run-button"
        onClick={handleRun}
        disabled={!canRun}
        title={disabledReason ?? 'Run inference'}
      >
        {isRunning ? 'Running…' : 'Run'}
      </button>
      {disabledReason && modelLoaded && (
        <span className="run-hint">{disabledReason}</span>
      )}
      {inference.state === 'complete' && (
        <span className="run-result">
          Predicted: {inference.trace.predictedClass}
        </span>
      )}
      {inference.state === 'error' && (
        <span className="run-error">{inference.error}</span>
      )}
    </div>
  );
}
