# Repository Guidelines

## Project Structure & Module Organization
- `client/`: Flutter app. Main code lives in `client/lib/` (`models/`, `services/`, `screens/`, `widgets/`), assets in `client/assets/`, tests in `client/test/`.
- `server/`: Go backend. Entrypoints are in `server/cmd/`; core logic is in `server/internal/` (`game/`, `perks/`, `handlers/`, `models/`, `matchmaking/`, `database/`).
- `templates/sim/`: Python simulation engine and pytest suite for perk/mechanics validation.
- `scripts/`: Local developer helpers (`build-and-run.sh`, `run-server.sh`, `run-client.sh`).

## Build, Test, and Development Commands
- `./scripts/build-and-run.sh`: Build Flutter web client, then start Go server with `air` hot reload.
- `./scripts/run-server.sh`: Start server with hot reload on `:8080`.
- `./scripts/run-client.sh`: Start Flutter client on Chrome.
- `cd server && go run cmd/server/main.go`: Run backend directly.
- `cd client && flutter pub get && flutter run -d chrome`: Run frontend locally.
- `cd client && flutter analyze`: Static analysis for Dart/Flutter code.
- `cd client && flutter test`: Run Flutter tests.
- `cd server && go test ./...`: Run Go unit tests.
- `cd templates/sim && python -m pytest tests/ -v`: Run simulator tests.

## Coding Style & Naming Conventions
- Dart: follow `client/analysis_options.yaml` (`flutter_lints`), use 2-space indentation, and format with `dart format lib test`.
- Go: format with `gofmt`; keep package names lowercase; keep tests beside implementation as `*_test.go`.
- Python: use `snake_case` and keep tests named `test_*.py`.
- Prefer descriptive, feature-based file names like `perk_selection_panel.dart` and `lane_engine.go`.

## Testing Guidelines
- Add or update tests with each behavior change.
- While iterating, run targeted tests first; before opening a PR, run `flutter test`, `go test ./...`, and relevant `pytest` suites.
- No strict coverage gate is configured, so PRs should include meaningful regression tests for fixes/features.

## Commit & Pull Request Guidelines
- Recent history favors short, imperative commit subjects (examples: `Add game simulation runner...`, `Fix combat screen sizing...`).
- Keep commits focused by layer (`client`, `server`, or `templates/sim`) when possible.
- PRs should include: summary, changed paths, test commands/results, linked issue, and screenshots/GIFs for UI changes.

## Configuration & Data Notes
- Server environment variables: `PORT` (default `8080`) and `DB_PATH` (default `./data/kiddiechess.db`).
- Treat generated artifacts (`build/`, `__pycache__/`, coverage outputs) as non-source and avoid committing them.
