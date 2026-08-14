// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Combat } from './Combat';
import { TUTORIAL_AI_DIFFICULTY, tutorialPlayerTeam, tutorialRivalTeam } from '../tutorialLevel';
import { LESSON_COUNT } from '../tutorialScript';

// Pacing constants mirrored from useTurnLoop.ts.
const HUMAN_PLACE_DELAY = 300;
const AI_TURN_DIALOG = 600;
const AI_PLACE_DELAY = 900;
const AI_THINK_DELAY = 900;
const AI_PERK_SHOW_DELAY = 1500;

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // The board only paints once it has measured itself; jsdom reports 0.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 });
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function renderTutorial() {
  const onGameEnd = vi.fn();
  render(
    <Combat
      player1Team={tutorialPlayerTeam()}
      player2Team={tutorialRivalTeam()}
      aiDifficulty={TUTORIAL_AI_DIFFICULTY}
      tutorial
      exitLabel="Menu"
      onGameEnd={onGameEnd}
    />,
  );
  // Opening hand-off dialog.
  act(() => void fireEvent.click(screen.getByText('Ready!')));
  return { onGameEnd };
}

const gotIt = () => act(() => void fireEvent.click(screen.getByText('Got it!')));
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

/** The perk chip button carrying `label`. */
function chip(label: string): HTMLButtonElement {
  const el = screen.getByText(label).closest('button');
  if (!el) throw new Error(`No chip for ${label}`);
  return el as HTMLButtonElement;
}

describe('Training Grid', () => {
  it('walks the player from the welcome card to their first power', () => {
    renderTutorial();

    // 1-2: intro cards, battle held behind them.
    expect(screen.getByText('Training Grid')).toBeTruthy();
    expect(screen.getByText(`Step 1 / ${LESSON_COUNT}`)).toBeTruthy();
    tick(5000);
    expect(document.querySelectorAll('.piece')).toHaveLength(0); // loop is paused
    gotIt();
    expect(screen.getByText('Two Sides')).toBeTruthy();
    gotIt();

    // 3: the coach bar takes over and the player's bot auto-deploys.
    expect(screen.getByText('Watch your bot')).toBeTruthy();
    tick(HUMAN_PLACE_DELAY);
    expect(document.querySelectorAll('.piece').length).toBeGreaterThan(0);

    // 4-5: what just happened, and where the powers live.
    expect(screen.getByText('One bot landed!')).toBeTruthy();
    gotIt();
    expect(screen.getByText('Your Powers')).toBeTruthy();
    gotIt();

    // 6: only Deploy Bot is tappable; everything else is locked out.
    expect(screen.getByText('Tap Deploy Bot')).toBeTruthy();
    expect(chip('Deploy Bot').disabled).toBe(false);
    expect(chip('Debug Zap').disabled).toBe(true);
    expect(chip('Lockdown').disabled).toBe(true);
    expect(chip('Pass').disabled).toBe(true);
    expect(chip('Deploy Bot').className).toContain('tut-target');

    // Tapping the locked chip does nothing; the taught one advances the script.
    act(() => void fireEvent.click(chip('Debug Zap')));
    expect(screen.getByText('Tap Deploy Bot')).toBeTruthy();
    act(() => void fireEvent.click(chip('Deploy Bot')));
    expect(screen.getByText('Tap USE')).toBeTruthy();

    // 7-8: confirm, then target a lane on the player's own side.
    act(() => void fireEvent.click(screen.getByText('Use')));
    expect(screen.getByText('Pick a line')).toBeTruthy();
    const lanes = document.querySelectorAll('.lane-overlay.tappable');
    expect(lanes.length).toBeGreaterThan(0);
    act(() => void fireEvent.click(lanes[0]));

    // The bot landed; after the brief hand-off cue the rival lesson is up.
    expect(document.querySelectorAll('.piece').length).toBeGreaterThan(1);
    tick(AI_TURN_DIALOG);
    expect(screen.getByText('Rival turn')).toBeTruthy();
    expect(document.querySelectorAll('.perk-chip')).toHaveLength(0); // the rival is acting
  });

  it('teaches Debug Zap after the rival turn, then hands the battle over', () => {
    renderTutorial();
    // Intro cards → first bot → power bar.
    gotIt();
    gotIt();
    tick(HUMAN_PLACE_DELAY);
    gotIt();
    gotIt();
    // Deploy Bot lesson.
    act(() => void fireEvent.click(chip('Deploy Bot')));
    act(() => void fireEvent.click(screen.getByText('Use')));
    act(() => void fireEvent.click(document.querySelectorAll('.lane-overlay.tappable')[0]));

    // Let the rival play its whole turn and the player's next bot land.
    tick(AI_TURN_DIALOG + AI_PLACE_DELAY + AI_THINK_DELAY + AI_PERK_SHOW_DELAY);
    tick(HUMAN_PLACE_DELAY);

    // Debug Zap lesson: only that chip is live, and it targets the rival half.
    expect(screen.getByText('Tap Debug Zap')).toBeTruthy();
    expect(chip('Debug Zap').disabled).toBe(false);
    expect(chip('Deploy Bot').disabled).toBe(true);
    act(() => void fireEvent.click(chip('Debug Zap')));
    act(() => void fireEvent.click(screen.getByText('Use')));
    expect(screen.getByText('Pick a rival line')).toBeTruthy();
    // (the removal burst reuses the .piece class for its flash — exclude it)
    const rivalBots = () => document.querySelectorAll('.piece.p2:not(.burst-out)').length;
    const before = rivalBots();
    act(() => void fireEvent.click(document.querySelectorAll('.lane-overlay.tappable')[0]));
    expect(rivalBots()).toBe(before - 1);

    // Goal card (behind the brief hand-off cue), then free play.
    tick(AI_TURN_DIALOG);
    expect(screen.getByText('How to win')).toBeTruthy();
    gotIt();
    expect(screen.getByText('Your move')).toBeTruthy();
    tick(AI_TURN_DIALOG + AI_PLACE_DELAY + AI_THINK_DELAY + AI_PERK_SHOW_DELAY);
    tick(HUMAN_PLACE_DELAY);
    expect(chip('Deploy Bot').disabled).toBe(false);
    expect(chip('Lockdown').disabled).toBe(false);
    expect(chip('Pass').disabled).toBe(false);
  });

  it('lets the player bail out, unlocking the bar for a normal battle', () => {
    renderTutorial();
    expect(screen.getByText('Training Grid')).toBeTruthy();

    act(() => void fireEvent.click(screen.getByText('Skip the training')));
    expect(screen.queryByText('Training Grid')).toBeNull();
    expect(localStorage.getItem('neon_tutorial_level_v1')).toBe('done');
    // The first-battle coach marks are retired along with it.
    expect(localStorage.getItem('neon_tutorial_v1')).toBe('done');

    // The battle carries on by itself: the player's bot lands and the bar frees up.
    tick(HUMAN_PLACE_DELAY);
    expect(document.querySelectorAll('.piece').length).toBeGreaterThan(0);
    expect(chip('Debug Zap').disabled).toBe(false);
    expect(chip('Pass').disabled).toBe(false);
  });
});
