// Headless AI-vs-AI match runner used for balance measurement and the balance
// regression tests. Drives the engine exactly like the Combat screen's turn
// loop (autoPlace -> AI perk -> endTurn), minus timers and rendering.

import { CombatEngine } from './engine';
import { chooseAIPerk } from './ai';
import { SeededRNG } from './rng';
import { PlayerSide } from './state';
import type { PerkPools } from './characters';

export interface MatchResult {
  winner: PlayerSide | null; // null = turn-cap draw (should be rare)
  turns: number;
  /** perk id -> times used, per side. */
  perkUse: Record<number, number>[];
  /** perk id -> times offered in a selectable (non-disabled) slot, per side. */
  perkOffered: Record<number, number>[];
}

export interface SeriesOptions {
  games: number;
  player1Difficulty: string;
  player2Difficulty: string;
  seed?: number;
  /** Safety cap on turns per game. */
  maxTurns?: number;
  /** Character-bound slot 3/4 pools per side; omitted = full catalog. */
  player1PerkPools?: PerkPools;
  player2PerkPools?: PerkPools;
}

export interface SeriesResult {
  games: number;
  player1Wins: number;
  player2Wins: number;
  draws: number;
  avgTurns: number;
  /** perk id -> uses, wins-when-used, and times offered, for either side combined. */
  perkStats: Record<number, { uses: number; wins: number; offered: number }>;
}

export function playMatch(engine: CombatEngine, maxTurns = 400): MatchResult {
  const perkUse: Record<number, number>[] = [{}, {}];
  const perkOffered: Record<number, number>[] = [{}, {}];
  let turns = 0;

  while (engine.state.status === 'playing' && turns < maxTurns) {
    if (engine.state.currentPhase === 'autoPlacement') {
      const placed = engine.autoPlace();
      if (
        placed === -1 &&
        engine.state.status === 'playing' &&
        engine.state.currentPhase === 'autoPlacement'
      ) {
        engine.skipTurn();
        turns++;
      }
    } else {
      const side = engine.state.currentPlayer === 'player1' ? 0 : 1;
      for (const slot of engine.currentPerkSlots) {
        if (slot.perkId > 0 && !slot.disabled) {
          perkOffered[side][slot.perkId] = (perkOffered[side][slot.perkId] ?? 0) + 1;
        }
      }
      const [perkId, target, second] = chooseAIPerk(engine);
      if (perkId === 0) {
        engine.skipTurn();
      } else {
        perkUse[side][perkId] = (perkUse[side][perkId] ?? 0) + 1;
        engine.executePerk(perkId, target, second);
      }
      turns++;
    }
  }

  return { winner: engine.state.gameWinner, turns, perkUse, perkOffered };
}

export function playSeries(opts: SeriesOptions): SeriesResult {
  const { games, player1Difficulty, player2Difficulty, seed = 12345, maxTurns = 400 } = opts;
  let p1 = 0;
  let p2 = 0;
  let draws = 0;
  let totalTurns = 0;
  const perkStats: Record<number, { uses: number; wins: number; offered: number }> = {};

  for (let g = 0; g < games; g++) {
    const engine = new CombatEngine(`sim_${g}`, {
      player1IsAI: true,
      player2IsAI: true,
      player1AIDifficulty: player1Difficulty,
      player2AIDifficulty: player2Difficulty,
      player1PerkPools: opts.player1PerkPools,
      player2PerkPools: opts.player2PerkPools,
      rng: new SeededRNG(seed + g * 7919),
    });
    const result = playMatch(engine, maxTurns);
    totalTurns += result.turns;
    if (result.winner === 'player1') p1++;
    else if (result.winner === 'player2') p2++;
    else draws++;

    for (let side = 0; side < 2; side++) {
      const won =
        (side === 0 && result.winner === 'player1') || (side === 1 && result.winner === 'player2');
      for (const [id, uses] of Object.entries(result.perkUse[side])) {
        const perkId = Number(id);
        const s = (perkStats[perkId] ??= { uses: 0, wins: 0, offered: 0 });
        s.uses += uses;
        if (won) s.wins += uses;
      }
      for (const [id, offered] of Object.entries(result.perkOffered[side])) {
        const perkId = Number(id);
        const s = (perkStats[perkId] ??= { uses: 0, wins: 0, offered: 0 });
        s.offered += offered;
      }
    }
  }

  return {
    games,
    player1Wins: p1,
    player2Wins: p2,
    draws,
    avgTurns: totalTurns / games,
    perkStats,
  };
}
