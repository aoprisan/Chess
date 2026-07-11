import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CombatEngine, MoveLogEntry } from '../game/engine';
import { chooseAIPerk } from '../game/ai';
import { getValidLanesForPerk, perkRequiresTarget } from '../game/targeting';
import { getPerk, PerkCategory, PerkInfo, PerkSlot, PerkTargetSide } from '../game/perks';
import { Character, buildPerkPools } from '../game/characters';
import { CombatGameState, Lane, PlayerSide, isCloaked, isBlinded } from '../game/state';
import { starsForBattle } from '../campaign/balance';

import { CharacterPortrait } from './CharacterPortrait';
import { Icon, IconName } from './Icons';
import { CATEGORY_COLOR, perkIcon } from './perkTheme';
import { PerkPicto } from './PerkPicto';
import { TutorialStep, isTutorialDone, markTutorialDone } from './tutorial';
import { useLang, useT, perkName, perkDescription, formatMoveLog } from '../i18n';
import type { Lang } from '../i18n';

// Translation keys for the "which half does this perk affect" pill label.
const SIDE_LABEL_KEY: Record<PerkTargetSide, string> = {
  own: 'combat.side.own',
  enemy: 'combat.side.enemy',
  both: 'combat.side.both',
};

// Landscape board with 5 horizontal data lines x 10 slots (P1 left/cyan,
// P2 right/magenta), neon grid field, turn pill, CSS-drawn player panels and
// turn flag, compact dark perk bar, pass-and-play turn dialog (auto-dismissed
// for the AI).

const DUAL_LANE_PERKS = new Set([33, 34]);
const FREEZE_PERK = 4;

// Lane-half highlight palette while targeting: cyan = your half, magenta =
// enemy half, amber = whole line; Lockdown keeps its signature ice-blue.
interface SideStyle {
  fill: string;
  border: string;
  pill: string;
  label: string;
}
const SIDE_STYLE: Record<PerkTargetSide, SideStyle> = {
  own: {
    fill: 'rgba(0,229,255,0.28)',
    border: '#00e5ff',
    pill: 'rgba(0,151,167,0.92)',
    label: 'Your side',
  },
  enemy: {
    fill: 'rgba(255,47,214,0.28)',
    border: '#ff2fd6',
    pill: 'rgba(170,20,140,0.92)',
    label: 'Enemy side',
  },
  both: {
    fill: 'rgba(255,210,63,0.25)',
    border: '#ffd23f',
    pill: 'rgba(255,160,0,0.9)',
    label: 'Whole line',
  },
};
const FREEZE_STYLE: SideStyle = {
  fill: 'rgba(66,165,245,0.3)',
  border: '#42A5F5',
  pill: 'rgba(25,118,210,0.9)',
  label: 'Enemy side',
};
const SIDE_CHIP_COLOR: Record<PerkTargetSide, string> = {
  own: '#0097a7',
  enemy: '#aa148c',
  both: '#FFA000',
};

function sideStyleFor(perkId: number, info: PerkInfo | undefined): SideStyle {
  if (perkId === FREEZE_PERK) return FREEZE_STYLE;
  return SIDE_STYLE[info?.targetSide ?? 'both'];
}

