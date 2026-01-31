# Kiddie Chess

A kid-friendly chess game with cute characters and special abilities (perks).

## Tech Stack

- **Frontend**: Flutter + Flame (2D game engine)
- **Backend**: Go (WebSocket server)
- **Database**: PostgreSQL + Redis (planned)

## Project Structure

```
Chess/
├── client/                 # Flutter app
│   ├── lib/
│   │   ├── main.dart       # App entry point
│   │   ├── models/         # Data models
│   │   │   ├── hero.dart   # Hero types and perks
│   │   │   └── game_state.dart  # Game state model
│   │   ├── screens/        # UI screens
│   │   │   ├── main_menu_screen.dart
│   │   │   ├── hero_selection_screen.dart
│   │   │   └── game_screen.dart
│   │   ├── services/       # Business logic
│   │   │   ├── game_service.dart
│   │   │   └── websocket_service.dart
│   │   ├── game/           # Flame game components
│   │   │   └── chess_game.dart
│   │   └── widgets/        # Reusable widgets
│   └── pubspec.yaml
│
├── server/                 # Go backend
│   ├── cmd/server/
│   │   └── main.go         # Server entry point
│   ├── internal/
│   │   ├── models/         # Shared models
│   │   │   └── game.go
│   │   ├── handlers/       # WebSocket handlers
│   │   │   └── websocket.go
│   │   ├── game/           # Game logic & AI
│   │   │   └── engine.go
│   │   └── matchmaking/    # Player matchmaking
│   │       └── matchmaker.go
│   └── go.mod
│
└── html.zip               # Original UI mockups
```

## Getting Started

### Prerequisites

- Flutter SDK (>= 3.2.0)
- Go (>= 1.21)
- (Optional) Docker for deployment

### Running the Backend

```bash
cd server
go mod download
go run cmd/server/main.go
```

Server starts on `http://localhost:8080`

### Running the Flutter App

```bash
cd client
flutter pub get
flutter run
```

### Running on Different Platforms

```bash
# iOS
flutter run -d ios

# Android
flutter run -d android

# Web
flutter run -d chrome

# macOS
flutter run -d macos
```

## Features

### Heroes
Each hero has unique perks:

| Hero | Perks |
|------|-------|
| Sloth | Freeze (x2), Cancel Move (x1) |
| Panda | Extra Move (x2), Remove Enemy (x1) |
| Unicorn | Scatter (x1), Place Piece (x2) |
| Snowman | Freeze (x2), Extra Move (x1) |
| Gnom | Remove Enemy (x2), Cancel Move (x1) |
| Yeti | Place Piece (x2), Scatter (x1) |

### Perks
- **Extra Move**: Take an additional turn
- **Remove Enemy**: Remove any enemy piece
- **Place Piece**: Place a captured piece back
- **Scatter**: Randomly reposition enemy pieces
- **Freeze**: Skip opponent's next turn
- **Cancel Move**: Undo your last move

### Game Modes
- **vs Friend**: Local 2-player
- **vs AI**: Play against AI (Easy/Medium/Hard)
- **Online**: Matchmaking against other players

## WebSocket Protocol

### Message Types

```json
// Join game
{"type": "joinGame", "payload": {"playerId": "...", "heroType": "panda", "vsAI": false}}

// Make move
{"type": "makeMove", "payload": {"gameId": "...", "fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4}}

// Use perk
{"type": "usePerk", "payload": {"gameId": "...", "perk": "freeze"}}

// Game state update (from server)
{"type": "gameState", "payload": {"game": {...}}}
```

## Development

### Adding New Perks

1. Add perk to `Perk` enum in `client/lib/models/hero.dart`
2. Add perk logic in `server/internal/handlers/websocket.go`
3. Update hero perk assignments in both client and server

### Adding New Heroes

1. Add hero to `Hero.allHeroes` in `client/lib/models/hero.dart`
2. Add hero image to `client/assets/images/characters/`
3. Update `GetHeroPerks()` in `server/internal/models/game.go`

## Deployment

### Backend (Fly.io)

```bash
cd server
fly launch
fly deploy
```

### Frontend (Web)

```bash
cd client
flutter build web
# Deploy build/web to any static hosting
```

### Mobile (App Stores)

```bash
# Android
flutter build appbundle

# iOS
flutter build ios
```

## License

MIT
