import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { CombatEngine } from '../game/engine';
import { chooseAIPerk } from '../game/ai';
import { getValidLanesForPerk, perkRequiresTarget } from '../game/targeting';
import { getPerk, PerkCategory, PerkSlot } from '../game/perks';
import { Hero } from '../game/hero';
import {
  CombatGameState,
  Lane,
  PlayerSide,
  isCloaked,
  isBlinded,
} from '../game/state';
import { heroImage, ui } from './assets';
import { Icon, IconName } from './Icons';

// Mirrors client/lib/screens/combat_screen.dart: landscape board with 5
// horizontal lanes x 10 columns (P1 left/green, P2 right/purple), doodle
// background, white turn pill, image-backed player panels, turn flag,
// painted grid + red center line, compact dark perk bar with amber border,
// pass-and-play turn dialog (auto-dismissed for the AI).

const DUAL_LANE_PERKS = new Set([33, 34]);
const ENEMY_TRIGGER_PERKS = new Set([24, 25, 26, 27, 50]);
const FREEZE_PERK = 4;

const CATEGORY_COLOR: Record<PerkCategory, string> = {
  offensive: '#EF5350', // red.shade400
  defensive: '#42A5F5', // blue.shade400
  utility: '#FFCA28', // amber.shade400
};
const CATEGORY_ICON: Record<PerkCategory, IconName> = {
  offensive: 'flash',
  defensive: 'shield',
  utility: 'build',
};

interface CombatResult {
  playerWon: boolean;
  stars: number; // 0 on loss, 1-3 on win
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function Combat({
  player1Hero,
  player2Hero,
  aiDifficulty,
  onGameEnd,
}: {
  player1Hero: Hero;
  player2Hero: Hero;
  aiDifficulty: string;
  onGameEnd: (result: CombatResult) => void;
}) {
  const engineRef = useRef<CombatEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new CombatEngine(`game_${Date.now()}`, {
      player1Hero: player1Hero.type,
      player2Hero: player2Hero.type,
      player2IsAI: true,
      player2AIDifficulty: aiDifficulty,
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

  // --- Turn loop -----------------------------------------------------------

  const tick = useCallback(function tickFn() {
    const s = engine.state;
    if (s.status !== 'playing') { bump(); return; }
    if (showTurnDialogRef.current) return; // paused while the turn dialog is up

    if (s.currentPhase === 'autoPlacement') {
      later(() => {
        if (showTurnDialogRef.current) return;
        if (engine.state.currentPhase !== 'autoPlacement') { tickFn(); return; }
        const placer = engine.state.currentPlayer;
        const placed = engine.autoPlace();
        if (placed >= 0) {
          lastPlacement.current = {
            lane: placed,
            player: placer,
            counter: (lastPlacement.current?.counter ?? 0) + 1,
          };
        }
        if (placed === -1 && engine.state.status === 'playing' && engine.state.currentPhase === 'autoPlacement') {
          engine.skipTurn();
        }
        afterMutation();
      }, 300);
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
          if (perkId === 0) engine.skipTurn();
          else engine.executePerk(perkId, target, second);
          afterMutation();
        }, 650);
      }, 400);
    }
    // Human perk selection: wait for input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, bump, later]);

  /** After any engine mutation: detect turn changes (turn dialog) and resume the loop. */
  const afterMutation = useCallback(() => {
    const s = engine.state;
    if (s.status === 'playing' && s.currentPlayer !== prevPlayerRef.current) {
      prevPlayerRef.current = s.currentPlayer;
      if (s.currentPlayer === 'player2') {
        // AI turn: show briefly, then auto-dismiss.
        setTurnDialog(true);
        later(() => {
          if (showTurnDialogRef.current) {
            setTurnDialog(false);
            tick();
          }
        }, 600);
      }
      // Human turns flow straight into auto-placement; the tap-gated dialog
      // only appears on the opening turn (initial state, fair-start hint).
    }
    bump();
    tick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, bump, later, tick, setTurnDialog]);

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
    setSelectedPerkId(perkId);
    setIsSelectingLane(false);
    setFirstSelectedLane(null);
  };

  const onConfirmPerk = () => {
    if (selectedPerkId === null) return;
    if (perkRequiresTarget(selectedPerkId) || DUAL_LANE_PERKS.has(selectedPerkId)) {
      setIsSelectingLane(true);
      return;
    }
    engine.executePerk(selectedPerkId, -1);
    resetSelection();
    afterMutation();
  };

