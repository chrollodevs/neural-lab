/**
 * App shell — workspace layout with unified header, central network visualization,
 * and contextual side panel.
 */

import { Header } from './components/Header/Header';
import { RunControl } from './components/RunControl/RunControl';
import { NetworkCanvas } from './components/NetworkCanvas/NetworkCanvas';
import { useAppState, useAppDispatch } from './state';

import { OverviewTab } from './features/overview/OverviewTab';
import { NetworkTab } from './features/network/NetworkTab';
import { ActivationsTab } from './features/activations/ActivationsTab';
import { ExplainTab } from './features/explain/ExplainTab';
import { InputTab } from './features/input/InputTab';
import { AboutTab } from './features/about/AboutTab';

import './App.css';

function TabContent() {
  const { activeTab } = useAppState();

  switch (activeTab) {
    case 'overview':
      return <OverviewTab />;
    case 'network':
      return <NetworkTab />;
    case 'activations':
      return <ActivationsTab />;
    case 'explain':
      return null;
    case 'input':
      return <InputTab />;
    default:
      return <NetworkTab />;
  }
}

const TAB_TITLES: Record<string, string> = {
  network: 'Structure',
  overview: 'Overview',
  activations: 'Activations',
  input: 'Input',
};

export function App() {
  const { activeTab } = useAppState();
  const dispatch = useAppDispatch();

  if (activeTab === 'about') {
    return <AboutTab onBack={() => dispatch({ type: 'SET_TAB', tab: 'network' })} />;
  }
  if (activeTab === 'explain') {
    return <ExplainTab onBack={() => dispatch({ type: 'SET_TAB', tab: 'network' })} />;
  }

  const modeLabel = TAB_TITLES[activeTab] ?? activeTab;

  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <section className={`main-canvas ${activeTab === 'network' ? 'is-network' : 'has-panel'}`} aria-label="Network visualization">
          <div className="canvas-heading">
            <div className="canvas-title-block">
              <span className="canvas-kicker">MNIST Forward Pass</span>
              <h1>See what the model sees.</h1>
            </div>
            <span className="canvas-meta">{modeLabel}</span>
          </div>
          <div className="canvas-stage">
            <NetworkCanvas />
            <div className="canvas-note" aria-label="Network architecture: 784 inputs, 128 hidden, 64 hidden, 10 outputs">
              <span>Input <strong>784</strong></span>
              <span className="note-arrow" aria-hidden="true">→</span>
              <span>Hidden <strong>128</strong></span>
              <span className="note-arrow" aria-hidden="true">→</span>
              <span>Hidden <strong>64</strong></span>
              <span className="note-arrow" aria-hidden="true">→</span>
              <span>Output <strong className="is-output">10</strong></span>
            </div>
          </div>
          <div className="stage-footer">
            <span className="stage-caption">A small instrument for looking closely at a real neural network.</span>
            <RunControl />
          </div>
          <div className={`environment-panel environment-${activeTab}`}>
            <TabContent />
          </div>
        </section>
      </main>
    </div>
  );
}
