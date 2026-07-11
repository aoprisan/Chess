// Combat engine — faithful TypeScript port of the LOCAL engine in
// client/lib/services/combat_service.dart (server-driven mode omitted; out of
// scope for the single-player PWA). State is mutated in place, which mirrors the
// Dart reassign-with-copyWith pattern exactly since all operations are synchronous.

import {
  CombatGameState,
  Lane,
  PlayerSide,
  DeferredData,
  SanctuaryData,
  CaptureData,
  opponentOf,
  ownerInt,
  countPieces,
  isSideFilled,
  getNextEmptyColumn,
  isLaneFrozenFor,
  isCloaked,
  isBlinded,
  columnsFor,
  initialState,
  LANE_COUNT,
  LANES_TO_WIN,
  SLOTS_PER_SIDE,
} from './state';
import { RNG, MathRandomRNG } from './rng';
import { PerkSlot, getPerk, SLOT3_POOL, SLOT4_POOL } from './perks';
import type { PerkPools } from './characters';

export interface EngineConfig {
  player1Hero?: string | null;
  player2Hero?: string | null;
  player1IsAI?: boolean;
  player2IsAI?: boolean;
  player1AIDifficulty?: string;
  player2AIDifficulty?: string;
  /**
   * Per-side perk pools for slots 3/4, built from the characters present in
   * the battle (see buildPerkPools). Omitted → full catalog pools (quick
   * match, 2-player, and all pre-campaign behavior — byte-identical rolls).
   */
  player1PerkPools?: PerkPools;
  player2PerkPools?: PerkPools;
  rng?: RNG;
  /**
   * Compensation for the first-mover advantage (player1 always moves first).
   * - 'skipFirstPerk': player1's opening turn is auto-placement only (no perk).
   * - 'bonusPiece': player2's first auto-placement places 2 pieces.
   * - 'none': raw turn order.
   * Default 'skipFirstPerk' (measured closest to 50/50 in AI mirror matches;
   * see src/game/simulate.ts and balance.test.ts).
   */
  firstMoveCompensation?: 'none' | 'skipFirstPerk' | 'bonusPiece';
}

const PLACEMENT_TRIGGER_TYPES = ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE', 'RETALIATE'];
const REMOVAL_TRIGGER_TYPES = ['HYDRA', 'BACKFIRE', 'ABSORB'];

/** How an enemy-caused removal resolved (see removePieceWithRedirects). */
type RemovalOutcome = 'none' | 'removed' | 'captured' | 'sanctuary';
const SOURCE_EXCLUSION_THRESHOLD = 3;
const MAX_TRIGGER_CHAIN_DEPTH = 10;

/** One line of the battle log ("who did what"), shown in the Combat move-log overlay. */
/**
 * Structured description of a logged event. The UI turns this into a localized
 * sentence fragment (see i18n/gameStrings formatMoveLog), so the engine stays
 * language-agnostic. `lane` fields are 0-based lane indices.
 */
export type MoveLogMsg =
  | { t: 'place'; lane: number }
  | { t: 'placeBonus'; lane: number }
  | { t: 'trigger'; effect: string; lane: number }
  | { t: 'deferred'; effect: string; lane: number }
  | { t: 'raidLost'; label: RaidLabel; lane: number }
  | { t: 'raidWon2'; label: RaidLabel; lane: number }
  | { t: 'raidWon1'; label: RaidLabel; lane: number }
  | { t: 'raidDone'; label: RaidLabel; lane: number }
  | { t: 'lane'; lane: number }
  | { t: 'wonBattle' }
  | { t: 'perk'; perkId: number; lane: number | null; secondLane: number | null }
  | { t: 'pass' };

export type RaidLabel = 'probe' | 'bounceProbe';

export interface MoveLogEntry {
  /** Ply (engine turnCounter) when the entry was recorded, 0-based. */
  ply: number;
  /** The player the entry is about (actor for moves, owner for triggers/raids). */
  side: PlayerSide;
  kind: 'place' | 'perk' | 'pass' | 'trigger' | 'deferred' | 'raid' | 'lane';
  /** Structured payload; rendered to text by the UI for the current language. */
  msg: MoveLogMsg;
}

export class CombatEngine {
  state: CombatGameState;
  rng: RNG;
  currentPerkSlots: PerkSlot[] = [];
  lastAIPerkId: number | null = null;
  /** Chronological record of everything that happened, for the move-log UI. */
  moveLog: MoveLogEntry[] = [];

  player1IsAI: boolean;
  player2IsAI: boolean;
  player1AIDifficulty: string;
  player2AIDifficulty: string;

  firstMoveCompensation: 'none' | 'skipFirstPerk' | 'bonusPiece';

  /** Slot 3/4 pools per side; defaults to the full catalog pools. */
  private perkPools: Record<PlayerSide, PerkPools>;

  private nextTriggerOrder = 0;
  private isAutoPlacing = false;
  private turnCounter = 0;
  private bonusPieceGranted = false;
  /** Ply at which each side's RemoveEnemy slot recharges (cooldown after use). */
  private removeEnemyReadyAt: Record<PlayerSide, number> = { player1: 0, player2: 0 };
  /**
   * Board snapshot frozen the moment each side was Blinded — the "belief
   * state" that a blinded AI reasons from (see beliefStateFor). Engine-level
   * on purpose: the UI and persistence only ever read CombatGameState.
   */
  private blindSnapshots: Record<PlayerSide, CombatGameState | null> = {
    player1: null,
    player2: null,
  };

  constructor(gameId: string, cfg: EngineConfig = {}) {
    this.rng = cfg.rng ?? new MathRandomRNG();
    this.firstMoveCompensation = cfg.firstMoveCompensation ?? 'skipFirstPerk';
    this.player1IsAI = cfg.player1IsAI ?? false;
    this.player2IsAI = cfg.player2IsAI ?? false;
    this.player1AIDifficulty = cfg.player1AIDifficulty ?? 'medium';
    this.player2AIDifficulty = cfg.player2AIDifficulty ?? 'medium';
    this.perkPools = {
      player1: cfg.player1PerkPools ?? { slot3: SLOT3_POOL, slot4: SLOT4_POOL },
      player2: cfg.player2PerkPools ?? { slot3: SLOT3_POOL, slot4: SLOT4_POOL },
    };
    this.state = initialState(gameId, cfg.player1Hero ?? null, cfg.player2Hero ?? null);
    this.currentPerkSlots = this.generatePerkSlots();
  }

  get isCurrentPlayerAI(): boolean {
    return this.state.currentPlayer === 'player1' ? this.player1IsAI : this.player2IsAI;
  }

  private randPick<T>(arr: T[]): T {
    return arr[this.rng.nextInt(arr.length)];
  }

  private log(side: PlayerSide, kind: MoveLogEntry['kind'], msg: MoveLogMsg): void {
    this.moveLog.push({ ply: this.turnCounter, side, kind, msg });
  }

  // --- Perk slot generation ---

