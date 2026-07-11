// Campaign balance knobs, kept in one place for tuning.

/** Respect at which a character joins the player's crew (level 1). */
export const JOIN_THRESHOLD = 3;

/**
 * Respect at which a character withdraws its defenses from all uncleared
 * nodes on every map (level 2).
 */
export const WITHDRAW_THRESHOLD = 9;

/** Battle seats at campaign start. */
export const BASE_SEATS = 3;

/** Seat cap after completing maps (3 + 1 per completed map, max 5). */
export const MAX_SEATS = 5;

/** Best respect a single node battle can award (the 3-star analog). */
export const MAX_NODE_RESPECT = 3;

/**
 * Stars for a battle result: 3 for a flawless win (rival took no lanes),
 * 2 when the rival took one lane, 1 for any other win, 0 for a loss.
 */
export function starsForBattle(playerWon: boolean, rivalLanesWon: number): number {
  if (!playerWon) return 0;
  if (rivalLanesWon === 0) return 3;
  return rivalLanesWon === 1 ? 2 : 1;
}
