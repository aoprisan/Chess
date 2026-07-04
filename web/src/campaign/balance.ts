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