  isRemoveEnemyAvailable(side: PlayerSide): boolean {
    return this.turnCounter >= this.removeEnemyReadyAt[side];
  }

  generatePerkSlots(): PerkSlot[] {
    const slots: PerkSlot[] = [
      { slotIndex: 0, perkId: 1, perkName: getPerk(1)?.name ?? 'PlaceAnother' },
      {
        slotIndex: 1,
        perkId: 2,
        perkName: getPerk(2)?.name ?? 'RemoveEnemy',
        disabled: !this.isRemoveEnemyAvailable(this.state.currentPlayer),
      },
    ];
    // Character-bound pools; an empty side falls back to the full catalog
    // pool so a battle can never run out of slot options.
    const pools = this.perkPools[this.state.currentPlayer];
    const pool3 = pools.slot3.length > 0 ? pools.slot3 : SLOT3_POOL;
    const pool4 = pools.slot4.length > 0 ? pools.slot4 : SLOT4_POOL;
    const slot3Id = pool3[this.rng.nextInt(pool3.length)];
    const slot4Id = pool4[this.rng.nextInt(pool4.length)];
    slots.push({
      slotIndex: 2,
      perkId: slot3Id,
      perkName: getPerk(slot3Id)?.name ?? `Perk ${slot3Id}`,
    });
    slots.push({
      slotIndex: 3,
      perkId: slot4Id,
      perkName: getPerk(slot4Id)?.name ?? `Perk ${slot4Id}`,
    });
    return slots;
  }

  // --- Piece helpers (mutate lane in place) ---

  private addPiece(laneIndex: number, side: PlayerSide): void {
    const lane = this.state.lanes[laneIndex];
    const col = getNextEmptyColumn(lane, side);
    if (col === -1) return;
    columnsFor(lane, side)[col] = true;
  }

  /** Remove the frontmost piece (highest filled index) for a side. */
  private removeFront(laneIndex: number, side: PlayerSide): void {
    const cols = columnsFor(this.state.lanes[laneIndex], side);
    for (let i = cols.length - 1; i >= 0; i--) {
      if (cols[i]) {
        cols[i] = false;
        break;
      }
    }
  }

  private clearSide(laneIndex: number, side: PlayerSide): void {
    const cols = columnsFor(this.state.lanes[laneIndex], side);
    for (let i = 0; i < cols.length; i++) cols[i] = false;
  }

  // --- Auto placement ---

  autoPlace(): number {
    if (this.isAutoPlacing) return -1;
    this.isAutoPlacing = true;
    try {
      return this.autoPlaceInternal();
    } finally {
      this.isAutoPlacing = false;
    }
  }

  private autoPlaceInternal(): number {
    if (this.state.status !== 'playing') return -1;
    const currentPlayer = this.state.currentPlayer;

    this.processPendingRaids(currentPlayer);
    this.processDeferredEffects(currentPlayer);
    this.checkAllLaneWins();
    if (this.state.status !== 'playing') return -1;

    const availableLanes: number[] = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = this.state.lanes[i];
      if (
        lane.winner === null &&
        getNextEmptyColumn(lane, currentPlayer) !== -1 &&
        !isLaneFrozenFor(this.state, i, currentPlayer)
      ) {
        availableLanes.push(i);
      }
    }
    if (availableLanes.length === 0) return -1;

    const laneIndex = this.randPick(availableLanes);
    this.placePieceAndAdvance(laneIndex, currentPlayer);
    this.log(currentPlayer, 'place', { t: 'place', lane: laneIndex });
    this.firePlacementTriggers(laneIndex, currentPlayer, 0);
    this.checkAllLaneWins();