interface CombatResult {
  playerWon: boolean;
  stars: number; // 0 on loss, 1-3 on win
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Combat({
  player1Team,
  player2Team,
  aiDifficulty,
  player2IsAI = true,
  usePerkPools = false,
  exitLabel = 'Back to Map',
  onGameEnd,
}: {
  /** Characters fighting on each side; index 0 is the lead (portrait + log name). */
  player1Team: Character[];
  player2Team: Character[];
  aiDifficulty: string;
  /** false = pass-and-play: both sides are humans sharing this device. */
  player2IsAI?: boolean;
  /** Campaign battles: restrict perk slots 3/4 to each team's own perks. */
  usePerkPools?: boolean;
  exitLabel?: string;
  onGameEnd: (result: CombatResult) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const player1Hero = player1Team[0];
  const player2Hero = player2Team[0];
  const engineRef = useRef<CombatEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new CombatEngine(`game_${Date.now()}`, {
      player1Hero: player1Hero.id,
      player2Hero: player2Hero.id,
      player2IsAI,
      player2AIDifficulty: aiDifficulty,
      player1PerkPools: usePerkPools ? buildPerkPools(player1Team.map((c) => c.id)) : undefined,
      player2PerkPools: usePerkPools ? buildPerkPools(player2Team.map((c) => c.id)) : undefined,
    });
  }
  const engine = engineRef.current;

  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Turn dialog: tap-gated only on the opening turn (fair-start hint); AI
  // turns show it briefly as a cue, later human turns flow straight through.
  const [showTurnDialog, setShowTurnDialog] = useState(true);
  const showTurnDialogRef = useRef(true);
  const setTurnDialog = useCallback((v: boolean) => {
    showTurnDialogRef.current = v;
    setShowTurnDialog(v);
  }, []);

  const [selectedPerkId, setSelectedPerkId] = useState<number | null>(null);
  const [isSelectingLane, setIsSelectingLane] = useState(false);
  const [firstSelectedLane, setFirstSelectedLane] = useState<number | null>(null);
  const [showMoveLog, setShowMoveLog] = useState(false);

  const prevPlayerRef = useRef<PlayerSide>('player1');
  const aiPerkInProgress = useRef(false);
  const lastPlacement = useRef<{ lane: number; player: PlayerSide; counter: number } | null>(null);
  const mountedRef = useRef(true);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Measure the content area (Flutter sizes everything off screen dimensions).
  const rootRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = dims.w;
  const H = dims.h;

  const state = engine.state;

  const later = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(() => {
      pendingTimers.current = pendingTimers.current.filter((x) => x !== t);
      if (mountedRef.current) fn();
    }, delay);
    pendingTimers.current.push(t);
    return t;
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedPerkId(null);
    setIsSelectingLane(false);
    setFirstSelectedLane(null);
  }, []);

  // Perk flash: a big glyph banner over the board whenever either side plays
  // a power, so what just happened reads without words.
  const [perkFlash, setPerkFlash] = useState<{
    perkId: number;
    side: PlayerSide;
    seq: number;
  } | null>(null);
  const flashSeq = useRef(0);
  const flashPerk = useCallback(
    (perkId: number, side: PlayerSide) => {
      flashSeq.current += 1;
      const seq = flashSeq.current;
      setPerkFlash({ perkId, side, seq });
      later(() => setPerkFlash((cur) => (cur?.seq === seq ? null : cur)), 1100);
    },
    [later],
  );

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

  // --- Turn loop -----------------------------------------------------------

  // Enemy pacing: AI actions are deliberately slower than the player's own
  // auto-placements so each enemy move can be read before the next one lands.
  const AI_PLACE_DELAY = 900;
  const HUMAN_PLACE_DELAY = 300;
  const AI_THINK_DELAY = 900;
  const AI_PERK_SHOW_DELAY = 1500;

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
              flashPerk(perkId, engine.state.currentPlayer);
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
    [engine, bump, later, flashPerk],
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingTimers.current.forEach(clearTimeout);
      pendingTimers.current = [];
    };
  }, []);

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

  // --- Human perk interactions ---------------------------------------------
  const humanTurn =
    state.currentPhase === 'perkSelection' &&
    !engine.isCurrentPlayerAI &&
    state.status === 'playing' &&
    !showTurnDialog;

  const onPerkClick = (perkId: number) => {
    if (!humanTurn) return;
    if (engine.currentPerkSlots.some((s) => s.perkId === perkId && s.disabled)) return;
    // Tapping the selected perk again collapses its explanation.
    setSelectedPerkId((prev) => (prev === perkId ? null : perkId));
    setIsSelectingLane(false);
    setFirstSelectedLane(null);
  };

  const onConfirmPerk = () => {
    if (selectedPerkId === null) return;
    if (perkRequiresTarget(selectedPerkId) || DUAL_LANE_PERKS.has(selectedPerkId)) {
      setIsSelectingLane(true);
      return;
    }
    flashPerk(selectedPerkId, state.currentPlayer);
    engine.executePerk(selectedPerkId, -1);
    resetSelection();
    afterMutation();
  };

  const onLaneClick = (laneIndex: number) => {
    if (!isSelectingLane || selectedPerkId === null) return;
    const validLanes = getValidLanesForPerk(
      selectedPerkId,
      state,
      state.currentPlayer,
      firstSelectedLane,
    );
    if (!validLanes.includes(laneIndex)) return;

    if (DUAL_LANE_PERKS.has(selectedPerkId)) {
      if (firstSelectedLane === null) {
        setFirstSelectedLane(laneIndex);
        return;
      }
      flashPerk(selectedPerkId, state.currentPlayer);
      engine.executePerk(selectedPerkId, laneIndex, firstSelectedLane);
    } else {
      flashPerk(selectedPerkId, state.currentPlayer);
      engine.executePerk(selectedPerkId, laneIndex);
    }
    resetSelection();
    afterMutation();
  };

  const onPass = () => {
    if (!humanTurn) return;
    engine.passTurn();
    resetSelection();
    afterMutation();
  };

  const validLanes =
    isSelectingLane && selectedPerkId !== null
      ? getValidLanesForPerk(selectedPerkId, state, state.currentPlayer, firstSelectedLane)
      : [];

  // --- Derived visuals ------------------------------------------------------
  const currentHero = state.currentPlayer === 'player1' ? player1Hero : player2Hero;
  const finished = state.status === 'finished';
  const winnerIsP1 = state.gameWinner === 'player1';
  const winnerHero = winnerIsP1 ? player1Hero : player2Hero;
  const endResult: CombatResult = {
    playerWon: winnerIsP1,
    stars: starsForBattle(winnerIsP1, state.player2LanesWon),
  };

  // Visibility (Flutter: viewer = currentPlayer in local play, null while dialog up)
  const viewer: PlayerSide | null = showTurnDialog ? null : state.currentPlayer;
  const blindViewer = viewer ?? state.currentPlayer;
  const hideP1 =
    (isCloaked(state, 'player1') && viewer !== 'player1') ||
    (isBlinded(state, 'player1') && blindViewer === 'player1');
  const hideP2 =
    (isCloaked(state, 'player2') && viewer !== 'player2') ||
    (isBlinded(state, 'player2') && blindViewer === 'player2');
  // Fog labels so a half emptied by Cloak/Blind reads as "hidden", not vanished.
  const stealthName = perkName(getPerk(22)!, lang);
  const staticName = perkName(getPerk(23)!, lang);
  const p1FogLabel = hideP1
    ? isCloaked(state, 'player1') && viewer !== 'player1'
      ? t('combat.hiddenBy', { power: stealthName })
      : t('combat.hiddenBy', { power: staticName })
    : null;
  const p2FogLabel = hideP2
    ? isCloaked(state, 'player2') && viewer !== 'player2'
      ? t('combat.hiddenBy', { power: stealthName })
      : t('combat.hiddenBy', { power: staticName })
    : null;

  const gap = H * 0.005;
  const selectedInfo = selectedPerkId !== null ? getPerk(selectedPerkId) : undefined;

  return (
    <div className="combat doodle-bg" ref={rootRef}>
      <div style={{ height: gap }} />

      {/* Move-log button */}
      <button className="log-btn" onClick={() => setShowMoveLog(true)}>
        <Icon name="list" size={14} color="#FFCA28" />
        {t('combat.moves')}
      </button>

      {/* Turn pill */}
      <div
        className="turn-pill"
        style={{
          padding: `${clamp(W * 0.01, 6, 12)}px ${clamp(W * 0.025, 16, 28)}px`,
          fontSize: clamp(W * 0.018, 14, 20),
        }}
      >
        {finished
          ? t('combat.wins', { name: winnerHero.name })
          : t('combat.turn', { name: currentHero.name })}
      </div>

      <div style={{ height: gap }} />

      <PlayerHeaders
        W={W}
        H={H}
        player1Team={player1Team}
        player2Team={player2Team}
        state={state}
      />

      <div style={{ height: gap }} />

      {/* Game field */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: `0 ${clamp(W * 0.02, 8, 20)}px`,
          display: 'flex',
          position: 'relative',
        }}
      >
        {/* Big glyph banner for the power that was just played */}
        {perkFlash &&
          (() => {
            const info = getPerk(perkFlash.perkId);
            if (!info) return null;
            const color = perkFlash.side === 'player1' ? '#00e5ff' : '#ff2fd6';
            return (
              <div
                key={perkFlash.seq}
                className="perk-flash"
                style={{ '--flash-color': color } as CSSProperties}
              >
                <span className="perk-flash-icon">
                  <Icon name={perkIcon(info.id)} size={clamp(W * 0.055, 36, 56)} color="#fff" />
                </span>
                <span className="perk-flash-name" style={{ fontSize: clamp(W * 0.02, 14, 22) }}>
                  {perkName(info, lang)}
                </span>
              </div>
            );
          })()}
        <GameBoard
          W={W}
          state={state}
          player1Hero={player1Hero}
          player2Hero={player2Hero}
          hideP1={hideP1}
          hideP2={hideP2}
          p1FogLabel={p1FogLabel}
          p2FogLabel={p2FogLabel}
          lastPlacement={lastPlacement.current}
          isSelectingLane={isSelectingLane}
          selectedPerkId={selectedPerkId}
          firstSelectedLane={firstSelectedLane}
          validLanes={validLanes}
          onLaneClick={onLaneClick}
        />
      </div>

      <div style={{ height: gap }} />

      {/* Bottom area: perk bar / placing indicator / game-over */}
      {finished ? (
        <div className="game-over-col" style={{ paddingBottom: H * 0.01 }}>
          <div
            className="winner-banner"
            style={{
              padding: `${W * 0.012}px ${W * 0.03}px`,
              background: winnerIsP1 ? 'rgba(0,229,255,0.18)' : 'rgba(255,47,214,0.18)',
              color: winnerIsP1 ? '#00e5ff' : '#ff2fd6',
              fontSize: clamp(W * 0.022, 16, 28),
            }}
          >
            {t('combat.wins', { name: winnerHero.name })}
          </div>
          {endResult.playerWon && player2IsAI && (
            <div
              className="winner-stars"
              role="img"
              aria-label={t('combat.starsEarned', { stars: endResult.stars })}
              style={{ display: 'flex', gap: W * 0.008, marginTop: W * 0.01 }}
            >
              {Array.from({ length: 3 }, (_, i) => (
                <Icon
                  key={i}
                  name="star"
                  size={clamp(W * 0.028, 20, 34)}
                  color={i < endResult.stars ? '#ffd23f' : '#2a3555'}
                />
              ))}
            </div>
          )}
          <div style={{ height: W * 0.012 }} />
          <button
            className="img-btn red"
            style={{
              width: clamp(W * 0.15, 120, 180),
              height: clamp(W * 0.045, 36, 56),
              fontSize: clamp(W * 0.016, 12, 20),
            }}
            onClick={() => onGameEnd(endResult)}
          >
            {exitLabel}
          </button>
        </div>
      ) : state.currentPhase === 'autoPlacement' && !showTurnDialog && !tutStep ? (
        <div
          className="placing-row"
          style={{ paddingBottom: H * 0.01, fontSize: clamp(W * 0.016, 12, 20) }}
        >
          <span
            className="spinner small"
            style={{
              width: clamp(W * 0.018, 14, 22),
              height: clamp(W * 0.018, 14, 22),
              borderColor: 'rgba(255,202,40,0.3)',
              borderTopColor: '#FFCA28',
            }}
          />
          {t('combat.placing')}
        </div>
      ) : state.currentPhase === 'perkSelection' && !showTurnDialog ? (
        engine.isCurrentPlayerAI && engine.lastAIPerkId === null ? (
          <div style={{ paddingBottom: H * 0.01, display: 'flex', justifyContent: 'center' }}>
            <div className="waiting-pill">
              <span
                className="spinner small"
                style={{ borderColor: 'rgba(189,189,189,0.3)', borderTopColor: '#BDBDBD' }}
              />
              {t('combat.opponentTurn')}
            </div>
          </div>
        ) : isSelectingLane && selectedPerkId !== null && selectedInfo ? (
          // Targeting: a hint takes the perk panel's spot, color-matched to
          // the lane-half glow so the player knows which side to tap.
          <TargetingHint
            W={W}
            perkId={selectedPerkId}
            info={selectedInfo}
            firstSelectedLane={firstSelectedLane}
            onCancel={resetSelection}
          />
        ) : (
          <PerkPanel
            slots={engine.currentPerkSlots}
            owners={
              usePerkPools
                ? state.currentPlayer === 'player1'
                  ? player1Team
                  : player2Team
                : undefined
            }
            disabled={!humanTurn}
            aiHighlight={engine.lastAIPerkId}
            selectedPerkId={selectedPerkId}
            selectedInfo={selectedInfo}
            onPerk={onPerkClick}
            onPass={onPass}
            onConfirm={onConfirmPerk}
            onCancel={resetSelection}
          />
        )
      ) : (
        <div style={{ height: H * 0.01 }} />
      )}

      {/* Move-log overlay */}
      {showMoveLog && (
        <MoveLogOverlay
          entries={engine.moveLog}
          player1Hero={player1Hero}
          player2Hero={player2Hero}
          onClose={() => setShowMoveLog(false)}
        />
      )}

      {/* Pass-and-play turn dialog */}
      {showTurnDialog && !finished && (
        <TurnDialog
          W={W}
          hero={currentHero}
          isP1={state.currentPlayer === 'player1'}
          isAI={engine.isCurrentPlayerAI}
          isOpeningTurn={lastPlacement.current === null && state.currentPlayer === 'player1'}
          onReady={dismissTurnDialog}
        />
      )}

      {/* First-battle coach marks */}
      {tutStep && !finished && (
        <TutorialCoach W={W} step={tutStep} onNext={onTutorialNext} onSkip={onTutorialSkip} />
      )}
    </div>
  );
}

