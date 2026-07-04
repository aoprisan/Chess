# Neon City: Bug Busters — Campaign PWA (TypeScript)

A standalone, installable **Progressive Web App**: a kid-friendly cyberpunk
lane battler — no login, no server, no multiplayer. The full lane-battle
combat engine (all 32 powers, trigger chains, raids, and the AI opponent) is
pure TypeScript, so the whole campaign plays **fully offline**.

The old fairy-tale version of the game ("Kiddie Chess") is preserved at git
tag `1.0`.

Built with **React + Vite + vite-plugin-pwa**.

## Develop

```bash
cd web
npm install
npm run dev        # http://localhost:5173/Chess/
npm test           # engine, balance, campaign, and UI suites (Vitest)
npm run build      # typecheck + production build -> dist/
npm run preview    # serve the production build at /Chess/
```

## Project layout

```
src/
  game/            # pure, framework-free engine
    state.ts         combat state model + helpers
    perks.ts         the 32-perk catalog (Neon City names) + Slot3/Slot4 pools
    characters.ts    the 23 Fixers: 5 starters + 6 per campaign map, each
                     owning 1-3 perks; buildPerkPools() for battle pools
    targeting.ts     legal-target rules (LaneValidator)
    engine.ts        CombatEngine — placement, 32 perks, triggers, raids,
                     win checks, per-side slot 3/4 perk pools
    ai.ts            greedy 1-ply heuristic AI (chooseAIPerk) + difficulty ladder
    simulate.ts      headless AI-vs-AI match runner (balance measurement)
    rng.ts           seedable RNG (deterministic tests)
    engine.test.ts   engine suite (incl. character-bound pools)
    characters.test.ts roster/pool allocation invariants
    balance.test.ts  balance regression suite (seat fairness, difficulty gaps, pacing)
  campaign/
    model.ts         city map graph model + map JSON loader
    balance.ts       campaign knobs (join/withdraw thresholds, seats)
    meta.ts          single-key localStorage persistence (neon_meta_v1)
    controller.ts    respect derivation, recruitment, withdrawal, unlocks,
                     free-roam movement (BFS pathfinding)
    maps.test.ts     structural validation of the shipped maps vs the spec
    controller.test.ts respect/withdrawal/unlock/movement suite
  ui/                React components (App, MapSelect, CampaignMap, TeamPicker,
                     Roster, CharacterSelect, Combat, CharacterPortrait)
public/assets/
  images/characters/  portrait asset slots ({id}.png; CSS fallback until art lands)
  maps/               map_1..3.json (generated)
scripts/
  generate-city.mjs   authoring tool that emits map_1..map_3.json;
                      deterministic (seeded), safe to re-run
  generate-icons.mjs  PWA icon set from a programmatic neon logo (npm run icons)
```

## How the campaign works

The player controls a crew of friendly repair bots ("Fixers") restoring the
glitched systems of Neon City across **3 maps** (Street Grid → Metro Net →
Sky Core; 24/48/72 nodes with 6/12/18 critical systems). Tap any node and the
crew roams there along the neon streets — movement is BFS pathfinding; only
restored nodes can be walked _through_.

- **Battles**: each defended node is a lane battle against 1-6 defender
  characters. The player brings 3 seats of characters (4 after map 1, 5 after
  map 2), and perk slots 3/4 offer **only perks owned by the characters in
  the battle** — on both sides.
- **Respect**: winning a node earns 1-3 respect (cleaner win = more; best
  result kept). A character's respect is the sum over the cleared nodes it
  defends. At **3** it joins the crew; at **9** it withdraws its defenses
  from every uncleared node on all maps — undefended nodes auto-restore.
- **Unlocks**: restoring all of a map's critical systems opens the next map
  and a new battle seat. Restoring the Sky Core's AI Core wins the game.

Everything runs client-side; progress persists to `localStorage` under
`neon_meta_v1`. Old `adventure_*` saves from the 1.0 game are removed on
first boot.

## Gameplay balance

Balance is tuned and locked in with seeded AI-vs-AI simulation
(`src/game/simulate.ts`, asserted by `src/game/balance.test.ts`):

- **Seat fairness** — player 1 always moves first, which is worth a lot on a
  race-to-fill-lanes board (~64% win rate in identical-AI mirror matches). The
  engine compensates with a _fair-start rule_: player 1's opening turn is
  auto-placement only, with no perk (`firstMoveCompensation: 'skipFirstPerk'`,
  configurable on `CombatEngine`). Mirror matches now land at ~53% for either
  seat, with the small residual favoring the human (always player 1).
- **Difficulty ladder** — `easy` plays mostly at random and passes often,
  `medium` plays the greedy heuristic but makes deliberate mistakes 25% of the
  time, `hard` always plays the best-scoring move. Node difficulty is authored
  per node by `generate-city.mjs`.
- **Pacing & perk diversity** — games always finish (~28 turns on average) and
  all 32 perks see play; a dedicated regression covers small character-bound
  pools (3 starters vs a 3-defender crew) staying playable.
- **Campaign knobs** — join/withdraw thresholds live in
  `src/campaign/balance.ts`; map generation invariants (every character can
  reach the withdraw threshold, criticals alone can't recruit a map's full
  cast) are enforced by the generator and `campaign/maps.test.ts`.

To re-measure after tuning `ai.ts` scoring or engine rules:

```bash
npm test -- balance          # regression windows
npx vite-node <script>       # ad-hoc series via playSeries() from simulate.ts
```

## Character art

Portraits are asset slots: drop `public/assets/images/characters/{id}.png`
(ids in `src/game/characters.ts`) and the app uses them with no code change;
until then a CSS tile (accent gradient + initial) renders in their place.

## Deploying to GitHub Pages

The site is static, so GitHub Pages hosts it directly. A workflow at
`.github/workflows/pages.yml` builds `web/` and deploys on pushes to `main`.
One-time setup: repo **Settings → Pages → Source = GitHub Actions**.

The site serves at `https://<user>.github.io/Chess/`, so the Vite `base` is
`/Chess/` (and the PWA manifest scope + service-worker scope match it). For a
custom domain or a `<user>.github.io` root repo, build with `BASE_PATH=/`:

```bash
BASE_PATH=/ npm run build
```

> GitHub Pages is **public**. For a private deployment, use Cloudflare Pages or
> Netlify (also free static hosting) with access protection.
