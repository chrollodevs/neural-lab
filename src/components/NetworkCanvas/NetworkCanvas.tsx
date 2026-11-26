/**
 * NetworkCanvas — Canvas 2D network visualization component + floating neuron tooltip.
 *
 * Handles:
 * - Canvas sizing and HiDPI rendering
 * - ResizeObserver for responsive layout
 * - Layout computation from model metadata (or default architecture)
 * - Rendering via the pure renderer module
 * - Floating contextual readout on node hover (Reference C)
 */

import { useRef, useEffect, useCallback, useState, type PointerEvent } from 'react';
import { useAppState, useAppDispatch } from '../../state';
import { computeLayout } from '../../visualizations/layout';
import { renderNetwork } from '../../visualizations/renderer';
import { createClearAnimation, createPropagationAnimation, IDLE_ANIMATION, type AnimationState } from '../../animation/propagation';
import { hitTest, type HoveredNode } from '../../visualizations/interaction';
import type { LayerInfo } from '../../model/types';
import './NetworkCanvas.css';

/** Default layer topology when no model is loaded (D4) */
const DEFAULT_LAYERS: LayerInfo[] = [
  { name: 'input', units: 784, activation: 'none' },
  { name: 'hidden_1', units: 128, activation: 'relu' },
  { name: 'hidden_2', units: 64, activation: 'relu' },
  { name: 'output', units: 10, activation: 'softmax' },
];

const LAYER_LABELS: Record<string, string> = {
  input: 'Input',
  hidden_1: 'Hidden 1',
  hidden_2: 'Hidden 2',
  output: 'Output',
};

