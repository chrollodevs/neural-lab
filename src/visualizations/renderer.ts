/**
 * Canvas 2D network renderer — refined pass.
 *
 * Key changes from previous version:
 *
 * CONNECTION ROUTING (bundle-then-fan):
 *   Connections leave their source node nearly horizontally, converge into
 *   a narrow "bundle band" at a midpoint between layers, then fan out to
 *   destination nodes. This dramatically reduces visual tangle.
 *   Uses cubic bezier with two control points.
 *
 * PREDICTION HIGHLIGHTING:
 *   Only the predicted class node gets amber fill + dark label.
 *   Non-predicted nodes use their base activation color — no amber bleed.
 *
 * VISUAL HIERARCHY:
 *   - Stronger separation between ambient connections and active ones
 *   - Cleaner node rendering for output layer
 *   - Layer labels use Inter (sans), not monospace
 *
 * Drawing philosophy:
 *   - Background with subtle depth
 *   - Layer labels and flow markers (reference marks)
 *   - Connections: subtle ambient field + prominent on hover/selection
 *   - Nodes: input grid as pixels, hidden as circles, output as labeled discs
 *   - Hover tooltip and selection glow
 *   - Edge filtering disclosure (D18)
 *
 * Connections use weight sign for brightness (D24):
 *   positive w → lighter, negative w → darker.
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

// ── Colors (matching tokens.css — monochromatic palette) ──
const C = {
  bgDeep:         '#080808',
  bgElevated:     '#181818',
  textPrimary:    '#efefef',
  textSecondary:  '#919191',
  textTertiary:   '#4f4f4f',
  accent:         '#efefef',
  accentBright:   '#ffffff',
  accentGlow:     'rgba(255, 255, 255, 0.10)',
  accentMuted:    'rgba(255, 255, 255, 0.07)',
  weightPos:      '#aaaaaa',
  weightNeg:      '#3a3a3a',
  layerInput:     '#787878',
  layerH1:        '#9e7272',
  layerH2:        '#5a7e68',
  layerOutput:    '#c9933a',
  nodeIdle:       '#141414',
  nodeIdleBorder: '#2a2a2a',
  gridEmpty:      '#0a0a0a',
  gridBorder:     '#1e1e1e',
};

const LAYER_COLORS = [C.layerInput, C.layerH1, C.layerH2, C.layerOutput];

// Brighter, restrained signal RGBs inherited from each layer's own hue
const LAYER_SIGNAL_RGB = [
  '192, 192, 192', // Input → Hidden 1 (silver-gray)
  '210, 162, 162', // Hidden 1 → Hidden 2 (restrained rose-red)
  '146, 198, 166', // Hidden 2 → Output (restrained sage-green)
];

interface SampledEdge {
  si: number;
  di: number;
  w: number;
  depth: number;
}

// Cache deterministic sampled edges per LoadedModel so 60fps animation
// does not re-scan 100,000+ weight entries every frame.
const sampledEdgeCache = new WeakMap<LoadedModel, SampledEdge[][]>();

function getSampledEdges(model: LoadedModel, layerIndex: number, srcUnits: number, dstUnits: number): SampledEdge[] {
  let perModel = sampledEdgeCache.get(model);
  if (!perModel) {
    perModel = [];
    sampledEdgeCache.set(model, perModel);
  }
  const cached = perModel[layerIndex];
  if (cached) return cached;

  const modelLayer = model.layers[layerIndex];
  if (!modelLayer) return [];

  const weights = modelLayer.weights;
  const inputUnits = modelLayer.inputUnits;
  const maxConnections = Math.min(620, srcUnits * dstUnits);
  const sampleRate = maxConnections / (srcUnits * dstUnits);
  const edges: SampledEdge[] = [];

  let seed = 7919;
  for (let di = 0; di < dstUnits; di++) {
    for (let si = 0; si < srcUnits; si++) {
      seed = (seed * 16807) % 2147483647;
      if ((seed % 32768) / 32768 > sampleRate) continue;
      const w = weights[di * inputUnits + si] ?? 0;
      const depth = ((seed * 31) % 1000) / 1000;
      edges.push({ si, di, w, depth });
    }
  }

  perModel[layerIndex] = edges;
  return edges;
}

export function renderNetwork(ctx: CanvasRenderingContext2D, opts: RenderOptions): void {
  const { layout, trace, model, dpr, hover, selection, animation, motion } = opts;
  const { width, height } = layout;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  if (motion) {
    ctx.translate(motion.pointerX * 2.5, motion.pointerY * 1.5);
  }

  // 1. Background
  ctx.fillStyle = C.bgDeep;
  ctx.fillRect(0, 0, width, height);

  // 2. Clean obsidian stage (no distracting background grid)

  // 3. Layer separator lines and labels
  drawLayerLabels(ctx, layout);

  // 4. Connection field (ambient + travelling signal streaks).
  const hasFocus = Boolean(hover || selection);
  const swayTimeSec = motion ? motion.time * 0.001 : 0;
  if (model) {
    drawAmbientConnections(ctx, layout, model, animation, trace, motion?.time ?? 0, Boolean(motion), hasFocus, swayTimeSec);
  } else {
    drawTopologyScaffold(ctx, layout, swayTimeSec);
  }

  // 5. Hover/selection connections (prominent)
  if (hasFocus && model) {
    drawFocusedConnections(ctx, layout, model, trace, hover, selection, swayTimeSec);
  }

  // 6. Nodes — respects animation phase
  drawAllNodes(ctx, layout, trace, animation, hover, selection, motion?.time ?? 0, Boolean(motion));

  // 7. Output digit labels & subtle breathing prediction ring
  drawOutputLabels(ctx, layout, trace, motion?.time ?? 0, Boolean(motion));

  // 8. Edge filtering disclosure (D18)
  drawDisclosure(ctx, layout, width, height, model);

  ctx.restore();
}

// ── Background ──

// ── Layer labels ──

const LAYER_TITLES: Record<string, string> = {
  input: 'Input',
  hidden_1: 'Hidden 1',
  hidden_2: 'Hidden 2',
  output: 'Output',
};

function drawLayerLabels(ctx: CanvasRenderingContext2D, layout: NetworkLayout): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let li = 0; li < layout.layers.length; li++) {
    const layer = layout.layers[li];
    if (!layer) continue;

    const color = LAYER_COLORS[li] ?? C.textSecondary;
    const labelY = Math.max(12, Math.min(layer.topY - 34, layout.height - 64));

    // Faint vertical axis hairline behind the layer
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(layer.centerX, Math.max(40, layer.topY - 8));
    ctx.lineTo(layer.centerX, Math.min(layout.height - 34, layer.bottomY + 8));
    ctx.stroke();
    ctx.setLineDash([]);

    // Layer name — clean Inter title case
    const title = LAYER_TITLES[layer.name] ?? layer.name.replace('_', ' ');
    ctx.font = '500 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = li === layout.layers.length - 1 ? color : C.textSecondary;
    ctx.globalAlpha = 0.92;
    ctx.fillText(title, layer.centerX, labelY);

    // Unit count
    ctx.font = '400 10px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = C.textTertiary;
    ctx.globalAlpha = 0.72;
    ctx.fillText(`${layer.units}`, layer.centerX, labelY + 14);

    ctx.globalAlpha = 1;
  }
}

// ── Bundle-then-fan connection routing ──
//
// For each connection from (sx, sy) to (tx, ty):
//   CP1: near source, offset toward the bundle midpoint
//   CP2: near destination, offset from the bundle midpoint
//
// The bundle midpoint is at ~40% of the inter-layer gap from the source,
// near the layer's centerX. Connections converge there, then fan to targets.
// This creates the "deliberate cable-routing" look in the reference image.

function bundleControlPoints(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  srcCenterX: number,
  dstCenterX: number,
  swayTimeSec = 0,
  depth = 0.5,
): [number, number, number, number] {
  // Subtle per-edge bundle waist variation creates layered spatial depth
  const depthShift = (depth - 0.5) * 0.08;
  const bundleX1 = srcCenterX + (dstCenterX - srcCenterX) * (0.28 + depthShift);
  const bundleX2 = srcCenterX + (dstCenterX - srcCenterX) * (0.72 - depthShift);
  const cp1x = sx + (bundleX1 - sx) * 1.4;
  const cp2x = tx - (tx - bundleX2) * 1.4;

  let sway1 = 0;
  let sway2 = 0;
  if (swayTimeSec > 0) {
    const phase = sy * 0.017 + ty * 0.013 + depth * 2.1;
    const amp = 2.6 + depth * 1.8;
    sway1 = Math.sin(swayTimeSec * 0.55 + phase) * amp;
    sway2 = Math.cos(swayTimeSec * 0.45 + phase * 1.3) * amp;
  }

  const cp1y = sy * 0.6 + ty * 0.4 + sway1;
  const cp2y = sy * 0.4 + ty * 0.6 + sway2;
  return [cp1x, cp1y, cp2x, cp2y];
}

function cubicBezierAt(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return [
    uuu * p0x + 3 * uu * t * p1x + 3 * u * tt * p2x + ttt * p3x,
    uuu * p0y + 3 * uu * t * p1y + 3 * u * tt * p2y + ttt * p3y,
  ];
}

function bundleCurveTo(
  path: Path2D,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  srcCenterX: number,
  dstCenterX: number,
  swayTimeSec = 0,
  depth = 0.5,
): void {
  const [cp1x, cp1y, cp2x, cp2y] = bundleControlPoints(
    sx, sy, tx, ty, srcCenterX, dstCenterX, swayTimeSec, depth,
  );
  path.moveTo(sx, sy);
  path.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tx, ty);
}

// ── Ambient connections ──

/**
 * Pre-compute per-neuron relevance to the predicted class for a hidden layer.
 * Relevance of hidden neuron [di] = |weight connecting di → predictedClass| in the
 * downstream model layer. This is a one-step backward pass using actual weights.
 * Returns a Float32Array of length dst.units, normalised to [0,1].
 */
