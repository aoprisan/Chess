# Perk Balance Pass — PWA (V2 local engine)

Scope: **Flutter client only** (`client/lib/`), i.e. the local/AI game engine used by
the PWA. The Go server and the Python simulation reference are unchanged.

## How the changes were validated

The reference simulation (`templates/sim`, run as-is, not modified) was used to
measure per-perk competitiveness: for each perk, how often a depth-1 expectimax AI
picks it over the always-available slot 1/2 commons (PlaceAnother / RemoveEnemy)
across 2,000 games (~42k perk decisions). Candidate parameters were injected at
runtime via a custom `GameConfig` and monkeypatched executors, so the sim source
stayed untouched.

Baseline (sim defaults): 10 of 30 perks were never selected, largely because
duration-1 triggers expire on the owner's own end-of-turn tick and can never fire.
The client already runs those triggers at 2 ticks (= 1 opponent turn), which the
sim confirmed is the right call: with functioning reactive triggers, dead perks
drop from 10 to 2 and first-mover advantage in a symmetric matchup shrinks from
59.5/40.5 to 53/47 (400 games/side).

## Client changes

| Perk | Before | After | Sim evidence |
|------|--------|-------|--------------|
| Kamikaze | Sacrifice 1, enemy loses 2 random | enemy loses **3** | pick rate 5.6% → 20.4% |
| Gambit | Enemy +3 spread, you +2 concentrated | Enemy **+2** spread | worst perk (score 0.19) → 0.28, pick rate 13% → 17% |
| Raid odds | 10% lost / 15% +2 / 30% +1 / 45% alone | **5% / 25% / 35% / 35%** | direct expected-value buff (AI pick rate is eval-capped, real strength up) |
| Cloak | hidden for 1 opponent turn (2 ticks) | **2 opponent turns (4 ticks)** | matches the card text "2 turns"; was weakest-quartile |
| Blind | hidden for 1 opponent turn (2 ticks) | **2 opponent turns (4 ticks)** | same reasoning as Cloak |

The local AI's perk-scoring hints for Kamikaze and Gambit were bumped to match
their new strength.

Unchanged on purpose:

- **Trigger durations** (Portal, Trap, Mirror, Echo, Shockwave, Hydra, Backfire,
  Absorb, Retaliate): the client's 2-tick values already match the sim-validated
  tuning.
- **Sanctuary (4 ticks) / Capture (3 ticks)**: already provide 2 effective turns,
  matching their card text.
- **Regroup / Disrupt**: still unpicked by the sim AI, but they are pure
  repositioning perks whose value a shallow search cannot see; left for a future
  design pass rather than a numbers pass.

## Post-change competitiveness (tuned config, 2,000 games)

Top tier (50–83% pick rate): Signal, Trap, Echo, Hydra, Freeze, Portal.
Mid tier (20–45%): Reinforce, Ambush, Enlist, Absorb, Mirror, Rush, Split, Steal, Kamikaze.
Situational (10–17%): Backfire, Shockwave, Scatter, Blind, Cloak, Sanctuary, Capture, Gambit.
Known-weak for a shallow AI (<10%): Nullify, Scramble, Retaliate, Disperse, Raid, Regroup, Disrupt.
