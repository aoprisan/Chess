# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kiddie Chess is a kid-friendly lane-based combat game with cute characters (heroes) and a 32-perk system. See `GAME_RULES_V2_COMPLETE.md` for full rules.

The app is a **standalone TypeScript Progressive Web App** in `web/` — React + Vite + vite-plugin-pwa. Everything runs client-side (engine, AI, adventure progression); there is no server, login, or network play. It deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Tech Stack

- **App**: TypeScript, React 18, Vite, vite-plugin-pwa (`web/`)
- **Tests**: Vitest
- **Simulation**: Python 3.x for perk balance reference (`templates/sim/`, reference-only, do not modify)

## Development Commands

```bash
cd web
npm install
npm run dev        # http://localhost:5173/Chess/
npm test           # Vitest suites (engine parity, balance, adventure)
npm run build      # typecheck (tsc) + production build -> dist/
npm run preview    # serve the production build at /Chess/
```

Run a single test file:
```bash
cd web && npx vitest run src/game/engine.test.ts
```

## Architecture (`web/src/`)

- **game/**: pure, framework-free engine
  - `state.ts` — combat state model + helpers
  - `perks.ts` — the 32-perk catalog + Slot3/Slot4 pools
  - `targeting.ts` — legal-target rules (LaneValidator)
  - `engine.ts` — CombatEngine: placement, all 32 perks, triggers, raids, win checks
  - `ai.ts` — heuristic AI (`chooseAIPerk`) + difficulty ladder (easy/medium/hard)
  - `simulate.ts` — headless AI-vs-AI match runner for balance measurement
  - `rng.ts` — seedable RNG for deterministic tests
  - `hero.ts` — the 6 cosmetic heroes
- **adventure/**: maze-map journeys, level catalog/unlocks, free-roam movement (BFS), localStorage persistence
- **ui/**: React components — `App.tsx` (screen routing), `LevelSelect.tsx`, `HeroSelect.tsx`, `AdventureMap.tsx`, `Combat.tsx` (lane combat UI incl. perk selection and lane targeting)
- **public/assets/**: images and journey maps
- **scripts/**: authoring tools (e.g. `generate-journeys.mjs`)

### Python Simulation (`templates/sim/`) — REFERENCE ONLY, DO NOT MODIFY
**Do not modify, refactor, or add code to `templates/sim/`.** It exists solely as a reference implementation for understanding perk logic and offline balance testing.

## Adding Features

### New Perks
1. Add to the catalog in `web/src/game/perks.ts` and implement in `web/src/game/engine.ts`
2. Add targeting rules in `web/src/game/targeting.ts` and AI scoring in `web/src/game/ai.ts`
3. Extend the Vitest suites (`engine.test.ts`, `balance.test.ts`)

### New Heroes
1. Add to `web/src/game/hero.ts`
2. Add image to `web/public/assets/images/characters/`

## Key Documentation

- `GAME_RULES_V2_COMPLETE.md` — Complete lane combat rules and 32-perk system
- `GAMEPLAY_DESIGN.md` — Gameplay design details
- `PERK_FLOW_DIAGRAM.md` — Perk execution flow diagrams
- `ADVENTURE_MODE_DESIGN.md` — Adventure mode design
- `web/README.md` — PWA development, balance tuning, and deployment details