function computeNodeRelevance(
  nextWeights: Float32Array,
  nextInputUnits: number,
  numDstNodes: number,
  predictedClass: number,
): Float32Array {
  const rel = new Float32Array(numDstNodes);
  let maxRel = 0;
  for (let di = 0; di < numDstNodes; di++) {
    // weight from hidden[di] → output[predictedClass]
    const w = Math.abs(nextWeights[predictedClass * nextInputUnits + di] ?? 0);
    rel[di] = w;
    if (w > maxRel) maxRel = w;
  }
  if (maxRel > 0) {
    for (let di = 0; di < numDstNodes; di++) {
      rel[di] = (rel[di] ?? 0) / maxRel;
    }
  }
  return rel;
}

function drawAmbientConnections(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  model: LoadedModel,
  animation: AnimationState,
  trace: ForwardTrace | null,
  timeMs: number,
  animatePulses: boolean,
  dimForFocus: boolean,
  swayTimeSec: number,
): void {
  const predictedClass = trace?.predictedClass ?? -1;

  for (let li = 0; li < layout.layers.length - 1; li++) {
    const src = layout.layers[li];
    const dst = layout.layers[li + 1];
    if (!src || !dst) continue;

    const modelLayer = model.layers[li];
    if (!modelLayer) continue;

    const phase = !trace
      ? 0
      : animation.resetting
        ? animation.phase
        : animation.playing
          ? connectionPhase(animation.phase, li)
          : 1;
    const activePhase = animation.resetting ? animation.phase : trace ? 1 : 0;

    const isLastConnection = li === layout.layers.length - 2;
    let dstNodeRelevance: Float32Array | null = null;
    if (trace && predictedClass >= 0 && !isLastConnection) {
      const nextModelLayer = model.layers[li + 1];
      if (nextModelLayer) {
        dstNodeRelevance = computeNodeRelevance(
          nextModelLayer.weights,
          nextModelLayer.inputUnits,
          dst.units,
          predictedClass,
        );
      }
    }

    drawSampledConnections(
      ctx,
      src,
      dst,
      getSampledEdges(model, li, src.units, dst.units),
      phase,
      activePhase,
      li,
      trace,
      predictedClass,
      dstNodeRelevance,
      timeMs,
      animatePulses,
      dimForFocus,
      swayTimeSec,
    );
  }
}

