import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LAST_LESSON_INDEX,
  LESSONS,
  Lesson,
  TutorialCtx,
  TutorialEvent,
  advance,
  gateAllowsPass,
  gateAllowsPerk,
  isPaused,
  lessonNumber,
} from '../tutorialScript';
import { markTutorialLevelDone } from '../tutorial';

export interface TutorialDirector {
  /** Null outside the tutorial level, or once the player has skipped it. */
  lesson: Lesson | null;
  lessonNo: number;
  /** True while a modal card is up: the turn loop must hold. */
  pausedRef: { current: boolean };
  paused: boolean;
  allowsPerk: (perkId: number) => boolean;
  allowsPass: () => boolean;
  /** Feed a player action or a state change into the script. */
  emit: (ev: TutorialEvent, ctx: TutorialCtx) => void;
  /** Abandon the walkthrough; the battle carries on unassisted. */
  skipAll: () => void;
}

/**
 * Owns the tutorial level's position in the lesson script. Inert when `active`
 * is false, so Combat can call it unconditionally.
 *
 * The index is mirrored in a ref so several events emitted within one render
 * (select → confirm → play) each fold onto the previous one instead of racing
 * on a stale value.
 */
export function useTutorialDirector(active: boolean): TutorialDirector {
  const [index, setIndex] = useState(0);
  const [abandoned, setAbandoned] = useState(false);
  const indexRef = useRef(0);
  const abandonedRef = useRef(false);
  const pausedRef = useRef(active && isPaused(0));

  const emit = useCallback(
    (ev: TutorialEvent, ctx: TutorialCtx) => {
      if (!active || abandonedRef.current) return;
      const next = advance(indexRef.current, ev, ctx);
      if (next === indexRef.current) return;
      indexRef.current = next;
      pausedRef.current = isPaused(next);
      setIndex(next);
      if (next === LAST_LESSON_INDEX) markTutorialLevelDone();
    },
    [active],
  );

  const skipAll = useCallback(() => {
    markTutorialLevelDone();
    abandonedRef.current = true;
    pausedRef.current = false;
    setAbandoned(true);
  }, []);

  const live = active && !abandoned;
  const paused = live && isPaused(index);

  return useMemo(
    () => ({
      lesson: live ? (LESSONS[index] ?? null) : null,
      lessonNo: live ? lessonNumber(index) : 0,
      pausedRef,
      paused,
      allowsPerk: (perkId: number) => !live || gateAllowsPerk(index, perkId),
      allowsPass: () => !live || gateAllowsPass(index),
      emit,
      skipAll,
    }),
    [live, index, paused, emit, skipAll],
  );
}
