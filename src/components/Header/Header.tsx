/**
 * App header — compact wordmark and model status indicator (D6).
 * Not a marketing hero. Minimal chrome.
 */

import { useAppState } from '../../state';
import './Header.css';

export function Header() {
  const { modelStatus } = useAppState();

  const statusText = (() => {
    switch (modelStatus.state) {
      case 'absent':
        return 'No model loaded';
      case 'loading':
        return 'Loading model…';
      case 'loaded':
        return `Model ready · ${modelStatus.model.meta.totalParameters.toLocaleString()} parameters`;
      case 'error':
        return `Model error: ${modelStatus.error}`;
    }
  })();

  const statusClass = modelStatus.state === 'loaded' ? 'ready' : modelStatus.state === 'error' ? 'error' : 'inactive';

  return (
    <header className="app-header">
      <div className="header-wordmark">
        <span className="header-title">Neural Lab</span>
        <span className="header-subtitle">MNIST MLP Explorer</span>
      </div>
      <div className={`header-status ${statusClass}`} aria-label={statusText} title={statusText}>
        <span className="status-dot" />
      </div>
    </header>
  );
}
