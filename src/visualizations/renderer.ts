/**
 * Canvas 2D network renderer — complete rewrite (D14, D18, D24).
 *
 * Drawing philosophy:
 *   - Background with subtle depth
 *   - Layer labels and flow arrows FIRST (they're reference marks)
 *   - Connections: subtle ambient field + prominent on hover/selection
 *   - Nodes: input grid as pixels, hidden as circles, output as labeled discs
 *   - Hover tooltip and selection glow
 *   - Edge filtering disclosure (D18)
 *
 * Connections use weight sign for brightness (D24):
 *   positive w → light gray, negative w → dark gray.
 * |w| ≠ w·a — contribution encoding is separate and labeled.
 *
 * Performance: batch draw calls, single stroke per style group.
 *
 * Active-edge ranking uses |w * a_source|, the absolute contribution term
 * to the destination pre-activation. The predicted output transition keeps
 * only edges into the predicted class at full priority; this is a visual
 * contribution cue, not a claim of one exclusive decision path.
 */

import type { NetworkLayout, LayerLayout } from './layout';
import type { ForwardTrace, LoadedModel } from '../model/types';
import type { HoveredNode, SelectedNode } from './interaction';
import type { AnimationState } from '../animation/propagation';

export interface RenderOptions {
  layout: NetworkLayout;
  trace: ForwardTrace | null;
  model: LoadedModel | null;
  dpr: number;
  hover: HoveredNode | null;
  selection: SelectedNode | null;
  animation: AnimationState;
  motion?: {
    time: number;
    pointerX: number;
    pointerY: number;
  };
}

// ── Colors (matching tokens.css) ──
const C = {
  bgDeep: '#07080a',
  bgElevated: '#101317',
  textPrimary: '#e6e8eb',
  textSecondary: '#8e96a0',
  textTertiary: '#525a65',
  accent: '#4f7a99',
  accentBright: '#6b9ab8',
  accentGlow: 'rgba(79, 122, 153, 0.22)',
  accentMuted: 'rgba(79, 122, 153, 0.12)',
  weightPos: '#96b4c4',
  weightNeg: '#465460',
  layerInput: '#8a9baa',
  layerH1: '#b87282',
  layerH2: '#5a8e72',
  layerOutput: '#cfa152',
  nodeIdle: '#13171c',
  nodeIdleBorder: '#272f38',
  gridEmpty: '#090b0e',
  gridBorder: '#1a2028',
};

const LAYER_COLORS = [C.layerInput, C.layerH1, C.layerH2, C.layerOutput];

export function renderNetwork(ctx: CanvasRenderingContext2D, opts: RenderOptions): void {
  const { layout, trace, model, dpr, hover, selection, animation, motion } = opts;
  const { width, height } = layout;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  if (motion) {
    ctx.translate(motion.pointerX * 3, motion.pointerY * 2);
  }

  // 1. Background
  ctx.fillStyle = C.bgDeep;
  ctx.fillRect(0, 0, width, height);

  // 2. Subtle dot grid for spatial reference
  drawDotGrid(ctx, width, height);

  // 3. Layer separator lines and labels
  drawLayerLabels(ctx, layout);

  // 4. Connection field (ambient). Without an artifact, show topology only:
  // adjacency is known, but weight sign and magnitude are intentionally absent.
  if (model) {
    drawAmbientConnections(ctx, layout, model, animation, trace);
  } else {
    drawTopologyScaffold(ctx, layout);
  }

  // 5. Hover/selection connections (prominent)
  if ((hover || selection) && model) {
    drawFocusedConnections(ctx, layout, model, trace, hover, selection);
  }

  // 6. Nodes — respects animation phase
  drawAllNodes(ctx, layout, trace, animation, hover, selection);

  // 7. Output digit labels
  drawOutputLabels(ctx, layout, trace);

  // 8. Hover tooltip
  if (hover) {
    drawTooltip(ctx, layout, trace, hover);
  }

  // 9. Edge filtering disclosure (D18)
  drawDisclosure(ctx, layout, width, height, model);

  ctx.restore();
}

// ── Background ──

function drawDotGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.022)';
  ctx.lineWidth = 1;
  const spacing = 32;
  ctx.beginPath();
  for (let x = spacing; x < w; x += spacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = spacing; y < h; y += spacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
}

// ── Layer labels ──

