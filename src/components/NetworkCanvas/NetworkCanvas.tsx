/**
 * NetworkCanvas — Canvas 2D network visualization component.
 *
 * Handles:
 * - Canvas sizing and HiDPI rendering
 * - ResizeObserver for responsive layout
 * - Layout computation from model metadata (or default architecture)
 * - Rendering via the pure renderer module
 *
 * Does not perform model computation (D14 — rendering concern only).
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

export function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { modelStatus, inference, selectedNode } = useAppState();
  const dispatch = useAppDispatch();
  const [hover, setHover] = useState<HoveredNode | null>(null);
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

    // Size canvas for HiDPI
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
      motion: {
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

  /* The render trace remains frozen after completion so active edges persist. */
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
    </div>
  );
}
