# Plan: Multiplayer Over the Internet

## Current State

The codebase has solid foundations for multiplayer:
- WebSocket hub pattern on the Go server with JWT auth
- FIFO matchmaking queue (V1 only; V2 multiplayer explicitly not implemented)
- Guest and email/password authentication with device-based reclaim
- Game state synchronization via push model (full state broadcast after each action)
- Single EC2 deployment at `35.156.232.123:9090`

**Key gaps for internet play:**
- V2 lane combat multiplayer is not implemented (`websocket.go:652` returns error)
- No connection resilience (no auto-reconnect, no message queuing)
- Game state is in-memory only (lost on server restart)
- No TLS/SSL encryption
- No lobby/room system or friend invites
- No rate limiting or abuse protection
- Single-server architecture with SQLite

---

## Implementation Plan

### Phase 1: V2 Multiplayer Foundation

**Goal:** Enable two human players to play V2 Lane Combat against each other over the internet.

#### Step 1.1: V2 Multiplayer Matchmaking
- **File:** `server/internal/handlers/websocket.go` (around line 609-655)
- Remove the "not yet implemented" error for multiplayer V2
- Create a separate matchmaking queue for V2 games in `server/internal/matchmaking/matchmaker.go` (currently only one queue exists)
- Add `GameMode` field to `QueuedPlayer` struct to distinguish V1 vs V2 queues
- Implement `handleJoinLaneGame` multiplayer path: add player to V2 queue, poll for match, create `LaneGame` with both players' connection IDs

#### Step 1.2: V2 Multiplayer Game Loop
- **File:** `server/internal/handlers/websocket.go` (lines 656-941)
- Update `handleLanePerkSelection` to route perk selections to the correct player in a multiplayer game
- Add turn validation: reject actions from the player whose turn it isn't
- Broadcast game state to both players after each perk selection, auto-placement, and lane resolution
- Send `opponentDisconnected` message when a player drops from a V2 game
- Handle game cleanup when both players disconnect

#### Step 1.3: V2 Multiplayer Client Integration
- **File:** `client/lib/services/combat_service.dart`
- Add multiplayer state management: track whether game is local, vs AI, or vs human
- Handle incoming `matchFound`, `autoPlacement`, `perkResult`, `laneWon`, `gameWon` messages for multiplayer context
- **File:** `client/lib/screens/combat_screen.dart`
- Add "Find Opponent" button alongside existing "Play vs AI"
- Show matchmaking waiting state with cancel option
- Hide opponent's perk choices during selection phase (currently both visible in pass-and-play)

---

### Phase 2: Connection Resilience

**Goal:** Games survive temporary network interruptions.

#### Step 2.1: Client Auto-Reconnect
- **File:** `client/lib/services/websocket_service.dart`
- Implement exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s)
- Queue outgoing messages during disconnection, flush on reconnect
- Emit connection state changes via stream so UI can show status indicator
- Re-authenticate with stored JWT on reconnect

#### Step 2.2: Server Session Persistence
- **File:** `server/internal/handlers/websocket.go`
- Map `PlayerID` to `Client` (currently only `Client.ID` which changes on reconnect)
- On reconnect: reassociate new WebSocket connection with existing player's in-progress game
- Add grace period (60 seconds) before declaring a disconnect as forfeit
- Send full game state resync on reconnect

#### Step 2.3: Game State Persistence to Database
- **File:** `server/internal/database/database.go`
- Add `lane_games` table:
  ```sql
  CREATE TABLE lane_games (
    id TEXT PRIMARY KEY,
    player1_id TEXT NOT NULL,
    player2_id TEXT NOT NULL,
    game_state TEXT NOT NULL,        -- JSON serialized LaneGame
    status TEXT DEFAULT 'playing',
    winner_id TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    ended_at DATETIME
  );
  ```
- Serialize `LaneGame` to JSON and persist after each state change
- On server restart: load active games from DB and allow reconnection
- Add `SaveLaneGame()`, `LoadLaneGame()`, `ListActiveGames()` methods

---

### Phase 3: Security & Production Readiness

**Goal:** Safe for public internet traffic.

#### Step 3.1: TLS/SSL
- Add reverse proxy configuration (nginx) with Let's Encrypt certificates
- Update `server_config.dart` to use `wss://` for production
- Add deployment config for nginx with WebSocket proxy pass (`Upgrade` and `Connection` headers)