function drawLayerLabels(ctx: CanvasRenderingContext2D, layout: NetworkLayout): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let li = 0; li < layout.layers.length; li++) {
    const layer = layout.layers[li];
    if (!layer) continue;

    const color = LAYER_COLORS[li] ?? C.textSecondary;
    const labelY = Math.min(layer.topY - 26, layout.height - 60);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(layer.centerX, Math.max(28, layer.topY - 8));
    ctx.lineTo(layer.centerX, Math.min(layout.height - 28, layer.bottomY + 8));
    ctx.stroke();

    // Layer name
    ctx.font = '500 9px "IBM Plex Mono", monospace';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillText(layer.name.replace('_', ' ').toUpperCase(), layer.centerX, Math.max(8, labelY));

    // Unit count
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.fillStyle = C.textTertiary;
    ctx.globalAlpha = 0.5;
    ctx.fillText(`${layer.units}`, layer.centerX, Math.max(8, labelY) + 13);

    ctx.globalAlpha = 1;

    // Flow arrow between layers (except after last)
    if (li < layout.layers.length - 1) {
      const next = layout.layers[li + 1];
      if (next) {
        const arrowX = (layer.centerX + next.centerX) / 2;
        const arrowY = Math.max(8, labelY) + 6;
        ctx.font = '9px "IBM Plex Mono", monospace';
        ctx.fillStyle = C.textTertiary;
        ctx.globalAlpha = 0.3;
        ctx.fillText('→', arrowX, arrowY);
        ctx.globalAlpha = 1;
      }
    }
  }
}

// ── Ambient connections ──

function drawAmbientConnections(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  model: LoadedModel,
  animation: AnimationState,
  trace: ForwardTrace | null,
): void {
  // Draw a readable deterministic sample of every real dense transition.
  for (let li = 0; li < layout.layers.length - 1; li++) {
    const src = layout.layers[li];
    const dst = layout.layers[li + 1];
    if (!src || !dst) continue;

    const modelLayer = model.layers[li];
    if (!modelLayer) continue;

    // The input layer is dense too; show a deterministic subset of its real
    // weights rather than an unconnected decorative band.
    const phase = !trace
      ? 0
      : animation.resetting
        ? animation.phase
        : animation.playing
          ? connectionPhase(animation.phase, li)
          : 1;
    const activePhase = animation.resetting ? animation.phase : trace ? 1 : 0;
    drawSampledConnections(
      ctx,
      src,
      dst,
      modelLayer.weights,
      modelLayer.inputUnits,
      phase,
      activePhase,
      li,
      trace,
    );
  }
}

function drawTopologyScaffold(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
): void {
  for (let li = 0; li < layout.layers.length - 1; li++) {
    const src = layout.layers[li];
    const dst = layout.layers[li + 1];
    if (!src || !dst) continue;

    const path = new Path2D();
    const maxConnections = src.units > 100 ? 120 : 180;
    let drawn = 0;
    let seed = 12011 + li * 7919;

    for (let di = 0; di < dst.units && drawn < maxConnections; di++) {
      for (let si = 0; si < src.units && drawn < maxConnections; si++) {
        seed = (seed * 16807) % 2147483647;
        if ((seed % 32768) / 32768 > maxConnections / (src.units * dst.units)) continue;
        const source = src.nodes[si];
        const target = dst.nodes[di];
        if (!source || !target) continue;
        path.moveTo(source.x, source.y);
        path.lineTo(target.x, target.y);
        drawn++;
      }
    }

    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 0.35;
    ctx.globalAlpha = 0.16;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }
}

