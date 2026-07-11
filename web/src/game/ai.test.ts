import { describe, it, expect } from 'vitest';
import { CombatEngine } from './engine';
import { SeededRNG } from './rng';
import { Lane, PlayerSide } from './state';
import { chooseAIPerk } from './ai';
import { getValidLanesForPerk } from './targeting';

function engine(seed = 1): CombatEngine {
  return new CombatEngine('test', { rng: new SeededRNG(seed) });
}

/** Fill a side of a lane to a given count (front-fill columns 0..n-1). */
function setPieces(lane: Lane, side: PlayerSide, n: number) {
  const cols = side === 'player1' ? lane.player1Columns : lane.player2Columns;
  for (let i = 0; i < cols.length; i++) cols[i] = i < n;
}

describe('random-difficulty dual-lane picks', () => {
  it('easy AI plays random valid Disrupt combos, not always the optimal one', () => {
    const sources = new Set<number>();
    for (let seed = 1; seed <= 60; seed++) {
      const e = engine(seed);
      e.player1AIDifficulty = 'easy';
      // Lane 0 is the stacked lane the optimal play always drags; lane 1 is a
      // legal but clearly worse source the old (optimal) code never chose.
      setPieces(e.state.lanes[0], 'player2', 4);
      setPieces(e.state.lanes[1], 'player2', 1);
      e.state.currentPhase = 'perkSelection';
      e.currentPerkSlots = [{ slotIndex: 0, perkId: 34, perkName: 'Disrupt' }];
      const [perkId, target, second] = chooseAIPerk(e);
      if (perkId === 0) continue; // easy passes 30% of turns
      expect(perkId).toBe(34);
      expect(getValidLanesForPerk(34, e.state, 'player1')).toContain(target);
      expect(getValidLanesForPerk(34, e.state, 'player1', target)).toContain(second!);
      sources.add(target);
    }
    // Both legal source lanes get picked across seeds — genuinely random.
    expect(sources).toContain(0);
    expect(sources).toContain(1);
  });
});

describe('greedy tie-breaking', () => {
  it('spreads equal-scoring lane choices instead of always picking the lowest index', () => {
    const targets = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const e = engine(seed);
      e.player1AIDifficulty = 'hard';
      // Empty board: PlaceAnother scores identically on all five lanes.
      e.state.currentPhase = 'perkSelection';
      e.currentPerkSlots = [{ slotIndex: 0, perkId: 1, perkName: 'PlaceAnother' }];
      const [perkId, target] = chooseAIPerk(e);
      expect(perkId).toBe(1);
      targets.add(target);
    }
    expect(targets.size).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for a fixed seed', () => {
    const run = () => {
      const e = engine(9);
      e.player1AIDifficulty = 'hard';
      e.state.currentPhase = 'perkSelection';
      e.currentPerkSlots = [{ slotIndex: 0, perkId: 1, perkName: 'PlaceAnother' }];
      return chooseAIPerk(e);
    };
    expect(run()).toEqual(run());
  });

  it('still prefers the strictly best-scoring lane when there is one', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const e = engine(seed);
      e.player1AIDifficulty = 'hard';
      setPieces(e.state.lanes[3], 'player1', 4); // instant lane win here
      e.state.currentPhase = 'perkSelection';
      e.currentPerkSlots = [{ slotIndex: 0, perkId: 1, perkName: 'PlaceAnother' }];
      const [perkId, target] = chooseAIPerk(e);
      expect(perkId).toBe(1);
      expect(target).toBe(3);
    }
  });
});

describe('board-sensitive flat-perk scores', () => {
  it('never Steals from an empty board (passes instead)', () => {
    const e = engine(2);
    e.player1AIDifficulty = 'hard';
    e.state.currentPhase = 'perkSelection';
    e.currentPerkSlots = [{ slotIndex: 0, perkId: 38, perkName: 'Steal' }];
    const [perkId] = chooseAIPerk(e);
    expect(perkId).toBe(0); // nothing to take — score 0 falls below the pass baseline
  });

  it('avoids Gambit when the enemy has a near-complete lane', () => {
    const e = engine(2);
    e.player1AIDifficulty = 'hard';
    setPieces(e.state.lanes[0], 'player2', 4);
    setPieces(e.state.lanes[1], 'player1', 2);
    e.state.currentPhase = 'perkSelection';
    // Freeze (blocks the 4-stack, scores 65) vs Gambit (scores 2 here).
    e.currentPerkSlots = [
      { slotIndex: 0, perkId: 37, perkName: 'Gambit' },
      { slotIndex: 1, perkId: 4, perkName: 'Freeze' },
    ];
    const [perkId] = chooseAIPerk(e);
    expect(perkId).toBe(4);
  });
});
