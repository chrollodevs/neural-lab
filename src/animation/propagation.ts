/**
 * Forward-pass propagation animation (D20).
 *
 * Controls a layer-by-layer reveal of a stored ForwardTrace.
 * Computes once, animates the frozen result. Never re-runs inference.
 *
 * Animation phases:
 *   0.0 = idle (no animation)
 *   0.0–0.20 = input layer lights up
 *   0.20–0.45 = hidden 1 activates
 *   0.45–0.70 = hidden 2 activates
 *   0.70–0.88 = output layer reveals
 *   0.88–1.0  = final settling
 *   1.0 = complete (all layers visible)
 *
 * Reduced-motion: snaps to phase 1.0 immediately.
 *
 * Reliability fix: animation uses a closure-local startTime set at RAF fire
 * time (not at start() call time), preventing stale timing on slower machines.
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

// Reduced from 3400ms → 1600ms for a noticeably faster, more fluid feel.
const TOTAL_DURATION_MS = 1600;

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
  let startTime = -1; // -1 = not yet set; set on first RAF tick
  let rafId = 0;
  let cancelled = false;

  function tick(now: number) {
    if (cancelled) return;

    // Set startTime on the first actual RAF tick — this is the fix for
    // machines where performance.now() at start() and at first RAF differ
    // significantly, causing the animation to appear skipped.
    if (startTime < 0) {
      startTime = now;
    }

    const elapsed = now - startTime;
    const rawPhase = Math.min(1, elapsed / TOTAL_DURATION_MS);
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
      startTime = -1; // Reset so first tick initialises it
      if (reducedMotion) {
        onUpdate(IDLE_ANIMATION);
        onComplete();
        return;
      }
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
  let startTime = -1;
  let rafId = 0;
  let cancelled = false;
  const duration = 400; // slightly faster clear too

  function tick(now: number) {
    if (cancelled) return;
    if (startTime < 0) startTime = now;
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
      startTime = -1;
      if (reducedMotion) {
        onUpdate(IDLE_ANIMATION);
        onComplete();
        return;
      }
      rafId = requestAnimationFrame(tick);
    },
    cancel() {
      cancelled = true;
      cancelAnimationFrame(rafId);
    },
  };
}