// --- First-battle tutorial coach marks -----------------------------------------

const TUTORIAL_CARDS: Record<
  TutorialStep,
  { titleKey: string; textKey: string; anchor: 'center' | 'bottom' }
> = {
  sides: { titleKey: 'tut.sides.title', textKey: 'tut.sides.text', anchor: 'center' },
  deploy: { titleKey: 'tut.deploy.title', textKey: 'tut.deploy.text', anchor: 'center' },
  power: { titleKey: 'tut.power.title', textKey: 'tut.power.text', anchor: 'bottom' },
  win: { titleKey: 'tut.win.title', textKey: 'tut.win.text', anchor: 'center' },
};

function TutorialCoach({
  W,
  step,
  onNext,
  onSkip,
}: {
  W: number;
  step: TutorialStep;
  onNext: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  const card = TUTORIAL_CARDS[step];
  return (
    <div className={`tut-scrim ${card.anchor}`}>
      <div className="tut-card" style={{ width: clamp(W * 0.4, 250, 380) }}>
        <span className="tut-title">{t(card.titleKey)}</span>

        {step === 'sides' && (
          <div className="tut-halves" aria-hidden>
            <span className="tut-half p1">
              <Icon name="robot" size={22} color="#00e5ff" />
              {t('combat.you')}
            </span>
            <span className="tut-half p2">
              <Icon name="robot" size={22} color="#ff2fd6" />
              {t('combat.rival')}
            </span>
          </div>
        )}
        {step === 'deploy' && (
          <span className="tut-glyph" aria-hidden>
            <Icon name="robot" size={38} color="#00e5ff" />
          </span>
        )}
        {step === 'win' && (
          <span className="tut-glyph row" aria-hidden>
            <Icon name="check" size={26} color="#3dff8f" />
            <Icon name="check" size={26} color="#3dff8f" />
            <Icon name="check" size={26} color="#3dff8f" />
          </span>
        )}

        <span className="tut-text">{t(card.textKey)}</span>

        <button className="img-btn yellow tut-next" onClick={onNext}>
          {t('combat.gotIt')}
        </button>
        <button className="tut-skip" onClick={onSkip}>
          {t('combat.skipLessons')}
        </button>
      </div>
      {step === 'power' && (
        <span className="tut-arrow" aria-hidden>
          ▼
        </span>
      )}
    </div>
  );
}

// --- Player headers ---------------------------------------------------------

function PlayerHeaders({
  W,
  H,
  player1Team,
  player2Team,
  state,
}: {
  W: number;
  H: number;
  player1Team: Character[];
  player2Team: Character[];
  state: CombatGameState;
}) {
  const player1Hero = player1Team[0];
  const player2Hero = player2Team[0];
  const spacing = clamp(W * 0.008, 4, 10);
  const avatarW = clamp(W * 0.1, 50, 140);
  const avatarH = clamp(H * 0.1, 60, 160);
  const titleW = clamp(W * 0.14, 90, 160);
  const titleH = clamp(W * 0.05, 34, 52);
  const scoreW = clamp(W * 0.065, 45, 75);
  const fontSize = clamp(W * 0.018, 13, 20);

  const t = useT();
  const indicatorW = clamp(W * 0.08, 50, 90);
  const indicatorH = clamp(H * 0.1, 60, 160);
  const poleW = clamp(W * 0.005, 3, 6);
  const flagW = clamp(W * 0.04, 28, 50);
  const flagH = clamp(W * 0.05, 34, 60);
  const isP1Turn = state.currentPlayer === 'player1';

  const title = (side: PlayerSide, hero: Character) => (
    <div
      className={`pp-title ${side === 'player1' ? 'p1' : 'p2'}`}
      style={{
        width: titleW,
        height: titleH,
        fontSize,
        paddingLeft: side === 'player1' ? 8 : 0,
        paddingRight: side === 'player1' ? 0 : 8,
      }}
    >
      {hero.name}
    </div>
  );
  const score = (side: PlayerSide, value: number) => (
    <div
      className={`pp-score ${side === 'player1' ? 'p1' : 'p2'}`}
      style={{ width: scoreW, height: titleH, fontSize }}
    >
      {value}
    </div>
  );

  const teamColumn = (team: Character[]) => {
    const lead = team[0];
    const rest = team.slice(1);
    const chipSize = Math.max(14, avatarH * 0.22);
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: avatarW,
          height: avatarH,
        }}
      >
        <CharacterPortrait
          character={lead}
          className="pp-avatar"
          style={{
            width: avatarW,
            height: rest.length > 0 ? avatarH - chipSize - 2 : avatarH,
            objectFit: 'contain',
          }}
        />
        {rest.length > 0 && (
          <div style={{ display: 'flex', gap: 2, height: chipSize }}>
            {rest.map((c) => (
              <CharacterPortrait
                key={c.id}
                character={c}
                style={{ width: chipSize, height: chipSize, objectFit: 'contain' }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="player-headers" style={{ padding: `0 ${clamp(W * 0.02, 8, 20)}px` }}>
      <div className="player-panel p1">
        {teamColumn(player1Team)}
        <span style={{ width: spacing }} />
        {title('player1', player1Hero)}
        {score('player1', state.player1LanesWon)}
      </div>

      <div className="flag-indicator" style={{ width: indicatorW, height: indicatorH }}>
        <div
          className="flag-pole"
          style={{ top: indicatorH * 0.2, width: poleW, height: indicatorH * 0.8 }}
        />
        <div
          className={`flag-img ${isP1Turn ? 'p1' : 'p2'}`}
          role="img"
          aria-label={isP1Turn ? t('combat.p1turn') : t('combat.p2turn')}
          style={{
            top: indicatorH * 0.2,
            width: flagW,
            height: flagH,
            left: isP1Turn ? 0 : indicatorW - flagW,
            transform: isP1Turn ? 'scaleX(-1)' : undefined,
          }}
        >
          <Icon name="flash" size={flagW * 0.55} color="#0a0e1a" />
        </div>
      </div>

      <div className="player-panel p2">
        {score('player2', state.player2LanesWon)}
        {title('player2', player2Hero)}
        <span style={{ width: spacing }} />
        {teamColumn(player2Team)}
      </div>
    </div>
  );
}

// --- Game board ---------------------------------------------------------------

/** A one-shot "bot removed" flash at a board cell. */
interface BoardBurst {
  key: string;
  x: number;
  y: number;
  side: PlayerSide;
}

function GameBoard({
  W,
  state,
  player1Hero,
  player2Hero,
  hideP1,
  hideP2,
  p1FogLabel,
  p2FogLabel,
  lastPlacement,
  isSelectingLane,
  selectedPerkId,
  firstSelectedLane,
  validLanes,
  onLaneClick,
}: {
  W: number;
  state: CombatGameState;
  player1Hero: Character;
  player2Hero: Character;
  hideP1: boolean;
  hideP2: boolean;
  p1FogLabel: string | null;
  p2FogLabel: string | null;
  lastPlacement: { lane: number; player: PlayerSide; counter: number } | null;
  isSelectingLane: boolean;
  selectedPerkId: number | null;
  firstSelectedLane: number | null;
  validLanes: number[];
  onLaneClick: (i: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const radius = clamp(W * 0.015, 10, 20);
  const padding = clamp(W * 0.008, 4, 10);
  const centerLineW = clamp(W * 0.004, 3, 5);
  const pieceSize = clamp(W * 0.045, 34, 55);

  const bw = box.w;
  const bh = box.h;
  const cellW = bw / 10;
  const cellH = bh / 5;
  const halfW = bw / 2;

  // Removal bursts: bots that vanished since the previous render pop out with
  // a visible flash instead of silently disappearing (readable without text).
  const [bursts, setBursts] = useState<BoardBurst[]>([]);
  const prevColsRef = useRef<Record<PlayerSide, boolean[][]> | null>(null);
  const burstSeq = useRef(0);
  useEffect(() => {
    const snapshot: Record<PlayerSide, boolean[][]> = {
      player1: state.lanes.map((l) => [...l.player1Columns]),
      player2: state.lanes.map((l) => [...l.player2Columns]),
    };
    const prev = prevColsRef.current;
    prevColsRef.current = snapshot;
    if (!prev || bw === 0) return;
    const found: BoardBurst[] = [];
    (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
      if (side === 'player1' ? hideP1 : hideP2) return;
      state.lanes.forEach((lane, li) => {
        const prevCols = prev[side][li] ?? [];
        const cols = side === 'player1' ? lane.player1Columns : lane.player2Columns;
        cols.forEach((filled, c) => {
          if (!prevCols[c] || filled) return;
          const gridCol = side === 'player1' ? c : 9 - c;
          burstSeq.current += 1;
          found.push({
            key: `burst-${burstSeq.current}`,
            x: gridCol * cellW + (cellW - pieceSize) / 2,
            y: li * cellH + (cellH - pieceSize) / 2,
            side,
          });
        });
      });
    });
    if (found.length > 0) {
      setBursts((bs) => [...bs, ...found]);
      const keys = new Set(found.map((b) => b.key));
      setTimeout(() => setBursts((bs) => bs.filter((b) => !keys.has(b.key))), 650);
    }
  });

  const pieces: ReactNode[] = [];
  if (bw > 0) {
    state.lanes.forEach((lane, laneIndex) => {
      (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
        if (side === 'player1' && hideP1) return;
        if (side === 'player2' && hideP2) return;
        const cols = side === 'player1' ? lane.player1Columns : lane.player2Columns;
        const hero = side === 'player1' ? player1Hero : player2Hero;
        const maxFilled = cols.lastIndexOf(true);
        cols.forEach((filled, c) => {
          if (!filled) return;
          const gridCol = side === 'player1' ? c : 9 - c;
          const x = gridCol * cellW + (cellW - pieceSize) / 2;
          const y = laneIndex * cellH + (cellH - pieceSize) / 2;
          const isNewest =
            lastPlacement !== null &&
            lastPlacement.lane === laneIndex &&
            lastPlacement.player === side &&
            c === maxFilled;
          const slideDist = side === 'player1' ? x + pieceSize : bw - x;
          pieces.push(
            <div
              key={
                isNewest
                  ? `${side}-${laneIndex}-${c}-anim${lastPlacement.counter}`
                  : `${side}-${laneIndex}-${c}`
              }
              className={`piece ${side === 'player1' ? 'p1' : 'p2'}${isNewest ? (side === 'player1' ? ' slide-left' : ' slide-right') : ''}`}
              style={
                {
                  left: x,
                  top: y,
                  width: pieceSize,
                  height: pieceSize,
                  '--slide-dist': `${slideDist}px`,
                } as CSSProperties
              }
            >
              <CharacterPortrait character={hero} className="portrait" />
            </div>,
          );
        });
      });
    });
  }

  return (
    <div className="game-field" ref={boardRef} style={{ flex: 1, borderRadius: radius }}>
      <div className="field-inner" style={{ margin: padding }}>
        {/* Cyan energy core rising from the board center (concept art) */}
        <div className="field-core" />

        {/* Neon grid — hot magenta major lines with bloom over a faint
            sub-grid, lit junctions, and cyan connector details, matching
            the pink holo-board concept art. */}
        {bw > 0 && (
          <svg
            width={bw}
            height={bh}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          >
            {/* faint sub-grid at half-cell pitch */}
            {Array.from({ length: 10 }, (_, i) => (
              <line
                key={`mv${i}`}
                x1={(i + 0.5) * cellW}
                y1={0}
                x2={(i + 0.5) * cellW}
                y2={bh}
                stroke="rgba(255,47,214,0.1)"
                strokeWidth={1}
              />
            ))}
            {Array.from({ length: 5 }, (_, i) => (
              <line
                key={`mh${i}`}
                x1={0}
                y1={(i + 0.5) * cellH}
                x2={bw}
                y2={(i + 0.5) * cellH}
                stroke="rgba(255,47,214,0.1)"
                strokeWidth={1}
              />
            ))}
            {/* major lines: wide glow pass + bright core pass */}
            {Array.from({ length: 9 }, (_, i) => (
              <g key={`v${i}`}>
                <line
                  x1={(i + 1) * cellW}
                  y1={0}
                  x2={(i + 1) * cellW}
                  y2={bh}
                  stroke="rgba(255,47,214,0.4)"
                  strokeWidth={5}
                />
                <line
                  x1={(i + 1) * cellW}
                  y1={0}
                  x2={(i + 1) * cellW}
                  y2={bh}
                  stroke="rgba(255,150,238,0.95)"
                  strokeWidth={1.5}
                />
              </g>
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <g key={`h${i}`}>
                <line
                  x1={0}
                  y1={(i + 1) * cellH}
                  x2={bw}
                  y2={(i + 1) * cellH}
                  stroke="rgba(255,47,214,0.4)"
                  strokeWidth={5}
                />
                <line
                  x1={0}
                  y1={(i + 1) * cellH}
                  x2={bw}
                  y2={(i + 1) * cellH}
                  stroke="rgba(255,150,238,0.95)"
                  strokeWidth={1.5}
                />
              </g>
            ))}
            {/* lit junction nodes at major intersections */}
            {Array.from({ length: 9 }, (_, c) =>
              Array.from({ length: 4 }, (_, r) => (
                <g key={`j${c}-${r}`}>
                  <circle
                    cx={(c + 1) * cellW}
                    cy={(r + 1) * cellH}
                    r={4}
                    fill="rgba(255,47,214,0.3)"
                  />
                  <circle
                    cx={(c + 1) * cellW}
                    cy={(r + 1) * cellH}
                    r={1.7}
                    fill="rgba(255,190,244,0.95)"
                  />
                </g>
              )),
            )}
            {/* cyan corner brackets */}
            {(
              [
                [4, 4, 1, 1],
                [bw - 4, 4, -1, 1],
                [4, bh - 4, 1, -1],
                [bw - 4, bh - 4, -1, -1],
              ] as const
            ).map(([x, y, sx, sy], i) => (
              <path
                key={`cb${i}`}
                d={`M ${x + sx * 16} ${y} L ${x} ${y} L ${x} ${y + sy * 16}`}
                fill="none"
                stroke="rgba(0,229,255,0.8)"
                strokeWidth={2.5}
              />
            ))}
            {/* cyan connector chips at the mid-edges */}
            {(
              [
                [bw / 2 - 14, 1.5, 28, 4],
                [bw / 2 - 14, bh - 5.5, 28, 4],
                [1.5, bh / 2 - 14, 4, 28],
                [bw - 5.5, bh / 2 - 14, 4, 28],
              ] as const
            ).map(([x, y, w, h], i) => (
              <rect key={`ec${i}`} x={x} y={y} width={w} height={h} fill="rgba(0,229,255,0.55)" />
            ))}
            {/* center emblem on the median line */}
            <g>
              <circle cx={bw / 2} cy={bh / 2} r={13} fill="rgba(0,229,255,0.12)" />
              <path
                d={`M ${bw / 2} ${bh / 2 - 9} L ${bw / 2 + 7} ${bh / 2} L ${bw / 2} ${bh / 2 + 9} L ${bw / 2 - 7} ${bh / 2} Z`}
                fill="rgba(10,14,26,0.85)"
                stroke="rgba(0,229,255,0.9)"
                strokeWidth={1.5}
              />
              <circle cx={bw / 2} cy={bh / 2} r={2} fill="#00e5ff" />
            </g>
          </svg>
        )}

        {/* Lane win tints */}
        {bw > 0 &&
          state.lanes.map((lane, i) =>
            lane.winner ? (
              <div
                key={`win${i}`}
                className="lane-overlay"
                style={{
                  left: 0,
                  top: i * cellH,
                  width: bw,
                  height: cellH,
                  background:
                    lane.winner === 'player1' ? 'rgba(0,229,255,0.16)' : 'rgba(255,47,214,0.16)',
                  border: `2px solid ${lane.winner === 'player1' ? '#00e5ff' : '#ff2fd6'}`,
                }}
              />
            ) : null,
          )}

        {/* Frozen lane tints */}
        {bw > 0 &&
          Object.entries(state.frozenLanes).map(([laneStr, frozenBy]) => {
            const i = Number(laneStr);
            if (state.lanes[i]?.winner) return null;
            const rightSide = frozenBy === 'player1';
            return (
              <div
                key={`frozen${i}`}
                className="lane-overlay"
                style={{
                  left: rightSide ? halfW : 0,
                  top: i * cellH,
                  width: halfW,
                  height: cellH,
                  background: 'rgba(33,150,243,0.25)',
                  border: '2px solid #42A5F5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                }}
              >
                <Icon name="snowflake" size={16} color="#64B5F6" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64B5F6' }}>FROZEN</span>
              </div>
            );
          })}

        {/* Lane effect pills */}
        {bw > 0 && <LaneEffects state={state} cellH={cellH} halfW={halfW} />}

        {/* Center line */}
        <div className="center-line" style={{ width: centerLineW, marginLeft: -centerLineW / 2 }} />

        {/* Pieces */}
        {pieces}

        {/* Removal bursts */}
        {bursts.map((b) => (
          <div
            key={b.key}
            className={`piece ${b.side === 'player1' ? 'p1' : 'p2'} burst-out`}
            style={{ left: b.x, top: b.y, width: pieceSize, height: pieceSize }}
          >
            <Icon
              name="burst"
              size={pieceSize * 0.6}
              color={b.side === 'player1' ? '#00e5ff' : '#ff2fd6'}
            />
          </div>
        ))}

        {/* Fog banners over halves hidden by Cloak/Blind */}
        {bw > 0 && hideP1 && p1FogLabel && (
          <FogOverlay left={0} width={halfW} height={bh} label={p1FogLabel} />
        )}
        {bw > 0 && hideP2 && p2FogLabel && (
          <FogOverlay left={halfW} width={halfW} height={bh} label={p2FogLabel} />
        )}

        {/* Lane selection highlights */}
        {bw > 0 && isSelectingLane && selectedPerkId !== null && (
          <LaneSelection
            state={state}
            selectedPerkId={selectedPerkId}
            firstSelectedLane={firstSelectedLane}
            validLanes={validLanes}
            cellH={cellH}
            halfW={halfW}
            bw={bw}
            onLaneClick={onLaneClick}
          />
        )}
      </div>
    </div>
  );
}

// --- Lane effects -------------------------------------------------------------

interface EffectEntry {
  name: string;
  icon: IconName;
  category: PerkCategory;
  turnsLeft: number;
  owner: PlayerSide;
}

const OFFENSIVE_TRIGGERS = new Set(['SHOCKWAVE', 'BACKFIRE', 'RETALIATE']);
const OFFENSIVE_DEFERRED = new Set(['ENLIST', 'AMBUSH']);

/** Engine trigger/deferred/raid type -> the perk it came from (for display names). */
const EFFECT_PERK_IDS: Record<string, number> = {
  PORTAL: 24,
  TRAP: 25,
  MIRROR: 26,
  ECHO: 27,
  SHOCKWAVE: 28,
  HYDRA: 29,
  BACKFIRE: 30,
  ABSORB: 46,
  RETALIATE: 52,
  SIGNAL: 43,
  ENLIST: 40,
  AMBUSH: 41,
  REINFORCE: 42,
  RAID: 51,
};

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/** Catalog name for an engine effect type (falls back to title-cased type). */
function effectLabel(type: string, lang: Lang): string {
  const perkId = EFFECT_PERK_IDS[type];
  const perk = perkId !== undefined ? getPerk(perkId) : undefined;
  return perk ? perkName(perk, lang) : titleCase(type);
}

/** The originating perk's glyph for an engine effect type, if known. */
function effectIcon(type: string, fallback: IconName): IconName {
  const perkId = EFFECT_PERK_IDS[type];
  return perkId !== undefined ? perkIcon(perkId) : fallback;
}

function effectsForLane(
  state: CombatGameState,
  lane: Lane,
  laneIndex: number,
  lang: Lang,
): EffectEntry[] {
  const entries: EffectEntry[] = [];
  for (const t of lane.triggers) {
    const offensive = OFFENSIVE_TRIGGERS.has(t.type);
    entries.push({
      name: effectLabel(t.type, lang),
      icon: effectIcon(t.type, offensive ? 'warning' : 'shield'),
      category: offensive ? 'offensive' : 'defensive',
      turnsLeft: t.turnsLeft,
      owner: t.owner === 1 ? 'player1' : 'player2',
    });
  }
  for (const d of lane.deferred) {
    entries.push({
      name: effectLabel(d.type, lang),
      icon: effectIcon(d.type, 'schedule'),
      category: OFFENSIVE_DEFERRED.has(d.type) ? 'offensive' : 'utility',
      turnsLeft: 0,
      owner: d.owner === 1 ? 'player1' : 'player2',
    });
  }
  (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
    const sancs = side === 'player1' ? state.player1Sanctuaries : state.player2Sanctuaries;
    for (const s of sancs) {
      if (s.lane === laneIndex) {
        const perk = getPerk(49);
        entries.push({
          name: perk ? perkName(perk, lang) : 'Safe Zone',
          icon: perkIcon(49),
          category: 'defensive',
          turnsLeft: s.turnsLeft,
          owner: side,
        });
      }
    }
    const caps = side === 'player1' ? state.player1Captures : state.player2Captures;
    for (const c of caps) {
      if (c.lane === laneIndex) {
        const perk = getPerk(50);
        entries.push({
          name: perk ? perkName(perk, lang) : 'Magnet',
          icon: perkIcon(50),
          category: 'offensive',
          turnsLeft: c.turnsLeft,
          owner: side,
        });
      }
    }
  });
  for (const r of state.pendingRaids) {
    if (r.lane === laneIndex) {
      entries.push({
        name: effectLabel(r.source, lang),
        icon: effectIcon(r.source, 'raid'),
        category: 'offensive',
        turnsLeft: r.turnsUntilResolve,
        owner: r.owner === 1 ? 'player1' : 'player2',
      });
    }
  }
  return entries;
}

function LaneEffects({
  state,
  cellH,
  halfW,
}: {
  state: CombatGameState;
  cellH: number;
  halfW: number;
}) {
  const { lang } = useLang();
  const t = useT();
  const out: ReactNode[] = [];
  state.lanes.forEach((lane, i) => {
    if (lane.winner) return;
    const all = effectsForLane(state, lane, i, lang);
    (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
      const effects = all.filter((e) => e.owner === side);
      if (effects.length === 0) return;
      const base = CATEGORY_COLOR[effects[0].category];
      out.push(
        <div
          key={`fx-${i}-${side}`}
          className="effect-overlay"
          style={{
            left: side === 'player1' ? 0 : halfW,
            top: i * cellH,
            width: halfW,
            height: cellH,
            background: `${base}26`, // 15%
            border: `1.5px solid ${base}99`, // 60%
          }}
        >
          {effects.length > 2 ? (
            <span className="effect-pill" style={{ background: `${base}33`, color: base }}>
              <Icon name={effects[0].icon} size={10} color={base} />
              {t('combat.effects', { count: effects.length })}
            </span>
          ) : (
            effects.map((e, j) => (
              <span
                key={j}
                className="effect-pill"
                style={{ background: `${base}33`, color: base }}
              >
                <Icon name={e.icon} size={10} color={base} />
                {e.name}
                {e.turnsLeft > 0 && (
                  <span className="turns" style={{ background: `${base}66` }}>
                    {e.turnsLeft}
                  </span>
                )}
              </span>
            ))
          )}
        </div>,
      );
    });
  });
  return <>{out}</>;
}

// --- Lane selection overlays ----------------------------------------------------

function LaneSelection({
  state,
  selectedPerkId,
  firstSelectedLane,
  validLanes,
  cellH,
  halfW,
  bw,
  onLaneClick,
}: {
  state: CombatGameState;
  selectedPerkId: number;
  firstSelectedLane: number | null;
  validLanes: number[];
  cellH: number;
  halfW: number;
  bw: number;
  onLaneClick: (i: number) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const me = state.currentPlayer;
  const info = getPerk(selectedPerkId);
  const label = info ? perkName(info, lang) : '';
  const side = info?.targetSide ?? 'both';
  const style = sideStyleFor(selectedPerkId, info);
  const icon = perkIcon(selectedPerkId);

  // Player 1 always owns the left half of the board, player 2 the right.
  const highlightLeft =
    side === 'own'
      ? me === 'player1'
        ? 0
        : halfW
      : side === 'enemy'
        ? me === 'player1'
          ? halfW
          : 0
        : 0;
  const highlightWidth = side === 'both' ? bw : halfW;

  return (
    <>
      {state.lanes.map((lane, i) => {
        if (lane.winner) return null;

        if (firstSelectedLane === i && DUAL_LANE_PERKS.has(selectedPerkId)) {
          // First selected lane of a dual-lane perk, on the half the perk affects
          return (
            <div
              key={i}
              className="lane-overlay"
              style={{
                left: highlightLeft,
                top: i * cellH,
                width: highlightWidth,
                height: cellH,
                background: 'rgba(255,152,0,0.35)',
                border: '3px solid #FFA726',
                boxShadow: '0 0 8px 1px rgba(255,152,0,0.4)',
              }}
            >
              <div className="pill-center">
                <span className="lane-pill" style={{ background: 'rgba(245,124,0,0.9)' }}>
                  <Icon name="check" size={14} color="#fff" />
                  {t('combat.laneChecked', { n: i + 1 })}
                </span>
              </div>
            </div>
          );
        }

        if (!validLanes.includes(i)) {
          return (
            <div
              key={i}
              className="lane-overlay"
              style={{
                left: 0,
                top: i * cellH,
                width: bw,
                height: cellH,
                background: 'rgba(158,158,158,0.15)',
              }}
            />
          );
        }

        // Highlight only the half of the lane the perk affects.
        return (
          <div
            key={i}
            className="lane-overlay tappable"
            style={{
              left: highlightLeft,
              top: i * cellH,
              width: highlightWidth,
              height: cellH,
              background: style.fill,
              border: `3px solid ${style.border}`,
              boxShadow: `0 0 8px 1px ${style.fill}`,
            }}
            onClick={() => onLaneClick(i)}
          >
            <div className="pill-center">
              <span className="lane-pill" style={{ background: style.pill }}>
                <Icon name={icon} size={14} color="#fff" />
                {label} {i + 1}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// --- Targeting hint (below the board, replaces the perk panel while aiming) -----

function TargetingHint({
  W,
  perkId,
  info,
  firstSelectedLane,
  onCancel,
}: {
  W: number;
  perkId: number;
  info: PerkInfo;
  firstSelectedLane: number | null;
  onCancel: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const style = sideStyleFor(perkId, info);
  const where =
    info.targetSide === 'own'
      ? t('combat.where.own')
      : info.targetSide === 'enemy'
        ? t('combat.where.enemy')
        : t('combat.where.both');
  const instruction = DUAL_LANE_PERKS.has(perkId)
    ? firstSelectedLane === null
      ? t('combat.aim.first', { where })
      : t('combat.aim.second', { where, n: firstSelectedLane + 1 })
    : t('combat.aim.single', { where });

  return (
    <div
      className="perk-bar"
      style={{
        padding: `${clamp(W * 0.01, 8, 14)}px ${clamp(W * 0.02, 12, 20)}px`,
        border: `2px solid ${style.border}`,
        boxShadow: `0 0 8px 1px ${style.fill}`,
      }}
    >
      <Icon name={perkIcon(perkId)} size={clamp(W * 0.022, 16, 24)} color={style.border} />
      <div className="info">
        <span className="name" style={{ fontSize: clamp(W * 0.016, 12, 18) }}>
          {perkName(info, lang)}
        </span>
        <span
          className="hint"
          style={{ fontSize: clamp(W * 0.016, 12, 18) * 0.85, color: style.border }}
        >
          {instruction}
        </span>
      </div>
      <button className="bar-btn cancel" onClick={onCancel}>
        <Icon name="close" size={14} color="#fff" />
        {t('common.cancel')}
      </button>
    </div>
  );
}

// --- Perk panel -----------------------------------------------------------------

function PerkPanel({
  slots,
  owners,
  disabled,
  aiHighlight,
  selectedPerkId,
  selectedInfo,
  onPerk,
  onPass,
  onConfirm,
  onCancel,
}: {
  slots: PerkSlot[];
  /** Campaign battles: the seated team, for "whose perk is this" tags. */
  owners?: Character[];
  disabled: boolean;
  aiHighlight: number | null;
  selectedPerkId: number | null;
  selectedInfo?: PerkInfo;
  onPerk: (perkId: number) => void;
  onPass: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const aiMode = aiHighlight !== null;
  const ownerOf = (perkId: number): Character | undefined =>
    owners?.find((c) => c.perkIds.includes(perkId));
  return (
    <div className={`perk-panel column${aiMode ? ' ai' : ''}`}>
      {/* Inline explanation of the selected perk, right where the player
          tapped — no separate top-of-screen confirmation bar. */}
      {!aiMode && selectedInfo && (
        <div
          className="perk-explain"
          style={{ borderColor: CATEGORY_COLOR[selectedInfo.category] }}
        >
          <Icon
            name={perkIcon(selectedInfo.id)}
            size={22}
            color={CATEGORY_COLOR[selectedInfo.category]}
          />
          <div className="info">
            <span className="row">
              <span className="name">{perkName(selectedInfo, lang)}</span>
              {/* Where the perk lands, matching the lane highlight color */}
              <span
                className="side-chip"
                style={{ background: SIDE_CHIP_COLOR[selectedInfo.targetSide] }}
              >
                <Icon name={perkIcon(selectedInfo.id)} size={10} color="#fff" />
                {t(SIDE_LABEL_KEY[selectedInfo.targetSide])}
              </span>
            </span>
            <PerkPicto perkId={selectedInfo.id} size={13} />
            <span className="desc">
              {selectedInfo.requiresTarget
                ? t('combat.descNext', { desc: perkDescription(selectedInfo, lang) })
                : perkDescription(selectedInfo, lang)}
            </span>
          </div>
          <button
            className="bar-btn"
            style={{ background: CATEGORY_COLOR[selectedInfo.category] }}
            onClick={onConfirm}
          >
            <Icon name="check" size={14} color="#fff" />
            {t('combat.use')}
          </button>
          <button className="bar-btn cancel" onClick={onCancel}>
            <Icon name="close" size={14} color="#fff" />
          </button>
        </div>
      )}
      <div className="perk-chip-row">
        {aiMode && (
          <span className="ai-chip">
            <Icon name="robot" size={12} color="#fff" />
            {t('combat.ai')}
          </span>
        )}
        {slots
          .filter((slot) => slot.perkId > 0)
          .map((slot) => {
            const info = getPerk(slot.perkId);
            const category = info?.category ?? 'utility';
            const isAiChoice = aiHighlight === slot.perkId;
            const isSel = selectedPerkId === slot.perkId;
            const recharging = slot.disabled === true;
            const owner = slot.slotIndex >= 2 ? ownerOf(slot.perkId) : undefined;
            const color =
              (disabled && !aiMode) || recharging ? '#757575' : CATEGORY_COLOR[category];
            return (
              <button
                key={slot.slotIndex}
                className={`perk-chip${isSel ? ' selected' : ''}${aiMode ? (isAiChoice ? ' ai-choice' : ' dimmed') : ''}${recharging ? ' dimmed' : ''}`}
                style={
                  isSel
                    ? {
                        borderColor: CATEGORY_COLOR[category],
                        background: `${CATEGORY_COLOR[category]}33`,
                      }
                    : undefined
                }
                disabled={disabled || recharging}
                onClick={() => onPerk(slot.perkId)}
              >
                {/* The glyph leads so pre-readers can pick powers by picture. */}
                <span className="perk-chip-glyph" style={{ color }}>
                  <Icon name={perkIcon(slot.perkId)} size={24} color={color} />
                </span>
                <span className="perk-chip-name">
                  {recharging
                    ? t('combat.recharging')
                    : info
                      ? perkName(info, lang)
                      : slot.perkName}
                </span>
                {!recharging && owner && (
                  <CharacterPortrait
                    character={owner}
                    className="perk-chip-owner"
                    style={{ borderColor: owner.accent }}
                  />
                )}
              </button>
            );
          })}
        {!aiMode && (
          <button className="pass-chip" disabled={disabled} onClick={onPass}>
            <span className="perk-chip-glyph" style={{ color: '#8899bb' }}>
              <Icon name="skip" size={24} color={disabled ? '#757575' : '#8899bb'} />
            </span>
            <span className="perk-chip-name">{t('combat.pass')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// --- Fog overlay (Cloak/Blind) ------------------------------------------------------

function FogOverlay({
  left,
  width,
  height,
  label,
}: {
  left: number;
  width: number;
  height: number;
  label: string;
}) {
  return (
    <div className="fog-overlay" style={{ left, top: 0, width, height }}>
      <span className="fog-pill">
        <Icon name="eyeOff" size={14} color="#fff" />
        {label}
      </span>
    </div>
  );
}

// --- Move log -----------------------------------------------------------------------

function MoveLogOverlay({
  entries,
  player1Hero,
  player2Hero,
  onClose,
}: {
  entries: MoveLogEntry[];
  player1Hero: Character;
  player2Hero: Character;
  onClose: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, []);
  return (
    <div className="modal-scrim" style={{ zIndex: 25 }} onClick={onClose}>
      <div className="move-log" onClick={(e) => e.stopPropagation()}>
        <div className="move-log-title">
          <Icon name="list" size={18} color="#FFCA28" />
          {t('combat.battleLog')}
          <button className="bar-btn cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="close" size={14} color="#fff" />
            {t('common.close')}
          </button>
        </div>
        <div className="move-log-list" ref={listRef}>
          {entries.length === 0 && <span className="move-log-empty">{t('combat.nothingYet')}</span>}
          {entries.map((e, i) => {
            const hero = e.side === 'player1' ? player1Hero : player2Hero;
            const color = e.side === 'player1' ? '#00e5ff' : '#ff2fd6';
            return (
              <div key={i} className="move-log-row">
                <span className="ply">{e.ply + 1}</span>
                <span>
                  <b style={{ color }}>{hero.name}</b> {formatMoveLog(e.msg, lang)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Turn dialog ------------------------------------------------------------------

function TurnDialog({
  W,
  hero,
  isP1,
  isAI,
  isOpeningTurn,
  onReady,
}: {
  W: number;
  hero: Character;
  isP1: boolean;
  isAI: boolean;
  isOpeningTurn: boolean;
  onReady: () => void;
}) {
  const t = useT();
  const playerColor = isP1 ? '#00e5ff' : '#ff2fd6';
  const cardW = clamp(W * 0.35, 220, 400);
  const padding = clamp(W * 0.025, 16, 30);
  const avatarSize = clamp(W * 0.12, 80, 150);
  return (
    <div className="modal-scrim" style={{ zIndex: 30 }}>
      <div
        style={{
          width: cardW,
          padding,
          background: '#131a2e',
          borderRadius: 20,
          border: `3px solid ${playerColor}`,
          boxShadow: `0 0 20px 4px ${playerColor}66`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <CharacterPortrait
          character={hero}
          style={{ width: avatarSize, height: avatarSize, objectFit: 'contain' }}
        />
        <div style={{ height: padding * 0.5 }} />
        <span style={{ fontSize: clamp(W * 0.028, 18, 32), fontWeight: 700, color: playerColor }}>
          {hero.name}
        </span>
        <div style={{ height: padding * 0.25 }} />
        <span style={{ fontSize: clamp(W * 0.02, 14, 24), fontWeight: 500, color: '#fff' }}>
          {t('combat.yourTurn')}
        </span>
        {isOpeningTurn && (
          <>
            <div style={{ height: padding * 0.25 }} />
            <span
              style={{
                fontSize: clamp(W * 0.014, 11, 16),
                color: '#FFCA28',
                textAlign: 'center',
              }}
            >
              {t('combat.fairStart')}
            </span>
          </>
        )}
        <div style={{ height: padding * 0.75 }} />
        <button
          className="img-btn red"
          style={{
            width: clamp(W * 0.12, 100, 160),
            height: clamp(W * 0.04, 36, 52),
            fontSize: clamp(W * 0.018, 14, 22),
          }}
          onClick={isAI ? undefined : onReady}
        >
          {t('combat.ready')}
        </button>
      </div>
    </div>
  );
}

export type { CombatResult };
