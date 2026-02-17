# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kiddie Chess is a kid-friendly lane-based combat game with cute characters (heroes) and a 32-perk system. See `GAME_RULES_V2_COMPLETE.md` for full rules. Uses a client-server architecture with real-time WebSocket communication.

## Tech Stack

- **Client**: Flutter (v3.2.0+) with Provider for state management
- **Server**: Go (v1.24) with gorilla/websocket, JWT authentication
- **Database**: SQLite with WAL mode
- **Simulation**: Python 3.x for perk balance testing (reference-only, do not modify)

## Development Commands

### Backend (Go Server)
```bash
cd server
go mod download          # Install dependencies
go run cmd/server/main.go # Run server on :8080
```

### Frontend (Flutter)
```bash
cd client
flutter pub get          # Install dependencies
flutter run              # Run on default device
flutter run -d chrome    # Run on web
flutter run -d macos     # Run on macOS
```

### Hot Reload Development
```bash
./scripts/build-and-run.sh  # Builds Flutter web + starts Go server with air hot reload
```

### Mobile Builds
```bash
./scripts/build-android.sh   # Build Android APK
./scripts/build-ios.sh       # Build iOS
./scripts/install-android.sh # Install APK to device
```

### Testing
```bash
# Run all tests
cd client && flutter test
cd server && go test ./...
cd templates/sim && python -m pytest tests/ -v

# Run single tests
cd client && flutter test test/models/combat_state_test.dart
cd server && go test ./internal/perks/... -v
cd templates/sim && python -m pytest tests/test_perks_immediate.py -v
```

### Python Simulation
```bash
cd templates/sim
python -m pytest tests/ -v        # Run perk tests
python run_simulation.py -n 1000  # Run AI matchup simulation
```

## Architecture

### Client (`client/lib/`)

- **models/**: `combat_state.dart` (lane-based game state, perk tracking), `hero.dart` (6 heroes)
- **services/**: `combat_service.dart` (combat game logic, perk execution), `auth_service.dart` (JWT authentication), `websocket_service.dart` (server communication), `server_config.dart`
- **screens/**: `combat_screen.dart` (lane combat UI), `hero_selection_screen.dart`, `login_screen.dart`, `main_menu_screen.dart`, `welcome_screen.dart`, `upgrade_account_screen.dart`
- **widgets/**: `perk_selection_panel.dart` (perk selection UI), `perk_card.dart`, `lane_selector.dart`, `lane_effect_indicator.dart`

### Server (`server/internal/`)

- **auth/**: `auth.go` — JWT + bcrypt authentication
- **handlers/**: `websocket.go` — Hub pattern for connection management and message routing
- **game/**: `lane_engine.go` (lane-based combat engine), `lane_ai.go` (AI opponent logic)
- **models/**: `lane_game.go` (lane game state and models)
- **perks/**: Perk system implementation
  - `executor.go`: Perk execution logic
  - `perks.go`: Perk definitions
  - `targeting.go`: Perk targeting system
- **database/**: `database.go` — SQLite with users table

### Python Simulation (`templates/sim/`) -- REFERENCE ONLY, DO NOT MODIFY
**The Python simulation code is strictly reference-only. Do not modify, refactor, or add code to `templates/sim/`.** It exists solely as a reference implementation for understanding perk logic and for offline balance testing. All active development happens in the Go server and Flutter client.

- **src/game/**: Game engine, state, rules, configuration
- **src/perks/**: Perk implementations by category (`immediate.py`, `triggers.py`, `deferred.py`, `duration.py`, `base.py`)
- **src/ai/**: AI strategies and heuristics
- **src/simulation/**: Match simulation runner and analysis
- **tests/**: Comprehensive perk and mechanics tests

### WebSocket Protocol
Messages follow `{"type": "messageType", "payload": {...}}` format. Key types: `joinGame`, `makeMove`, `usePerk`, `gameState`, `matchFound`, `opponentDisconnected`.

## Adding Features

### New Perks
1. Implement in Go server in `server/internal/perks/`
2. Update client perk UI in `client/lib/widgets/perk_selection_panel.dart`
3. Refer to `templates/sim/` for logic reference (but do not modify the Python code)

### New Heroes
1. Add to `Hero.allHeroes` in `client/lib/models/hero.dart`
2. Add image to `client/assets/images/characters/`

## Key Documentation

- `GAME_RULES_V2_COMPLETE.md` — Complete lane combat rules and 32-perk system
- `GAME_OVERVIEW.md` — Game overview and design goals
- `GAMEPLAY_DESIGN.md` — Gameplay design details
- `PERK_FLOW_DIAGRAM.md` — Perk execution flow diagrams

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `DB_PATH` | `./data/kiddiechess.db` | SQLite database path |
