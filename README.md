# Neon City: Bug Busters

A kid-friendly cyberpunk lane battler, delivered as a standalone **TypeScript Progressive Web App**. Friendly repair-bot "Fixers" restore the glitched computer systems of Neon City: everything — the combat engine, the 32-power system, the AI opponent, and the 3-map campaign — runs entirely in the browser: no server, no login, fully playable offline once installed.

The previous fairy-tale version of the game ("Kiddie Chess") is preserved at git tag `1.0`.

Full combat rules live in `GAME_RULES_V2_COMPLETE.md` (perk mechanics are unchanged from V2; names are reflavored in `web/src/game/perks.ts`).

## Tech Stack

- **App**: TypeScript + React 18 + Vite + vite-plugin-pwa (`web/`)
- **Mobile**: Capacitor 8 wraps the same bundle as Android/iOS apps (`web/MOBILE.md`)
- **Tests**: Vitest (engine, balance regression, campaign, and UI suites)
- **Balance reference**: Python simulation in `templates/sim/` (reference-only)

## Project Structure

```
Chess/
├── web/                    # The PWA (see web/README.md for details)
│   ├── src/
│   │   ├── game/           # Pure TypeScript engine: state, 32 perks,
│   │   │                   # 23 characters, targeting, CombatEngine, AI
│   │   ├── campaign/       # City maps, respect/recruitment, persistence
│   │   └── ui/             # React components (App, CampaignMap, Combat, …)
│   ├── public/assets/      # Character portrait slots and map JSONs
│   ├── scripts/mobile/     # Local Android/iOS build scripts (Capacitor)
│   └── capacitor.config.ts # Native shell config (android/ and ios/ are generated)
├── templates/sim/          # Python balance simulation (reference only)
├── docs/                   # Additional documentation
└── *.md                    # Game rules and design docs
```

## Getting Started

```bash
cd web
npm install
npm run dev        # http://localhost:5173/Chess/
```

### Testing & Building

```bash
cd web
npm test           # Vitest suites
npm run build      # typecheck + production build -> dist/
npm run preview    # serve the production build
```

### Mobile apps

```bash
cd web
npm run android:build     # debug APK -> web/dist-mobile/android/
npm run ios:build         # simulator build -> web/dist-mobile/ios/ (macOS only)
```

Built locally only — there is no CI workflow for the store builds. Prerequisites,
signing, live reload and troubleshooting are in `web/MOBILE.md`.

## Features

- **Campaign** — 3 city systems (Street Grid, Metro Net, Sky Core; 24/48/72 nodes) with free-roam movement, defended nodes, and critical systems that gate the next map.
- **23 recruitable characters** — each owns 1-3 powers; earn respect by beating a character's nodes (3 = joins your crew, 9 = withdraws its defenses city-wide).
- **Team battles** — bring 3-5 seated characters; perk slots 3/4 offer only the powers owned by the characters in the battle, on both sides.
- **Lane combat** — 5-line battles, race to fill 3 lines; all 32 powers (placement triggers, removal triggers, repositioning, trades, probes, and more).
- **AI opponent** — easy/medium/hard difficulty ladder tuned with seeded AI-vs-AI simulation; node difficulty authored per node.

## Deployment

The app is static. A GitHub Actions workflow (`.github/workflows/pages.yml`) builds `web/` and deploys to GitHub Pages on pushes to `main`. See `web/README.md` for base-path configuration and alternative hosts.

The Android and iOS builds are **not** wired into CI — store artifacts are produced on a developer machine with `npm run android:release` / `npm run ios:release`, so signing keys never live in the repo.

## License

MIT
