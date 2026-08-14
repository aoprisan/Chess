// The Training Grid — the guided tutorial level's step-by-step script.
//
// This module is pure (no React, no engine mutation) so the whole walkthrough
// can be exercised in Vitest: a lesson list, an input gate per lesson, and a
// reducer that maps player/battle events onto the next lesson.
//
// Two lesson kinds drive the battle differently:
//   'modal'  — a card over the board; the turn loop is PAUSED while it is up.
//   'action' — a coach bar; the battle runs and only the taught input is legal.
//   'free'   — no card, no gate; the player finishes the battle on their own.

import { CombatGameState, PlayerSide, countPieces } from '../game/state';

export type LessonId =
  | 'welcome'
  | 'sides'
  | 'watchDeploy'
  | 'deployed'
  | 'powers'
  | 'pickDeploy'
  | 'useDeploy'
  | 'targetDeploy'
  | 'rivalTurn'
  | 'pickZap'
  | 'useZap'
  | 'targetZap'
  | 'goal'
  | 'playOn'
  | 'lineFixed'
  | 'finish';

/** Everything a lesson needs to know about the live battle. */
export interface TutorialCtx {
  state: CombatGameState;
  /** The player can act right now (their perk phase, no dialog up). */
  humanTurn: boolean;
  /** Perk ids the player could legally play this instant (target exists). */
  playablePerkIds: number[];
}

export type TutorialEvent =
  | { type: 'sync' } // the battle state changed
  | { type: 'next' } // the player tapped "Got it!"
  | { type: 'selectPerk'; perkId: number }
  | { type: 'cancelPerk' }
  | { type: 'confirmPerk'; perkId: number }
  | { type: 'playPerk'; perkId: number };

/** What the player is allowed to touch while a lesson is up. */
export interface TutorialGate {
  /** Playable perk ids; `[]` locks the whole bar. Undefined = no restriction. */
  perkIds?: number[];
  /** Whether the Pass chip is live. */
  pass: boolean;
}

/** Which control the coach bar points at. */
export type TutorialPointer = 'perkBar' | 'confirm' | 'board' | null;

export interface Lesson {
  id: LessonId;
  kind: 'modal' | 'action' | 'free';
  /** Where the card sits (modal lessons only). */
  anchor: 'center' | 'bottom';
  /** Decorative glyph row on the card. */
  art?: 'sides' | 'bot' | 'zap' | 'checks' | 'goal';
  pointer?: TutorialPointer;
  /** Show the coach bar over the board (defaults to true for action lessons). */
  bar?: boolean;
  gate?: TutorialGate;
  /** True once the lesson's objective is met. */
  done: (ev: TutorialEvent, ctx: TutorialCtx) => boolean;
  /** Step backwards (e.g. the player cancelled a perk they had selected). */
  back?: (ev: TutorialEvent) => boolean;
  /** Not performable right now → jump straight to `skipTo`. */
  skip?: (ctx: TutorialCtx) => boolean;
  skipTo?: LessonId;
}

const DEPLOY_BOT = 1;
const DEBUG_ZAP = 2;

/** Locked bar: the player watches instead of tapping. */
const WATCH: TutorialGate = { perkIds: [], pass: false };
const onlyPerk = (perkId: number): TutorialGate => ({ perkIds: [perkId], pass: false });

function hasBots(state: CombatGameState, side: PlayerSide): boolean {
  return state.lanes.some((lane) => countPieces(lane, side) > 0);
}

