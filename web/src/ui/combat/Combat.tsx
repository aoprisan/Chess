import { useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { CombatEngine } from '../../game/engine';
import { getValidLanesForPerk, perkRequiresTarget } from '../../game/targeting';
import { getPerk } from '../../game/perks';
import { Character, buildPerkPools } from '../../game/characters';
import { PlayerSide, isCloaked, isBlinded } from '../../game/state';
import { starsForBattle } from '../../campaign/balance';

import { Icon } from '../Icons';
import { perkIcon } from '../perkTheme';
import { useLang, useT, perkName } from '../../i18n';

import { clamp, DUAL_LANE_PERKS, CombatResult } from './theme';
import { useLaterTimers, useTurnLoop } from './useTurnLoop';
import { TutorialCoach } from './TutorialCoach';
import { PlayerHeaders } from './PlayerHeaders';
import { GameBoard } from './GameBoard';
import { TargetingHint } from './TargetingHint';
import { PerkPanel } from './PerkPanel';
import { MoveLogOverlay } from './MoveLogOverlay';
import { TurnDialog } from './TurnDialog';

// Landscape board with 5 horizontal data lines x 10 slots (P1 left/cyan,
// P2 right/magenta), neon grid field, turn pill, CSS-drawn player panels and
// turn flag, compact dark perk bar, pass-and-play turn dialog (auto-dismissed
// for the AI).

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
    // One-time lazy init; the wall-clock value only names the game instance.
    // eslint-disable-next-line react-hooks/purity
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

  const [selectedPerkId, setSelectedPerkId] = useState<number | null>(null);
  const [isSelectingLane, setIsSelectingLane] = useState(false);
  const [firstSelectedLane, setFirstSelectedLane] = useState<number | null>(null);
  const [showMoveLog, setShowMoveLog] = useState(false);

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

  const later = useLaterTimers();

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

  const {
    showTurnDialog,
    dismissTurnDialog,
    tutStep,
    onTutorialNext,
    onTutorialSkip,
    lastPlacement,
    afterMutation,
  } = useTurnLoop({ engine, player2IsAI, bump, later, onAIPerk: flashPerk });

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

export type { CombatResult };