function drawSampledConnections(
  ctx: CanvasRenderingContext2D,
  src: LayerLayout,
  dst: LayerLayout,
  weights: Float32Array,
  inputUnits: number,
  phase: number,
  activePhase: number,
  modelLayerIndex: number,
  trace: ForwardTrace | null = null,
): void {
  // Sample a subset of connections for ambient display
  const maxConnections = Math.min(720, src.units * dst.units);
  const sampleRate = maxConnections / (src.units * dst.units);

  // Batch into positive and negative paths while retaining layer identity.
  const posPath = new Path2D();
  const negPath = new Path2D();
  const activeEdges: Array<{ si: number; di: number; score: number; weight: number }> = [];

  let seed = 7919; // deterministic sampling
  for (let di = 0; di < dst.units; di++) {
    for (let si = 0; si < src.units; si++) {
      seed = (seed * 16807) % 2147483647;
      if ((seed % 32768) / 32768 > sampleRate) continue;

      const w = weights[di * inputUnits + si] ?? 0;
      const srcNode = src.nodes[si];
      const dstNode = dst.nodes[di];
      if (!srcNode || !dstNode) continue;

      const path = w >= 0 ? posPath : negPath;
      path.moveTo(srcNode.x, srcNode.y);
      curveTo(path, srcNode.x, srcNode.y, dstNode.x, dstNode.y, si, di);

      const sourceActivation = trace
        ? modelLayerIndex === 0
          ? trace.input[si] ?? 0
          : trace.layerResults[modelLayerIndex - 1]?.activation[si] ?? 0
        : 0;
      const contribution = Math.abs(w * sourceActivation);
      const targetRelevance = trace && modelLayerIndex === trace.layerResults.length
        ? di === trace.predictedClass ? 1 : 0.06
        : 1;
      const score = contribution * targetRelevance;
      if (score > 0) {
        activeEdges.push({ si, di, score, weight: w });
      }
    }
  }

  activeEdges.sort((a, b) => b.score - a.score);

  ctx.lineWidth = 0.45;
  ctx.globalAlpha = 0.08 + phase * 0.16;

  const layerColor = LAYER_COLORS[modelLayerIndex] ?? C.weightPos;
  const negativeLayerColor = lerpColor(C.weightNeg, layerColor, 0.28);
  ctx.strokeStyle = layerColor;
  ctx.stroke(posPath);
  ctx.strokeStyle = negativeLayerColor;
  ctx.stroke(negPath);

  function curveTo(
    path: Path2D,
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    sourceIndex: number,
    targetIndex: number,
  ): void {
    const dx = tx - sx;
    const curve = Math.sin((sourceIndex + 1) * 1.71 + (targetIndex + 1) * 0.37) * Math.min(18, Math.abs(dx) * 0.08);
    path.quadraticCurveTo(sx + dx * 0.5, (sy + ty) * 0.5 + curve, tx, ty);
  }

  if (trace && activePhase > 0) {
    drawContributionTiers(ctx, src, dst, activeEdges, layerColor, negativeLayerColor, activePhase);
  }

  ctx.globalAlpha = 1;
}

function drawContributionTiers(
  ctx: CanvasRenderingContext2D,
  src: LayerLayout,
  dst: LayerLayout,
  edges: Array<{ si: number; di: number; score: number; weight: number }>,
  positiveColor: string,
  negativeColor: string,
  phase: number,
): void {
  const visibleEdges = edges.slice(0, Math.min(72, edges.length));
  const maxScore = visibleEdges[0]?.score ?? 1;

  for (let index = visibleEdges.length - 1; index >= 0; index--) {
    const edge = visibleEdges[index];
    if (!edge) continue;
    const source = src.nodes[edge.si];
    const target = dst.nodes[edge.di];
    if (!source || !target) continue;

    const relativeScore = edge.score / maxScore;
    const tier = index < 12 ? 'primary' : index < 42 ? 'secondary' : 'context';
    const opacity = tier === 'primary'
      ? 0.25 + phase * 0.62 * Math.max(0.65, relativeScore)
      : tier === 'secondary'
        ? 0.14 + phase * 0.32 * Math.max(0.45, relativeScore)
        : 0.08 + phase * 0.16 * Math.max(0.3, relativeScore);
    const width = tier === 'primary' ? 1.15 : tier === 'secondary' ? 0.7 : 0.45;
    const path = new Path2D();
    path.moveTo(source.x, source.y);
    const dx = target.x - source.x;
    const curve = Math.sin((edge.si + 1) * 1.71 + (edge.di + 1) * 0.37) * Math.min(18, Math.abs(dx) * 0.08);
    path.quadraticCurveTo(source.x + dx * 0.5, (source.y + target.y) * 0.5 + curve, target.x, target.y);

    ctx.strokeStyle = edge.weight >= 0 ? positiveColor : negativeColor;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = width;
    ctx.stroke(path);
  }
}

// ── Focused connections (hover/selection) ──

