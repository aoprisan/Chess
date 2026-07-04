// Gameplay balance regression tests. Seeded AI-vs-AI series lock in the three
// balance properties tuned in ai.ts + engine.ts (see simulate.ts):
//   1. Fair seats: mirror matches are near 50/50 (firstMoveCompensation).
//   2. Real difficulty ladder: easy < medium < hard, with clear gaps.
//   3. Healthy pacing & perk diversity: games always finish (no turn-cap
//      draws) and no single perk dominates play.
// Windows are generous (±4 sigma) so they only trip on genuine regressions.

import { describe, it, expect } from 'vitest';
import { playSeries } from './simulate';

const N = 600;

describe('seat fairness (first-mover compensation)', () => {
  it.each(['easy', 'medium', 'hard'])('mirror %s is near 50/50', (diff) => {
    const r = playSeries({ games: N, player1Difficulty: diff, player2Difficulty: diff, seed: 11 });
    const p1Rate = r.player1Wins / r.games;
    // Without compensation this sits at 0.59-0.67.
    expect(Math.abs(p1Rate - 0.5)).toBeLessThanOrEqual(0.1);
  });
});

describe('difficulty ladder', () => {
  it('hard beats medium from the disadvantaged seat', () => {
    const r = playSeries({
      games: N,
      player1Difficulty: 'medium',
      player2Difficulty: 'hard',
      seed: 22,
    });
    // Measured ~66%; identical AIs (the old bug) would sit near 46%.
    expect(r.player2Wins / r.games).toBeGreaterThanOrEqual(0.55);
  });

  it('medium beats easy from the disadvantaged seat', () => {
    const r = playSeries({
      games: N,
      player1Difficulty: 'easy',
      player2Difficulty: 'medium',
      seed: 33,
    });
    expect(r.player2Wins / r.games).toBeGreaterThanOrEqual(0.85);
  });
});

describe('pacing and perk diversity (mirror medium)', () => {
  const r = playSeries({
    games: N,
    player1Difficulty: 'medium',
    player2Difficulty: 'medium',
    seed: 44,
  });

  it('games always finish (no turn-cap stalemates)', () => {
    // Pre-rework the AI spammed RemoveEnemy and ~14% of games hit the cap.
    expect(r.draws).toBe(0);
    expect(r.avgTurns).toBeLessThan(60);
  });

  it('most of the perk catalog sees play', () => {
    const used = Object.values(r.perkStats).filter((s) => s.uses > 0).length;
    // 32 perks + the two fixed commons; pre-rework only 7 were ever chosen.
    expect(used).toBeGreaterThanOrEqual(28);
  });

  it('no single perk dominates usage', () => {
    const total = Object.values(r.perkStats).reduce((acc, s) => acc + s.uses, 0);
    const max = Math.max(...Object.values(r.perkStats).map((s) => s.uses));
    // Pre-rework RemoveEnemy alone was ~83% of all perk uses; post
    // trigger-buff/cooldown the max (PlaceAnother) measures ~42%.
    expect(max / total).toBeLessThanOrEqual(0.47);
  });
});

describe('trigger viability and RemoveEnemy cap (mirror hard)', () => {
  // Hard has no random-mistake noise, so uses here are genuine greedy picks.
  const r = playSeries({
    games: N,
    player1Difficulty: 'hard',
    player2Difficulty: 'hard',
    seed: 44,
  });
  const total = Object.values(r.perkStats).reduce((acc, s) => acc + s.uses, 0);

  it('conditional trigger perks are worth picking', () => {
    const TRIGGER_IDS = [26, 27, 28, 29, 30, 46, 52];
    const trigUses = TRIGGER_IDS.reduce((acc, id) => acc + (r.perkStats[id]?.uses ?? 0), 0);
    // Pre-buff these 7 combined were 0.6% of uses (Hydra/Backfire/Absorb: 0);
    // with "+1 now" + 2-turn lifetime they measure ~18%.
    expect(trigUses / total).toBeGreaterThanOrEqual(0.08);
  });

  it('RemoveEnemy stays under the cooldown-enforced cap', () => {
    // Pre-cooldown RemoveEnemy was ~48% of all uses; measured ~23% after.
    expect((r.perkStats[2]?.uses ?? 0) / total).toBeLessThanOrEqual(0.35);
  });
});
