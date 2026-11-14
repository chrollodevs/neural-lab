/**
 * App shell — workspace layout with header, tabs, run control, and tab content.
 * Central network visualization is always visible; tab panels overlay or sit beside it.
 */

import { Header } from './components/Header/Header';
import { TabNav } from './components/TabNav/TabNav';
import { RunControl } from './components/RunControl/RunControl';
import { NetworkCanvas } from './components/NetworkCanvas/NetworkCanvas';
import { useAppState } from './state';
import { useAppDispatch } from './state';

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

export function App() {
  const { activeTab } = useAppState();
  const dispatch = useAppDispatch();

  if (activeTab === 'about') {
    return <AboutTab onBack={() => dispatch({ type: 'SET_TAB', tab: 'network' })} />;
  }
  if (activeTab === 'explain') {
    return <ExplainTab onBack={() => dispatch({ type: 'SET_TAB', tab: 'network' })} />;
  }

  return (
    <div className="app-shell">
      <Header />
      <TabNav />
      <main className="app-main">
        <section className={`main-canvas ${activeTab === 'network' ? 'is-network' : 'has-panel'}`} aria-label="Network visualization">
          <div className="canvas-heading">
            <div className="canvas-title-block">
              <span className="canvas-kicker mono">MNIST / FORWARD PASS / 01</span>
              <h1>See what the model sees.</h1>
            </div>
            <div className="canvas-meta mono">
              <span className="meta-pulse" />
              {activeTab === 'network' ? 'STRUCTURE' : activeTab.toUpperCase()}
            </div>
          </div>
          <div className="canvas-stage">
            <NetworkCanvas />
            <div className="canvas-note mono" aria-hidden="true">
              <span>INPUT 784</span>
              <span className="note-arrow">→</span>
              <span>HIDDEN 128</span>
              <span className="note-arrow">→</span>
              <span>HIDDEN 64</span>
              <span className="note-arrow">→</span>
              <span>OUTPUT 10</span>
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