  const onLaneClick = (laneIndex: number) => {
    if (!isSelectingLane || selectedPerkId === null) return;
    const validLanes = getValidLanesForPerk(selectedPerkId, state, state.currentPlayer, firstSelectedLane);
    if (!validLanes.includes(laneIndex)) return;

    if (DUAL_LANE_PERKS.has(selectedPerkId)) {
      if (firstSelectedLane === null) {
        setFirstSelectedLane(laneIndex);
        return;
      }
      engine.executePerk(selectedPerkId, laneIndex, firstSelectedLane);
    } else {
      engine.executePerk(selectedPerkId, laneIndex);
    }
    resetSelection();
    afterMutation();
  };

  const onPass = () => {
    if (!humanTurn) return;
    engine.skipTurn();
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

  // Visibility (Flutter: viewer = currentPlayer in local play, null while dialog up)
  const viewer: PlayerSide | null = showTurnDialog ? null : state.currentPlayer;
  const blindViewer = viewer ?? state.currentPlayer;
  const hideP1 =
    (isCloaked(state, 'player1') && viewer !== 'player1') ||
    (isBlinded(state, 'player1') && blindViewer === 'player1');
  const hideP2 =
    (isCloaked(state, 'player2') && viewer !== 'player2') ||
    (isBlinded(state, 'player2') && blindViewer === 'player2');

  const gap = H * 0.005;
  const selectedInfo = selectedPerkId !== null ? getPerk(selectedPerkId) : undefined;

  return (
    <div className="combat doodle-bg" ref={rootRef}>
      <div style={{ height: gap }} />

      {/* Turn pill */}
      <div
        className="turn-pill"
        style={{
          padding: `${clamp(W * 0.01, 6, 12)}px ${clamp(W * 0.025, 16, 28)}px`,
          fontSize: clamp(W * 0.018, 14, 20),
        }}
      >
        {finished ? `${winnerHero.name} Wins!` : `${currentHero.name} Turn`}
      </div>

      <div style={{ height: gap }} />

      <PlayerHeaders
        W={W}
        H={H}
        player1Hero={player1Hero}
        player2Hero={player2Hero}
        state={state}
      />

      <div style={{ height: gap }} />

      {/* Game field */}
      <div style={{ flex: 1, minHeight: 0, padding: `0 ${clamp(W * 0.02, 8, 20)}px`, display: 'flex' }}>
        <GameBoard
          W={W}
          state={state}
          player1Hero={player1Hero}
          player2Hero={player2Hero}
          hideP1={hideP1}
          hideP2={hideP2}
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
              background: winnerIsP1 ? '#C8E6C9' : '#E1BEE7',
              color: winnerIsP1 ? '#388E3C' : '#7B1FA2',
              fontSize: clamp(W * 0.022, 16, 28),
            }}
          >
            {winnerHero.name} Wins!
          </div>
          <div style={{ height: W * 0.012 }} />
          <button
            className="img-btn red"
            style={{
              width: clamp(W * 0.15, 120, 180),
              height: clamp(W * 0.045, 36, 56),
              fontSize: clamp(W * 0.016, 12, 20),
            }}
            onClick={() => {
              const rivalLanes = state.player2LanesWon;
              const playerWon = state.gameWinner === 'player1';
              const stars = playerWon ? (rivalLanes === 0 ? 3 : rivalLanes === 1 ? 2 : 1) : 0;
              onGameEnd({ playerWon, stars });
            }}
          >
            Back to Map
          </button>
        </div>
      ) : state.currentPhase === 'autoPlacement' && !showTurnDialog ? (
        <div className="placing-row" style={{ paddingBottom: H * 0.01, fontSize: clamp(W * 0.016, 12, 20) }}>
          <span
            className="spinner small"
            style={{
              width: clamp(W * 0.018, 14, 22),
              height: clamp(W * 0.018, 14, 22),
              borderColor: 'rgba(255,202,40,0.3)',
              borderTopColor: '#FFCA28',
            }}
          />
          Placing piece...
        </div>
      ) : state.currentPhase === 'perkSelection' && !showTurnDialog ? (
        engine.isCurrentPlayerAI && engine.lastAIPerkId === null ? (
          <div style={{ paddingBottom: H * 0.01, display: 'flex', justifyContent: 'center' }}>
            <div className="waiting-pill">
              <span className="spinner small" style={{ borderColor: 'rgba(189,189,189,0.3)', borderTopColor: '#BDBDBD' }} />
              Opponent&apos;s turn
            </div>
          </div>
        ) : (
          <PerkPanel
            slots={engine.currentPerkSlots}
            disabled={!humanTurn}
            aiHighlight={engine.lastAIPerkId}
            selectedPerkId={selectedPerkId}
            onPerk={onPerkClick}
            onPass={onPass}
          />
        )
      ) : (
        <div style={{ height: H * 0.01 }} />
      )}

      {/* Perk confirmation bar (perk picked, not yet targeting) */}
      {selectedPerkId !== null && !isSelectingLane && selectedInfo && (
        <div
          className="perk-bar"
          style={{
            padding: `${clamp(W * 0.01, 8, 14)}px ${clamp(W * 0.02, 12, 20)}px`,
            border: `2px solid ${CATEGORY_COLOR[selectedInfo.category]}`,
            boxShadow: `0 0 8px 1px ${CATEGORY_COLOR[selectedInfo.category]}4D`,
          }}
        >
          <Icon
            name={CATEGORY_ICON[selectedInfo.category]}
            size={clamp(W * 0.022, 16, 24)}
            color={CATEGORY_COLOR[selectedInfo.category]}
          />
          <div className="info">
            <span className="name" style={{ fontSize: clamp(W * 0.016, 12, 18) }}>{selectedInfo.name}</span>
            <span className="desc" style={{ fontSize: clamp(W * 0.016, 12, 18) * 0.8 }}>{selectedInfo.description}</span>
          </div>
          <button
            className="bar-btn"
            style={{ background: CATEGORY_COLOR[selectedInfo.category] }}
            onClick={onConfirmPerk}
          >
            <Icon name="check" size={14} color="#fff" />
            Go
          </button>
          <button className="bar-btn cancel" onClick={resetSelection}>
            <Icon name="close" size={14} color="#fff" />
            Cancel
          </button>
        </div>
      )}

      {/* Perk targeting bar (selecting a lane) */}
      {isSelectingLane && selectedInfo && (
        <div
          className="perk-bar"
          style={{
            padding: `${clamp(W * 0.01, 8, 14)}px ${clamp(W * 0.02, 12, 20)}px`,
            border: `2px solid ${CATEGORY_COLOR[selectedInfo.category]}`,
            boxShadow: `0 0 8px 1px ${CATEGORY_COLOR[selectedInfo.category]}4D`,
          }}
        >
          <Icon
            name={CATEGORY_ICON[selectedInfo.category]}
            size={clamp(W * 0.022, 16, 24)}
            color={CATEGORY_COLOR[selectedInfo.category]}
          />
          <div className="info">
            <span className="name" style={{ fontSize: clamp(W * 0.016, 12, 18) }}>{selectedInfo.name}</span>
            <span className="desc" style={{ fontSize: clamp(W * 0.016, 12, 18) * 0.8 }}>{selectedInfo.description}</span>
            <span className="hint" style={{ fontSize: clamp(W * 0.016, 12, 18) * 0.85 }}>
              {DUAL_LANE_PERKS.has(selectedPerkId!)
                ? firstSelectedLane === null
                  ? 'Select first lane'
                  : `Select second lane (Lane ${firstSelectedLane + 1} selected)`
                : 'Select a lane on the board'}
            </span>
          </div>
          <button className="bar-btn cancel" onClick={resetSelection}>
            <Icon name="close" size={14} color="#fff" />
            Cancel
          </button>
        </div>
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
    </div>
  );
}

