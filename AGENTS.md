# Repository Guidelines

## Project Structure & Module Organization
- `web/`: the TypeScript PWA (React + Vite). Engine in `web/src/game/`, adventure logic in `web/src/adventure/`, React components in `web/src/ui/`, assets in `web/public/assets/`. Tests live beside implementation as `*.test.ts`.
- `templates/sim/`: Python simulation engine and pytest suite for perk/mechanics reference (reference-only — do not modify).
- `docs/` and root `*.md`: game rules and design documentation.

## Build, Test, and Development Commands
- `cd web && npm install`: install dependencies.
- `cd web && npm run dev`: start the dev server at `http://localhost:5173/Chess/`.
- `cd web && npm test`: run all Vitest suites.
- `cd web && npx vitest run src/game/engine.test.ts`: run a single suite.
- `cd web && npm run build`: typecheck (`tsc`) + production build to `dist/`.
- `cd web && npm run preview`: serve the production build.
- `cd templates/sim && python -m pytest tests/ -v`: run simulator tests (reference).

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation; keep the `game/` engine framework-free (no React imports); React components in PascalCase files (`Combat.tsx`), modules in lowercase (`targeting.ts`).
- Python: use `snake_case` and keep tests named `test_*.py`.
- Keep tests beside implementation as `*.test.ts`.

## Testing Guidelines
- Add or update tests with each behavior change.
- While iterating, run targeted suites first; before opening a PR, run `npm test` and `npm run build` (the build is also the typecheck).
- Balance-affecting engine/AI changes must keep `src/game/balance.test.ts` green.

## Commit & Pull Request Guidelines
- Recent history favors short, imperative commit subjects (examples: `Add game simulation runner...`, `Fix combat screen sizing...`).
- PRs should include: summary, changed paths, test commands/results, linked issue, and screenshots/GIFs for UI changes.

## Configuration & Data Notes
- The app is fully static; GitHub Pages deploys from `.github/workflows/pages.yml` on pushes to `main`. Use `BASE_PATH=/ npm run build` for non-`/Chess/` hosting.
- Player progress persists in browser `localStorage` (`adventure_progress_v2`, `adventure_levels_v1`).
- Treat generated artifacts (`web/dist/`, `node_modules/`, `__pycache__/`) as non-source and avoid committing them.
