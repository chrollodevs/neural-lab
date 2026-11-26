/**
 * Network layout — deterministic organic positions (D18, D14).
 *
 * Input: 28×28 pixel grid with proper spacing.
 * Hidden: clean vertical column with minimal jitter for legible connections.
 * Output: wide-spaced column with digit labels.
 *
 * Layout is computed from LayerInfo[], not hardcoded.
 * Positions are deterministic (seeded PRNG) and cached.
 */

import type { LayerInfo } from '../model/types';

export interface NodePosition {
  x: number;
  y: number;
  layerIndex: number;
  nodeIndex: number;
  /** For input layer: row/col in 28×28 grid */
  gridRow?: number;
  gridCol?: number;
}

export interface LayerLayout {
  name: string;
  units: number;
  activation: string;
  nodes: NodePosition[];
  centerX: number;
  centerY: number;
  /** Top and bottom bounds for drawing connection bands */
  topY: number;
  bottomY: number;
  /** For input grid: cell size in pixels */
  cellSize?: number;
}

export interface NetworkLayout {
  layers: LayerLayout[];
  width: number;
  height: number;
}

/** Deterministic PRNG (Lehmer) for organic jitter */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function computeLayout(
  layers: LayerInfo[],
  canvasWidth: number,
  canvasHeight: number,
): NetworkLayout {
  if (!Array.isArray(layers) || layers.length === 0) {
    return { layers: [], width: canvasWidth, height: canvasHeight };
  }

  const rand = seededRandom(31415);
  const pad = { top: 56, bottom: 44, left: 40, right: 124 };
  const usableW = Math.max(canvasWidth - pad.left - pad.right, 1);
  const usableH = Math.max(canvasHeight - pad.top - pad.bottom, 1);
  const layerCount = layers.length;

  // Horizontal centers — input layer gets a narrower share now.
  // Hidden layers get equal shares of the remaining space.
  const inputShare = 0.26;
  const remainShare = layerCount > 1 ? (1 - inputShare) / (layerCount - 1) : 0;
  const layerXFractions = layers.map((_, i) => {
    if (layerCount === 1) return 0.5;
    return i === 0 ? inputShare / 2 : inputShare + remainShare * (i - 0.5);
  });

  const layerLayouts: LayerLayout[] = [];

  for (let li = 0; li < layerCount; li++) {
    const layer = layers[li];
    if (!layer) continue;

    const centerX = pad.left + usableW * (layerXFractions[li] ?? 0);
    const nodes: NodePosition[] = [];
    let topY = Infinity;
    let bottomY = -Infinity;
    let cellSize: number | undefined;

    if (li === 0 && layer.units === 784) {
      // ── Input: 28×28 pixel grid — slightly reduced footprint ──
      const gridN = 28;
      const maxGridSize = Math.min(usableH * 0.80, usableW * inputShare * 0.95);
      cellSize = Math.max(4, Math.floor(maxGridSize / gridN));
      const gap = 0; // No gap — tighter grid looks cleaner
      const stride = cellSize + gap;
      const gridW = gridN * stride;
      const gridH = gridN * stride;
      const startX = centerX - gridW / 2;
      const startY = pad.top + (usableH - gridH) / 2;

      for (let row = 0; row < gridN; row++) {
        for (let col = 0; col < gridN; col++) {
          const x = startX + col * stride + cellSize / 2;
          const y = startY + row * stride + cellSize / 2;
          nodes.push({ x, y, layerIndex: li, nodeIndex: row * gridN + col, gridRow: row, gridCol: col });
          if (y < topY) topY = y;
          if (y > bottomY) bottomY = y;
        }
      }
    } else if (layer.units <= 12) {
      // ── Output layer: wide spacing, centered, NO jitter for clean label rendering ──
      const spacing = Math.min(usableH / (layer.units + 1), 46);
      const colH = spacing * (layer.units - 1);
      const startY = pad.top + (usableH - colH) / 2;

      for (let ni = 0; ni < layer.units; ni++) {
        const y = startY + ni * spacing;
        nodes.push({ x: centerX, y, layerIndex: li, nodeIndex: ni });
        if (y < topY) topY = y;
        if (y > bottomY) bottomY = y;
      }
      // Consume rand calls to keep sequence consistent
      for (let ni = 0; ni < layer.units; ni++) { rand(); rand(); }
    } else {
      // ── Hidden layers: clean column with very subtle jitter only on X ──
      // Keeping nodes in a tight vertical column makes connections much cleaner.
      const maxSpacing = layer.units > 80 ? 5.2 : 7.8;
      const spacing = Math.min(usableH / (layer.units + 1.4), maxSpacing);
      const colH = spacing * (layer.units - 1);
      const startY = pad.top + (usableH - colH) / 2;

      // Very gentle sine curve — just enough to signal it's a curved column,
      // not so much that it creates visual chaos.
      const curveAmp = Math.min(10, usableW * 0.008);

      for (let ni = 0; ni < layer.units; ni++) {
        const t = layer.units > 1 ? ni / (layer.units - 1) : 0.5;
        const curveX = Math.sin(t * Math.PI) * curveAmp;
        // Minimal X jitter only — Y jitter creates uneven vertical spacing
        // that makes straight connections look messier.
        const jx = (rand() - 0.5) * 2;
        rand(); // consume Y slot for PRNG consistency
        const y = startY + ni * spacing;
        nodes.push({ x: centerX + curveX + jx, y, layerIndex: li, nodeIndex: ni });
        if (y < topY) topY = y;
        if (y > bottomY) bottomY = y;
      }
    }

    layerLayouts.push({
      name: layer.name,
      units: layer.units,
      activation: layer.activation,
      nodes,
      centerX,
      centerY: pad.top + usableH / 2,
      topY,
      bottomY,
      cellSize,
    });
  }

  return { layers: layerLayouts, width: canvasWidth, height: canvasHeight };
}