    // First-mover compensation (see EngineConfig.firstMoveCompensation).
    if (
      this.firstMoveCompensation === 'bonusPiece' &&
      currentPlayer === 'player2' &&
      !this.bonusPieceGranted &&
      this.state.status === 'playing'
    ) {
      this.bonusPieceGranted = true;
      const bonusLanes: number[] = [];
      for (let i = 0; i < LANE_COUNT; i++) {
        const lane = this.state.lanes[i];
        if (
          lane.winner === null &&
          getNextEmptyColumn(lane, currentPlayer) !== -1 &&
          !isLaneFrozenFor(this.state, i, currentPlayer)
        ) {
          bonusLanes.push(i);
        }
      }
      if (bonusLanes.length > 0) {
        const bonusLane = this.randPick(bonusLanes);
        this.addPiece(bonusLane, currentPlayer);
        this.log(currentPlayer, 'place', { t: 'placeBonus', lane: bonusLane });
        this.firePlacementTriggers(bonusLane, currentPlayer, 0);
        this.checkAllLaneWins();
      }
    }
    if (
      this.firstMoveCompensation === 'skipFirstPerk' &&
      this.turnCounter === 0 &&
      currentPlayer === 'player1' &&
      this.state.status === 'playing'
    ) {
      this.endTurn();
    }
    return laneIndex;
  }

  /** _placePiece: place, move to perk phase, regenerate slots, check lane win. */
  private placePieceAndAdvance(laneIndex: number, player: PlayerSide): void {
    const lane = this.state.lanes[laneIndex];
    if (getNextEmptyColumn(lane, player) === -1) return;
    this.addPiece(laneIndex, player);
    this.state.currentPhase = 'perkSelection';
    this.state.lastAutoPlacedLane = laneIndex;
    this.currentPerkSlots = this.generatePerkSlots();
    this.checkLaneWin(laneIndex);
  }

  // --- Basic perks ---

  placeOnLane(laneIndex: number): boolean {
    if (this.state.status !== 'playing') return false;
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const currentPlayer = this.state.currentPlayer;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    if (isLaneFrozenFor(this.state, laneIndex, currentPlayer)) return false;
    if (getNextEmptyColumn(lane, currentPlayer) === -1) return false;
    this.placePieceAndAdvance(laneIndex, currentPlayer);
    this.firePlacementTriggers(laneIndex, currentPlayer, 0);
    this.checkAllLaneWins();
    return true;
  }

  removeEnemyPiece(laneIndex: number): boolean {
    if (this.state.status !== 'playing') return false;
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const currentPlayer = this.state.currentPlayer;
    const enemy = opponentOf(currentPlayer);
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    if (countPieces(lane, enemy) === 0) return false;

    this.removePieceWithRedirects(laneIndex, enemy, currentPlayer);
    return true;
  }

  freezeLane(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    if (this.state.lanes[laneIndex].winner !== null) return false;
    this.state.frozenLanes[laneIndex] = this.state.currentPlayer;
    return true;
  }

  scrambleEnemyPieces(): boolean {
    const enemy = opponentOf(this.state.currentPlayer);
    let total = 0;
    for (const lane of this.state.lanes) {
      if (lane.winner === null) total += countPieces(lane, enemy);
    }
    if (total === 0) return false;

    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.state.lanes[i].winner === null) this.clearSide(i, enemy);
    }
    const availableLanes: number[] = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.state.lanes[i].winner === null) availableLanes.push(i);
    }
    for (let placed = 0; placed < total && availableLanes.length > 0; placed++) {
      const laneIdx = this.randPick(availableLanes);
      const lane = this.state.lanes[laneIdx];
      if (getNextEmptyColumn(lane, enemy) !== -1) {
        this.addPiece(laneIdx, enemy);
        if (isSideFilled(lane, enemy)) {
          availableLanes.splice(availableLanes.indexOf(laneIdx), 1);
        }
      }
    }
    return true;
  }

  splitPiece(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const player = this.state.currentPlayer;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    if (countPieces(lane, player) === 0) return false;

    this.removeFront(laneIndex, player);

    const otherLanes = this.openLanesFor(player);
    if (otherLanes.length >= SOURCE_EXCLUSION_THRESHOLD && otherLanes.includes(laneIndex)) {
      otherLanes.splice(otherLanes.indexOf(laneIndex), 1);
    }
    for (let placed = 0; placed < 2 && otherLanes.length > 0; placed++) {
      const idx = this.rng.nextInt(otherLanes.length);
      const targetLane = otherLanes[idx];
      if (getNextEmptyColumn(this.state.lanes[targetLane], player) !== -1) {
        this.addPiece(targetLane, player);
        if (isSideFilled(this.state.lanes[targetLane], player)) otherLanes.splice(idx, 1);
      }
    }
    this.checkAllLaneWins();
    return true;
  }

  kamikazePiece(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const player = this.state.currentPlayer;
    const enemy = opponentOf(player);
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    if (countPieces(lane, player) === 0) return false;

    this.removeFront(laneIndex, player);
    for (let r = 0; r < 2; r++) {
      const lanesWithEnemy: number[] = [];
      for (let i = 0; i < LANE_COUNT; i++) {
        if (this.state.lanes[i].winner === null && countPieces(this.state.lanes[i], enemy) > 0) {
          lanesWithEnemy.push(i);
        }
      }
      if (lanesWithEnemy.length === 0) break;
      this.removePieceWithRedirects(this.randPick(lanesWithEnemy), enemy, player);
    }
    return true;
  }

  regroupPieces(lane1: number, lane2: number): boolean {
    if (lane1 < 0 || lane1 >= LANE_COUNT || lane2 < 0 || lane2 >= LANE_COUNT) return false;
    if (lane1 === lane2) return false;
    const player = this.state.currentPlayer;
    const l1 = this.state.lanes[lane1];
    const l2 = this.state.lanes[lane2];
    if (l1.winner !== null || l2.winner !== null) return false;
    if (countPieces(l1, player) === 0 && countPieces(l2, player) === 0) return false;

    const tmp = columnsFor(l1, player).slice();
    if (player === 'player1') {
      l1.player1Columns = columnsFor(l2, player).slice();
      l2.player1Columns = tmp;
    } else {
      l1.player2Columns = columnsFor(l2, player).slice();
      l2.player2Columns = tmp;
    }
    this.checkAllLaneWins();
    return true;
  }

  disruptEnemyPieces(lane1: number, lane2: number): boolean {
    if (lane1 < 0 || lane1 >= LANE_COUNT || lane2 < 0 || lane2 >= LANE_COUNT) return false;
    if (lane1 === lane2) return false;
    const enemy = opponentOf(this.state.currentPlayer);
    const l1 = this.state.lanes[lane1];
    const l2 = this.state.lanes[lane2];
    if (l1.winner !== null || l2.winner !== null) return false;
    if (countPieces(l1, enemy) === 0 && countPieces(l2, enemy) === 0) return false;

    const tmp = columnsFor(l1, enemy).slice();
    if (enemy === 'player1') {
      l1.player1Columns = columnsFor(l2, enemy).slice();
      l2.player1Columns = tmp;
    } else {
      l1.player2Columns = columnsFor(l2, enemy).slice();
      l2.player2Columns = tmp;
    }
    this.checkAllLaneWins();
    return true;
  }

  scatterPieces(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const player = this.state.currentPlayer;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    const pieceCount = countPieces(lane, player);
    if (pieceCount === 0) return false;

    this.clearSide(laneIndex, player);
    const otherLanes = this.openLanesFor(player);
    if (otherLanes.length >= SOURCE_EXCLUSION_THRESHOLD && otherLanes.includes(laneIndex)) {
      otherLanes.splice(otherLanes.indexOf(laneIndex), 1);
    }
    for (let placed = 0; placed < pieceCount && otherLanes.length > 0; placed++) {
      const idx = this.rng.nextInt(otherLanes.length);
      const targetLane = otherLanes[idx];
      if (getNextEmptyColumn(this.state.lanes[targetLane], player) !== -1) {
        this.addPiece(targetLane, player);
        if (isSideFilled(this.state.lanes[targetLane], player)) otherLanes.splice(idx, 1);
      }
    }
    this.checkAllLaneWins();
    return true;
  }

  disperseEnemyPieces(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const enemy = opponentOf(this.state.currentPlayer);
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    const pieceCount = countPieces(lane, enemy);
    if (pieceCount === 0) return false;

    this.clearSide(laneIndex, enemy);
    const otherLanes = this.openLanesFor(enemy);
    if (otherLanes.length >= SOURCE_EXCLUSION_THRESHOLD && otherLanes.includes(laneIndex)) {
      otherLanes.splice(otherLanes.indexOf(laneIndex), 1);
    }
    for (let placed = 0; placed < pieceCount && otherLanes.length > 0; placed++) {
      const idx = this.rng.nextInt(otherLanes.length);
      const targetLane = otherLanes[idx];
      if (getNextEmptyColumn(this.state.lanes[targetLane], enemy) !== -1) {
        this.addPiece(targetLane, enemy);
        if (isSideFilled(this.state.lanes[targetLane], enemy)) otherLanes.splice(idx, 1);
      }
    }
    this.checkAllLaneWins();
    return true;
  }

  stealPiece(): boolean {
    const player = this.state.currentPlayer;
    const enemy = opponentOf(player);
    const lanesWithEnemy: number[] = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.state.lanes[i].winner === null && countPieces(this.state.lanes[i], enemy) > 0) {
        lanesWithEnemy.push(i);
      }
    }
    if (lanesWithEnemy.length === 0) return false;

    // The +1 below is unconditional even when the stolen piece escapes to a
    // Sanctuary or lands in the stealer's own Capture zone.
    this.removePieceWithRedirects(this.randPick(lanesWithEnemy), enemy, player);

    const lanesForAdd = this.openLanesFor(player);
    if (lanesForAdd.length > 0) {
      const addLane = this.randPick(lanesForAdd);
      if (getNextEmptyColumn(this.state.lanes[addLane], player) !== -1) {
        this.addPiece(addLane, player);
      }
    }
    this.checkAllLaneWins();
    return true;
  }

  cloakField(): boolean {
    const player = this.state.currentPlayer;
    if (isCloaked(this.state, player)) return false;
    if (player === 'player1') this.state.player1Cloaked = 2;
    else this.state.player2Cloaked = 2;
    return true;
  }

  blindOpponent(): boolean {
    const opponent = opponentOf(this.state.currentPlayer);
    if (isBlinded(this.state, opponent)) return false;
    if (opponent === 'player1') this.state.player1Blinded = 2;
    else this.state.player2Blinded = 2;
    // Freeze what the blinded player believes the board looks like.
    this.blindSnapshots[opponent] = structuredClone(this.state);
    return true;
  }

  /**
   * The board as `player` perceives it. Sighted players get the live state.
   * A blinded player gets the snapshot taken when Blind hit them, overlaid
   * with what stays visible per the rules: won lanes (replaced whole), lane
   * win counts, game status, and whose turn it is. Everything else — columns,
   * triggers, markers, freeze, cloak — stays stale. Choices made from stale
   * information execute against the real board and silently no-op when
   * invalid (every perk handler guards and the turn always ends).
   */
  beliefStateFor(player: PlayerSide): CombatGameState {
    const snapshot = this.blindSnapshots[player];
    if (!isBlinded(this.state, player) || snapshot === null) return this.state;

    const belief = structuredClone(snapshot);
    for (let i = 0; i < LANE_COUNT; i++) {
      if (this.state.lanes[i].winner !== null) {
        belief.lanes[i] = structuredClone(this.state.lanes[i]);
      }
    }
    belief.player1LanesWon = this.state.player1LanesWon;
    belief.player2LanesWon = this.state.player2LanesWon;
    belief.status = this.state.status;
    belief.gameWinner = this.state.gameWinner;
    belief.currentPlayer = this.state.currentPlayer;
    belief.currentPhase = this.state.currentPhase;
    return belief;
  }

  gambitPieces(): boolean {
    const player = this.state.currentPlayer;
    const enemy = opponentOf(player);

    for (let i = 0; i < 3; i++) {
      const available = this.openLanesFor(enemy);
      if (available.length === 0) break;
      const laneIdx = this.randPick(available);
      if (getNextEmptyColumn(this.state.lanes[laneIdx], enemy) !== -1)
        this.addPiece(laneIdx, enemy);
    }

    const playerAvailable = this.openLanesFor(player);
    if (playerAvailable.length > 0) {
      const playerLane = this.randPick(playerAvailable);
      for (let i = 0; i < 2; i++) {
        const lane = this.state.lanes[playerLane];
        if (getNextEmptyColumn(lane, player) === -1) break;
        if (lane.winner !== null) break;
        this.addPiece(playerLane, player);
      }
    }
    this.checkAllLaneWins();
    return true;
  }

  rushLane(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    if (this.state.lanes[laneIndex].winner !== null) return false;
    if (isLaneFrozenFor(this.state, laneIndex, this.state.currentPlayer)) return false;
    const player = this.state.currentPlayer;
    const enemy = opponentOf(player);
    let laneWonDuringPlacement = false;

    for (let i = 0; i < 2; i++) {
      const lane = this.state.lanes[laneIndex];
      if (lane.winner !== null) {
        laneWonDuringPlacement = true;
        break;
      }
      if (isSideFilled(lane, player)) break;
      if (getNextEmptyColumn(lane, player) === -1) break;
      this.addPiece(laneIndex, player);
    }
    for (let i = 0; i < 2; i++) {
      const lane = this.state.lanes[laneIndex];
      if (lane.winner !== null) {
        laneWonDuringPlacement = true;
        break;
      }
      if (isSideFilled(lane, enemy)) break;
      if (getNextEmptyColumn(lane, enemy) === -1) break;
      this.addPiece(laneIndex, enemy);
    }

    if (!laneWonDuringPlacement) {
      const otherLanes: number[] = [];
      for (let i = 0; i < LANE_COUNT; i++) {
        if (
          i !== laneIndex &&
          this.state.lanes[i].winner === null &&
          countPieces(this.state.lanes[i], player) > 0
        ) {
          otherLanes.push(i);
        }
      }
      let removeLane: number | null = null;
      if (otherLanes.length > 0) removeLane = this.randPick(otherLanes);
      else if (countPieces(this.state.lanes[laneIndex], player) > 0) removeLane = laneIndex;
      if (removeLane !== null) this.removeFront(removeLane, player);
    }
    this.checkAllLaneWins();
    return true;
  }

  nullifyLane(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    lane.triggers = [];
    lane.deferred = [];
    this.state.pendingRaids = this.state.pendingRaids.filter((r) => r.lane !== laneIndex);
    this.state.player1Sanctuaries = this.state.player1Sanctuaries.filter(
      (s) => s.lane !== laneIndex,
    );
    this.state.player2Sanctuaries = this.state.player2Sanctuaries.filter(
      (s) => s.lane !== laneIndex,
    );
    this.state.player1Captures = this.state.player1Captures.filter((c) => c.lane !== laneIndex);
    this.state.player2Captures = this.state.player2Captures.filter((c) => c.lane !== laneIndex);
    delete this.state.frozenLanes[laneIndex];
    return true;
  }

  // --- Trigger setup perks ---

  private setTrigger(
    laneIndex: number,
    type: string,
    opts: { turnsLeft?: number; placeNow?: boolean } = {},
  ): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    // "+1 now" so conditional triggers are never a dead pick (same shape as
    // deferredPerk). No trigger chaining, matching deferred placements.
    if (opts.placeNow && !isSideFilled(lane, this.state.currentPlayer)) {
      this.addPiece(laneIndex, this.state.currentPlayer);
      this.checkAllLaneWins();
      // A won lane never fires triggers and endTurn skips its timer
      // decrement, so don't leave a stale trigger behind.
      if (lane.winner !== null) return true;
    }
    lane.triggers.push({
      type,
      owner: ownerInt(this.state.currentPlayer),
      turnsLeft: opts.turnsLeft ?? 2,
      orderId: this.nextTriggerOrder++,
    });
    return true;
  }

  // Conditional triggers get +1 now and live two opponent turns. endTurn
  // decrements on every ply (both players'), so surviving through the owner's
  // intervening turn to the opponent's 2nd turn takes turnsLeft 4, not 3.
  // Portal/Trap stay conditional-only for one opponent turn (turnsLeft 2).
  private static readonly BUFFED_TRIGGER = { turnsLeft: 4, placeNow: true };

  setPortalTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'PORTAL');
  }
  setTrapTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'TRAP');
  }
  setMirrorTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'MIRROR', CombatEngine.BUFFED_TRIGGER);
  }
  setEchoTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'ECHO', CombatEngine.BUFFED_TRIGGER);
  }
  setShockwaveTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'SHOCKWAVE', CombatEngine.BUFFED_TRIGGER);
  }
  setHydraTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'HYDRA', CombatEngine.BUFFED_TRIGGER);
  }
  setBackfireTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'BACKFIRE', CombatEngine.BUFFED_TRIGGER);
  }
  setAbsorbTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'ABSORB', CombatEngine.BUFFED_TRIGGER);
  }
  setRetaliateTrigger(laneIndex: number): boolean {
    return this.setTrigger(laneIndex, 'RETALIATE', CombatEngine.BUFFED_TRIGGER);
  }

  // --- Deferred perks (+1 now, effect next turn) ---

  private deferredPerk(laneIndex: number, type: string): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const player = this.state.currentPlayer;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    if (isSideFilled(lane, player)) return false;
    this.addPiece(laneIndex, player);
    lane.deferred.push({ type, owner: ownerInt(player), targetLane: laneIndex });
    this.checkAllLaneWins();
    return true;
  }

  signalLane(laneIndex: number): boolean {
    return this.deferredPerk(laneIndex, 'SIGNAL');
  }
  enlistOnLane(laneIndex: number): boolean {
    return this.deferredPerk(laneIndex, 'ENLIST');
  }
  ambushOnLane(laneIndex: number): boolean {
    return this.deferredPerk(laneIndex, 'AMBUSH');
  }
  reinforceLane(laneIndex: number): boolean {
    return this.deferredPerk(laneIndex, 'REINFORCE');
  }

  // --- Duration perks ---

  setSanctuary(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    if (this.state.lanes[laneIndex].winner !== null) return false;
    const s: SanctuaryData = { lane: laneIndex, turnsLeft: 4 };
    if (this.state.currentPlayer === 'player1') this.state.player1Sanctuaries.push(s);
    else this.state.player2Sanctuaries.push(s);
    return true;
  }

  setCaptureZone(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    if (this.state.lanes[laneIndex].winner !== null) return false;
    const c: CaptureData = { lane: laneIndex, turnsLeft: 3 };
    if (this.state.currentPlayer === 'player1') this.state.player1Captures.push(c);
    else this.state.player2Captures.push(c);
    return true;
  }

  // --- Raid ---

  raidLane(laneIndex: number): boolean {
    if (laneIndex < 0 || laneIndex >= LANE_COUNT) return false;
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return false;
    const player = this.state.currentPlayer;
    const opponent = opponentOf(player);
    // The raid piece lands on the ENEMY side; if it would be their 5th it
    // would win the lane FOR them, so the raid fizzles (same guard as Raid
    // lane targeting and Retaliate). Matters when a blinded AI targets from
    // a stale snapshot: targeting validated the belief state, not the real
    // board.
    if (countPieces(lane, opponent) >= SLOTS_PER_SIDE - 1) return false;

    this.addPiece(laneIndex, opponent);
    this.state.pendingRaids.push({
      owner: ownerInt(player),
      lane: laneIndex,
      turnsUntilResolve: 2,
      source: 'RAID',
    });
    this.checkAllLaneWins();
    return true;
  }

  // --- Redirect-aware removal ---

  private getSanctuaryLane(player: PlayerSide): number | null {
    const list =
      player === 'player1' ? this.state.player1Sanctuaries : this.state.player2Sanctuaries;
    return list.length === 0 ? null : list[0].lane;
  }

  private getCaptureLane(player: PlayerSide): number | null {
    const list = player === 'player1' ? this.state.player1Captures : this.state.player2Captures;
    return list.length === 0 ? null : list[0].lane;
  }

  /** Remove a piece with Capture-before-Sanctuary-before-normal redirection. */
  /**
   * The single choke point for enemy-caused removals: applies the Capture /
   * Sanctuary redirects, fires the piece owner's removal triggers, and
   * re-checks lane wins (a redirect can fill its destination lane). Own-perk
   * sacrifices and raid placeholder cleanup deliberately bypass this and use
   * removeFront directly — a Sanctuary must not void a cost, and the enemy
   * must not "rescue" a raid placeholder into their board.
   */
  private removePieceWithRedirects(
    laneIndex: number,
    pieceOwner: PlayerSide,
    remover?: PlayerSide,
    chainDepth = 0,
  ): RemovalOutcome {
    if (countPieces(this.state.lanes[laneIndex], pieceOwner) <= 0) return 'none';

    let outcome: RemovalOutcome = 'removed';
    // Capture first (remover is opponent with active Capture)
    const captureLane =
      remover !== undefined && remover !== pieceOwner ? this.getCaptureLane(remover) : null;
    const sanctuaryLane = this.getSanctuaryLane(pieceOwner);
    if (
      captureLane !== null &&
      this.state.lanes[captureLane].winner === null &&
      // A full capture zone can't hold the piece (addPiece would no-op and
      // the piece would just vanish as a phantom "capture"); fall through to
      // the Sanctuary/plain-removal branches instead.
      getNextEmptyColumn(this.state.lanes[captureLane], remover!) !== -1
    ) {
      this.removeFront(laneIndex, pieceOwner);
      this.addPiece(captureLane, remover!);
      outcome = 'captured';
    } else if (sanctuaryLane !== null && this.state.lanes[sanctuaryLane].winner === null) {
      // Sanctuary (piece owner has active Sanctuary)
      this.removeFront(laneIndex, pieceOwner);
      this.addPiece(sanctuaryLane, pieceOwner);
      outcome = 'sanctuary';
    } else {
      this.removeFront(laneIndex, pieceOwner);
    }

    // The piece left the lane in every branch, so removal triggers fire on
    // all outcomes — matching the original RemoveEnemy sequencing.
    if (remover !== undefined && remover !== pieceOwner) {
      this.fireRemovalTriggers(laneIndex, remover, chainDepth);
    }
    this.checkAllLaneWins();
    return outcome;
  }

  // --- Placement triggers ---

  private firePlacementTriggers(
    laneIndex: number,
    placingPlayer: PlayerSide,
    chainDepth: number,
  ): void {
    if (chainDepth >= MAX_TRIGGER_CHAIN_DEPTH) return;
    if (this.state.lanes[laneIndex].winner !== null) return;

    const placingOwnerInt = ownerInt(placingPlayer);
    const triggerOwner = opponentOf(placingPlayer);

    const triggers = this.state.lanes[laneIndex].triggers
      .filter((t) => t.owner !== placingOwnerInt && PLACEMENT_TRIGGER_TYPES.includes(t.type))
      .sort((a, b) => a.orderId - b.orderId);

    for (const trigger of triggers) {
      const lane = this.state.lanes[laneIndex];
      if (lane.winner !== null) break;
      if (this.state.status !== 'playing') break;

      // Remove trigger by orderId (one-time use)
      lane.triggers = lane.triggers.filter((t) => t.orderId !== trigger.orderId);
      this.log(triggerOwner, 'trigger', {
        t: 'trigger',
        effect: trigger.type,
        lane: laneIndex,
      });

      switch (trigger.type) {
        case 'PORTAL':
          this.handlePortalTrigger(laneIndex, placingPlayer, chainDepth);
          break;
        case 'TRAP':
          this.handleTrapTrigger(laneIndex, placingPlayer, triggerOwner, chainDepth);
          break;
        case 'MIRROR':
          this.handleMirrorTrigger(laneIndex, triggerOwner);
          break;
        case 'ECHO':
          this.handleEchoTrigger(laneIndex, triggerOwner);
          break;
        case 'SHOCKWAVE':
          this.handleShockwaveTrigger(laneIndex, placingPlayer, triggerOwner, chainDepth);
          break;
        case 'RETALIATE':
          this.handleRetaliateTrigger(laneIndex, triggerOwner, placingPlayer);
          break;
      }
      this.checkAllLaneWins();
    }
  }

  private handlePortalTrigger(
    laneIndex: number,
    placingPlayer: PlayerSide,
    chainDepth: number,
  ): void {
    this.removeFront(laneIndex, placingPlayer);
    const available = this.openLanesFor(placingPlayer);
    if (available.length >= SOURCE_EXCLUSION_THRESHOLD && available.includes(laneIndex)) {
      available.splice(available.indexOf(laneIndex), 1);
    }
    if (available.length > 0) {
      const dest = this.randPick(available);
      this.addPiece(dest, placingPlayer);
      this.checkLaneWin(dest);
      if (this.state.lanes[dest].winner === null) {
        this.firePlacementTriggers(dest, placingPlayer, chainDepth + 1);
      }
    }
  }

  private handleTrapTrigger(
    laneIndex: number,
    placingPlayer: PlayerSide,
    triggerOwner: PlayerSide,
    chainDepth: number,
  ): void {
    // The trap owner performs the removal, so their Capture can convert the
    // trapped piece and the placer's removal triggers on the lane can fire.
    this.removePieceWithRedirects(laneIndex, placingPlayer, triggerOwner, chainDepth + 1);
  }

  private handleMirrorTrigger(laneIndex: number, owner: PlayerSide): void {
    for (let i = 0; i < 2; i++) {
      if (!isSideFilled(this.state.lanes[laneIndex], owner)) this.addPiece(laneIndex, owner);
    }
  }

  private handleEchoTrigger(laneIndex: number, owner: PlayerSide): void {
    for (let i = 0; i < 2; i++) {
      const available = this.openLanesFor(owner);
      if (available.length >= SOURCE_EXCLUSION_THRESHOLD && available.includes(laneIndex)) {
        available.splice(available.indexOf(laneIndex), 1);
      }
      if (available.length > 0) this.addPiece(this.randPick(available), owner);
    }
  }

  private handleShockwaveTrigger(
    laneIndex: number,
    placingPlayer: PlayerSide,
    triggerOwner: PlayerSide,
    chainDepth: number,
  ): void {
    for (let i = 0; i < 2; i++) {
      const otherLanes: number[] = [];
      for (let j = 0; j < LANE_COUNT; j++) {
        if (
          j !== laneIndex &&
          this.state.lanes[j].winner === null &&
          countPieces(this.state.lanes[j], placingPlayer) > 0
        ) {
          otherLanes.push(j);
        }
      }
      if (otherLanes.length > 0) {
        this.removePieceWithRedirects(
          this.randPick(otherLanes),
          placingPlayer,
          triggerOwner,
          chainDepth + 1,
        );
      }
    }
  }

  private handleRetaliateTrigger(laneIndex: number, owner: PlayerSide, opponent: PlayerSide): void {
    // The raid piece is mechanically the placer's piece; if it would be their
    // 5th it would win the lane FOR them, so the retaliation fizzles instead
    // (same guard as Raid lane targeting).
    if (countPieces(this.state.lanes[laneIndex], opponent) >= SLOTS_PER_SIDE - 1) return;
    this.addPiece(laneIndex, opponent);
    this.state.pendingRaids.push({
      owner: ownerInt(owner),
      lane: laneIndex,
      turnsUntilResolve: 2,
      source: 'RETALIATE',
    });
  }

  // --- Removal triggers ---

  private fireRemovalTriggers(
    laneIndex: number,
    removingPlayer: PlayerSide,
    chainDepth: number,
  ): void {
    if (chainDepth >= MAX_TRIGGER_CHAIN_DEPTH) return;
    if (this.state.lanes[laneIndex].winner !== null) return;
    const removingOwnerInt = ownerInt(removingPlayer);
    const pieceOwner = opponentOf(removingPlayer);

    const triggers = this.state.lanes[laneIndex].triggers
      .filter((t) => t.owner !== removingOwnerInt && REMOVAL_TRIGGER_TYPES.includes(t.type))
      .sort((a, b) => a.orderId - b.orderId);

    for (const trigger of triggers) {
      const lane = this.state.lanes[laneIndex];
      if (lane.winner !== null) break;
      if (this.state.status !== 'playing') break;

      lane.triggers = lane.triggers.filter((t) => t.orderId !== trigger.orderId);
      this.log(pieceOwner, 'trigger', { t: 'trigger', effect: trigger.type, lane: laneIndex });

      switch (trigger.type) {
        case 'HYDRA':
          this.handleHydraTrigger(laneIndex, pieceOwner);
          break;
        case 'BACKFIRE':
          this.handleBackfireTrigger(removingPlayer, pieceOwner, chainDepth);
          break;
        case 'ABSORB':
          this.handleAbsorbTrigger(laneIndex, pieceOwner);
          break;
      }
      this.checkAllLaneWins();
    }
  }

  private handleHydraTrigger(laneIndex: number, owner: PlayerSide): void {
    for (let i = 0; i < 2; i++) {
      const available = this.openLanesFor(owner);
      if (available.length >= SOURCE_EXCLUSION_THRESHOLD && available.includes(laneIndex)) {
        available.splice(available.indexOf(laneIndex), 1);
      }
      if (available.length > 0) this.addPiece(this.randPick(available), owner);
    }
  }

  private handleBackfireTrigger(
    removingPlayer: PlayerSide,
    triggerOwner: PlayerSide,
    chainDepth: number,
  ): void {
    for (let i = 0; i < 2; i++) {
      const lanesWithPieces: number[] = [];
      for (let j = 0; j < LANE_COUNT; j++) {
        if (
          this.state.lanes[j].winner === null &&
          countPieces(this.state.lanes[j], removingPlayer) > 0
        ) {
          lanesWithPieces.push(j);
        }
      }
      if (lanesWithPieces.length > 0) {
        this.removePieceWithRedirects(
          this.randPick(lanesWithPieces),
          removingPlayer,
          triggerOwner,
          chainDepth + 1,
        );
      }
    }
  }

  private handleAbsorbTrigger(laneIndex: number, owner: PlayerSide): void {
    const available = this.openLanesFor(owner);
    if (available.length >= SOURCE_EXCLUSION_THRESHOLD && available.includes(laneIndex)) {
      available.splice(available.indexOf(laneIndex), 1);
    }
    if (available.length > 0) this.addPiece(this.randPick(available), owner);
  }

  // --- Deferred + raid resolution ---

  private processPendingRaids(player: PlayerSide): void {
    const owner = ownerInt(player);
    const opponent = opponentOf(player);

    const readyRaids = this.state.pendingRaids.filter(
      (r) => r.owner === owner && r.turnsUntilResolve <= 0,
    );
    if (readyRaids.length === 0) return;

    this.state.pendingRaids = this.state.pendingRaids.filter(
      (r) => !(r.owner === owner && r.turnsUntilResolve <= 0),
    );

    for (const raid of readyRaids) {
      const laneIdx = raid.lane;
      if (this.state.lanes[laneIdx].winner !== null) continue;
      const roll = this.rng.nextInt(100);
      const label: RaidLabel = raid.source === 'RAID' ? 'probe' : 'bounceProbe';

      if (roll < 10) {
        // 10% lost
        if (countPieces(this.state.lanes[laneIdx], opponent) > 0)
          this.removeFront(laneIdx, opponent);
        this.log(player, 'raid', { t: 'raidLost', label, lane: laneIdx });
      } else if (roll < 25) {
        // 15% +2 recruits => 3 total
        if (countPieces(this.state.lanes[laneIdx], opponent) > 0)
          this.removeFront(laneIdx, opponent);
        for (let i = 0; i < 3; i++) {
          if (!isSideFilled(this.state.lanes[laneIdx], player)) this.addPiece(laneIdx, player);
        }
        this.log(player, 'raid', { t: 'raidWon2', label, lane: laneIdx });
      } else if (roll < 55) {
        // 30% +1 recruit => 2 total
        if (countPieces(this.state.lanes[laneIdx], opponent) > 0)
          this.removeFront(laneIdx, opponent);
        for (let i = 0; i < 2; i++) {
          if (!isSideFilled(this.state.lanes[laneIdx], player)) this.addPiece(laneIdx, player);
        }
        this.log(player, 'raid', { t: 'raidWon1', label, lane: laneIdx });
      } else {
        // 45% alone
        if (countPieces(this.state.lanes[laneIdx], opponent) > 0)
          this.removeFront(laneIdx, opponent);
        if (!isSideFilled(this.state.lanes[laneIdx], player)) this.addPiece(laneIdx, player);
        this.log(player, 'raid', { t: 'raidDone', label, lane: laneIdx });
      }
    }
  }

  private processDeferredEffects(player: PlayerSide): void {
    const owner = ownerInt(player);
    const opponent = opponentOf(player);

    for (let laneIdx = 0; laneIdx < LANE_COUNT; laneIdx++) {
      const lane = this.state.lanes[laneIdx];
      if (lane.winner !== null) continue;

      const effects = lane.deferred.filter((d) => d.owner === owner);
      if (effects.length === 0) continue;
      lane.deferred = lane.deferred.filter((d) => d.owner !== owner);

      for (const effect of effects) {
        this.log(player, 'deferred', { t: 'deferred', effect: effect.type, lane: laneIdx });
        switch (effect.type) {
          case 'SIGNAL':
            this.resolveSignal(laneIdx, player);
            break;
          case 'ENLIST':
            this.resolveEnlist(laneIdx, player, opponent);
            break;
          case 'AMBUSH':
            this.resolveAmbush(effect, player, opponent);
            break;
          case 'REINFORCE':
            if (!isSideFilled(this.state.lanes[laneIdx], player)) this.addPiece(laneIdx, player);
            break;
        }
      }
    }
  }

  private resolveSignal(laneIdx: number, player: PlayerSide): void {
    const sourceLanes: number[] = [];
    let maxPieces = 0;
    for (let i = 0; i < LANE_COUNT; i++) {
      if (
        i !== laneIdx &&
        this.state.lanes[i].winner === null &&
        countPieces(this.state.lanes[i], player) > 0
      ) {
        const count = countPieces(this.state.lanes[i], player);
        if (count > maxPieces) {
          maxPieces = count;
          sourceLanes.length = 0;
          sourceLanes.push(i);
        } else if (count === maxPieces) {
          sourceLanes.push(i);
        }
      }
    }
    if (sourceLanes.length > 0 && !isSideFilled(this.state.lanes[laneIdx], player)) {
      const source = this.randPick(sourceLanes);
      this.removeFront(source, player);
      this.addPiece(laneIdx, player);
    }
  }

  private resolveEnlist(laneIdx: number, player: PlayerSide, opponent: PlayerSide): void {
    if (countPieces(this.state.lanes[laneIdx], player) <= 0) return;
    this.removeFront(laneIdx, player);
    let enemyCaptured = false;
    if (countPieces(this.state.lanes[laneIdx], opponent) > 0) {
      const outcome = this.removePieceWithRedirects(laneIdx, opponent, player);
      // A Sanctuary escape means the piece survived — no growth bonus.
      enemyCaptured = outcome === 'removed' || outcome === 'captured';
    }

    const destLanes: number[] = [];
    let minPieces = 999;
    for (let i = 0; i < LANE_COUNT; i++) {
      if (
        i !== laneIdx &&
        this.state.lanes[i].winner === null &&
        !isSideFilled(this.state.lanes[i], player)
      ) {
        const count = countPieces(this.state.lanes[i], player);
        if (count < minPieces) {
          minPieces = count;
          destLanes.length = 0;
          destLanes.push(i);
        } else if (count === minPieces) {
          destLanes.push(i);
        }
      }
    }
    if (
      destLanes.length === 0 &&
      this.state.lanes[laneIdx].winner === null &&
      !isSideFilled(this.state.lanes[laneIdx], player)
    ) {
      destLanes.push(laneIdx);
    }
    if (destLanes.length > 0) {
      const dest = this.randPick(destLanes);
      const piecesToAdd = enemyCaptured ? 2 : 1;
      for (let i = 0; i < piecesToAdd; i++) {
        if (!isSideFilled(this.state.lanes[dest], player)) this.addPiece(dest, player);
      }
    }
  }

  private resolveAmbush(effect: DeferredData, player: PlayerSide, opponent: PlayerSide): void {
    const targetLane = effect.targetLane;
    const adjacentLanes: number[] = [targetLane];
    if (targetLane > 0) adjacentLanes.push(targetLane - 1);
    if (targetLane < LANE_COUNT - 1) adjacentLanes.push(targetLane + 1);

    const validRemoval = adjacentLanes.filter(
      (i) => this.state.lanes[i].winner === null && countPieces(this.state.lanes[i], opponent) > 0,
    );
    if (validRemoval.length > 0) {
      this.removePieceWithRedirects(this.randPick(validRemoval), opponent, player);
    }
  }

  // --- Win checks ---

  private checkAllLaneWins(): void {
    for (let i = 0; i < LANE_COUNT; i++) this.checkLaneWin(i);
  }

  private checkLaneWin(laneIndex: number): void {
    const lane = this.state.lanes[laneIndex];
    if (lane.winner !== null) return;
    let winner: PlayerSide | null = null;
    if (isSideFilled(lane, 'player1')) winner = 'player1';
    else if (isSideFilled(lane, 'player2')) winner = 'player2';
    if (winner !== null) {
      lane.winner = winner;
      if (winner === 'player1') this.state.player1LanesWon += 1;
      else this.state.player2LanesWon += 1;
      this.log(winner, 'lane', { t: 'lane', lane: laneIndex });
      this.checkGameWin();
    }
  }

  private checkGameWin(): void {
    if (this.state.player1LanesWon >= LANES_TO_WIN) {
      this.state.status = 'finished';
      this.state.gameWinner = 'player1';
      this.log('player1', 'lane', { t: 'wonBattle' });
    } else if (this.state.player2LanesWon >= LANES_TO_WIN) {
      this.state.status = 'finished';
      this.state.gameWinner = 'player2';
      this.log('player2', 'lane', { t: 'wonBattle' });
    }
  }

  // --- Turn end ---

  endTurn(): void {
    if (this.state.status !== 'playing') return;
    const currentPlayer = this.state.currentPlayer;
    const nextPlayer = opponentOf(currentPlayer);

    // Clear frozen lanes that were blocking the current player
    for (const key of Object.keys(this.state.frozenLanes)) {
      const idx = Number(key);
      if (this.state.frozenLanes[idx] !== currentPlayer) delete this.state.frozenLanes[idx];
    }

    this.state.player1Cloaked = Math.max(0, this.state.player1Cloaked - 1);
    this.state.player2Cloaked = Math.max(0, this.state.player2Cloaked - 1);
    this.state.player1Blinded = Math.max(0, this.state.player1Blinded - 1);
    this.state.player2Blinded = Math.max(0, this.state.player2Blinded - 1);
    if (this.state.player1Blinded === 0) this.blindSnapshots.player1 = null;
    if (this.state.player2Blinded === 0) this.blindSnapshots.player2 = null;

    // Decrement trigger timers, drop expired
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = this.state.lanes[i];
      if (lane.winner !== null) continue;
      lane.triggers = lane.triggers
        .map((t) => ({ ...t, turnsLeft: t.turnsLeft - 1 }))
        .filter((t) => t.turnsLeft > 0);
    }

    this.state.player1Sanctuaries = decTurns(this.state.player1Sanctuaries);
    this.state.player2Sanctuaries = decTurns(this.state.player2Sanctuaries);
    this.state.player1Captures = decTurns(this.state.player1Captures);
    this.state.player2Captures = decTurns(this.state.player2Captures);

    this.state.pendingRaids = this.state.pendingRaids.map((r) => ({
      ...r,
      turnsUntilResolve: r.turnsUntilResolve - 1,
    }));

    this.state.currentPlayer = nextPlayer;
    this.state.currentPhase = 'autoPlacement';
    this.state.lastAutoPlacedLane = null;
    this.turnCounter++;
  }

  skipTurn(): void {
    this.endTurn();
  }

  /** Deliberate pass (a player choosing not to play a perk) — logged, unlike forced skips. */
  passTurn(): void {
    this.log(this.state.currentPlayer, 'pass', { t: 'pass' });
    this.endTurn();
  }

  // --- Perk dispatch (mirrors combat_screen.dart _executePerk) ---

  /** Execute a perk then end the turn (always, matching the Dart controller). */
  executePerk(perkId: number, targetLane: number, secondLane: number | null = null): void {
    const info = getPerk(perkId);
    if (info) {
      this.log(this.state.currentPlayer, 'perk', {
        t: 'perk',
        perkId,
        lane: targetLane,
        secondLane,
      });
    }
    switch (perkId) {
      case 1:
        if (targetLane >= 0) this.placeOnLane(targetLane);
        break;
      case 2:
        // Cooldown: a successful removal locks the slot for the player's next
        // turn (their next perk phase is ply turnCounter+2, ready at +3).
        if (
          targetLane >= 0 &&
          this.isRemoveEnemyAvailable(this.state.currentPlayer) &&
          this.removeEnemyPiece(targetLane)
        ) {
          this.removeEnemyReadyAt[this.state.currentPlayer] = this.turnCounter + 3;
        }
        break;
      case 4:
        if (targetLane >= 0) this.freezeLane(targetLane);
        break;
      case 13:
        this.scrambleEnemyPieces();
        break;
      case 31:
        if (targetLane >= 0) this.splitPiece(targetLane);
        break;
      case 32:
        if (targetLane >= 0) this.kamikazePiece(targetLane);
        break;
      case 33:
        if (targetLane >= 0 && secondLane !== null) this.regroupPieces(secondLane, targetLane);
        break;
      case 34:
        if (targetLane >= 0 && secondLane !== null) this.disruptEnemyPieces(secondLane, targetLane);
        break;
      case 35:
        if (targetLane >= 0) this.scatterPieces(targetLane);
        break;
      case 36:
        if (targetLane >= 0) this.disperseEnemyPieces(targetLane);
        break;
      case 22:
        this.cloakField();
        break;
      case 23:
        this.blindOpponent();
        break;
      case 38:
        this.stealPiece();
        break;
      case 37:
        this.gambitPieces();
        break;
      case 39:
        if (targetLane >= 0) this.rushLane(targetLane);
        break;
      case 48:
        if (targetLane >= 0) this.nullifyLane(targetLane);
        break;
      case 24:
        if (targetLane >= 0) this.setPortalTrigger(targetLane);
        break;
      case 25:
        if (targetLane >= 0) this.setTrapTrigger(targetLane);
        break;
      case 26:
        if (targetLane >= 0) this.setMirrorTrigger(targetLane);
        break;
      case 27:
        if (targetLane >= 0) this.setEchoTrigger(targetLane);
        break;
      case 28:
        if (targetLane >= 0) this.setShockwaveTrigger(targetLane);
        break;
      case 29:
        if (targetLane >= 0) this.setHydraTrigger(targetLane);
        break;
      case 30:
        if (targetLane >= 0) this.setBackfireTrigger(targetLane);
        break;
      case 46:
        if (targetLane >= 0) this.setAbsorbTrigger(targetLane);
        break;
      case 52:
        if (targetLane >= 0) this.setRetaliateTrigger(targetLane);
        break;
      case 43:
        if (targetLane >= 0) this.signalLane(targetLane);
        break;
      case 40:
        if (targetLane >= 0) this.enlistOnLane(targetLane);
        break;
      case 41:
        if (targetLane >= 0) this.ambushOnLane(targetLane);
        break;
      case 42:
        if (targetLane >= 0) this.reinforceLane(targetLane);
        break;
      case 49:
        if (targetLane >= 0) this.setSanctuary(targetLane);
        break;
      case 50:
        if (targetLane >= 0) this.setCaptureZone(targetLane);
        break;
      case 51:
        if (targetLane >= 0) this.raidLane(targetLane);
        break;
    }
    this.skipTurn();
  }

  // --- Shared helper ---

  /** Non-won lanes where `side` has an empty column. */
  private openLanesFor(side: PlayerSide): number[] {
    const lanes: number[] = [];
    for (let i = 0; i < LANE_COUNT; i++) {
      const lane = this.state.lanes[i];
      if (lane.winner === null && !isSideFilled(lane, side)) lanes.push(i);
    }
    return lanes;
  }
}

function decTurns<T extends { turnsLeft: number }>(list: T[]): T[] {
  return list.filter((x) => x.turnsLeft > 1).map((x) => ({ ...x, turnsLeft: x.turnsLeft - 1 }));
}

// Re-export for convenience
export type { Lane };
