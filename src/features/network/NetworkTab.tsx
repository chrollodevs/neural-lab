/**
 * Network tab — the contextual rail for the Canvas 2D graph (D14).
 * The canvas itself is owned by the application shell.
 */

import { useAppState } from '../../state';
import './NetworkTab.css';

export function NetworkTab() {
  const { modelStatus, selectedNode } = useAppState();
  const layers = modelStatus.state === 'loaded'
    ? modelStatus.model.meta.layers
    : [
        { name: 'input', units: 784, activation: 'none' },
        { name: 'hidden_1', units: 128, activation: 'relu' },
        { name: 'hidden_2', units: 64, activation: 'relu' },
        { name: 'output', units: 10, activation: 'softmax' },
      ];

  return (
    <div className="network-tab">
      <div className="rail-intro">
        <span className="section-label mono">Network map</span>
        <h2>One pass, four layers.</h2>
        <p>Explore the shape of the classifier before you run it. Activity appears only when a real trace exists.</p>
      </div>
      <div className="layer-list" aria-label="Network layers">
        {layers.map((layer, index) => (
          <div className={`layer-row layer-${index}`} key={layer.name}>
            <span className="layer-index mono">0{index + 1}</span>
            <span className="layer-marker" />
            <span className="layer-copy">
              <strong>{layer.name.replace('_', ' ')}</strong>
              <small className="mono">{layer.units} units · {layer.activation}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="network-inspector">
        <span className="section-label mono">Selection</span>
        {selectedNode ? (
          <div className="selection-readout mono">
            <strong>Node {selectedNode.nodeIndex}</strong>
            <span>Layer {selectedNode.layerIndex + 1}</span>
            <small>Run inference to inspect activation values.</small>
          </div>
        ) : (
          <p>Hover a node, then click to pin its inspection state.</p>
        )}
      </div>
      <div className="network-legend">
        <span className="section-label mono">Display rule</span>
        <p>Connections are filtered for legibility. The underlying dense adjacency is unchanged.</p>
      </div>
    </div>
  );
}
