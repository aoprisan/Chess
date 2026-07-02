import { useEffect, useRef, useState, useCallback } from 'react';
import { CombatEngine } from '../game/engine';
import { chooseAIPerk } from '../game/ai';
import { getValidLanesForPerk, perkRequiresTarget } from '../game/targeting';
import { getPerk, PerkSlot } from '../game/perks';
import { Hero } from '../game/hero';
import {
  CombatGameState,
  PlayerSide,
  countPieces,
  isCloaked,
  isBlinded,
  SLOTS_PER_SIDE,
} from '../game/state';
import { heroImage, ui } from './assets';

const DUAL_LANE_PERKS = new Set([33, 34]);
const VIEWER: PlayerSide = 'player1'; // human is always player1 in adventure

interface CombatResult {
  playerWon: boolean;
  stars: number; // 0 on loss, 1-3 on win
}

export function Combat({
  player1Hero,
  player2Hero,
  aiDifficulty,
  isBoss,
  onGameEnd,
  onExit,
}: {
  player1Hero: Hero;
  player2Hero: Hero;
  aiDifficulty: string;
  isBoss: boolean;
  onGameEnd: (result: CombatResult) => void;
  onExit: () => void;
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

  const [selectedPerkId, setSelectedPerkId] = useState<number | null>(null);
  const [isSelectingLane, setIsSelectingLane] = useState(false);
  const [firstSelectedLane, setFirstSelectedLane] = useState<number | null>(null);

  const endReportedRef = useRef(false);
  const tickScheduledRef = useRef(false);
  const mountedRef = useRef(true);
  const pendingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const state = engine.state;

  const resetSelection = useCallback(() => {
    setSelectedPerkId(null);
    setIsSelectingLane(false);
    setFirstSelectedLane(null);
  }, []);

  const later = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(() => {
      pendingTimers.current = pendingTimers.current.filter((x) => x !== t);
      if (mountedRef.current) fn();
    }, delay);
    pendingTimers.current.push(t);
    return t;
  }, []);

  // --- Game end reporting ---
  useEffect(() => {
    if (state.status === 'finished' && !endReportedRef.current) {
      endReportedRef.current = true;
      const rivalLanes = state.player2LanesWon;
      const playerWon = state.gameWinner === 'player1';
      const stars = playerWon ? (rivalLanes === 0 ? 3 : rivalLanes === 1 ? 2 : 1) : 0;
      // small delay so the final board paints before the result modal
      later(() => onGameEnd({ playerWon, stars }), 900);
    }
  });

  // --- Self-scheduling turn ticker (independent of React render cycles) ---
  // Drives auto-placement and the AI's two-stage perk selection. Human turns
  // simply wait; human handlers call scheduleTick() to resume the loop.
  const runTick = useCallback(() => {
    tickScheduledRef.current = false;
    const s = engine.state;
    if (s.status !== 'playing') { bump(); return; }

    if (s.currentPhase === 'autoPlacement') {
      const placed = engine.autoPlace();
      if (placed === -1 && engine.state.status === 'playing') engine.skipTurn();
      bump();
      scheduleTick(500);
      return;
    }

    if (s.currentPhase === 'perkSelection' && engine.isCurrentPlayerAI) {
      const [perkId, target, second] = chooseAIPerk(engine);
      engine.lastAIPerkId = perkId > 0 ? perkId : null;
      bump();
      later(() => {
        engine.lastAIPerkId = null;
        if (perkId === 0) engine.skipTurn();
        else engine.executePerk(perkId, target, second);
        bump();
        scheduleTick(500);
      }, 1000);
    }
    // else: human perk selection — wait for input.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, bump, later]);

  const scheduleTick = useCallback((delay: number) => {
    if (tickScheduledRef.current) return;
    tickScheduledRef.current = true;
    later(runTick, delay);
  }, [later, runTick]);

  // Kick off the loop once; cancel pending timers on unmount.
  useEffect(() => {
    mountedRef.current = true;
    scheduleTick(500);
    return () => {
      mountedRef.current = false;
      pendingTimers.current.forEach(clearTimeout);
      pendingTimers.current = [];
    };
  }, [scheduleTick]);

  // --- Human perk interactions ---
  const humanTurn = state.currentPhase === 'perkSelection' && !engine.isCurrentPlayerAI && state.status === 'playing';

  const onPerkClick = (perkId: number) => {
    if (!humanTurn) return;
    if (!perkRequiresTarget(perkId) && !DUAL_LANE_PERKS.has(perkId)) {
      engine.executePerk(perkId, -1);
      resetSelection();
      bump();
      scheduleTick(500);
      return;
    }
    setSelectedPerkId(perkId);
    setIsSelectingLane(true);
    setFirstSelectedLane(null);
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
    bump();
    scheduleTick(500);
  };

  const onPass = () => {
    if (!humanTurn) return;
    engine.skipTurn();
    resetSelection();
    bump();
    scheduleTick(500);
  };

  const validLanes =
    isSelectingLane && selectedPerkId !== null
      ? getValidLanesForPerk(selectedPerkId, state, state.currentPlayer, firstSelectedLane)
      : [];

  const showPerkPanel =
    state.status === 'playing' &&
    (humanTurn || engine.lastAIPerkId !== null) &&
    !isSelectingLane;

  return (
    <div className="combat">
      <div className="combat-header">
        <PlayerBadge hero={player1Hero} side="player1" state={state} />
        <button className="chip" onClick={onExit} style={{ alignSelf: 'center' }}>
          ✕ Map
        </button>
        <PlayerBadge hero={player2Hero} side="player2" state={state} isBoss={isBoss} />
      </div>

      <div className="turn-banner">
        {state.status === 'finished'
          ? state.gameWinner === 'player1'
            ? '🎉 You win!'
            : '😿 Rival wins…'
          : isSelectingLane
            ? firstSelectedLane === null && DUAL_LANE_PERKS.has(selectedPerkId ?? -1)
              ? 'Pick the FIRST lane'
              : 'Pick a lane'
            : engine.isCurrentPlayerAI
              ? `${player2Hero.name} is thinking…`
              : 'Your turn — win 3 lanes!'}
      </div>

      <div className="board">
        {state.lanes.map((_, i) => (
          <LaneView
            key={i}
            index={i}
            state={state}
            targetable={validLanes.includes(i)}
            firstSelected={firstSelectedLane === i}
            onClick={() => onLaneClick(i)}
          />
        ))}
      </div>

      {isSelectingLane && (
        <div className="perk-actions" style={{ paddingBottom: 10 }}>
          <button className="btn danger" onClick={resetSelection}>
            ✕ Cancel
          </button>
        </div>
      )}

      {showPerkPanel && (
        <PerkPanel
          slots={engine.currentPerkSlots}
          disabled={!humanTurn}
          aiHighlight={engine.lastAIPerkId}
          selectedPerkId={selectedPerkId}
          onPerk={onPerkClick}
          onPass={onPass}
        />
      )}
    </div>
  );
}

function PlayerBadge({
  hero,
  side,
  state,
  isBoss,
}: {
  hero: Hero;
  side: PlayerSide;
  state: CombatGameState;
  isBoss?: boolean;
}) {
  const lanesWon = side === 'player1' ? state.player1LanesWon : state.player2LanesWon;
  const active = state.currentPlayer === side && state.status === 'playing';
  return (
    <div className={`player-badge ${side === 'player1' ? 'p1' : 'p2'}${active ? ' active' : ''}`}>
      <img src={heroImage(hero.imagePath)} alt={hero.name} />
      <div className="meta">
        <b>{isBoss ? `👑 ${hero.name}` : hero.name}</b>
        <small>🏆 {lanesWon}/3 lanes</small>
      </div>
    </div>
  );
}

function LaneView({
  index,
  state,
  targetable,
  firstSelected,
  onClick,
}: {
  index: number;
  state: CombatGameState;
  targetable: boolean;
  firstSelected: boolean;
  onClick: () => void;
}) {
  const lane = state.lanes[index];
  const p1 = countPieces(lane, 'player1');
  const p2 = countPieces(lane, 'player2');

  // Visibility: viewer is player1. Enemy (p2) hidden if p2 cloaked; own hidden if p1 blinded.
  const enemyHidden = isCloaked(state, 'player2');
  const ownHidden = isBlinded(state, 'player1');

  const cls = [
    'lane',
    targetable ? 'targetable' : '',
    firstSelected ? 'first-selected' : '',
    lane.winner === 'player1' ? 'won-p1' : lane.winner === 'player2' ? 'won-p2' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const badges = laneEffectBadges(state, index);

  return (
    <div className={cls} onClick={onClick}>
      <div className="lane-tag">L{index + 1}</div>
      {badges.length > 0 && (
        <div className="effects">
          {badges.map((b, i) => (
            <span key={i} className={`effect-badge ${b.polarity}`}>
              {b.name}
            </span>
          ))}
        </div>
      )}
      {lane.winner ? (
        <div className="won-badge">{lane.winner === VIEWER ? '✅' : '❌'}</div>
      ) : (
        <>
          <div className="half top">
            {renderCells(p2, 'p2', enemyHidden)}
          </div>
          <div className="divider" />
          <div className="half">{renderCells(p1, 'p1', ownHidden)}</div>
        </>
      )}
    </div>
  );
}

function renderCells(count: number, cls: 'p1' | 'p2', hidden: boolean) {
  const cells = [];
  for (let i = 0; i < SLOTS_PER_SIDE; i++) {
    const filled = i < count;
    cells.push(
      <div
        key={i}
        className={`cell ${filled ? (hidden ? 'hidden' : cls) : ''}`}
      />,
    );
  }
  return cells;
}

interface Badge {
  name: string;
  polarity: 'beneficial' | 'detrimental';
}

function laneEffectBadges(state: CombatGameState, laneIndex: number): Badge[] {
  const lane = state.lanes[laneIndex];
  if (lane.winner !== null) return [];
  const badges: Badge[] = [];
  const beneficialTriggers = new Set(['RETALIATE', 'HYDRA', 'BACKFIRE', 'ABSORB']);
  for (const t of lane.triggers) {
    badges.push({
      name: t.type.slice(0, 4),
      polarity: beneficialTriggers.has(t.type) ? 'beneficial' : 'detrimental',
    });
  }
  for (const d of lane.deferred) {
    badges.push({ name: d.type.slice(0, 4), polarity: d.type === 'AMBUSH' ? 'detrimental' : 'beneficial' });
  }
  for (const r of state.pendingRaids) {
    if (r.lane === laneIndex) badges.push({ name: 'RAID', polarity: 'detrimental' });
  }
  return badges;
}

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
  return (
    <div className="perk-panel">
      <div className="perk-row">
        {slots.map((slot) => {
          const info = getPerk(slot.perkId);
          const isAi = aiHighlight === slot.perkId;
          const isSel = selectedPerkId === slot.perkId;
          return (
            <button
              key={slot.slotIndex}
              className={`perk-card ${info?.category ?? 'utility'}${isAi ? ' ai-pick' : ''}`}
              style={isSel ? { outline: '2px solid var(--gold)' } : undefined}
              disabled={disabled}
              onClick={() => onPerk(slot.perkId)}
            >
              <b>{info?.name ?? slot.perkName}</b>
              <small>{info?.description ?? ''}</small>
            </button>
          );
        })}
      </div>
      <div className="perk-actions">
        <button className="btn secondary" disabled={disabled} onClick={onPass} style={{ backgroundImage: `url(${ui.greyBtn})` }}>
          Pass ⏭
        </button>
      </div>
    </div>
  );
}

export type { CombatResult };
