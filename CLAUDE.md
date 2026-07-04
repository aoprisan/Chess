# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Neon City: Bug Busters is a kid-friendly cyberpunk lane-battler with 23 recruitable characters ("Fixers") and a 32-perk system. The player's crew restores the glitched systems of Neon City across a 3-map campaign. See `GAME_RULES_V2_COMPLETE.md` for the combat rules (perk mechanics are unchanged from V2; names are reflavored in `web/src/game/perks.ts`). The previous fairy-tale game ("Kiddie Chess") is preserved at git tag `1.0`.

The app is a **standalone TypeScript Progressive Web App** in `web/` — React + Vite + vite-plugin-pwa. Everything runs client-side (engine, AI, campaign progression); there is no server, login, or network play. It deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Tech Stack

- **App**: TypeScript, React 18, Vite, vite-plugin-pwa (`web/`)
- **Tests**: Vitest
- **Simulation**: Python 3.x for perk balance reference (`templates/sim/`, reference-only, do not modify)

## Development Commands

```bash
cd web
npm install
npm run dev        # http://localhost:5173/Chess/
npm test           # Vitest suites (engine, balance, campaign, UI)
npm run build      # typecheck (tsc) + production build -> dist/
npm run preview    # serve the production build at /Chess/
```

Run a single test file:
```bash
cd web && npx vitest run src/game/engine.test.ts
```

Regenerate the campaign maps (deterministic; committed JSON must not churn):
```bash
cd web && node scripts/generate-city.mjs
```

## Architecture (`web/src/`)

- **game/**: pure, framework-free engine
  - `state.ts` — combat state model + helpers
  - `perks.ts` — the 32-perk catalog (Neon City names) + Slot3/Slot4 pools
  - `characters.ts` — the 23 Fixers (5 starters + 6 per map), 1-3 perks each, `buildPerkPools`
  - `targeting.ts` — legal-target rules (LaneValidator)
  - `engine.ts` — CombatEngine: placement, all 32 perks, triggers, raids, win checks; optional per-side slot 3/4 perk pools (`player1PerkPools`/`player2PerkPools`)
  - `ai.ts` — heuristic AI (`chooseAIPerk`) + difficulty ladder (easy/medium/hard)
  - `simulate.ts` — headless AI-vs-AI match runner for balance measurement
  - `rng.ts` — seedable RNG for deterministic tests
- **campaign/**: the 3-map city campaign
  - `model.ts` — node-graph maps (entry/junction/system nodes, defenders, criticals)
  - `balance.ts` — join (3) / withdraw (9) respect thresholds, battle seats (3→5)
  - `meta.ts` — single-key localStorage persistence (`neon_meta_v1`)
  - `controller.ts` — respect derivation, recruitment, withdrawal + auto-restore, map unlocks, BFS free-roam movement
- **ui/**: React components — `App.tsx` (screen routing), `MapSelect.tsx`, `CampaignMap.tsx`, `TeamPicker.tsx`, `Roster.tsx`, `CharacterSelect.tsx`, `Combat.tsx` (lane combat incl. team perk pools), `CharacterPortrait.tsx` (asset slot + CSS fallback tile)
- **public/assets/**: character portrait slots (`images/characters/{id}.png`) and generated `maps/map_1..3.json`
- **scripts/**: authoring tools (`generate-city.mjs` for maps, `generate-icons.mjs` for PWA icons)

### Python Simulation (`templates/sim/`) — REFERENCE ONLY, DO NOT MODIFY
**Do not modify, refactor, or add code to `templates/sim/`.** It exists solely as a reference implementation for understanding perk logic and offline balance testing.

## Adding Features

### New Perks
1. Add to the catalog in `web/src/game/perks.ts` and implement in `web/src/game/engine.ts`
2. Add targeting rules in `web/src/game/targeting.ts` and AI scoring in `web/src/game/ai.ts`
3. Assign an owning character in `web/src/game/characters.ts` (`characters.test.ts` enforces the allocation invariants)
4. Extend the Vitest suites (`engine.test.ts`, `balance.test.ts`)

### New Characters
1. Add to `web/src/game/characters.ts` (id, name, perkIds, accent, homeMap)
2. Update `MAP_CHARS` in `web/scripts/generate-city.mjs` and regenerate the maps
3. Drop portrait art into `web/public/assets/images/characters/{id}.png` (a CSS fallback tile renders until then)

## Key Documentation

- `GAME_RULES_V2_COMPLETE.md` — Complete lane combat rules and 32-perk system (original V2 perk names)
- `GAMEPLAY_DESIGN.md` — Gameplay design details
- `PERK_FLOW_DIAGRAM.md` — Perk execution flow diagrams
- `web/README.md` — PWA development, campaign rules, balance tuning, and deployment details
