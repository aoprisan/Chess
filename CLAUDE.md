# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kiddie Chess is a kid-friendly chess game with cute characters and special abilities (perks). It uses a client-server architecture with real-time WebSocket communication.

## Tech Stack

- **Client**: Flutter (v3.2.0+) with Flame game engine, Provider for state management
- **Server**: Go (v1.21) with gorilla/websocket
- **Database**: SQLite with WAL mode

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

### Testing
```bash
cd client && flutter test
cd server && go test ./...
```

## Architecture

### Client (`client/lib/`)
- **models/**: `hero.dart` (6 heroes with perks), `game_state.dart` (board state, moves)
- **services/**: `game_service.dart` (local state via Provider/ChangeNotifier), `websocket_service.dart` (server communication)
- **game/**: `chess_game.dart` (Flame-based 2D rendering, tap detection, move highlighting)
- **screens/**: Main menu, hero selection, game screen

### Server (`server/internal/`)
- **handlers/websocket.go**: Hub pattern for connection management, message routing (joinGame, makeMove, usePerk)
- **game/engine.go**: AI with 3 difficulty levels (Easy=random, Medium=prefers captures, Hard=evaluation function)
- **matchmaking/matchmaker.go**: Queue-based player matching with 5-minute stale timeout
- **database/database.go**: SQLite with users, games, game_moves tables

### WebSocket Protocol
Messages follow `{"type": "messageType", "payload": {...}}` format. Key types: `joinGame`, `makeMove`, `usePerk`, `gameState`, `matchFound`, `opponentDisconnected`.

## Adding Features

### New Perks
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
