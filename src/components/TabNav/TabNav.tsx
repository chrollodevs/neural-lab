/**
 * Tab navigation — compact horizontal tabs under the header (D3).
 * Six tabs: Overview · Network · Activations · Explain · Input · About
 * No motion on tab switch (DESIGN_DIRECTION.md — high-frequency interaction).
 */

import { useAppState, useAppDispatch, type TabId } from '../../state';
import './TabNav.css';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'network', label: 'Network' },
  { id: 'activations', label: 'Activations' },
  { id: 'explain', label: 'Explain' },
  { id: 'input', label: 'Input' },
  { id: 'about', label: 'About' },
];

export function TabNav() {
  const { activeTab } = useAppState();
  const dispatch = useAppDispatch();

  return (
    <nav className="tab-nav" role="tablist">
      {TABS.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          aria-selected={activeTab === id}
          className={`tab-item ${activeTab === id ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_TAB', tab: id })}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
