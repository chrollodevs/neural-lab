/**
 * Run control — explicit inference trigger (D21).
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
        type="button"
        className={`run-button${isRunning ? ' is-running' : ''}`}
        onClick={handleRun}
        disabled={!canRun}
        title={disabledReason ?? 'Run inference'}
      >
        <svg
          className="run-btn-svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
          />
        </svg>
        <span>{isRunning ? 'Running…' : 'Run Inference'}</span>
      </button>

      {disabledReason && modelLoaded && (
        <span className="run-hint">{disabledReason}</span>
      )}
      {inference.state === 'complete' && (
        <span className="run-result">
          Predicted {inference.trace.predictedClass}
        </span>
      )}
      {inference.state === 'error' && (
        <span className="run-error">{inference.error}</span>
      )}
    </div>
  );
}
