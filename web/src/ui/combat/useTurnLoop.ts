import { useCallback, useEffect, useRef, useState } from 'react';
import { CombatEngine } from '../../game/engine';
import { chooseAIPerk } from '../../game/ai';
import { PlayerSide } from '../../game/state';
import { TutorialStep, isTutorialDone, markTutorialDone } from '../tutorial';

// Enemy pacing: AI actions are deliberately slower than the player's own
// auto-placements so each enemy move can be read before the next one lands.
const AI_PLACE_DELAY = 900;
const HUMAN_PLACE_DELAY = 300;
const AI_THINK_DELAY = 900;
const AI_PERK_SHOW_DELAY = 1500;

export type Later = (fn: () => void, delay: number) => ReturnType<typeof setTimeout>;

/**
 * Timer registry whose callbacks are dropped (and timers cleared) once the
 * owning component unmounts — the combat loop schedules everything through
 * this so a mid-battle exit can't fire stale state updates.
 */
export function useLaterTimers(): Later {
  const mountedRef = useRef(true);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingTimers.current.forEach(clearTimeout);
      pendingTimers.current = [];
    };
  }, []);

  return useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(() => {
      pendingTimers.current = pendingTimers.current.filter((x) => x !== t);
      if (mountedRef.current) fn();
    }, delay);
    pendingTimers.current.push(t);
    return t;
  }, []);
}

export interface LastPlacement {
  lane: number;
  player: PlayerSide;
  counter: number;
}

/**
 * The combat turn loop: alternates auto-placement and perk phases, drives the
 * AI with readable pacing, pauses for the pass-and-play turn dialog and the
 * first-battle tutorial coach marks. `tick` and `afterMutation` are mutually
 * recursive; every human-driven engine mutation must be followed by a call to
 * `afterMutation()` so the loop resumes.
 */
