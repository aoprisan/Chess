// Perk balance report: AI-vs-AI series with per-perk pick/win rates.
// Run: cd web && npx vite-node scripts/perk-report.ts
//
// Used to measure the conditional-trigger buffs and the RemoveEnemy cooldown
// (see docs/BALANCE_AND_FLOW_REVIEW.md "Suggested further improvements").

import { playSeries } from '../src/game/simulate';
import { getPerk } from '../src/game/perks';

const FOCUS_IDS = new Set([1, 2, 26, 27, 28, 29, 30, 46, 52]);
const GAMES = 1000;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function runReport(label: string, difficulty: string, seed: number): void {
  const r = playSeries({
    games: GAMES,
    player1Difficulty: difficulty,
    player2Difficulty: difficulty,
    seed,
  });

  const totalUses = Object.values(r.perkStats).reduce((sum, s) => sum + s.uses, 0);
  const totalWins = Object.values(r.perkStats).reduce((sum, s) => sum + s.wins, 0);
  const globalWinRate = totalUses > 0 ? totalWins / totalUses : 0;

  console.log(`\n=== ${label} (${GAMES} games, seed ${seed}) ===`);
  console.log(
    `p1 ${r.player1Wins} / p2 ${r.player2Wins} / draws ${r.draws} | avgTurns ${r.avgTurns.toFixed(1)} | global win-rate-when-used ${pct(globalWinRate)}`,
  );
  console.log(
    'perk'.padEnd(16) +
      'uses'.padStart(7) +
      'share'.padStart(8) +
      'offered'.padStart(9) +
      'pick@off'.padStart(10) +
      'win@use'.padStart(9),
  );

  const rows = Object.entries(r.perkStats)
    .map(([id, s]) => ({ id: Number(id), ...s }))
    .sort((a, b) => b.uses - a.uses);

  for (const row of rows) {
    const name = getPerk(row.id)?.name ?? `Perk${row.id}`;
    const marker = FOCUS_IDS.has(row.id) ? '*' : ' ';
    console.log(
      `${marker}${name}`.padEnd(16) +
        String(row.uses).padStart(7) +
        pct(totalUses > 0 ? row.uses / totalUses : 0).padStart(8) +
        String(row.offered).padStart(9) +
        pct(row.offered > 0 ? row.uses / row.offered : 0).padStart(10) +
        pct(row.uses > 0 ? row.wins / row.uses : 0).padStart(9),
    );
  }

  const triggerIds = [26, 27, 28, 29, 30, 46, 52];
  const trigUses = triggerIds.reduce((sum, id) => sum + (r.perkStats[id]?.uses ?? 0), 0);
  console.log(
    `Conditional triggers combined: ${trigUses} uses = ${pct(totalUses > 0 ? trigUses / totalUses : 0)} of all uses`,
  );
}

runReport('medium-mirror', 'medium', 44);
runReport('hard-mirror', 'hard', 44);
