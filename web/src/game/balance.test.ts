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
  const r = playSeries({ games: N, player1Difficulty: 'medium', player2Difficulty: 'medium', seed: 44 });

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
    // Pre-rework RemoveEnemy alone was ~83% of all perk uses.
    expect(max / total).toBeLessThanOrEqual(0.5);
  });
});
