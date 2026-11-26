import { useCallback, useEffect, useRef, useState } from 'react';
import './NetworkViewer.css';

// model-viewer is a Google web component — loaded via CDN script tag at runtime.
// It is not bundled; this avoids adding Three.js to the main chunk.
//
// SCROLL & ZOOM ARCHITECTURE
// --------------------------
// Normal mouse-wheel scrolling over the 3D viewer always scrolls the page
// (.explain-page), never hijacking vertical navigation.
//
// Zooming the 3D model remains available via two non-conflicting methods:
//   1. Dedicated − / + zoom buttons in the viewer toolbar.
//   2. Modifier-key scrolling (Ctrl / Alt / Cmd + wheel) over the viewer.
//
// Drag-to-rotate works directly on <model-viewer> via pointer events.

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.HTMLAttributes<HTMLElement> & {
        ref?: React.Ref<HTMLElement>;
        src?: string;
        alt?: string;
        'camera-controls'?: '' | boolean;
        'auto-rotate'?: '' | boolean;
        'rotation-per-second'?: string;
        'shadow-intensity'?: string;
        exposure?: string;
        'camera-orbit'?: string;
        'field-of-view'?: string;
        loading?: string;
        'disable-zoom'?: '' | boolean;
      };
    }
  }
}

const MODEL_VIEWER_SRC =
  'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';

const DEFAULT_FOV = 30;
const MIN_FOV = 12;
const MAX_FOV = 60;
const FOV_STEP = 5;

function clampFov(fov: number): number {
  return Math.max(MIN_FOV, Math.min(MAX_FOV, fov));
}

function useModelViewerScript() {
  const [ready, setReady] = useState(() =>
    typeof customElements !== 'undefined' &&
    customElements.get('model-viewer') !== undefined,
  );

  useEffect(() => {
    if (ready) return;
    if (document.querySelector(`script[src="${MODEL_VIEWER_SRC}"]`)) {
      const existing = document.querySelector(
        `script[src="${MODEL_VIEWER_SRC}"]`,
      ) as HTMLScriptElement;
      existing.addEventListener('load', () => setReady(true));
      return;
    }
    const script = document.createElement('script');
    script.type = 'module';
    script.src = MODEL_VIEWER_SRC;
    script.onload = () => setReady(true);
    script.onerror = () => setReady(false);
    document.head.appendChild(script);
  }, [ready]);

  return ready;
}

/** Walk up the DOM and return the first element that can actually scroll vertically. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const overflow = style.overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function NetworkViewer() {
  const scriptReady = useModelViewerScript();
  const viewerRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fov, setFov] = useState(DEFAULT_FOV);

  const applyFov = useCallback((nextFov: number) => {
    const clamped = clampFov(nextFov);
    setFov(clamped);
    const el = viewerRef.current as (HTMLElement & { fieldOfView?: string }) | null;
    if (el) {
      el.fieldOfView = `${clamped}deg`;
    }
  }, []);

  // Intercept wheel events on the stage in capture phase:
  // - With Ctrl/Alt/Meta pressed: zoom the 3D model.
  // - Otherwise: forward scroll delta to the page's scroll container (.explain-page).
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function onWheel(e: WheelEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? FOV_STEP : -FOV_STEP;
        setFov((prev) => {
          const next = clampFov(prev + delta);
          const el = viewerRef.current as (HTMLElement & { fieldOfView?: string }) | null;
          if (el) el.fieldOfView = `${next}deg`;
          return next;
        });
        return;
      }

      const scroller = findScrollParent(stage!);
      if (scroller) {
        scroller.scrollBy({ top: e.deltaY, left: 0, behavior: 'auto' });
        e.preventDefault();
        e.stopPropagation();
      }
    }

    stage.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => stage.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  const handleZoomIn = useCallback(() => {
    applyFov(fov - FOV_STEP);
  }, [applyFov, fov]);

  const handleZoomOut = useCallback(() => {
    applyFov(fov + FOV_STEP);
  }, [applyFov, fov]);

  const handleReset = useCallback(() => {
    setFov(DEFAULT_FOV);
    const el = viewerRef.current as HTMLElement & {
      resetTurntableRotation?: (value?: number) => void;
      cameraOrbit?: string;
      fieldOfView?: string;
    };
    if (!el) return;
    el.cameraOrbit = '0deg 75deg 105%';
    el.fieldOfView = `${DEFAULT_FOV}deg`;
    if (typeof el.resetTurntableRotation === 'function') {
      el.resetTurntableRotation(0);
    }
  }, []);

  return (
    <div className="nv-root">
      <div className="nv-stage" ref={stageRef}>
        {scriptReady ? (
          <model-viewer
            ref={viewerRef as React.Ref<HTMLElement>}
            src={`${import.meta.env.BASE_URL}neural-network.glb`}
            alt="Interactive 3D neural network model"
            camera-controls=""
            auto-rotate=""
            rotation-per-second="6deg"
            shadow-intensity="0"
            exposure="0.9"
            camera-orbit="0deg 75deg 105%"
            field-of-view={`${DEFAULT_FOV}deg`}
            loading="eager"
            disable-zoom=""
            style={{ width: '100%', height: '100%', background: 'transparent' }}
          />
        ) : (
          <div className="nv-loading" aria-label="Loading 3D model">
            <span className="nv-loading-dot" />
            <span className="nv-loading-dot" />
            <span className="nv-loading-dot" />
          </div>
        )}
      </div>

      <div className="nv-toolbar">
        <div className="nv-actions">
          <button
            type="button"
            className="nv-btn"
            onClick={handleZoomIn}
            disabled={fov <= MIN_FOV}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="nv-btn"
            onClick={handleZoomOut}
            disabled={fov >= MAX_FOV}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="nv-reset"
            onClick={handleReset}
            title="Reset camera view"
            aria-label="Reset camera view"
          >
            Reset view
          </button>
        </div>
        <p className="nv-hint">Drag to rotate · Ctrl+Scroll or +/− to zoom</p>
      </div>
    </div>
  );
}