export function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { modelStatus, input, inference, selectedNode } = useAppState();
  const dispatch = useAppDispatch();
  const [hover, setHover] = useState<HoveredNode | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const layoutRef = useRef<ReturnType<typeof computeLayout> | null>(null);
  const hoverRef = useRef<HoveredNode | null>(null);
  const selectionRef = useRef(selectedNode);
  const modelRef = useRef(modelStatus.state === 'loaded' ? modelStatus.model : null);
  const trace = inference.state === 'complete' ? inference.trace : null;
  const displayTraceRef = useRef(trace);
  const animationRef = useRef<AnimationState>(IDLE_ANIMATION);
  const pointerRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);

  const layers =
    modelStatus.state === 'loaded'
      ? modelStatus.model.meta.layers
      : DEFAULT_LAYERS;

  const draw = useCallback((time = performance.now()) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    const w = rect.width || container.clientWidth || 0;
    const h = rect.height || container.clientHeight || 0;

    if (w === 0 || h === 0) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const existingLayout = layoutRef.current;
    const layout = existingLayout && existingLayout.width === w && existingLayout.height === h
      ? existingLayout
      : computeLayout(layers, w, h);
    layoutRef.current = layout;
    renderNetwork(ctx, {
      layout,
      trace: displayTraceRef.current,
      model: modelRef.current,
      dpr,
      hover: hoverRef.current,
      selection: selectionRef.current,
      animation: animationRef.current,
      motion: reducedMotionRef.current
        ? undefined
        : {
            time,
            pointerX: pointerRef.current.x,
            pointerY: pointerRef.current.y,
          },
    });
  }, [layers]);

  modelRef.current = modelStatus.state === 'loaded' ? modelStatus.model : null;
  selectionRef.current = selectedNode;
  hoverRef.current = hover;

  const getCanvasPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    const nextHover = layoutRef.current
      ? hitTest(layoutRef.current, point.x, point.y)
      : null;
    const rect = event.currentTarget.getBoundingClientRect();
    setContainerSize({ width: rect.width, height: rect.height });
    pointerRef.current = {
      x: (event.clientX - rect.left - rect.width / 2) / Math.max(rect.width, 1),
      y: (event.clientY - rect.top - rect.height / 2) / Math.max(rect.height, 1),
    };
    setHover(nextHover);
    draw();
  };

  const handlePointerLeave = () => {
    pointerRef.current = { x: 0, y: 0 };
    setHover(null);
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event);
    const node = layoutRef.current
      ? hitTest(layoutRef.current, point.x, point.y)
      : null;
    dispatch({
      type: 'SELECT_NODE',
      node: node ? { layerIndex: node.layerIndex, nodeIndex: node.nodeIndex } : null,
    });
  };

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (!trace) {
      if (!displayTraceRef.current) {
        animationRef.current = IDLE_ANIMATION;
        draw();
        return;
      }
      const controller = createClearAnimation(
        reducedMotionRef.current,
        (state) => {
          animationRef.current = state;
          draw();
        },
        () => {
          displayTraceRef.current = null;
          animationRef.current = IDLE_ANIMATION;
          draw();
        },
      );
      controller.start();
      return () => controller.cancel();
    }

    displayTraceRef.current = trace;
    const controller = createPropagationAnimation(
      layers.length,
      reducedMotionRef.current,
      (state) => {
        animationRef.current = state;
        draw();
      },
      () => {
        animationRef.current = { phase: 1, activeLayerIndex: -1, playing: false, resetting: false };
        draw();
      },
    );
    controller.start();
    return () => controller.cancel();
  }, [trace, layers.length, draw]);

  useEffect(() => {
    if (trace) {
      displayTraceRef.current = trace;
      return;
    }
  }, [trace]);

  useEffect(() => {
    draw();

    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      layoutRef.current = null;
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
      draw();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    if (reducedMotionRef.current) return;
    const tick = (time: number) => {
      draw(time);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

  // Compute floating tooltip readout for the hovered neuron/pixel
  const tooltip = (() => {
    if (!hover || containerSize.width === 0) return null;
    const layer = layers[hover.layerIndex];
    if (!layer) return null;

    const layerLabel = LAYER_LABELS[layer.name] ?? layer.name;
    const isInput = hover.layerIndex === 0;
    const isOutput = hover.layerIndex === layers.length - 1;
    const layerResult = !isInput && trace ? trace.layerResults[hover.layerIndex - 1] : null;
    const isPredicted = isOutput && trace !== null && trace.predictedClass === hover.nodeIndex;

    const title = isInput
      ? `${layerLabel} · Pixel (${Math.floor(hover.nodeIndex / 28)}, ${hover.nodeIndex % 28})`
      : isOutput
        ? `${layerLabel} · Digit ${hover.nodeIndex}`
        : `${layerLabel} · Unit #${hover.nodeIndex}`;

    const rows: { label: string; value: string; accent?: 'amber' | 'muted' }[] = [];

    if (isInput) {
      const val = trace ? trace.input[hover.nodeIndex] : input?.tensor28[hover.nodeIndex];
      rows.push({
        label: 'Intensity',
        value: val !== undefined ? val.toFixed(3) : '—',
      });
      rows.push({
        label: 'Index',
        value: `${hover.nodeIndex} / 783`,
        accent: 'muted',
      });
    } else if (isOutput) {
      if (trace && layerResult) {
        const prob = trace.probabilities[hover.nodeIndex] ?? 0;
        const logit = layerResult.preActivation[hover.nodeIndex] ?? 0;
        rows.push({
          label: isPredicted ? 'Predicted' : 'Probability',
          value: `${(prob * 100).toFixed(1)}%`,
          accent: isPredicted ? 'amber' : undefined,
        });
        rows.push({
          label: 'Logit (z)',
          value: logit.toFixed(3),
          accent: 'muted',
        });
      } else {
        rows.push({ label: 'Activation', value: layer.activation });
        rows.push({ label: 'State', value: 'Idle', accent: 'muted' });
      }
    } else if (layerResult) {
      const act = layerResult.activation[hover.nodeIndex] ?? 0;
      const pre = layerResult.preActivation[hover.nodeIndex] ?? 0;
      rows.push({
        label: 'Activation',
        value: act.toFixed(4),
      });
      rows.push({
        label: 'Pre (z)',
        value: pre.toFixed(4),
        accent: 'muted',
      });
    } else {
      rows.push({ label: 'Activation', value: layer.activation });
      rows.push({ label: 'Units', value: `${layer.units}`, accent: 'muted' });
    }

    // Place tooltip above the node if room, otherwise below; clamp horizontally
    const tipWidth = 196;
    const rawLeft = hover.screenX - tipWidth / 2;
    const left = Math.max(12, Math.min(containerSize.width - tipWidth - 12, rawLeft));
    const placeBelow = hover.screenY < 96;
    const top = placeBelow ? hover.screenY + 18 : hover.screenY - 16;

    return { title, rows, left, top, placeBelow, isPredicted };
  })();

  return (
    <div className="network-canvas-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="network-canvas"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        aria-label="Interactive neural network visualization"
      />
      {tooltip && (
        <div
          className={`nc-tooltip${tooltip.placeBelow ? ' is-below' : ''}${tooltip.isPredicted ? ' is-predicted' : ''}`}
          style={{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }}
          role="status"
          aria-live="polite"
        >
          <p className="nc-tooltip__title">{tooltip.title}</p>
          {tooltip.rows.map((row) => (
            <div className="nc-tooltip__row" key={row.label}>
              <span className={`nc-tooltip__lab${row.accent ? ` is-${row.accent}` : ''}`}>
                {row.label}
              </span>
              <span className="nc-tooltip__val mono">{row.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
