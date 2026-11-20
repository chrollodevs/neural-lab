import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useAppDispatch, useAppState } from '../../state';
import { createDrawingInput } from '../../preprocess/drawing';
import './InputTab.css';

interface Sample {
  label: number;
  tensor: number[];
}

export function InputTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const { input } = useAppState();
  const dispatch = useAppDispatch();
  const [samples, setSamples] = useState<Sample[]>([]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}model/samples.json`)
      .then((response) => response.ok ? response.json() as Promise<Sample[]> : [])
      .then(setSamples)
      .catch(() => setSamples([]));
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    dispatch({ type: 'CLEAR_INPUT' });
  };

  const drawAt = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const context = canvas.getContext('2d');
    if (!context) return;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#c8d4dc';
    context.lineWidth = 22;
    context.lineTo(
      ((event.clientX - rect.left) / rect.width) * canvas.width,
      ((event.clientY - rect.top) / rect.height) * canvas.height,
    );
    context.stroke();
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const rect = event.currentTarget.getBoundingClientRect();
    context.beginPath();
    context.moveTo(
      ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    );
    drawAt(event);
  };

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (canvasRef.current) dispatch({ type: 'SET_INPUT', input: createDrawingInput(canvasRef.current) });
  };

  const selectSample = (sample: Sample) => {
    dispatch({ type: 'SET_INPUT', input: { source: 'sample', label: sample.label, tensor28: new Float32Array(sample.tensor) } });
  };

  return (
    <div className="input-tab">
      <section className="input-section drawing-section">
        <h3 className="section-label">Draw a digit</h3>
        <canvas
          ref={canvasRef}
          className="drawing-canvas"
          width={280}
          height={280}
          onPointerDown={handlePointerDown}
          onPointerMove={(event) => drawingRef.current && drawAt(event)}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="Draw a handwritten digit"
        />
        <div className="input-actions">
          <button type="button" className="text-button" onClick={clearCanvas}>Clear</button>
          {input?.source === 'draw' && <span className="input-confirmation">Input ready</span>}
        </div>
      </section>

      <section className="input-section">
        <h3 className="section-label">Real MNIST samples</h3>
        <div className="sample-list">
          {samples.length > 0 ? samples.map((sample) => (
            <button type="button" className={`sample-button ${input?.label === sample.label ? 'selected' : ''}`} key={sample.label} onClick={() => selectSample(sample)}>
              <span className="sample-glyph" aria-hidden="true">
                {sample.tensor.map((value, index) => <i key={index} style={{ opacity: value }} />)}
              </span>
              <span>{sample.label}</span>
            </button>
          )) : <p className="input-message">Samples become available with the trained artifact.</p>}
        </div>
      </section>

      <section className="input-section current-input">
        <h3 className="section-label">Current input</h3>
        <p className="input-message">
          {input ? `${input.source === 'sample' ? `MNIST sample ${input.label}` : 'Drawing'} · 28 × 28 tensor ready` : 'Draw a digit or choose a real sample, then run inference.'}
        </p>
      </section>
    </div>
  );
}
