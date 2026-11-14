/**
 * Forward-pass propagation animation (D20).
 *
 * Controls a layer-by-layer reveal of a stored ForwardTrace.
 * Computes once, animates the frozen result. Never re-runs inference.
 *
 * Animation phases:
 *   0.0 = idle (no animation)
 *   0.0–0.18 = input layer lights up
 *   0.18–0.42 = hidden 1 activates
 *   0.42–0.66 = hidden 2 activates
 *   0.66–0.86 = output layer reveals
 *   0.86–1.0 = final settling
 *   1.0 = complete (all layers visible)
 *
 * Reduced-motion: snaps to phase 1.0 immediately.
 */

export interface AnimationState {
  /** 0 = not started, 1 = complete */
  phase: number;
  /** Which layer index is currently "arriving" (for connection highlight) */
  activeLayerIndex: number;
  /** Whether animation is playing */
  playing: boolean;
  /** True while an explicit input clear is returning the frozen trace to idle. */
  resetting: boolean;
}

export const IDLE_ANIMATION: AnimationState = {
  phase: 1,
  activeLayerIndex: -1,
  playing: false,
  resetting: false,
};

export const START_ANIMATION: AnimationState = {
  phase: 0,
  activeLayerIndex: 0,
  playing: true,
  resetting: false,
};

const TOTAL_DURATION_MS = 3400;

/**
 * Create an animation controller.
 * Call `tick()` on each requestAnimationFrame.
 * Call `skip()` to jump to the end.
 */
export function createPropagationAnimation(
  layerCount: number,
  reducedMotion: boolean,
  onUpdate: (state: AnimationState) => void,
  onComplete: () => void,
): { start: () => void; skip: () => void; cancel: () => void } {
  let startTime = 0;
  let rafId = 0;
  let cancelled = false;

  function tick(now: number) {
    if (cancelled) return;
    const elapsed = now - startTime;
    const rawPhase = Math.min(1, elapsed / TOTAL_DURATION_MS);

    // Keep the presentation deliberate; the renderer eases each layer locally.
    const phase = rawPhase;
    const activeLayerIndex = Math.min(
      layerCount - 1,
      Math.floor(phase * layerCount),
    );

    onUpdate({ phase, activeLayerIndex, playing: true, resetting: false });

    if (rawPhase < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      onUpdate(IDLE_ANIMATION);
      onComplete();
    }

  }

  return {
    start() {
      cancelled = false;
      if (reducedMotion) {
        onUpdate(IDLE_ANIMATION);
        onComplete();
        return;
      }
      startTime = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    skip() {
      cancelled = true;
      cancelAnimationFrame(rafId);
      onUpdate(IDLE_ANIMATION);
      onComplete();
    },
    cancel() {
      cancelled = true;
      cancelAnimationFrame(rafId);
    },
  };
}

export function createClearAnimation(
  reducedMotion: boolean,
  onUpdate: (state: AnimationState) => void,
  onComplete: () => void,
): { start: () => void; cancel: () => void } {
  let startTime = 0;
  let rafId = 0;
  let cancelled = false;
  const duration = 520;

  function tick(now: number) {
    if (cancelled) return;
    const progress = Math.min(1, (now - startTime) / duration);
    const phase = 1 - (progress * progress * (3 - 2 * progress));
    onUpdate({ phase, activeLayerIndex: -1, playing: false, resetting: true });
    if (progress < 1) {
      rafId = requestAnimationFrame(tick);
    } else {
      onUpdate(IDLE_ANIMATION);
      onComplete();
    }
  }

  return {
    start() {
      cancelled = false;
      if (reducedMotion) {
        onUpdate(IDLE_ANIMATION);
        onComplete();
        return;
      }
      startTime = performance.now();
      rafId = requestAnimationFrame(tick);
    },
    cancel() {
      cancelled = true;
      cancelAnimationFrame(rafId);
    },
  };
}
