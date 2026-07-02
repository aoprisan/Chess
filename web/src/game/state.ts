// Core combat state model — ported faithfully from client/lib/models/combat_state.dart.
// Pure data + helpers, no framework dependencies.

export type PlayerSide = 'player1' | 'player2';

export function opponentOf(side: PlayerSide): PlayerSide {
  return side === 'player1' ? 'player2' : 'player1';
}

/** Owner is encoded as 1 or 2 on triggers/deferred/raids, matching the Dart engine. */
export function ownerInt(side: PlayerSide): number {
  return side === 'player1' ? 1 : 2;
}

export type TurnPhase = 'deferredResolution' | 'autoPlacement' | 'perkSelection';
export type CombatStatus = 'setup' | 'playing' | 'finished';

export interface TriggerData {
  type: string; // PORTAL, TRAP, MIRROR, ECHO, SHOCKWAVE, HYDRA, BACKFIRE, ABSORB, RETALIATE
  owner: number; // 1 or 2
  turnsLeft: number;
  orderId: number;
}

export interface DeferredData {
  type: string; // SIGNAL, ENLIST, AMBUSH, REINFORCE
  owner: number;
  targetLane: number;
}

export interface SanctuaryData {
  lane: number;
  turnsLeft: number;
}

export interface CaptureData {
  lane: number;
  turnsLeft: number;
}

export interface PendingRaidData {
  owner: number;
  lane: number;
  turnsUntilResolve: number;
  source: string; // "RAID" or "RETALIATE"
}

/** A single lane: 5 columns per side (front-fill order 0..4). */
export interface Lane {
  player1Columns: boolean[];
  player2Columns: boolean[];
  winner: PlayerSide | null;
  triggers: TriggerData[];
  deferred: DeferredData[];
}

export interface CombatGameState {
  gameId: string;
  lanes: Lane[];
  currentPlayer: PlayerSide;
  currentPhase: TurnPhase;
  player1Pieces: number;
  player2Pieces: number;
  player1LanesWon: number;
  player2LanesWon: number;
  status: CombatStatus;
  gameWinner: PlayerSide | null;
  player1Hero: string | null; // hero type key
  player2Hero: string | null;
  lastAutoPlacedLane: number | null;
  /** lane index -> the player who froze it (their opponent is blocked). */
  frozenLanes: Record<number, PlayerSide>;
  player1Sanctuaries: SanctuaryData[];
  player2Sanctuaries: SanctuaryData[];
  player1Captures: CaptureData[];
  player2Captures: CaptureData[];
  pendingRaids: PendingRaidData[];
  player1Cloaked: number;
  player2Cloaked: number;
  player1Blinded: number;
  player2Blinded: number;
}

export const LANE_COUNT = 5;
export const SLOTS_PER_SIDE = 5;
export const LANES_TO_WIN = 3;

export function emptyLane(): Lane {
  return {
    player1Columns: Array(SLOTS_PER_SIDE).fill(false),
    player2Columns: Array(SLOTS_PER_SIDE).fill(false),
    winner: null,
    triggers: [],
    deferred: [],
  };
}

export function initialState(
  gameId: string,
  player1Hero: string | null = null,
  player2Hero: string | null = null,
): CombatGameState {
  return {
    gameId,
    lanes: Array.from({ length: LANE_COUNT }, emptyLane),
    currentPlayer: 'player1',
    currentPhase: 'autoPlacement',
    player1Pieces: 40,
    player2Pieces: 40,
    player1LanesWon: 0,
    player2LanesWon: 0,
    status: 'playing',
    gameWinner: null,
    player1Hero,
    player2Hero,
    lastAutoPlacedLane: null,
    frozenLanes: {},
    player1Sanctuaries: [],
    player2Sanctuaries: [],
    player1Captures: [],
    player2Captures: [],
    pendingRaids: [],
    player1Cloaked: 0,
    player2Cloaked: 0,
    player1Blinded: 0,
    player2Blinded: 0,
  };
}

// --- Lane helpers ---

export function columnsFor(lane: Lane, side: PlayerSide): boolean[] {
  return side === 'player1' ? lane.player1Columns : lane.player2Columns;
}

export function countPieces(lane: Lane, side: PlayerSide): number {
  return columnsFor(lane, side).filter(Boolean).length;
}

export function isSideFilled(lane: Lane, side: PlayerSide): boolean {
  return columnsFor(lane, side).every(Boolean);
}

/** Next empty column index for a side, or -1 if full. */
export function getNextEmptyColumn(lane: Lane, side: PlayerSide): number {
  const cols = columnsFor(lane, side);
  for (let i = 0; i < cols.length; i++) {
    if (!cols[i]) return i;
  }
  return -1;
}

// --- State helpers ---

export function getRemainingPieces(s: CombatGameState, side: PlayerSide): number {
  return side === 'player1' ? s.player1Pieces : s.player2Pieces;
}

export function getLanesWon(s: CombatGameState, side: PlayerSide): number {
  return side === 'player1' ? s.player1LanesWon : s.player2LanesWon;
}

export function isGameOver(s: CombatGameState): boolean {
  return s.player1LanesWon >= LANES_TO_WIN || s.player2LanesWon >= LANES_TO_WIN;
}

export function isCloaked(s: CombatGameState, side: PlayerSide): boolean {
  return side === 'player1' ? s.player1Cloaked > 0 : s.player2Cloaked > 0;
}

export function isBlinded(s: CombatGameState, side: PlayerSide): boolean {
  return side === 'player1' ? s.player1Blinded > 0 : s.player2Blinded > 0;
}

/** A lane is frozen for the opponent of whoever froze it. */
export function isLaneFrozenFor(s: CombatGameState, laneIndex: number, player: PlayerSide): boolean {
  const frozenBy = s.frozenLanes[laneIndex];
  if (frozenBy === undefined) return false;
  return frozenBy !== player;
}
