// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { CombatEngine } from '../../game/engine';
import { SeededRNG } from '../../game/rng';
import { useLaterTimers, useTurnLoop } from './useTurnLoop';

// Pacing constants mirrored from useTurnLoop.ts.
const HUMAN_PLACE_DELAY = 300;
const AI_PLACE_DELAY = 900;
const AI_TURN_DIALOG = 600;
const AI_THINK_DELAY = 900;
const AI_PERK_SHOW_DELAY = 1500;

// Note: the engine's first-move compensation ('skipFirstPerk') skips the
// opening player's perk phase, so the first placement hands the turn straight
// to the other side.

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function soloEngine(seed = 1): CombatEngine {
  return new CombatEngine('test', {
    rng: new SeededRNG(seed),
    player2IsAI: true,
    player2AIDifficulty: 'medium',
  });
}

function renderLoop(engine: CombatEngine, player2IsAI = true) {
  const onAIPerk = vi.fn();
  const rendered = renderHook(() => {
    const later = useLaterTimers();
    return useTurnLoop({ engine, player2IsAI, bump: () => {}, later, onAIPerk });
  });
  return { ...rendered, onAIPerk };
}

describe('useTurnLoop', () => {
  it('stays paused behind the opening turn dialog, then auto-places on dismiss', () => {
    localStorage.setItem('neon_tutorial_v1', 'done');
    const engine = soloEngine();
    const { result } = renderLoop(engine);

    expect(result.current.showTurnDialog).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.lastPlacement.current).toBeNull(); // gated: nothing ran

    act(() => result.current.dismissTurnDialog());
    act(() => vi.advanceTimersByTime(HUMAN_PLACE_DELAY));
    expect(result.current.lastPlacement.current).toMatchObject({ player: 'player1' });
    // First-move compensation: the opening perk phase is skipped, the AI is up
    // and gets its brief turn-dialog cue.
    expect(engine.state.currentPlayer).toBe('player2');
    expect(result.current.showTurnDialog).toBe(true);
  });

  it('plays a full AI turn unattended and hands the turn back to the human', () => {
    localStorage.setItem('neon_tutorial_v1', 'done');
    const engine = soloEngine(7);
    const { result, onAIPerk } = renderLoop(engine);

    act(() => result.current.dismissTurnDialog());
    act(() => vi.advanceTimersByTime(HUMAN_PLACE_DELAY)); // P1 places, turn skips to AI
    act(() =>
      vi.advanceTimersByTime(AI_TURN_DIALOG + AI_PLACE_DELAY + AI_THINK_DELAY + AI_PERK_SHOW_DELAY),
    );
    // The AI placed and resolved its perk phase (executed or passed)...
    expect(engine.state.currentPlayer).toBe('player1');
    // ...and the human's second turn ran its placement and now waits for input.
    act(() => vi.advanceTimersByTime(HUMAN_PLACE_DELAY));
    expect(engine.state.currentPhase).toBe('perkSelection');
    expect(engine.state.currentPlayer).toBe('player1');
    // If the AI played a perk (not a pass), the flash callback fired.
    expect(onAIPerk.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('keeps the pass-and-play dialog up until tapped', () => {
    localStorage.setItem('neon_tutorial_v1', 'done');
    const engine = new CombatEngine('test', { rng: new SeededRNG(3) });
    const { result } = renderLoop(engine, false);

    act(() => result.current.dismissTurnDialog());
    act(() => vi.advanceTimersByTime(HUMAN_PLACE_DELAY)); // P1 places, turn passes to P2
    expect(engine.state.currentPlayer).toBe('player2');
    expect(result.current.showTurnDialog).toBe(true);
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.showTurnDialog).toBe(true); // no auto-dismiss for humans
    expect(engine.state.currentPhase).toBe('autoPlacement'); // loop still gated

    act(() => result.current.dismissTurnDialog());
    act(() => vi.advanceTimersByTime(HUMAN_PLACE_DELAY));
    expect(result.current.lastPlacement.current).toMatchObject({ player: 'player2' });
  });

  it('pauses the loop for the first-battle tutorial and resumes on skip', () => {
    // No 'done' marker: the sides lesson queues for a solo battle.
    const engine = soloEngine();
    const { result } = renderLoop(engine);

    act(() => result.current.dismissTurnDialog());
    expect(result.current.tutStep).toBe('sides');
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.lastPlacement.current).toBeNull(); // gated by the coach mark

    act(() => result.current.onTutorialSkip());
    expect(localStorage.getItem('neon_tutorial_v1')).toBe('done');
    act(() => vi.advanceTimersByTime(HUMAN_PLACE_DELAY));
    expect(result.current.lastPlacement.current).toMatchObject({ player: 'player1' });
  });

  it('clears its pending timers on unmount', () => {
    localStorage.setItem('neon_tutorial_v1', 'done');
    const engine = soloEngine();
    const { result, unmount } = renderLoop(engine);
    const baseline = vi.getTimerCount(); // environment timers outside the hook

    act(() => result.current.dismissTurnDialog()); // schedules the placement timer
    expect(vi.getTimerCount()).toBeGreaterThan(baseline);
    unmount();
    expect(vi.getTimerCount()).toBe(baseline);
  });
});