export function useTurnLoop({
  engine,
  player2IsAI,
  bump,
  later,
  onAIPerk,
}: {
  engine: CombatEngine;
  /** false = pass-and-play: both sides are humans sharing this device. */
  player2IsAI: boolean;
  /** Re-render trigger (the engine mutates in place). */
  bump: () => void;
  later: Later;
  /** Fired when the AI plays a perk, so the UI can flash it. */
  onAIPerk: (perkId: number, side: PlayerSide) => void;
}) {
  // Turn dialog: tap-gated only on the opening turn (fair-start hint); AI
  // turns show it briefly as a cue, later human turns flow straight through.
  const [showTurnDialog, setShowTurnDialog] = useState(true);
  const showTurnDialogRef = useRef(true);
  const setTurnDialog = useCallback((v: boolean) => {
    showTurnDialogRef.current = v;
    setShowTurnDialog(v);
  }, []);

  const prevPlayerRef = useRef<PlayerSide>('player1');
  const aiPerkInProgress = useRef(false);
  const lastPlacement = useRef<LastPlacement | null>(null);

  // --- First-battle tutorial -------------------------------------------------
  // Coach marks that pause the turn loop (same gate as the turn dialog) at
  // four teachable moments of the player's first solo battle: the two board
  // sides, the self-deploying bot, the perk bar, and the first fixed line.
  const [tutStep, setTutStepState] = useState<TutorialStep | null>(null);
  const tutStepRef = useRef<TutorialStep | null>(null);
  const setTutStep = useCallback((s: TutorialStep | null) => {
    tutStepRef.current = s;
    setTutStepState(s);
  }, []);
  const tutPending = useRef<TutorialStep | null>(player2IsAI && !isTutorialDone() ? 'sides' : null);

  const tick = useCallback(
    function tickFn() {
      const s = engine.state;
      if (s.status !== 'playing') {
        bump();
        return;
      }
      if (showTurnDialogRef.current) return; // paused while the turn dialog is up
      if (tutStepRef.current !== null) return; // paused while a coach mark is up

      if (s.currentPhase === 'autoPlacement') {
        const placeDelay = engine.isCurrentPlayerAI ? AI_PLACE_DELAY : HUMAN_PLACE_DELAY;
        later(() => {
          if (showTurnDialogRef.current || tutStepRef.current !== null) return;
          if (engine.state.currentPhase !== 'autoPlacement') {
            tickFn();
            return;
          }
          const placer = engine.state.currentPlayer;
          const placed = engine.autoPlace();
          if (placed >= 0) {
            lastPlacement.current = {
              lane: placed,
              player: placer,
              counter: (lastPlacement.current?.counter ?? 0) + 1,
            };
          }
          if (
            placed === -1 &&
            engine.state.status === 'playing' &&
            engine.state.currentPhase === 'autoPlacement'
          ) {
            engine.skipTurn();
          }
          afterMutation();
        }, placeDelay);
        return;
      }

      if (s.currentPhase === 'perkSelection' && engine.isCurrentPlayerAI) {
        if (aiPerkInProgress.current) return;
        aiPerkInProgress.current = true;
        later(() => {
          const [perkId, target, second] = chooseAIPerk(engine);
          engine.lastAIPerkId = perkId > 0 ? perkId : null;
          bump();
          later(() => {
            engine.lastAIPerkId = null;
            aiPerkInProgress.current = false;
            if (perkId === 0) {
              engine.passTurn();
            } else {
              onAIPerk(perkId, engine.state.currentPlayer);
              engine.executePerk(perkId, target, second);
            }
            afterMutation();
          }, AI_PERK_SHOW_DELAY);
        }, AI_THINK_DELAY);
      }
      // Human perk selection: wait for input.
    },
    // afterMutation is intentionally omitted: it and tick are mutually
    // recursive, and both are stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, bump, later, onAIPerk],
  );

  /** After any engine mutation: detect turn changes (turn dialog) and resume the loop. */
  const afterMutation = useCallback(() => {
    const s = engine.state;
    if (s.status === 'playing' && s.currentPlayer !== prevPlayerRef.current) {
      prevPlayerRef.current = s.currentPlayer;
      if (engine.isCurrentPlayerAI) {
        // AI turn: show briefly, then auto-dismiss.
        setTurnDialog(true);
        later(() => {
          if (showTurnDialogRef.current) {
            setTurnDialog(false);
            tick();
          }
        }, 600);
      } else if (!player2IsAI) {
        // Pass-and-play: tap-gated hand-off so the device can change hands
        // (the board hides Cloak/Blind info while the dialog is up).
        setTurnDialog(true);
      }
      // Solo human turns flow straight into auto-placement; the tap-gated
      // dialog only appears on the opening turn (fair-start hint).
    }
    // Tutorial checkpoints (queued only in the player's first solo battle).
    if (tutPending.current === 'deploy' && lastPlacement.current?.player === 'player1') {
      tutPending.current = 'power';
      setTutStep('deploy');
    } else if (
      tutPending.current === 'power' &&
      s.status === 'playing' &&
      s.currentPhase === 'perkSelection' &&
      !engine.isCurrentPlayerAI
    ) {
      tutPending.current = 'win';
      setTutStep('power');
    } else if (tutPending.current === 'win' && s.lanes.some((l) => l.winner)) {
      tutPending.current = null;
      markTutorialDone();
      setTutStep('win');
    } else if (s.status === 'finished' && tutPending.current !== null) {
      // Battle ended before the walkthrough finished: don't repeat it.
      tutPending.current = null;
      markTutorialDone();
    }
    bump();
    tick();
  }, [engine, bump, later, tick, setTurnDialog, setTutStep, player2IsAI]);

  const dismissTurnDialog = () => {
    setTurnDialog(false);
    if (tutPending.current === 'sides') {
      // First lesson right after the opening "Ready!": which side is whose.
      tutPending.current = 'deploy';
      setTutStep('sides');
      return;
    }
    tick();
  };

  const onTutorialNext = () => {
    setTutStep(null);
    tick();
  };
  const onTutorialSkip = () => {
    markTutorialDone();
    tutPending.current = null;
    setTutStep(null);
    tick();
  };

  return {
    showTurnDialog,
    dismissTurnDialog,
    tutStep,
    onTutorialNext,
    onTutorialSkip,
    lastPlacement,
    afterMutation,
  };
}
