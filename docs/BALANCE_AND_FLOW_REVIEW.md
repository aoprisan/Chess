# Gameplay Balance & Flow Review

A cross-codebase review of gameplay balance and turn flow across the three
implementations (Go server, Flutter client, web PWA), the changes applied as a
result, and a prioritized list of further improvements.

## Evidence base

Two independent measurement efforts already existed in the repo:

- **Python simulation** (`templates/sim/COMPETITIVENESS_FINDINGS.md`):
  at search depth 2, RemoveEnemy dominates (~45% of all actions), only ~10 of
  30 pool perks are competitive, and conditional triggers (Mirror, Echo,
  Shockwave, Retaliate, Hydra, Backfire, Absorb) have ~0% selection.
- **PWA headless simulator** (`web/src/game/simulate.ts`, 2000-game series):
  player 1 won 59-67% of identical-AI mirror matches, "hard" was literally
  identical to "medium", and RemoveEnemy accounted for ~83% of perk uses.

The PWA fixed its findings in commit `abf4716` (fair start, difficulty ladder,
threat-aware AI scoring, regression suite). The Go server and Flutter client
had none of those fixes — this change ports them and fixes flow problems found
along the way.

## Changes applied

### Balance

| Change | Server | Flutter client | PWA |
|--------|--------|----------------|-----|
| **Fair start** — player 1's opening turn is auto-placement only (no perk phase). Moves mirror matches from ~59-67% P1 to ~53/47. | `lane_engine.go` (`ExecuteAutoPlacement`, `PerkPhaseSkipped`), handler plumbing in `websocket.go`, tests in `lane_engine_test.go` | `combat_service.dart` (`_turnCounter`, skip in `_autoPlaceInternal`), fair-start hint in the opening turn dialog | already present |
| **Real difficulty ladder** — easy: 30% pass else random perk; medium: greedy with 25% deliberate mistakes; hard: pure greedy. Previously medium == hard on the client. | already distinct (weights + noise) | `chooseAIPerk` + new `_randomAIChoice` | already present |
| **Threat-aware AI scoring** — removal/denial valued by actual lane threat, instant lane-wins recognized (PlaceAnother/Signal/Reinforce/Enlist/Ambush at 4 pieces, Rush at 3+), match-point win/block bonuses. Spreads AI usage across all 32 perks instead of RemoveEnemy spam. | — (see suggestions) | `_scorePerkOnLane`, `_scoreAutoTargetPerk`, `_scoreDualLanePerk` ported from `web/src/game/ai.ts` | already present |

The fair-start rule is now documented in `GAME_RULES_V2_COMPLETE.md` §2 and
`GAMEPLAY_DESIGN.md` §3.

### Flow

- **Server vs-AI games were unplayable**: `executeLaneGameTurn` only ever ran
  the auto-placement phase, but `SwitchTurn` resets each turn to the raid
  resolution phase, so the engine rejected the very first placement
  ("Not in auto-placement phase") and raid/deferred effects could never
  resolve. The driver now runs the full phase cycle
  (raid → deferred → auto-place → perk), and the duplicated inline turn logic
  in `handleSelectPerk` was collapsed into it.
- **AI turn dead time cut ~35%** (Flutter and PWA): turn-banner hold
  800→600 ms, pre-placement delay 500→300 ms, AI "thinking" 600→400 ms,
  perk-highlight hold 1000→650 ms (~2.9 s → ~1.95 s fixed delay per AI turn).
  Server-side AI delay 500→300 ms.
- **"Ready!" modal removed from solo turns** (Flutter and PWA): the tap-gated
  turn dialog is pure ceremony when there is no pass-and-play privacy handoff.
  It now appears only on the opening turn (where it doubles as the fair-start
  explainer) and briefly, auto-dismissing, on AI turns. Pass-and-play keeps
  the dialog on every turn.
- **Perk descriptions on the picker** (Flutter): the in-combat compact perk
  cards showed icon + name only — kids had to tap "Kamikaze" or "Gambit"
  blind to find out what it does. Cards now show the one-line description.

## Suggested further improvements (prioritized)

1. **Buff the conditional trigger perks** (biggest balance lever). The sim
   shows Mirror/Echo/Shockwave/Retaliate/Hydra/Backfire/Absorb are never worth
   picking on a 5×5 board: they need the opponent to act on the right lane
   within 1-2 turns while a guaranteed effect sits in slot 1/2. Cheapest
   experiments, in order: extend the 1-turn triggers to 2 turns; let triggers
   fire twice before expiring; or add a small immediate effect ("+1 piece now")
   so they are never a dead pick. Validate with `templates/sim` and
   `web/src/game/simulate.ts` before committing to numbers.
2. **Tame RemoveEnemy** (slot 2). Strongest single action at depth 2 (~45%
   usage). Options: a 1-turn cooldown after use, or replace the fixed slot
   with a small rotating pool so it isn't guaranteed every turn. This
   changes game feel significantly — simulate first.
3. **Unify the three rules implementations.** Go server, Dart client, and TS
   PWA each reimplement all 32 perks; they have already drifted once (the
   PWA-only balance pass, the broken server vs-AI driver). Options: make the
   client server-driven for all modes (needs an offline server story), or
   generate rule tables/constants from one source. At minimum, add a shared
   cross-implementation test fixture (same seed → same game trace).
4. **Give the server AI the PWA's evaluation.** The server AI's hand-tuned
   weights predate the threat-aware scorer and it over-values RemoveEnemy
   against stacked lanes. Port `web/src/game/ai.ts` scoring into `lane_ai.go`
   (as done for the Dart client) and consider a 2-ply search on "hard" using
   the existing `LaneGame.Clone()`.
5. **Show cause and effect for random outcomes.** Split/Scatter/Steal/Gambit/
   Scramble redistribute pieces with no animation or callout — pieces just
   jump on the next repaint. A brief per-piece movement animation (or event
   log line, which the server already emits as discrete WS messages) would
   make outcomes legible, especially for kids.
6. **First-session onboarding.** There is no tutorial or rules screen in the
   Flutter client; perk descriptions are terse and jargon-y ("Cancel all
   triggers on your lane"). A 5-step guided first game plus kid-friendly
   description rewrites would lower the entry barrier more than any balance
   change.
7. **Batch the server's per-turn WebSocket frames.** A full AI turn sends 4-5
   discrete messages (auto-placement, perk result, lane won, game state).
   One consolidated turn-summary message would simplify client state handling
   and remove flicker between frames.
8. **Board-size experiments.** The sim's untested hypothesis: on 7×7, longer
   games may make triggers and duration effects viable without direct buffs.
   Board constants are compile-time (`lane_game.go:64-68`); making them
   config-driven would let the sim answer this cheaply.

## Verification

- `cd server && go test ./...` — all green, including 2 new fair-start tests.
- `cd web && npm test` — 26/26, including the balance regression suite
  (seat fairness, difficulty ordering, perk diversity) against the new flow.
- `cd web && npm run build` — clean.
- `cd client && flutter test` — 78/78 logic tests pass (`widget_test.dart`
  only compiles on Flutter ≥ 3.27 because the app uses `Color.withValues`;
  pre-existing, unrelated to this change).
