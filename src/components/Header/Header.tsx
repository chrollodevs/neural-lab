/**
 * App header — unified top bar combining brand identity, capsule navigation,
 * and restrained model status.
 */

import { useAppState } from '../../state';
import { TabNav } from '../TabNav/TabNav';
import './Header.css';

export function Header() {
  const { modelStatus } = useAppState();

  const statusInfo = (() => {
    switch (modelStatus.state) {
      case 'absent':
        return { label: 'No model', detail: null };
      case 'loading':
        return { label: 'Loading…', detail: null };
      case 'loaded':
        return {
          label: 'Model ready',
          detail: `${modelStatus.model.meta.totalParameters.toLocaleString()} params`,
        };
      case 'error':
        return { label: 'Model error', detail: modelStatus.error };
    }
  })();

  const statusClass =
    modelStatus.state === 'loaded'
      ? 'ready'
      : modelStatus.state === 'error'
        ? 'error'
        : 'inactive';

  const ariaText = statusInfo.detail
    ? `${statusInfo.label} · ${statusInfo.detail}`
    : statusInfo.label;

  return (
    <header className="app-header">
      <div className="header-wordmark">
        <span className="header-title">Neural Lab</span>
      </div>

      <div className="header-nav">
        <TabNav />
      </div>

      <div className={`header-status ${statusClass}`} aria-label={ariaText} title={ariaText}>
        <span className="status-label">{statusInfo.label}</span>
        {statusInfo.detail && (
          <>
            <span className="status-sep" aria-hidden="true">·</span>
            <span className="status-detail">{statusInfo.detail}</span>
          </>
        )}
      </div>
    </header>
  );
}
