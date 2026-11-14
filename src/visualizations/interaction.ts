/**
 * Canvas interaction — hit testing, hover, selection (D14).
 *
 * Pure functions, no DOM. The NetworkCanvas component calls these
 * on mouse events and passes the results to the renderer.
 */

import type { NetworkLayout, NodePosition } from './layout';

export interface HoveredNode {
  layerIndex: number;
  nodeIndex: number;
  node: NodePosition;
  /** Screen-space position for tooltip placement */
  screenX: number;
  screenY: number;
}

export interface SelectedNode {
  layerIndex: number;
  nodeIndex: number;
}

/**
 * Find the closest node to the given canvas-space coordinates.
 * Returns null if no node is within the hit radius.
 */
export function hitTest(
  layout: NetworkLayout,
  canvasX: number,
  canvasY: number,
): HoveredNode | null {
  let closest: HoveredNode | null = null;
  let closestDist = Infinity;

  for (let li = 0; li < layout.layers.length; li++) {
    const layer = layout.layers[li];
    if (!layer) continue;

    // Input layer: use grid-based hit testing (cells are squares)
    const isInput = li === 0 && layer.units === 784;
    const hitRadius = isInput
      ? (layer.cellSize ?? 6) * 0.6
      : layer.units > 32
        ? 8
        : 14;

    for (let ni = 0; ni < layer.nodes.length; ni++) {
      const node = layer.nodes[ni];
      if (!node) continue;

      const dx = canvasX - node.x;
      const dy = canvasY - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < hitRadius && dist < closestDist) {
        closestDist = dist;
        closest = {
          layerIndex: li,
          nodeIndex: ni,
          node,
          screenX: node.x,
          screenY: node.y,
        };
      }
    }
  }

  return closest;
}