function drawFocusedConnections(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  model: LoadedModel,
  trace: ForwardTrace | null,
  hover: HoveredNode | null,
  selection: SelectedNode | null,
): void {
  const focus = hover ?? (selection ? { layerIndex: selection.layerIndex, nodeIndex: selection.nodeIndex } : null);
  if (!focus) return;
  const { layerIndex, nodeIndex } = focus;

  // Draw incoming connections (from previous layer)
  if (layerIndex > 0) {
    const modelLayer = model.layers[layerIndex - 1];
    const srcLayout = layout.layers[layerIndex - 1];
    const dstLayout = layout.layers[layerIndex];
    if (modelLayer && srcLayout && dstLayout) {
      drawNodeConnections(ctx, srcLayout, dstLayout, modelLayer.weights, modelLayer.inputUnits,
        nodeIndex, 'incoming', trace, layerIndex - 1);
    }
  }

  // Draw outgoing connections (to next layer)
  if (layerIndex < layout.layers.length - 1 && layerIndex < model.layers.length) {
    const modelLayer = model.layers[layerIndex];
    const srcLayout = layout.layers[layerIndex];
    const dstLayout = layout.layers[layerIndex + 1];
    if (modelLayer && srcLayout && dstLayout) {
      drawNodeConnections(ctx, srcLayout, dstLayout, modelLayer.weights, modelLayer.inputUnits,
        nodeIndex, 'outgoing', trace, layerIndex);
    }
  }
}

