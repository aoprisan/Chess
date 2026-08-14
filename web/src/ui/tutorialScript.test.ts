import { describe, it, expect } from 'vitest';
import { CombatGameState, initialState } from '../game/state';
import { UI } from '../i18n/uiStrings';
import {
  LESSONS,
  LESSON_COUNT,
  TutorialCtx,
  TutorialEvent,
  advance,
  gateAllowsPass,
  gateAllowsPerk,
  isPaused,
  lessonIndexById,
  lessonNumber,
  showsBar,
} from './tutorialScript';

function ctx(over: Partial<TutorialCtx> = {}): TutorialCtx {
  return {
    state: initialState('t', 'bitzy', 'pixel'),
    humanTurn: true,
    playablePerkIds: [1, 2, 4, 42],
    ...over,
  };
}

/** A state with `n` player-1 bots on lane 0. */
function withPlayerBots(n: number): CombatGameState {
  const s = initialState('t', 'bitzy', 'pixel');
  for (let i = 0; i < n; i++) s.lanes[0].player1Columns[i] = true;
  return s;
}

const at = (id: Parameters<typeof lessonIndexById>[0]) => lessonIndexById(id);
const step = (index: number, ev: TutorialEvent, c: TutorialCtx = ctx()) => advance(index, ev, c);
const idAt = (index: number) => LESSONS[index].id;

describe('tutorial script', () => {
  it('opens on a paused welcome card and walks the intro with taps', () => {
    expect(idAt(0)).toBe('welcome');
    expect(isPaused(0)).toBe(true);

    const sides = step(0, { type: 'next' });
    expect(idAt(sides)).toBe('sides');
    expect(isPaused(sides)).toBe(true);

    const watch = step(sides, { type: 'next' });
    expect(idAt(watch)).toBe('watchDeploy');
    expect(isPaused(watch)).toBe(false); // the battle runs behind the coach bar
  });

  it('holds the "watch your bot" lesson until a bot has actually landed', () => {
    const watch = at('watchDeploy');
    expect(step(watch, { type: 'sync' })).toBe(watch);

    const next = step(watch, { type: 'sync' }, ctx({ state: withPlayerBots(1) }));
    expect(idAt(next)).toBe('deployed');
  });

  it('locks the perk bar while the player is only meant to watch', () => {
    for (const id of ['watchDeploy', 'rivalTurn'] as const) {
      const i = at(id);
      expect(gateAllowsPerk(i, 1)).toBe(false);
      expect(gateAllowsPerk(i, 2)).toBe(false);
      expect(gateAllowsPass(i)).toBe(false);
    }
  });

  it('gates each taught power to its own chip and blocks Pass', () => {
    const deploy = at('pickDeploy');
    expect(gateAllowsPerk(deploy, 1)).toBe(true);
    expect(gateAllowsPerk(deploy, 2)).toBe(false);
    expect(gateAllowsPerk(deploy, 42)).toBe(false);
    expect(gateAllowsPass(deploy)).toBe(false);

    const zap = at('pickZap');
    expect(gateAllowsPerk(zap, 2)).toBe(true);
    expect(gateAllowsPerk(zap, 1)).toBe(false);
  });

  it('runs the Deploy Bot lesson select → use → target', () => {
    let i = at('pickDeploy');
    i = step(i, { type: 'selectPerk', perkId: 1 });
    expect(idAt(i)).toBe('useDeploy');
    i = step(i, { type: 'confirmPerk', perkId: 1 });
    expect(idAt(i)).toBe('targetDeploy');
    // Playing the power ends the turn, so the rival lesson takes over.
    i = step(i, { type: 'playPerk', perkId: 1 }, ctx({ humanTurn: false }));
    expect(idAt(i)).toBe('rivalTurn');
  });

  it('ignores the wrong power and steps back when the player cancels', () => {
    const pick = at('pickDeploy');
    expect(step(pick, { type: 'selectPerk', perkId: 2 })).toBe(pick);

    const use = step(pick, { type: 'selectPerk', perkId: 1 });
    expect(step(use, { type: 'cancelPerk' })).toBe(pick);

    const target = step(use, { type: 'confirmPerk', perkId: 1 });
    expect(idAt(step(target, { type: 'cancelPerk' }))).toBe('useDeploy');
  });

  it('waits out the rival turn and resumes when control comes back', () => {
    const rival = at('rivalTurn');
    expect(step(rival, { type: 'sync' }, ctx({ humanTurn: false }))).toBe(rival);
    expect(idAt(step(rival, { type: 'sync' }))).toBe('pickZap');
  });

  it('skips the Debug Zap lesson when there is nothing to zap', () => {
    const rival = at('rivalTurn');
    const next = step(rival, { type: 'sync' }, ctx({ playablePerkIds: [1] }));
    expect(idAt(next)).toBe('goal'); // the whole zap group is jumped, not stranded
  });

  it('hands the battle over, then celebrates the first fixed line', () => {
    const goal = at('goal');
    const playOn = step(goal, { type: 'next' });
    expect(idAt(playOn)).toBe('playOn');
    expect(gateAllowsPerk(playOn, 42)).toBe(true); // free play: nothing is locked
    expect(gateAllowsPass(playOn)).toBe(true);
    expect(isPaused(playOn)).toBe(false);

    const won = initialState('t', 'bitzy', 'pixel');
    won.lanes[2].winner = 'player1';
    const fixed = step(playOn, { type: 'sync' }, ctx({ state: won }));
    expect(idAt(fixed)).toBe('lineFixed');
    expect(isPaused(fixed)).toBe(true);

    const finish = step(fixed, { type: 'next' });
    expect(idAt(finish)).toBe('finish');
    // The last lesson is terminal: the player finishes the battle unassisted.
    expect(step(finish, { type: 'sync' }, ctx({ state: won }))).toBe(finish);
    expect(showsBar(LESSONS[finish])).toBe(false);
  });

  it('numbers only the lessons that show a card', () => {
    expect(LESSON_COUNT).toBe(LESSONS.filter((l) => l.kind !== 'free').length);
    expect(lessonNumber(0)).toBe(1);
    expect(lessonNumber(at('playOn'))).toBe(0); // free lessons are uncounted
    const numbers = LESSONS.map((_, i) => lessonNumber(i)).filter((n) => n > 0);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    expect(Math.max(...numbers)).toBe(LESSON_COUNT);
  });

  it('gives every lesson the strings and shape the UI expects', () => {
    for (const lesson of LESSONS) {
      // Action lessons must gate input, otherwise the coach bar lies.
      if (lesson.kind === 'action') expect(lesson.gate).toBeDefined();
      // Pointing at a chip requires knowing which chip.
      if (lesson.pointer === 'perkBar') expect(lesson.gate?.perkIds?.length).toBe(1);
      // Anything that renders text needs both halves in both languages.
      if (lesson.kind === 'modal' || showsBar(lesson)) {
        for (const key of [`train.${lesson.id}.title`, `train.${lesson.id}.text`]) {
          expect(UI[key]?.en, key).toBeTruthy();
          expect(UI[key]?.ro, key).toBeTruthy();
        }
      }
    }
  });
});