// --- Player headers ---------------------------------------------------------

function PlayerHeaders({
  W,
  H,
  player1Hero,
  player2Hero,
  state,
}: {
  W: number;
  H: number;
  player1Hero: Hero;
  player2Hero: Hero;
  state: CombatGameState;
}) {
  const spacing = clamp(W * 0.008, 4, 10);
  const avatarW = clamp(W * 0.1, 50, 140);
  const avatarH = clamp(H * 0.1, 60, 160);
  const titleW = clamp(W * 0.14, 90, 160);
  const titleH = clamp(W * 0.05, 34, 52);
  const scoreW = clamp(W * 0.065, 45, 75);
  const fontSize = clamp(W * 0.018, 13, 20);

  const indicatorW = clamp(W * 0.08, 50, 90);
  const indicatorH = clamp(H * 0.1, 60, 160);
  const poleW = clamp(W * 0.005, 3, 6);
  const flagW = clamp(W * 0.04, 28, 50);
  const flagH = clamp(W * 0.05, 34, 60);
  const isP1Turn = state.currentPlayer === 'player1';

  const title = (side: PlayerSide, hero: Hero) => (
    <div
      className="pp-title"
      style={{
        width: titleW,
        height: titleH,
        fontSize,
        backgroundImage: `url(${side === 'player1' ? ui.p1TitleBg : ui.p2TitleBg})`,
        paddingLeft: side === 'player1' ? 8 : 0,
        paddingRight: side === 'player1' ? 0 : 8,
      }}
    >
      {hero.name}
    </div>
  );
  const score = (side: PlayerSide, value: number) => (
    <div
      className="pp-score"
      style={{
        width: scoreW,
        height: titleH,
        fontSize,
        backgroundImage: `url(${side === 'player1' ? ui.p1ScoreBg : ui.p2ScoreBg})`,
      }}
    >
      {value}
    </div>
  );

  return (
    <div className="player-headers" style={{ padding: `0 ${clamp(W * 0.02, 8, 20)}px` }}>
      <div className="player-panel p1">
        <img className="pp-avatar" src={heroImage(player1Hero.imagePath)} alt={player1Hero.name} style={{ width: avatarW, height: avatarH }} />
        <span style={{ width: spacing }} />
        {title('player1', player1Hero)}
        {score('player1', state.player1Pieces)}
      </div>

      <div className="flag-indicator" style={{ width: indicatorW, height: indicatorH }}>
        <div className="flag-pole" style={{ top: indicatorH * 0.2, width: poleW, height: indicatorH * 0.8 }} />
        <img
          className="flag-img"
          src={ui.turnFlag}
          alt="turn"
          style={{
            top: indicatorH * 0.2,
            width: flagW,
            height: flagH,
            left: isP1Turn ? 0 : indicatorW - flagW,
            transform: isP1Turn ? 'scaleX(-1)' : undefined,
          }}
        />
      </div>

      <div className="player-panel p2">
        {score('player2', state.player2Pieces)}
        {title('player2', player2Hero)}
        <span style={{ width: spacing }} />
        <img className="pp-avatar" src={heroImage(player2Hero.imagePath)} alt={player2Hero.name} style={{ width: avatarW, height: avatarH }} />
      </div>
    </div>
  );
}