function drawNodeConnections(
  ctx: CanvasRenderingContext2D,
  src: LayerLayout,
  dst: LayerLayout,
  weights: Float32Array,
  inputUnits: number,
  focusIndex: number,
  direction: 'incoming' | 'outgoing',
  _trace: ForwardTrace | null,
  _modelLayerIndex: number,
): void {
  // Collect weight magnitudes for the focused node
  interface Edge { si: number; di: number; w: number; mag: number }
  const edges: Edge[] = [];

  if (direction === 'incoming') {
    // focusIndex is the destination node in dst layer
    for (let si = 0; si < src.units; si++) {
      const w = weights[focusIndex * inputUnits + si] ?? 0;
      edges.push({ si, di: focusIndex, w, mag: Math.abs(w) });
    }
  } else {
    // focusIndex is the source node in src layer
    for (let di = 0; di < dst.units; di++) {
      const w = weights[di * inputUnits + focusIndex] ?? 0;
      edges.push({ si: focusIndex, di, w, mag: Math.abs(w) });
    }
  }

  // Sort by magnitude descending, take top K
  edges.sort((a, b) => b.mag - a.mag);
  const maxShow = src.units > 100 ? 30 : edges.length;
  const topEdges = edges.slice(0, maxShow);
  if (topEdges.length === 0) return;

  const maxMag = topEdges[0]?.mag ?? 1;

  for (const edge of topEdges) {
    const srcNode = src.nodes[edge.si];
    const dstNode = dst.nodes[edge.di];
    if (!srcNode || !dstNode) continue;

    const normMag = edge.mag / maxMag;
    const alpha = 0.15 + normMag * 0.6;
    const width = 0.5 + normMag * 2.5;

    ctx.strokeStyle = edge.w >= 0 ? C.weightPos : C.weightNeg;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(srcNode.x, srcNode.y);
    ctx.lineTo(dstNode.x, dstNode.y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

// ── Nodes ──

function drawAllNodes(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  trace: ForwardTrace | null,
  animation: AnimationState,
  hover: HoveredNode | null,
  selection: SelectedNode | null,
): void {
  for (let li = 0; li < layout.layers.length; li++) {
    const layer = layout.layers[li];
    if (!layer) continue;

    // Animation phase: layers light up sequentially
    const layerPhase = animation.playing
      ? layerProgress(animation.phase, li)
      : animation.resetting
        ? animation.phase
        : 1;

    const isInput = li === 0 && layer.units === 784;

    if (isInput) {
      drawInputGrid(ctx, layer, trace, layerPhase);
    } else {
      drawHiddenOutputNodes(ctx, layer, li, trace, layerPhase, hover, selection, layout.layers.length);
    }
  }
}

function drawInputGrid(
  ctx: CanvasRenderingContext2D,
  layer: LayerLayout,
  trace: ForwardTrace | null,
  phase: number,
): void {
  const cellSize = layer.cellSize ?? 6;
  const half = cellSize / 2;
  const layerColor = LAYER_COLORS[0] ?? C.layerInput;

  for (let ni = 0; ni < layer.nodes.length; ni++) {
    const node = layer.nodes[ni];
    if (!node) continue;

    let fill: string;
    if (trace && phase > 0) {
      const val = (trace.input[ni] ?? 0) * phase;
      fill = lerpColor(C.gridEmpty, layerColor, Math.min(1, val * 1.15));
    } else {
      fill = lerpColor(C.gridEmpty, layerColor, 0.06);
    }

    ctx.fillStyle = fill;
    ctx.fillRect(node.x - half, node.y - half, cellSize, cellSize);

    // Subtle border
    ctx.strokeStyle = C.gridBorder;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(node.x - half, node.y - half, cellSize, cellSize);
  }
}

function drawHiddenOutputNodes(
  ctx: CanvasRenderingContext2D,
  layer: LayerLayout,
  layerIndex: number,
  trace: ForwardTrace | null,
  phase: number,
  hover: HoveredNode | null,
  selection: SelectedNode | null,
  totalLayers: number,
): void {
  const isOutput = layerIndex === totalLayers - 1;
  const baseRadius = isOutput ? 11 : (layer.units > 80 ? 2.1 : 3.6);
  const layerColor = LAYER_COLORS[layerIndex] ?? C.textSecondary;

  for (let ni = 0; ni < layer.nodes.length; ni++) {
    const node = layer.nodes[ni];
    if (!node) continue;

    const isHovered = hover?.layerIndex === layerIndex && hover.nodeIndex === ni;
    const isSelected = selection?.layerIndex === layerIndex && selection.nodeIndex === ni;

    // Activation-based coloring
    let activationVal = 0;
    if (trace && layerIndex > 0 && phase > 0) {
      const traceLayer = trace.layerResults[layerIndex - 1];
      activationVal = (traceLayer?.activation[ni] ?? 0) * phase;
    }

    const depth = particleDepth(layerIndex, ni);
    const radius = (baseRadius * (0.86 + depth * 0.22)) + (isHovered ? 2 : isSelected ? 1.5 : 0);
    const activeState = Math.min(1, activationVal * 2.5);
    const hoverIntensity = isHovered || isSelected ? 1 : 0;
    const illumination = Math.max(activeState, hoverIntensity);

    // Node fill
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

    if (activationVal > 0.01) {
      // Blend from idle to layer color based on activation
      const t = Math.min(1, activationVal * 2.5);
      ctx.fillStyle = lerpColor(C.nodeIdle, layerColor, t);
    } else {
      ctx.fillStyle = lerpColor(C.nodeIdle, layerColor, depth * 0.14);
    }
    ctx.fill();

    // Crisp particle edge: activation changes brightness, not bloom.
    ctx.strokeStyle = illumination > 0
      ? lerpColor(layerColor, C.accentBright, Math.min(1, activeState * 0.55 + hoverIntensity * 0.45))
      : activationVal > 0.01
        ? layerColor
        : C.nodeIdleBorder;
    ctx.lineWidth = illumination > 0 ? 1.25 : 0.8;
    ctx.globalAlpha = illumination > 0 ? 0.9 : 0.42 + depth * 0.24;
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (activationVal > 0.01 || isHovered || isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(0.7, radius * 0.28), 0, Math.PI * 2);
      ctx.fillStyle = C.accentBright;
      ctx.globalAlpha = Math.min(0.9, 0.25 + activeState * 0.65 + hoverIntensity * 0.2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

}

function particleDepth(layerIndex: number, nodeIndex: number): number {
  const value = Math.sin((layerIndex + 1) * 19.17 + (nodeIndex + 1) * 7.31) * 43758.5453;
  return value - Math.floor(value);
}

function layerProgress(phase: number, layerIndex: number): number {
  const starts = [0, 0.16, 0.4, 0.64];
  const ends = [0.18, 0.42, 0.66, 0.86];
  const start = starts[layerIndex] ?? 0;
  const end = ends[layerIndex] ?? 1;
  if (phase <= start) return 0;
  if (phase >= end) return 1;
  const t = (phase - start) / (end - start);
  return t * t * (3 - 2 * t);
}

function connectionPhase(phase: number, layerIndex: number): number {
  const start = [0.12, 0.34, 0.58][layerIndex] ?? 0.8;
  const end = [0.38, 0.6, 0.82][layerIndex] ?? 1;
  if (phase <= start) return 0;
  if (phase >= end) return 1;
  const t = (phase - start) / (end - start);
  return t * t * (3 - 2 * t);
}

// ── Output digit labels ──

function drawOutputLabels(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  trace: ForwardTrace | null,
): void {
  const outputLayer = layout.layers[layout.layers.length - 1];
  if (!outputLayer || outputLayer.units > 12) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let ni = 0; ni < outputLayer.nodes.length; ni++) {
    const node = outputLayer.nodes[ni];
    if (!node) continue;

    // Digit label inside node
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    const outputActivation = trace?.layerResults[layout.layers.length - 2]?.activation[ni] ?? 0;
    const isHighlighted = outputActivation > 0.5;
    ctx.fillStyle = isHighlighted ? C.bgDeep : C.textPrimary;
    ctx.globalAlpha = 0.8;
    ctx.fillText(`${ni}`, node.x, node.y);

    // Probability beside node (when inference has run)
    if (trace) {
      const prob = trace.probabilities[ni] ?? 0;
      const isPredicted = ni === trace.predictedClass;

      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = isPredicted ? C.layerOutput : C.textTertiary;
      ctx.globalAlpha = isPredicted ? 1 : 0.6;
      ctx.fillText(
        `${(prob * 100).toFixed(1)}%`,
        node.x + 20,
        node.y,
      );
      ctx.textAlign = 'center';

      // Small bar indicator
      if (isPredicted) {
        ctx.fillStyle = C.layerOutput;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(node.x + 18, node.y + 7, prob * 40, 2);
      }
    }

    ctx.globalAlpha = 1;
  }
}

// ── Tooltip ──

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  trace: ForwardTrace | null,
  hover: HoveredNode,
): void {
  const layer = layout.layers[hover.layerIndex];
  if (!layer) return;

  const lines: string[] = [];
  lines.push(`${layer.name.replace('_', ' ')} [${hover.nodeIndex}]`);

  if (trace && hover.layerIndex === 0) {
    const val = trace.input[hover.nodeIndex] ?? 0;
    lines.push(`pixel: ${val.toFixed(3)}`);
  } else if (trace && hover.layerIndex > 0) {
    const tl = trace.layerResults[hover.layerIndex - 1];
    if (tl) {
      lines.push(`z: ${(tl.preActivation[hover.nodeIndex] ?? 0).toFixed(4)}`);
      lines.push(`a: ${(tl.activation[hover.nodeIndex] ?? 0).toFixed(4)}`);
    }
  }

  if (!trace && hover.layerIndex > 0) {
    lines.push('run inference to see values');
  }

  const padding = 8;
  const lineHeight = 14;
  ctx.font = '10px "IBM Plex Mono", monospace';
  const maxTextW = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxW = maxTextW + padding * 2;
  const boxH = lines.length * lineHeight + padding * 2 - 4;

  // Position tooltip above/below the node
  let tx = hover.screenX - boxW / 2;
  let ty = hover.screenY - boxH - 12;
  if (ty < 4) ty = hover.screenY + 16;
  if (tx < 4) tx = 4;
  if (tx + boxW > layout.width - 4) tx = layout.width - boxW - 4;

  // Background
  ctx.fillStyle = C.bgElevated;
  ctx.globalAlpha = 0.95;
  roundRect(ctx, tx, ty, boxW, boxH, 4);
  ctx.fill();

  // Border
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.4;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Text
  ctx.fillStyle = C.textPrimary;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    ctx.fillStyle = i === 0 ? C.textPrimary : C.textSecondary;
    ctx.fillText(line, tx + padding, ty + padding + i * lineHeight);
  }
}

// ── Disclosure (D18) ──

function drawDisclosure(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  w: number,
  h: number,
  model: LoadedModel | null,
): void {
  let totalConns = 0;
  for (let li = 0; li < layout.layers.length - 1; li++) {
    const src = layout.layers[li];
    const dst = layout.layers[li + 1];
    if (src && dst) totalConns += src.units * dst.units;
  }

  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = C.textTertiary;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = 0.5;

  const label = model
    ? `Filtered view · ${totalConns.toLocaleString()} connections · hover node to inspect`
    : `Topology scaffold · ${totalConns.toLocaleString()} possible connections · weights unavailable`;

  ctx.fillText(label, w - 10, h - 8);
  ctx.globalAlpha = 1;
}

// ── Utilities ──

function lerpColor(a: string, b: string, t: number): string {
  const parse = (c: string) => {
    const hex = c.replace('#', '');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ] as [number, number, number];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bv = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bv})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