function drawTopologyScaffold(
  ctx: CanvasRenderingContext2D,
  layout: NetworkLayout,
  swayTimeSec = 0,
): void {
  for (let li = 0; li < layout.layers.length - 1; li++) {
    const src = layout.layers[li];
    const dst = layout.layers[li + 1];
    if (!src || !dst) continue;

    const path = new Path2D();
    const maxConnections = src.units > 100 ? 100 : 160;
    let drawn = 0;
    let seed = 12011 + li * 7919;

    for (let di = 0; di < dst.units && drawn < maxConnections; di++) {
      for (let si = 0; si < src.units && drawn < maxConnections; si++) {
        seed = (seed * 16807) % 2147483647;
        if ((seed % 32768) / 32768 > maxConnections / (src.units * dst.units)) continue;
        const source = src.nodes[si];
        const target = dst.nodes[di];
        if (!source || !target) continue;
        bundleCurveTo(path, source.x, source.y, target.x, target.y, src.centerX, dst.centerX, swayTimeSec);
        drawn++;
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.3;
    ctx.globalAlpha = 0.18;
    ctx.stroke(path);
    ctx.globalAlpha = 1;
  }
}

function drawSampledConnections(
  ctx: CanvasRenderingContext2D,
  src: LayerLayout,
  dst: LayerLayout,
  sampledEdges: SampledEdge[],
  phase: number,
  activePhase: number,
  modelLayerIndex: number,
  trace: ForwardTrace | null = null,
  predictedClass = -1,
  dstNodeRelevance: Float32Array | null = null,
  timeMs = 0,
  animatePulses = false,
  dimForFocus = false,
  swayTimeSec = 0,
): void {
  // Two depth planes for ambient lines: background thin plane + foreground plane
  const bgPosPath = new Path2D();
  const fgPosPath = new Path2D();
  const negPath = new Path2D();
  const activeEdges: Array<{ si: number; di: number; score: number; weight: number; depth: number }> = [];
  const idleStrongEdges: Array<{ si: number; di: number; mag: number; weight: number; depth: number }> = [];

  for (let idx = 0; idx < sampledEdges.length; idx++) {
    const edge = sampledEdges[idx];
    if (!edge) continue;
    const { si, di, w, depth } = edge;
    const srcNode = src.nodes[si];
    const dstNode = dst.nodes[di];
    if (!srcNode || !dstNode) continue;

    const path = w >= 0 ? (depth > 0.55 ? fgPosPath : bgPosPath) : negPath;
    bundleCurveTo(path, srcNode.x, srcNode.y, dstNode.x, dstNode.y, src.centerX, dst.centerX, swayTimeSec, depth);

    if (!trace) {
      idleStrongEdges.push({ si, di, mag: Math.abs(w), weight: w, depth });
    }

    const sourceActivation = trace
      ? modelLayerIndex === 0
        ? trace.input[si] ?? 0
        : trace.layerResults[modelLayerIndex - 1]?.activation[si] ?? 0
      : 0;
    const contribution = Math.abs(w * sourceActivation);

    const isLastLayer = trace && modelLayerIndex === trace.layerResults.length - 1;
    const targetRelevance = isLastLayer
      ? (di === predictedClass ? 1 : 0.06)
      : dstNodeRelevance
        ? (0.08 + (dstNodeRelevance[di] ?? 0) * 0.92)
        : 1;

    const score = contribution * targetRelevance;
    if (score > 0) {
      activeEdges.push({ si, di, score, weight: w, depth });
    }
  }

  activeEdges.sort((a, b) => b.score - a.score);

  const focusDim = dimForFocus ? 0.45 : 1;
  const layerColor = LAYER_COLORS[modelLayerIndex] ?? C.weightPos;
  const negativeLayerColor = lerpColor(C.weightNeg, layerColor, 0.22);

  // Background plane (recessed, thinner)
  ctx.lineWidth = 0.35;
  ctx.globalAlpha = (0.065 + phase * 0.09) * focusDim;
  ctx.strokeStyle = layerColor;
  ctx.stroke(bgPosPath);
  ctx.strokeStyle = negativeLayerColor;
  ctx.stroke(negPath);

  // Foreground plane (crisper)
  ctx.lineWidth = 0.55;
  ctx.globalAlpha = (0.11 + phase * 0.15) * focusDim;
  ctx.strokeStyle = layerColor;
  ctx.stroke(fgPosPath);

  const layerSignalRgb = LAYER_SIGNAL_RGB[modelLayerIndex] ?? '192, 192, 192';

  if (trace && activePhase > 0) {
    drawContributionTiers(ctx, src, dst, activeEdges, layerColor, negativeLayerColor, activePhase * focusDim, swayTimeSec);
    if (animatePulses && activeEdges.length > 0) {
      drawSignalStreaks(
        ctx,
        src,
        dst,
        activeEdges.slice(0, 18),
        layerSignalRgb,
        timeMs,
        modelLayerIndex,
        0.78 * activePhase * focusDim,
        0.66,
        0.22,
        1.35,
        swayTimeSec,
      );
    }
  } else if (!trace && animatePulses && idleStrongEdges.length > 0) {
    idleStrongEdges.sort((a, b) => b.mag - a.mag);
    drawSignalStreaks(
      ctx,
      src,
      dst,
      idleStrongEdges.slice(0, 12),
      layerSignalRgb,
      timeMs,
      modelLayerIndex,
      0.44 * focusDim,
      0.30,
      0.16,
      1.05,
      swayTimeSec,
    );
  }

  ctx.globalAlpha = 1;
}

/**
 * Draw sleek, directional light streaks that ride directly along the
 * cubic Bézier connection curves and inherit their layer's color identity.
 */
function drawSignalStreaks(
  ctx: CanvasRenderingContext2D,
  src: LayerLayout,
  dst: LayerLayout,
  edges: Array<{ si: number; di: number; depth: number }>,
  rgb: string,
  timeMs: number,
  layerIndex: number,
  maxAlpha: number,
  speedHz: number,
  span: number,
  lineWidth: number,
  swayTimeSec: number,
): void {
  const timeSec = timeMs * 0.001;
  const prevCap = ctx.lineCap;
  ctx.lineCap = 'round';
  ctx.lineWidth = lineWidth;
  ctx.globalAlpha = 1;

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge) continue;
    const s = src.nodes[edge.si];
    const d = dst.nodes[edge.di];
    if (!s || !d) continue;

    const [cp1x, cp1y, cp2x, cp2y] = bundleControlPoints(
      s.x, s.y, d.x, d.y, src.centerX, dst.centerX, swayTimeSec, edge.depth,
    );

    const offset = (i * 0.13 + layerIndex * 0.27) % 1;
    const raw = (timeSec * speedHz + offset) % (1 + span);
    const tHead = Math.min(1, raw);
    const tTail = Math.max(0, raw - span);
    if (tHead <= tTail + 0.01) continue;

    const envelope = Math.sin(((tHead + tTail) * 0.5) * Math.PI);
    const alpha = maxAlpha * Math.max(0.18, envelope);

    const [hx, hy] = cubicBezierAt(s.x, s.y, cp1x, cp1y, cp2x, cp2y, d.x, d.y, tHead);
    const [tx, ty] = cubicBezierAt(s.x, s.y, cp1x, cp1y, cp2x, cp2y, d.x, d.y, tTail);
    if ((hx - tx) * (hx - tx) + (hy - ty) * (hy - ty) < 4) continue;

    const grad = ctx.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, `rgba(${rgb}, 0)`);
    grad.addColorStop(0.55, `rgba(${rgb}, ${(alpha * 0.42).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${rgb}, ${alpha.toFixed(3)})`);

    ctx.strokeStyle = grad;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    const steps = 8;
    for (let k = 1; k <= steps; k++) {
      const tk = tTail + ((tHead - tTail) * k) / steps;
      const [px, py] = cubicBezierAt(s.x, s.y, cp1x, cp1y, cp2x, cp2y, d.x, d.y, tk);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.lineCap = prevCap;
}

function drawContributionTiers(
  ctx: CanvasRenderingContext2D,
  src: LayerLayout,
  dst: LayerLayout,
  edges: Array<{ si: number; di: number; score: number; weight: number; depth: number }>,
  positiveColor: string,
  negativeColor: string,
  phase: number,
  swayTimeSec = 0,
): void {
  const visibleEdges = edges.slice(0, Math.min(80, edges.length));
  const maxScore = visibleEdges[0]?.score ?? 1;

  for (let index = visibleEdges.length - 1; index >= 0; index--) {
    const edge = visibleEdges[index];
    if (!edge) continue;
    const source = src.nodes[edge.si];
    const target = dst.nodes[edge.di];
    if (!source || !target) continue;

    const relativeScore = edge.score / maxScore;
    const tier = index < 12 ? 'primary' : index < 48 ? 'secondary' : 'context';
    const opacity = tier === 'primary'
      ? 0.22 + phase * 0.65 * Math.max(0.6, relativeScore)
      : tier === 'secondary'
        ? 0.12 + phase * 0.28 * Math.max(0.4, relativeScore)
        : 0.06 + phase * 0.12 * Math.max(0.25, relativeScore);
    const width = tier === 'primary' ? 1.0 : tier === 'secondary' ? 0.65 : 0.4;

    const path = new Path2D();
    bundleCurveTo(path, source.x, source.y, target.x, target.y, src.centerX, dst.centerX, swayTimeSec, edge.depth);

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
  swayTimeSec = 0,
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
        nodeIndex, 'incoming', trace, layerIndex - 1, swayTimeSec);
    }
  }

  // Draw outgoing connections (to next layer)
  if (layerIndex < layout.layers.length - 1 && layerIndex < model.layers.length) {
    const modelLayer = model.layers[layerIndex];
    const srcLayout = layout.layers[layerIndex];
    const dstLayout = layout.layers[layerIndex + 1];
    if (modelLayer && srcLayout && dstLayout) {
      drawNodeConnections(ctx, srcLayout, dstLayout, modelLayer.weights, modelLayer.inputUnits,
        nodeIndex, 'outgoing', trace, layerIndex, swayTimeSec);
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
  swayTimeSec = 0,
): void {
  interface Edge { si: number; di: number; w: number; mag: number }
  const edges: Edge[] = [];

  if (direction === 'incoming') {
    for (let si = 0; si < src.units; si++) {
      const w = weights[focusIndex * inputUnits + si] ?? 0;
      edges.push({ si, di: focusIndex, w, mag: Math.abs(w) });
    }
  } else {
    for (let di = 0; di < dst.units; di++) {
      const w = weights[di * inputUnits + focusIndex] ?? 0;
      edges.push({ si: focusIndex, di, w, mag: Math.abs(w) });
    }
  }

  edges.sort((a, b) => b.mag - a.mag);
  const maxShow = src.units > 100 ? 28 : edges.length;
  const topEdges = edges.slice(0, maxShow);
  if (topEdges.length === 0) return;

  const maxMag = topEdges[0]?.mag ?? 1;

  const layerColor = LAYER_COLORS[_modelLayerIndex] ?? C.weightPos;
  const posColor = lerpColor(C.weightPos, layerColor, 0.38);

  for (const edge of topEdges) {
    const srcNode = src.nodes[edge.si];
    const dstNode = dst.nodes[edge.di];
    if (!srcNode || !dstNode) continue;

    const normMag = edge.mag / maxMag;
    const alpha = 0.22 + normMag * 0.65;
    const width = 0.55 + normMag * 2.1;

    ctx.strokeStyle = edge.w >= 0 ? posColor : C.weightNeg;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    const path = new Path2D();
    bundleCurveTo(path, srcNode.x, srcNode.y, dstNode.x, dstNode.y, src.centerX, dst.centerX, swayTimeSec);
    ctx.stroke(path);
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
  timeMs: number,
  animateNodes: boolean,
): void {
  for (let li = 0; li < layout.layers.length; li++) {
    const layer = layout.layers[li];
    if (!layer) continue;

    const layerPhase = animation.playing
      ? layerProgress(animation.phase, li)
      : animation.resetting
        ? animation.phase
        : 1;

    const isInput = li === 0 && layer.units === 784;

    if (isInput) {
      drawInputGrid(ctx, layer, trace, layerPhase);
    } else {
      drawHiddenOutputNodes(
        ctx, layer, li, trace, layerPhase, hover, selection, layout.layers.length, timeMs, animateNodes,
      );
    }
  }
}

function drawInputGrid(
  ctx: CanvasRenderingContext2D,
  layer: LayerLayout,
  trace: ForwardTrace | null,
  phase: number,
): void {
  const cellSize = layer.cellSize ?? 5;
  const half = cellSize / 2;
  const layerColor = LAYER_COLORS[0] ?? C.layerInput;

  for (let ni = 0; ni < layer.nodes.length; ni++) {
    const node = layer.nodes[ni];
    if (!node) continue;

    let fill: string;
    if (trace && phase > 0) {
      const val = (trace.input[ni] ?? 0) * phase;
      fill = lerpColor(C.gridEmpty, '#e4e4e4', Math.min(1, val * 1.15));
    } else {
      fill = lerpColor(C.gridEmpty, layerColor, 0.06);
    }

    ctx.fillStyle = fill;
    ctx.fillRect(node.x - half, node.y - half, cellSize, cellSize);
  }
  // No per-cell border — reduces visual noise. Draw a single outer border instead.
  if (layer.nodes.length > 0) {
    const first = layer.nodes[0];
    const last = layer.nodes[layer.nodes.length - 1];
    if (first && last) {
      const margin = half;
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(
        first.x - half - margin,
        first.y - half - margin,
        last.x - first.x + cellSize + margin * 2,
        last.y - first.y + cellSize + margin * 2,
      );
    }
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
  timeMs: number,
  animateNodes: boolean,
): void {
  const isOutput = layerIndex === totalLayers - 1;
  const baseRadius = isOutput ? 12 : (layer.units > 80 ? 2.1 : 3.5);
  const layerColor = LAYER_COLORS[layerIndex] ?? C.textSecondary;
  const predictedClass = trace?.predictedClass ?? -1;

  for (let ni = 0; ni < layer.nodes.length; ni++) {
    const node = layer.nodes[ni];
    if (!node) continue;

    const isHovered = hover?.layerIndex === layerIndex && hover.nodeIndex === ni;
    const isSelected = selection?.layerIndex === layerIndex && selection.nodeIndex === ni;
    const isPredicted = isOutput && ni === predictedClass;

    // For output nodes: use softmax probability as activation signal,
    // but only visually highlight the PREDICTED class with amber.
    // All other output nodes stay neutral regardless of their probability.
    let activationVal = 0;
    if (trace && layerIndex > 0 && phase > 0) {
      if (isOutput) {
        // Only the predicted class gets highlighted amber — others stay grey.
        activationVal = isPredicted ? (trace.probabilities[ni] ?? 0) * phase : 0;
      } else {
        const traceLayer = trace.layerResults[layerIndex - 1];
        activationVal = (traceLayer?.activation[ni] ?? 0) * phase;
      }
    }

    const depth = particleDepth(layerIndex, ni);
    const radius = isOutput
      ? baseRadius + (isHovered ? 1.5 : isSelected ? 1 : 0)
      : (baseRadius * (0.88 + depth * 0.18)) + (isHovered ? 2 : isSelected ? 1.5 : 0);
    const activeState = Math.min(1, activationVal * 2.2);
    const hoverIntensity = isHovered || isSelected ? 1 : 0;
    const illumination = Math.max(activeState, hoverIntensity);

    // Subtle soft luminance halo on active hidden neurons
    if (!isOutput && activeState > 0.12) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = layerColor;
      ctx.globalAlpha = activeState * 0.14;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Node fill — subtle radial dimensionality on active/hovered neurons
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);

    if (activationVal > 0.02) {
      const t = Math.min(1, activationVal * 2.2);
      if (!isOutput && t > 0.2) {
        const grad = ctx.createRadialGradient(
          node.x - radius * 0.25, node.y - radius * 0.25, 0,
          node.x, node.y, radius,
        );
        grad.addColorStop(0, lerpColor(layerColor, C.accentBright, 0.35 * t));
        grad.addColorStop(1, lerpColor(C.nodeIdle, layerColor, t * 0.85));
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = lerpColor(C.nodeIdle, layerColor, t);
      }
    } else if (isOutput) {
      // Output nodes: flat identical idle fill; subtle neutral lift for runner-up probs
      const prob = trace ? (trace.probabilities[ni] ?? 0) : 0;
      ctx.fillStyle = prob > 0.01
        ? lerpColor(C.nodeIdle, '#383838', Math.min(1, prob * 2.5))
        : C.nodeIdle;
    } else {
      ctx.fillStyle = lerpColor(C.nodeIdle, layerColor, depth * 0.12);
    }
    ctx.fill();

    // Ring / border
    ctx.strokeStyle = illumination > 0
      ? lerpColor(layerColor, C.accentBright, Math.min(1, activeState * 0.5 + hoverIntensity * 0.5))
      : activationVal > 0.02
        ? layerColor
        : C.nodeIdleBorder;
    ctx.lineWidth = illumination > 0 ? 1.2 : 0.75;
    // Output nodes: uniform ring alpha — no depth variation that makes some look pre-highlighted
    ctx.globalAlpha = illumination > 0 ? 0.9 : (isOutput ? 0.5 : 0.4 + depth * 0.22);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Centre dot — only for truly active or hovered nodes
    if (activationVal > 0.02 || isHovered || isSelected) {
      const shimmer = animateNodes && activeState > 0.15
        ? 0.92 + 0.08 * Math.sin(timeMs * 0.0038 + ni * 0.7)
        : 1;
      ctx.beginPath();
      ctx.arc(node.x, node.y, Math.max(0.6, radius * 0.26), 0, Math.PI * 2);
      ctx.fillStyle = C.accentBright;
      ctx.globalAlpha = Math.min(0.92, (0.22 + activeState * 0.62 + hoverIntensity * 0.2) * shimmer);
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
  // Tighter phase windows to match the reduced 1600ms total duration.
  const starts = [0, 0.18, 0.44, 0.68];
  const ends   = [0.22, 0.48, 0.72, 0.90];
  const start = starts[layerIndex] ?? 0;
  const end   = ends[layerIndex] ?? 1;
  if (phase <= start) return 0;
  if (phase >= end) return 1;
  const t = (phase - start) / (end - start);
  return t * t * (3 - 2 * t); // smoothstep
}

function connectionPhase(phase: number, layerIndex: number): number {
  const start = [0.10, 0.34, 0.58][layerIndex] ?? 0.78;
  const end   = [0.36, 0.58, 0.80][layerIndex] ?? 1;
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
  timeMs: number,
  animateBreath: boolean,
): void {
  const outputLayer = layout.layers[layout.layers.length - 1];
  if (!outputLayer || outputLayer.units > 12) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const predictedClass = trace?.predictedClass ?? -1;
  const breath = animateBreath ? 0.5 + 0.5 * Math.sin(timeMs * 0.0026) : 0.5;

  for (let ni = 0; ni < outputLayer.nodes.length; ni++) {
    const node = outputLayer.nodes[ni];
    if (!node) continue;

    const isPredicted = ni === predictedClass;

    if (isPredicted && trace) {
      // Restrained breathing outer ring around predicted node
      ctx.beginPath();
      ctx.arc(node.x, node.y, 15.5 + breath * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = C.layerOutput;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.16 + breath * 0.18;
      ctx.stroke();

      // Amber disc
      ctx.beginPath();
      ctx.arc(node.x, node.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = C.layerOutput;
      ctx.globalAlpha = 0.96;
      ctx.fill();

      // Subtle inner highlight ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, 11.2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 1;
      ctx.stroke();
    }

    // Digit label inside node — Inter sans, crisp contrast
    ctx.font = isPredicted
      ? '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
      : '500 10.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = isPredicted ? '#ffffff' : C.textSecondary;
    ctx.globalAlpha = isPredicted ? 1.0 : 0.72;
    ctx.fillText(`${ni}`, node.x, node.y + 0.5);

    // Probability readout + clean inline Predicted label
    if (trace) {
      const prob = trace.probabilities[ni] ?? 0;

      ctx.font = isPredicted
        ? '600 11px Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        : '400 10px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = isPredicted ? C.textPrimary : C.textTertiary;
      ctx.globalAlpha = isPredicted ? 0.96 : 0.55;
      ctx.fillText(`${(prob * 100).toFixed(1)}%`, node.x + 20, node.y);

      if (isPredicted) {
        ctx.font = '500 10px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillStyle = C.layerOutput;
        ctx.globalAlpha = 0.92;
        ctx.fillText('Predicted', node.x + 62, node.y);

        // Probability track + active fill
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.globalAlpha = 1;
        ctx.fillRect(node.x + 20, node.y + 9, 44, 2);

        ctx.fillStyle = C.layerOutput;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(node.x + 20, node.y + 9, prob * 44, 2);
      } else if (prob > 0.005) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
        ctx.globalAlpha = 0.7;
        ctx.fillRect(node.x + 20, node.y + 8, Math.max(2, prob * 36), 1.5);
      }
      ctx.textAlign = 'center';
    }

    ctx.globalAlpha = 1;
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

  ctx.font = '400 10.5px Inter, -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = C.textTertiary;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.globalAlpha = 0.65;

  const label = model
    ? `Filtered view · ${totalConns.toLocaleString()} connections · Hover to inspect`
    : `Topology scaffold · ${totalConns.toLocaleString()} possible connections`;

  ctx.fillText(label, w - 16, h - 14);
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
