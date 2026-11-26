/**
 * Tab navigation — floating capsule tabs integrated into the header.
 * Six tabs: Overview · Network · Activations · Explain · Input · About
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
    <nav className="tab-nav" role="tablist" aria-label="Workspace sections">
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
