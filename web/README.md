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
    ai.ts            greedy 1-ply heuristic AI (chooseAIPerk)
    rng.ts           seedable RNG (deterministic tests)
    hero.ts          the 6 cosmetic heroes
    engine.test.ts   Vitest parity suite
  adventure/
    map.ts           maze graph model + journey_1.json loader
    progress.ts      movement rules, stars, localStorage persistence
  ui/                React components (App, HeroSelect, AdventureMap, Combat)
public/assets/     images + maps (copied from ../client/assets)
```

## How single-player works

Adventure runs entirely client-side, exactly as the Flutter app does: each rival
fight instantiates `CombatEngine` in solo-AI mode. There is **no** network call,
no WebSocket, and no auth. Journey progress (current node, cleared obstacles,
opened treasures, best stars per rival) persists to `localStorage` under
`adventure_progress_v2` — the same key/shape the Flutter app uses in
`SharedPreferences`.

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
