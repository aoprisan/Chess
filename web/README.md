# Kiddie Chess — Adventure PWA (TypeScript)

A standalone, installable **Progressive Web App** that replicates the Flutter
app's **single-player Adventure mode** — no login, no server, no multiplayer.
The full lane-battle combat engine (all 32 perks, trigger chains, raids, and the
AI opponent) is reimplemented in pure TypeScript, so a whole journey plays
**fully offline**.

Built with **React + Vite + vite-plugin-pwa**.

## Develop

```bash
cd web
npm install
npm run dev        # http://localhost:5173/Chess/
npm test           # engine parity suite (Vitest)
npm run build      # typecheck + production build -> dist/
npm run preview    # serve the production build at /Chess/
```

## Project layout

```
src/
  game/            # pure, framework-free engine (ported from combat_service.dart)
    state.ts         combat state model + helpers
    perks.ts         the 32-perk catalog + Slot3/Slot4 pools
    targeting.ts     legal-target rules (LaneValidator)
    engine.ts        CombatEngine — placement, 32 perks, triggers, raids, win checks
    ai.ts            greedy 1-ply heuristic AI (chooseAIPerk) + difficulty ladder
    simulate.ts      headless AI-vs-AI match runner (balance measurement)
    rng.ts           seedable RNG (deterministic tests)
    hero.ts          the 6 cosmetic heroes
    engine.test.ts   Vitest parity suite
    balance.test.ts  balance regression suite (seat fairness, difficulty gaps, pacing)
  adventure/
    map.ts           maze graph model + journey_1.json loader
    progress.ts      free-roam movement (BFS pathfinding), stars, localStorage persistence
    progress.test.ts movement/pathfinding suite (Vitest)
  ui/                React components (App, HeroSelect, AdventureMap, Combat)
public/assets/     images + maps (copied from ../client/assets)
```

## How single-player works

The map plays like a quest, not a level select: tap anywhere on the trail (or
any marker, however far) and the hero roams there hop-by-hop along the dashed
trails, camera following. Movement is BFS pathfinding over the maze graph —
only cleared nodes can be walked *through*; an uncleared obstacle, rival, or
treasure can be walked *to* but blocks travel beyond it until dealt with, and
standing on one you may only retreat onto trail you have already explored.

Adventure runs entirely client-side, exactly as the Flutter app does: each rival
fight instantiates `CombatEngine` in solo-AI mode. There is **no** network call,
no WebSocket, and no auth. Journey progress (current node, cleared obstacles,
opened treasures, best stars per rival) persists to `localStorage` under
`adventure_progress_v2` — the same key/shape the Flutter app uses in
`SharedPreferences`.

## Gameplay balance

Balance is tuned and locked in with seeded AI-vs-AI simulation
(`src/game/simulate.ts`, asserted by `src/game/balance.test.ts`):

- **Seat fairness** — player 1 always moves first, which is worth a lot on a
  race-to-fill-lanes board (~64% win rate in identical-AI mirror matches). The
  engine compensates with a *fair-start rule*: player 1's opening turn is
  auto-placement only, with no perk (`firstMoveCompensation: 'skipFirstPerk'`,
  configurable on `CombatEngine`). Mirror matches now land at ~53% for either
  seat, with the small residual favoring the human (always player 1).
- **Difficulty ladder** — `easy` plays mostly at random and passes often,
  `medium` plays the greedy heuristic but makes deliberate mistakes 25% of the
  time, `hard` always plays the best-scoring move. Hard beats medium ~69% of
  games seat-averaged; medium beats easy ~96%.
- **Pacing & perk diversity** — the AI scorer values removal/denial by actual
  lane threat instead of spamming `RemoveEnemy` (previously ~83% of all perk
  uses and ~14% of games stalemated at the turn cap). Games now always finish
  (~28 turns on average) and all 32 perks see play.

To re-measure after tuning `ai.ts` scoring or engine rules:

```bash
npm test -- balance          # regression windows
npx vite-node <script>       # ad-hoc series via playSeries() from simulate.ts
```

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