// --- Game board ---------------------------------------------------------------

function GameBoard({
  W,
  state,
  player1Hero,
  player2Hero,
  hideP1,
  hideP2,
  lastPlacement,
  isSelectingLane,
  selectedPerkId,
  firstSelectedLane,
  validLanes,
  onLaneClick,
}: {
  W: number;
  state: CombatGameState;
  player1Hero: Hero;
  player2Hero: Hero;
  hideP1: boolean;
  hideP2: boolean;
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
              key={isNewest ? `${side}-${laneIndex}-${c}-anim${lastPlacement.counter}` : `${side}-${laneIndex}-${c}`}
              className={`piece${isNewest ? (side === 'player1' ? ' slide-left' : ' slide-right') : ''}`}
              style={
                {
                  left: x,
                  top: y,
                  width: pieceSize,
                  height: pieceSize,
                  backgroundImage: `url(${side === 'player1' ? ui.p1ItemBg : ui.p2ItemBg})`,
                  '--slide-dist': `${slideDist}px`,
                } as CSSProperties
              }
            >
              <img className="portrait" src={heroImage(hero.imagePath)} alt="" />
            </div>,
          );
        });
      });
    });
  }

  return (
    <div className="game-field" ref={boardRef} style={{ flex: 1, borderRadius: radius }}>
      <div className="field-inner" style={{ margin: padding }}>
        {/* Grid lines (painted #E0E0E0, 1px) */}
        {bw > 0 && (
          <svg width={bw} height={bh} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={(i + 1) * cellW} y1={0} x2={(i + 1) * cellW} y2={bh} stroke="#E0E0E0" strokeWidth={1} />
            ))}
            {Array.from({ length: 4 }, (_, i) => (
              <line key={`h${i}`} x1={0} y1={(i + 1) * cellH} x2={bw} y2={(i + 1) * cellH} stroke="#E0E0E0" strokeWidth={1} />
            ))}
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
                  background: lane.winner === 'player1' ? 'rgba(76,175,80,0.2)' : 'rgba(156,39,176,0.2)',
                  border: `2px solid ${lane.winner === 'player1' ? '#4CAF50' : '#9C27B0'}`,
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

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function effectsForLane(state: CombatGameState, lane: Lane, laneIndex: number): EffectEntry[] {
  const entries: EffectEntry[] = [];
  for (const t of lane.triggers) {
    const offensive = OFFENSIVE_TRIGGERS.has(t.type);
    entries.push({
      name: titleCase(t.type),
      icon: offensive ? 'warning' : 'shield',
      category: offensive ? 'offensive' : 'defensive',
      turnsLeft: t.turnsLeft,
      owner: t.owner === 1 ? 'player1' : 'player2',
    });
  }
  for (const d of lane.deferred) {
    entries.push({
      name: titleCase(d.type),
      icon: 'schedule',
      category: OFFENSIVE_DEFERRED.has(d.type) ? 'offensive' : 'utility',
      turnsLeft: 0,
      owner: d.owner === 1 ? 'player1' : 'player2',
    });
  }
  (['player1', 'player2'] as PlayerSide[]).forEach((side) => {
    const sancs = side === 'player1' ? state.player1Sanctuaries : state.player2Sanctuaries;
    for (const s of sancs) {
      if (s.lane === laneIndex) {
        entries.push({ name: 'Sanctuary', icon: 'heart', category: 'defensive', turnsLeft: s.turnsLeft, owner: side });
      }
    }
    const caps = side === 'player1' ? state.player1Captures : state.player2Captures;
    for (const c of caps) {
      if (c.lane === laneIndex) {
        entries.push({ name: 'Capture', icon: 'crosshair', category: 'offensive', turnsLeft: c.turnsLeft, owner: side });
      }
    }
  });
  for (const r of state.pendingRaids) {
    if (r.lane === laneIndex) {
      entries.push({
        name: titleCase(r.source),
        icon: 'raid',
        category: 'offensive',
        turnsLeft: r.turnsUntilResolve,
        owner: r.owner === 1 ? 'player1' : 'player2',
      });
    }
  }
  return entries;
}