export const LESSONS: Lesson[] = [
  {
    id: 'welcome',
    kind: 'modal',
    anchor: 'center',
    art: 'bot',
    done: (ev) => ev.type === 'next',
  },
  {
    id: 'sides',
    kind: 'modal',
    anchor: 'center',
    art: 'sides',
    done: (ev) => ev.type === 'next',
  },
  {
    // The engine auto-places the player's first bot: nothing to tap, just watch.
    id: 'watchDeploy',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'board',
    gate: WATCH,
    done: (_ev, ctx) => hasBots(ctx.state, 'player1'),
  },
  {
    id: 'deployed',
    kind: 'modal',
    anchor: 'center',
    art: 'bot',
    done: (ev) => ev.type === 'next',
  },
  {
    id: 'powers',
    kind: 'modal',
    anchor: 'bottom',
    done: (ev) => ev.type === 'next',
  },
  {
    id: 'pickDeploy',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'perkBar',
    gate: onlyPerk(DEPLOY_BOT),
    skip: (ctx) => ctx.humanTurn && !ctx.playablePerkIds.includes(DEPLOY_BOT),
    skipTo: 'goal',
    done: (ev) => ev.type === 'selectPerk' && ev.perkId === DEPLOY_BOT,
  },
  {
    id: 'useDeploy',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'confirm',
    gate: onlyPerk(DEPLOY_BOT),
    back: (ev) => ev.type === 'cancelPerk',
    done: (ev) => ev.type === 'confirmPerk' && ev.perkId === DEPLOY_BOT,
  },
  {
    id: 'targetDeploy',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'board',
    gate: onlyPerk(DEPLOY_BOT),
    back: (ev) => ev.type === 'cancelPerk',
    done: (ev) => ev.type === 'playPerk' && ev.perkId === DEPLOY_BOT,
  },
  {
    // The rival takes its turn; the bar stays locked until control comes back.
    id: 'rivalTurn',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'board',
    gate: WATCH,
    done: (_ev, ctx) => ctx.humanTurn,
  },
  {
    id: 'pickZap',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'perkBar',
    gate: onlyPerk(DEBUG_ZAP),
    // Debug Zap needs a rival bot on the board and a charged slot; if either is
    // missing this round, move on rather than stranding the player.
    skip: (ctx) => ctx.humanTurn && !ctx.playablePerkIds.includes(DEBUG_ZAP),
    skipTo: 'goal',
    done: (ev) => ev.type === 'selectPerk' && ev.perkId === DEBUG_ZAP,
  },
  {
    id: 'useZap',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'confirm',
    gate: onlyPerk(DEBUG_ZAP),
    back: (ev) => ev.type === 'cancelPerk',
    done: (ev) => ev.type === 'confirmPerk' && ev.perkId === DEBUG_ZAP,
  },
  {
    id: 'targetZap',
    kind: 'action',
    anchor: 'bottom',
    pointer: 'board',
    gate: onlyPerk(DEBUG_ZAP),
    back: (ev) => ev.type === 'cancelPerk',
    done: (ev) => ev.type === 'playPerk' && ev.perkId === DEBUG_ZAP,
  },
  {
    id: 'goal',
    kind: 'modal',
    anchor: 'center',
    art: 'goal',
    done: (ev) => ev.type === 'next',
  },
  {
    // Hands the battle over: play freely until the first line is fixed.
    id: 'playOn',
    kind: 'free',
    anchor: 'bottom',
    bar: true,
    done: (_ev, ctx) => ctx.state.lanes.some((l) => l.winner !== null),
  },
  {
    id: 'lineFixed',
    kind: 'modal',
    anchor: 'center',
    art: 'checks',
    done: (ev) => ev.type === 'next',
  },
  {
    // Graduation: the rest of the battle is played unassisted.
    id: 'finish',
    kind: 'free',
    anchor: 'bottom',
    done: () => false,
  },
];

export const LAST_LESSON_INDEX = LESSONS.length - 1;

/** Lessons that show a card, for the "Step 3 / 8" counter. */
const COUNTED = LESSONS.filter((l) => l.kind !== 'free');
export const LESSON_COUNT = COUNTED.length;

/** 1-based position of a lesson in the counter, or 0 for uncounted lessons. */
export function lessonNumber(index: number): number {
  const lesson = LESSONS[index];
  if (!lesson || lesson.kind === 'free') return 0;
  return COUNTED.indexOf(lesson) + 1;
}

/** Whether the lesson shows the coach bar over the board. */
export function showsBar(lesson: Lesson): boolean {
  return lesson.bar ?? lesson.kind === 'action';
}

export function lessonIndexById(id: LessonId): number {
  return LESSONS.findIndex((l) => l.id === id);
}

/** The battle pauses while a modal lesson card is up. */
export function isPaused(index: number): boolean {
  return LESSONS[index]?.kind === 'modal';
}

/** Input restrictions for the lesson at `index` (undefined = unrestricted). */
export function gateAt(index: number): TutorialGate | undefined {
  return LESSONS[index]?.gate;
}

/** Whether the tutorial currently lets the player play `perkId`. */
export function gateAllowsPerk(index: number, perkId: number): boolean {
  const gate = gateAt(index);
  if (!gate?.perkIds) return true;
  return gate.perkIds.includes(perkId);
}

export function gateAllowsPass(index: number): boolean {
  return gateAt(index)?.pass !== false;
}

/**
 * Fold one event into the walkthrough and return the new lesson index.
 *
 * After a lesson completes, the next one is re-checked against the current
 * context (so state-driven lessons chain without waiting for another event)
 * and `skip` predicates are honoured, which keeps the script from stranding
 * the player on a lesson the battle can no longer satisfy.
 */
export function advance(index: number, ev: TutorialEvent, ctx: TutorialCtx): number {
  let i = index;
  const lesson = LESSONS[i];
  if (!lesson) return i;

  if (lesson.back?.(ev)) {
    return resolveSkips(Math.max(0, i - 1), ctx);
  }
  if (!lesson.done(ev, ctx)) {
    return resolveSkips(i, ctx);
  }

  i = resolveSkips(i + 1, ctx);
  // Chain any lessons already satisfied by the current battle state.
  for (let guard = 0; guard < LESSONS.length; guard++) {
    const next = LESSONS[i];
    if (!next || !next.done({ type: 'sync' }, ctx)) break;
    i = resolveSkips(i + 1, ctx);
  }
  return Math.min(i, LAST_LESSON_INDEX);
}

/** Follow `skip` jumps from `index` until a performable lesson is reached. */
function resolveSkips(index: number, ctx: TutorialCtx): number {
  let i = Math.min(index, LAST_LESSON_INDEX);
  for (let guard = 0; guard < LESSONS.length; guard++) {
    const lesson = LESSONS[i];
    if (!lesson?.skip?.(ctx) || !lesson.skipTo) return i;
    const target = lessonIndexById(lesson.skipTo);
    if (target <= i) return i; // never jump backwards
    i = target;
  }
  return i;
}
