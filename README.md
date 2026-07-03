# Kiddie Chess

A kid-friendly lane-battle game with cute characters and special abilities (perks), delivered as a standalone **TypeScript Progressive Web App**. Everything — the combat engine, the 32-perk system, the AI opponent, and the Adventure journeys — runs entirely in the browser: no server, no login, fully playable offline once installed.

Full game rules live in `GAME_RULES_V2_COMPLETE.md`.

## Tech Stack

- **App**: TypeScript + React 18 + Vite + vite-plugin-pwa (`web/`)
- **Tests**: Vitest (engine parity, balance regression, adventure suites)
- **Balance reference**: Python simulation in `templates/sim/` (reference-only)

## Project Structure

```
Chess/
├── web/                    # The PWA (see web/README.md for details)
│   ├── src/
│   │   ├── game/           # Pure TypeScript engine: state, 32 perks,
│   │   │                   # targeting, CombatEngine, AI, balance sim
│   │   ├── adventure/      # Journey maps, levels, progress persistence
│   │   └── ui/             # React components (App, AdventureMap, Combat, …)
│   └── public/assets/      # Images and journey maps
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

## Features

- **Adventure mode** — 5 journey maps with free-roam movement, rivals, obstacles, and treasure; unlock progression and star ratings persist in `localStorage`.
- **Lane combat** — 5-lane battles, race to fill 3 lanes; all 32 perks (placement triggers, removal triggers, repositioning, trades, raids, and more).
- **6 heroes** — Sloth, Panda, Unicorn, Snowman, Gnom, and Yeti.
- **AI opponent** — easy/medium/hard difficulty ladder tuned with seeded AI-vs-AI simulation.

## Deployment

The app is static. A GitHub Actions workflow (`.github/workflows/pages.yml`) builds `web/` and deploys to GitHub Pages on pushes to `main`. See `web/README.md` for base-path configuration and alternative hosts.

## License

MIT
