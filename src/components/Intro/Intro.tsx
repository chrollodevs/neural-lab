/**
 * Cinematic intro — first-visit only.
 *
 * Sequence (total ~1.8s):
 *   0ms       — overlay visible, wordmark fades in (200ms)
 *   200–650ms — wordmark held
 *   650ms     — wordmark fades out + drifts up (220ms)
 *   870ms     — overlay slides upward off-screen (750ms, expo easing)
 *   1620ms    — component unmounts; flag written to localStorage
 *
 * Bypass: click, tap, or any key dismisses immediately.
 * Reduced-motion: entire sequence is skipped; overlay is never shown.
 * Replay: call clearIntroFlag() then reload (exposed for About tab).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './Intro.css';

const STORAGE_KEY = 'nl_intro_seen';

export function clearIntroFlag(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('nl_intro_seen');
    localStorage.removeItem('nl_intro_seen_v2');
  } catch { /* ignore */ }
}

/** Returns true if the intro has already been seen in this browser session. */
function alreadySeen(): boolean {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return true; }
}

/** Mark the intro as seen for this browser session. */
function markSeen(): void {
  try { sessionStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
}

type Phase = 'wordmark-in' | 'hold' | 'wordmark-out' | 'overlay-out' | 'done';

export function Intro() {
  // Synchronously determine whether to show at all.
  // Using a ref so we can call it once without triggering a re-render.
  const shouldShow = useRef(
    !alreadySeen() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const [phase, setPhase] = useState<Phase>(shouldShow.current ? 'wordmark-in' : 'done');

  const dismiss = useCallback(() => {
    setPhase('done');
    markSeen();
  }, []);

  useEffect(() => {
    if (!shouldShow.current) return;

    // Timing constants (ms) — extended by ~1s to feel deliberate
    const T_WMARK_OUT  = 1650;  // when wordmark starts to exit (hold ~1450ms)
    const T_OVERLAY    = 1870;  // when overlay starts sliding up
    const T_DONE       = 2680; // when component unmounts

    const timers = [
      setTimeout(() => setPhase('hold'),        200),
      setTimeout(() => setPhase('wordmark-out'), T_WMARK_OUT),
      setTimeout(() => setPhase('overlay-out'), T_OVERLAY),
      setTimeout(() => { setPhase('done'); markSeen(); }, T_DONE),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={`intro intro--${phase}`}
      onClick={dismiss}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') dismiss();
      }}
      role="presentation"
      aria-hidden="true"
      tabIndex={-1}
    >
      <div className="intro__wordmark">
        <span className="intro__name">Neural Lab</span>
        <span className="intro__sub">Interactive Neural Network Visualization</span>
      </div>
      <span className="intro__hint">click to skip</span>
    </div>
  );
}