function LaneEffects({ state, cellH, halfW }: { state: CombatGameState; cellH: number; halfW: number }) {
  const out: ReactNode[] = [];
  state.lanes.forEach((lane, i) => {
    if (lane.winner) return;
    const all = effectsForLane(state, lane, i);
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
              {effects.length} effects
            </span>
          ) : (
            effects.map((e, j) => (
              <span key={j} className="effect-pill" style={{ background: `${base}33`, color: base }}>
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
  const me = state.currentPlayer;
  const enemyHalfLeft = me === 'player1' ? halfW : 0;
  const myHalfLeft = me === 'player1' ? 0 : halfW;
  const perkName = getPerk(selectedPerkId)?.name ?? '';

  return (
    <>
      {state.lanes.map((lane, i) => {
        if (lane.winner) return null;

        if (firstSelectedLane === i && DUAL_LANE_PERKS.has(selectedPerkId)) {
          // First selected lane of a dual-lane perk (Regroup = own half, Disrupt = enemy half)
          const left = selectedPerkId === 33 ? myHalfLeft : enemyHalfLeft;
          return (
            <div
              key={i}
              className="lane-overlay"
              style={{
                left,
                top: i * cellH,
                width: halfW,
                height: cellH,
                background: 'rgba(255,152,0,0.35)',
                border: '3px solid #FFA726',
                boxShadow: '0 0 8px 1px rgba(255,152,0,0.4)',
              }}
            >
              <div className="pill-center">
                <span className="lane-pill" style={{ background: 'rgba(245,124,0,0.9)' }}>
                  <Icon name="check" size={14} color="#fff" />
                  Lane {i + 1} ✓
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
              style={{ left: 0, top: i * cellH, width: bw, height: cellH, background: 'rgba(158,158,158,0.15)' }}
            />
          );
        }

        if (selectedPerkId === FREEZE_PERK) {
          return (
            <div
              key={i}
              className="lane-overlay tappable"
              style={{
                left: enemyHalfLeft,
                top: i * cellH,
                width: halfW,
                height: cellH,
                background: 'rgba(33,150,243,0.35)',
                border: '3px solid #42A5F5',
                boxShadow: '0 0 8px 1px rgba(33,150,243,0.4)',
              }}
              onClick={() => onLaneClick(i)}
            >
              <div className="pill-center">
                <span className="lane-pill" style={{ background: 'rgba(25,118,210,0.9)' }}>
                  <Icon name="snowflake" size={14} color="#fff" />
                  Freeze {i + 1}
                </span>
              </div>
            </div>
          );
        }

        if (ENEMY_TRIGGER_PERKS.has(selectedPerkId)) {
          const icon: IconName =
            selectedPerkId === 24 ? 'swap' : selectedPerkId === 26 ? 'flip' : selectedPerkId === 27 ? 'surround' : selectedPerkId === 50 ? 'capture' : 'warning';
          return (
            <div
              key={i}
              className="lane-overlay tappable"
              style={{
                left: enemyHalfLeft,
                top: i * cellH,
                width: halfW,
                height: cellH,
                background: 'rgba(156,39,176,0.35)',
                border: '3px solid #AB47BC',
                boxShadow: '0 0 8px 1px rgba(156,39,176,0.4)',
              }}
              onClick={() => onLaneClick(i)}
            >
              <div className="pill-center">
                <span className="lane-pill" style={{ background: 'rgba(123,31,162,0.9)' }}>
                  <Icon name={icon} size={14} color="#fff" />
                  {perkName} {i + 1}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div
            key={i}
            className="lane-overlay tappable"
            style={{
              left: 0,
              top: i * cellH,
              width: bw,
              height: cellH,
              background: 'rgba(255,193,7,0.3)',
              border: '3px solid #FFCA28',
              boxShadow: '0 0 8px 1px rgba(255,193,7,0.4)',
            }}
            onClick={() => onLaneClick(i)}
          >
            <div className="pill-center">
              <span className="lane-pill" style={{ background: 'rgba(255,160,0,0.9)' }}>Lane {i + 1}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

// --- Perk panel -----------------------------------------------------------------

function PerkPanel({
  slots,
  disabled,
  aiHighlight,
  selectedPerkId,
  onPerk,
  onPass,
}: {
  slots: PerkSlot[];
  disabled: boolean;
  aiHighlight: number | null;
  selectedPerkId: number | null;
  onPerk: (perkId: number) => void;
  onPass: () => void;
}) {
  const aiMode = aiHighlight !== null;
  return (
    <div className={`perk-panel${aiMode ? ' ai' : ''}`}>
      {aiMode && (
        <span className="ai-chip">
          <Icon name="robot" size={12} color="#fff" />
          AI
        </span>
      )}
      {slots
        .filter((slot) => slot.perkId > 0)
        .map((slot) => {
          const info = getPerk(slot.perkId);
          const category = info?.category ?? 'utility';
          const isAiChoice = aiHighlight === slot.perkId;
          const isSel = selectedPerkId === slot.perkId;
          return (
            <button
              key={slot.slotIndex}
              className={`perk-chip${isSel ? ' selected' : ''}${aiMode ? (isAiChoice ? ' ai-choice' : ' dimmed') : ''}`}
              style={
                isSel
                  ? { borderColor: CATEGORY_COLOR[category], background: `${CATEGORY_COLOR[category]}4D` }
                  : undefined
              }
              disabled={disabled}
              onClick={() => onPerk(slot.perkId)}
            >
              <Icon
                name={CATEGORY_ICON[category]}
                size={14}
                color={disabled && !aiMode ? '#757575' : CATEGORY_COLOR[category]}
              />
              {info?.name ?? slot.perkName}
            </button>
          );
        })}
      {!aiMode && (
        <button className="pass-chip" disabled={disabled} onClick={onPass}>
          Pass
        </button>
      )}
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
  hero: Hero;
  isP1: boolean;
  isAI: boolean;
  isOpeningTurn: boolean;
  onReady: () => void;
}) {
  const playerColor = isP1 ? '#4CAF50' : '#9C27B0';
  const cardW = clamp(W * 0.35, 220, 400);
  const padding = clamp(W * 0.025, 16, 30);
  const avatarSize = clamp(W * 0.12, 80, 150);
  return (
    <div className="modal-scrim" style={{ zIndex: 30 }}>
      <div
        style={{
          width: cardW,
          padding,
          background: '#2A2A2A',
          borderRadius: 20,
          border: `3px solid ${playerColor}`,
          boxShadow: `0 0 20px 4px ${playerColor}66`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <img src={heroImage(hero.imagePath)} alt={hero.name} style={{ width: avatarSize, height: avatarSize, objectFit: 'contain' }} />
        <div style={{ height: padding * 0.5 }} />
        <span style={{ fontSize: clamp(W * 0.028, 18, 32), fontWeight: 700, color: playerColor }}>{hero.name}</span>
        <div style={{ height: padding * 0.25 }} />
        <span style={{ fontSize: clamp(W * 0.02, 14, 24), fontWeight: 500, color: '#fff' }}>
          Your Turn!
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
              Fair start: your first turn places a piece — perks unlock next turn!
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
          Ready!
        </button>
      </div>
    </div>
  );
}

export type { CombatResult };