#### Step 3.2: Rate Limiting & Abuse Protection
- **File:** `server/cmd/server/main.go`
- Add per-IP connection rate limiter (max 5 connections per minute)
- Add per-client message rate limiter (max 30 messages per minute)
- Add max concurrent games per user (limit to 1 active game)
- Validate all incoming message payloads (bounds checking on lane indices, perk IDs)

#### Step 3.3: Input Validation Hardening
- **File:** `server/internal/handlers/websocket.go`
- Audit all `handleMessage` paths for missing validation
- Verify perk targeting is within valid lane range (0-4)
- Verify players can only act on their own game
- Prevent replay attacks (sequence numbers on messages)

---

### Phase 4: Lobby & Social Features

**Goal:** Players can find and play specific opponents.

#### Step 4.1: Game Room System
- **New file:** `server/internal/lobby/room.go`
- Room struct: `ID`, `HostPlayer`, `GuestPlayer`, `GameMode`, `Status`, `CreatedAt`
- Room lifecycle: Create -> Waiting -> Full -> Playing -> Finished
- Generate short room codes (6 alphanumeric characters) for sharing
- WebSocket message types: `createRoom`, `joinRoom`, `roomReady`, `roomClosed`

#### Step 4.2: Room UI
- **New file:** `client/lib/screens/lobby_screen.dart`
- "Create Room" button: generates room code, shows waiting screen with shareable code
- "Join Room" input: enter room code to join existing game
- Room status display: show both players, hero selections, ready state
- Cancel/leave room functionality

#### Step 4.3: Matchmaking Improvements
- **File:** `server/internal/matchmaking/matchmaker.go`
- Add rating-based matching: prefer opponents within 200 rating points
- Expand search range over time (200 -> 400 -> any after 30s)
- Send queue position/estimated wait updates to waiting players
- Add cancel matchmaking message type

---

### Phase 5: Scaling & Infrastructure

**Goal:** Support concurrent players beyond single-server capacity.

#### Step 5.1: Database Migration (SQLite -> PostgreSQL)
- Replace `modernc.org/sqlite` with `lib/pq` or `pgx`
- Migrate schema (SQLite-specific types to PostgreSQL)
- Use connection pooling
- Update `DB_PATH` env var to `DATABASE_URL` connection string

#### Step 5.2: Containerization
- Add `Dockerfile` for Go server (multi-stage build: Go builder + minimal runtime)
- Add `docker-compose.yml` with services: `server`, `postgres`, `nginx`
- Add health check endpoint integration (`/health` already exists but unused)

#### Step 5.3: Horizontal Scaling (if needed)
- Extract game state from in-memory to Redis for shared state across instances
- Use Redis pub/sub for cross-instance WebSocket message routing
- Sticky sessions at load balancer level (alternative to Redis for simpler deployments)

---

## Execution Order & Dependencies

```
Phase 1 (V2 Multiplayer Foundation)
  |
  v
Phase 2 (Connection Resilience)    -- depends on Phase 1
  |
  v
Phase 3 (Security & Production)    -- depends on Phase 2
  |
  v
Phase 4 (Lobby & Social)           -- depends on Phase 3
  |
  v
Phase 5 (Scaling)                  -- depends on Phase 3, independent of Phase 4
```

**Phase 1** is the minimum viable product for internet multiplayer.
**Phases 1-3** together make it production-safe.
**Phases 4-5** are enhancements for better UX and scale.

---

## Files Modified Per Phase

| Phase | Server Files | Client Files | New Files |
|-------|-------------|--------------|-----------|
| 1 | `websocket.go`, `matchmaker.go` | `combat_service.dart`, `combat_screen.dart`, `websocket_service.dart` | - |
| 2 | `websocket.go`, `database.go` | `websocket_service.dart` | - |
| 3 | `main.go`, `websocket.go` | `server_config.dart` | nginx config |
| 4 | `matchmaker.go` | - | `room.go`, `lobby_screen.dart` |
| 5 | `database.go`, `main.go` | - | `Dockerfile`, `docker-compose.yml` |

---

## Risk Areas

1. **V2 game state serialization** -- `LaneGame` has complex nested structures (triggers, deferred effects). JSON serialization for DB persistence needs thorough testing.
2. **Reconnection race conditions** -- A player could reconnect while the server is still processing their disconnect. Need mutex protection on the reconnect path.
3. **SQLite under concurrent load** -- WAL mode helps but SQLite still has write serialization. Phase 5's PostgreSQL migration addresses this, but Phase 1-3 should work fine for moderate traffic (hundreds of concurrent games).
4. **Turn timer** -- Not addressed in this plan. Without a turn timer, a player can stall indefinitely. Consider adding a 60-second turn timer as a follow-up.
