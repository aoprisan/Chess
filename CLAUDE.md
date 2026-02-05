# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kiddie Chess is a kid-friendly game with cute characters and special abilities (perks). The project has two game modes:

- **V1 (Chess Mode)**: Traditional chess with hero characters and perks
- **V2 (Lane Combat Mode)**: A lane-based combat game with a 32-perk system (see `GAME_RULES_V2_COMPLETE.md` for full rules)

The V2 lane combat system is the primary development focus. It uses a client-server architecture with real-time WebSocket communication.

## Tech Stack

- **Client**: Flutter (v3.2.0+) with Flame game engine, Provider for state management
- **Server**: Go (v1.21) with gorilla/websocket
- **Database**: SQLite with WAL mode
- **Simulation**: Python 3.x for perk balance testing

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

**V1 Chess Mode:**
- **models/**: `hero.dart` (6 heroes with perks), `game_state.dart` (board state, moves)
- **services/**: `game_service.dart` (local state via Provider/ChangeNotifier), `websocket_service.dart` (server communication)
- **game/**: `chess_game.dart` (Flame-based 2D rendering, tap detection, move highlighting)
- **screens/**: Main menu, hero selection, game screen

**V2 Lane Combat Mode:**
- **models/**: `combat_state.dart` (lane-based game state, perk tracking)
- **services/**: `combat_service.dart` (combat game logic, perk execution)
- **screens/**: `combat_screen.dart` (lane combat UI)
- **widgets/**: `perk_selection_panel.dart` (perk selection UI)

### Server (`server/internal/`)

**V1 Chess Mode:**
- **handlers/websocket.go**: Hub pattern for connection management, message routing (joinGame, makeMove, usePerk)
- **game/engine.go**: AI with 3 difficulty levels (Easy=random, Medium=prefers captures, Hard=evaluation function)
- **matchmaking/matchmaker.go**: Queue-based player matching with 5-minute stale timeout
- **database/database.go**: SQLite with users, games, game_moves tables

**V2 Lane Combat Mode:**
- **game/lane_engine.go**: Lane-based combat engine
- **models/lane_game.go**: Lane game state and models
- **perks/**: Perk system implementation
  - `executor.go`: Perk execution logic
  - `perks.go`: Perk definitions
  - `targeting.go`: Perk targeting system

### Python Simulation (`templates/sim/`)
**Note: The Python simulation code is reference-only and should not be modified.**
A comprehensive simulation engine for perk balance testing:
- **src/game/**: Game engine, state, rules, configuration
- **src/perks/**: Perk implementations by category
  - `immediate.py`: Instant-effect perks
  - `triggers.py`: Triggered/reactive perks
  - `deferred.py`: Delayed-effect perks
  - `duration.py`: Duration-based perks
  - `base.py`: `PerkType` enum and base classes
- **src/ai/**: AI strategies and heuristics
- **src/simulation/**: Match simulation runner and analysis
- **tests/**: Comprehensive perk and mechanics tests

### WebSocket Protocol
Messages follow `{"type": "messageType", "payload": {...}}` format. Key types: `joinGame`, `makeMove`, `usePerk`, `gameState`, `matchFound`, `opponentDisconnected`.

## Adding Features

### New V2 Perks
1. Add to `PerkType` in `templates/sim/src/perks/base.py`
2. Implement in appropriate file (`immediate.py`, `triggers.py`, `deferred.py`, `duration.py`)
3. Add tests in `templates/sim/tests/`
4. Port to Go server in `server/internal/perks/`
5. Update client perk UI in `client/lib/widgets/perk_selection_panel.dart`

### New V1 Perks
1. Add to `Perk` enum in `client/lib/models/hero.dart`
2. Add logic in `server/internal/handlers/websocket.go`
3. Update hero perk assignments in both client and server

### New Heroes
1. Add to `Hero.allHeroes` in `client/lib/models/hero.dart`
2. Add image to `client/assets/images/characters/`
3. Update `GetHeroPerks()` in `server/internal/models/game.go`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `DB_PATH` | `./data/kiddiechess.db` | SQLite database path |
