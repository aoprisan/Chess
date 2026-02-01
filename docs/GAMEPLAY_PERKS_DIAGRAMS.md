# Gameplay and Perks System - Architecture Diagrams

This document contains ASCII diagrams documenting the gameplay flow, perks system architecture, and component interactions.

---

## 1. Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KIDDIE CHESS ARCHITECTURE                         │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────────┐
                              │   Flutter Client │
                              │   (Flame Engine) │
                              └────────┬─────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         │                             │                             │
         ▼                             ▼                             ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│     Screens     │         │    Services     │         │     Models      │
├─────────────────┤         ├─────────────────┤         ├─────────────────┤
│ • Main Menu     │◄───────►│ • GameService   │◄───────►│ • Hero          │
│ • Hero Select   │         │ • CombatService │         │ • GameState     │
│ • Combat Screen │         │ • WebSocketSvc  │         │ • CombatState   │
│ • Game Screen   │         │                 │         │ • LaneGame      │
└─────────────────┘         └────────┬────────┘         └─────────────────┘
                                     │
                                     │ WebSocket (JSON)
                                     │ {"type": "...", "payload": {...}}
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │      Go Server        │
                         │   (gorilla/websocket) │
                         └───────────┬───────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    Handlers     │       │   Game Engine   │       │    Database     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ • WebSocket Hub │──────►│ • LaneEngine    │       │ • SQLite + WAL  │
│ • Message Route │       │ • AI (3 levels) │       │ • Users         │
│ • Client Mgmt   │       │                 │       │ • Games         │
└─────────────────┘       └────────┬────────┘       │ • Moves         │
                                   │                └─────────────────┘
                                   ▼
                         ┌─────────────────┐
                         │  Perk Executor  │
                         ├─────────────────┤
                         │ • 30+ Perks     │
                         │ • Triggers      │
                         │ • Effects       │
                         └─────────────────┘
```

---

## 2. Turn Phase State Machine

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TURN PHASE STATE MACHINE                              │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────┐
                              │ TURN START  │
                              └──────┬──────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │   PHASE 1: RAID RESOLUTION     │
                    │ ─────────────────────────────  │
                    │ • Process pending raid pieces  │
                    │ • Apply raid effects           │
                    │ • Check lane captures          │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │ PHASE 2: DEFERRED RESOLUTION   │
                    │ ─────────────────────────────  │
                    │ • Execute deferred perks       │
                    │ • Process trigger chains       │
                    │ • Apply delayed effects        │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │   PHASE 3: AUTO-PLACEMENT      │
                    │ ─────────────────────────────  │
                    │ • System places 1 piece        │
                    │ • Fire placement triggers      │
                    │   (Portal, Mirror, Trap, etc.) │
                    │ • Check lane win condition     │
                    │ • Check game win condition     │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │   PHASE 4: PERK SELECTION      │
                    │ ─────────────────────────────  │
                    │ • Generate 4 perk options      │
                    │   [Slot1][Slot2][Slot3][Slot4] │
                    │ • Player selects OR passes     │
                    │ • Execute selected perk        │
                    │ • Fire perk triggers           │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │ SWITCH TURN │
                              │ ─────────── │
                              │ Player 1 ⇄ 2│
                              └──────┬──────┘
                                     │
                                     ▼
                            (Next Turn Begins)


    ┌────────────────────────────────────────────────────────────────┐
    │                    WIN CONDITIONS                               │
    ├────────────────────────────────────────────────────────────────┤
    │  LANE WIN:  First to 4 pieces in a lane captures it            │
    │  GAME WIN:  First to capture 3 lanes wins the game             │
    └────────────────────────────────────────────────────────────────┘
```

---

## 3. WebSocket Message Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      WEBSOCKET MESSAGE FLOW                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    CLIENT                                                    SERVER
    ──────                                                    ──────
       │                                                         │
       │  ─────────── CONNECTION PHASE ───────────              │
       │                                                         │
       │  {"type": "connect"}                                    │
       │ ───────────────────────────────────────────────────────►│
       │                                                         │
       │                         {"type": "connected", ...}      │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │
       │  ─────────── MATCHMAKING PHASE ──────────              │
       │                                                         │
       │  {"type": "joinGame",                                   │
       │   "payload": {"heroType": "panda"}}                     │
       │ ───────────────────────────────────────────────────────►│
       │                                                         │
       │                        {"type": "matchFound",           │
       │                         "payload": {"gameId": "..."}}   │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │
       │  ─────────── GAMEPLAY LOOP ───────────                 │
       │                                                         │
       │                        {"type": "laneGameState",        │
       │                         "payload": {full game state}}   │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │
       │                        {"type": "autoPlacement",        │
       │                         "payload": {"laneIndex": 2}}    │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │
       │  {"type": "selectPerk",                                 │
       │   "payload": {                                          │
       │     "gameId": "abc123",                                 │
       │     "perkId": 1,                                        │
       │     "targetLane": 2                                     │
       │   }}                                                    │
       │ ───────────────────────────────────────────────────────►│
       │                                                         │
       │                        {"type": "perkResult",           │
       │                         "payload": {                    │
       │                           "success": true,              │
       │                           "perkId": 1,                  │
       │                           "affectedLanes": [2]          │
       │                         }}                              │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │
       │                        {"type": "laneWon",              │
       │                         "payload": {"lane": 2}}         │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │
       │  ─────────── END GAME ───────────                      │
       │                                                         │
       │                        {"type": "gameWon",              │
       │                         "payload": {"winner": "p1"}}    │
       │◄─────────────────────────────────────────────────────── │
       │                                                         │


    ┌────────────────────────────────────────────────────────────────┐
    │                    MESSAGE TYPES REFERENCE                      │
    ├────────────────────────────────────────────────────────────────┤
    │  Client → Server        │  Server → Client                      │
    │  ─────────────────      │  ─────────────────                    │
    │  connect                │  connected                            │
    │  joinGame               │  matchFound                           │
    │  selectPerk             │  laneGameState                        │
    │  disconnect             │  autoPlacement                        │
    │                         │  perkResult                           │
    │                         │  laneWon                              │
    │                         │  gameWon                              │
    │                         │  error                                │
    │                         │  opponentDisconnected                 │
    └────────────────────────────────────────────────────────────────┘
```

---

## 4. Perk Execution Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PERK EXECUTION PIPELINE                                │
└─────────────────────────────────────────────────────────────────────────────┘

  User Action                Server Processing                  Result
  ───────────               ─────────────────                  ──────

  ┌───────────┐
  │  Tap Perk │
  │   Card    │
  └─────┬─────┘
        │
        ▼
  ┌───────────────┐
  │ Requires      │─── NO ───┐
  │ Target Lane?  │          │
  └───────┬───────┘          │
          │ YES              │
          ▼                  │
  ┌───────────────┐          │
  │ Show Lane     │          │
  │ Selector UI   │          │
  └───────┬───────┘          │
          │                  │
          ▼                  │
  ┌───────────────┐          │
  │ Tap Target    │          │
  │ Lane          │          │
  └───────┬───────┘          │
          │                  │
          ▼                  ▼
  ┌─────────────────────────────┐
  │     Send selectPerk         │
  │ ─────────────────────────── │
  │ {gameId, perkId, targetLane}│
  └──────────────┬──────────────┘
                 │
                 │  WebSocket
                 ▼
  ┌─────────────────────────────┐        ┌─────────────────────────────┐
  │     Validate Perk           │        │                             │
  │ ─────────────────────────── │───NO──►│   Return Error              │
  │ • Is it player's turn?      │        │   {success: false,          │
  │ • Is perk in current slots? │        │    error: "Invalid perk"}   │
  │ • Is target valid?          │        │                             │
  └──────────────┬──────────────┘        └─────────────────────────────┘
                 │ YES
                 ▼
  ┌─────────────────────────────┐
  │     Execute Perk            │
  │ ─────────────────────────── │
  │ PerkExecutor.Execute(       │
  │   perkId,                   │
  │   player,                   │
  │   targets                   │
  │ )                           │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │    Fire Placement Triggers  │ ◄─── (if perk places pieces)
  │ ─────────────────────────── │
  │ • Portal  → Swap positions  │
  │ • Mirror  → Copy placement  │
  │ • Trap    → Remove piece    │
  │ • Echo    → Duplicate       │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │    Check Win Conditions     │
  │ ─────────────────────────── │
  │ • Lane captured? (4 pieces) │
  │ • Game won? (3 lanes)       │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │    Advance Phase            │
  │ ─────────────────────────── │
  │ • Switch current player     │
  │ • Generate new perk slots   │
  │ • Begin next turn           │
  └──────────────┬──────────────┘
                 │
                 ▼
  ┌─────────────────────────────┐
  │    Send Results             │
  │ ─────────────────────────── │
  │ • perkResult                │
  │ • laneGameState             │
  │ • laneWon (if applicable)   │
  │ • gameWon (if applicable)   │
  └─────────────────────────────┘
```

---

## 5. Perk Categories and Slot System

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERK SLOT SYSTEM                                   │
└─────────────────────────────────────────────────────────────────────────────┘

  Each turn, player sees 4 perk options:

  ┌─────────────┬─────────────┬─────────────┬─────────────┐
  │   SLOT 1    │   SLOT 2    │   SLOT 3    │   SLOT 4    │
  │  (Common)   │  (Common)   │  (Protect)  │  (Disrupt)  │
  ├─────────────┼─────────────┼─────────────┼─────────────┤
  │ PlaceAnother│ RemoveEnemy │  [Random]   │  [Random]   │
  │   (Fixed)   │   (Fixed)   │   React &   │   Act &     │
  │             │             │   Protect   │   Disrupt   │
  └─────────────┴─────────────┴─────────────┴─────────────┘
        │             │             │             │
        ▼             ▼             ▼             ▼
  Always Available     Always Available     Pool Selection     Pool Selection


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         PERK POOLS                                       │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   SLOT 3 POOL (React & Protect)    │   SLOT 4 POOL (Act & Disrupt)      │
  │   ─────────────────────────────    │   ──────────────────────────       │
  │                                    │                                     │
  │   [4]  Freeze     Block enemy      │   [3]  Scramble   Swap 2 lanes     │
  │   [22] Cloak      Hide your lane   │   [5]  Split      Divide pieces    │
  │   [24] Portal     Swap on place    │   [6]  Steal      Take enemy perk  │
  │   [25] Trap       Remove attacker  │   [7]  Snipe      Remove from lane │
  │   [26] Mirror     Copy placement   │   [8]  Rally      Add to 2 lanes   │
  │   [27] Echo       Duplicate piece  │   [9]  Surge      Add 2 to 1 lane  │
  │   [28] Sanctuary  Protect lane     │   [10] Sabotage   Block perk use   │
  │   [29] Redirect   Move attackers   │   [11] Raid       Delayed attack   │
  │                                    │   [12] Reinforce  Extra placement  │
  │                                    │                                     │
  └─────────────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      PERK TARGETING TYPES                                │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   TARGET TYPE       │  DESCRIPTION              │  EXAMPLE PERKS         │
  │   ────────────      │  ───────────              │  ──────────────        │
  │   auto              │  No selection needed      │  Freeze, Scramble      │
  │   yourLane          │  Select 1 of your lanes   │  PlaceAnother, Portal  │
  │   enemyLane         │  Select 1 enemy lane      │  RemoveEnemy, Snipe    │
  │   twoYourLanes      │  Select 2 of your lanes   │  Rally, Split          │
  │   anyLane           │  Select any lane          │  Raid                  │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                       PERK TIMING TYPES                                  │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   TIMING        │  WHEN IT EXECUTES              │  EXAMPLES             │
  │   ──────        │  ─────────────────              │  ────────             │
  │   Instant       │  Immediately on selection       │  PlaceAnother,        │
  │                 │                                 │  RemoveEnemy, Freeze  │
  │                 │                                 │                       │
  │   Trigger       │  On opponent's action          │  Portal (on placement)│
  │                 │  (fires automatically)          │  Mirror, Trap, Echo   │
  │                 │                                 │                       │
  │   Duration      │  Lasts multiple turns          │  Cloak (3 turns)      │
  │                 │                                 │  Sanctuary, Blind     │
  │                 │                                 │                       │
  │   Deferred      │  After specific game event     │  Signal (on capture)  │
  │                 │                                 │  Raid (after X turns) │
  │                 │                                 │                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Client State Management Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLIENT STATE MANAGEMENT FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                           PROVIDER TREE                                  │
  └─────────────────────────────────────────────────────────────────────────┘

                           ┌─────────────────┐
                           │  MaterialApp    │
                           └────────┬────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │ CombatService   │ │ WebSocketService│ │   LaneGame      │
          │ (ChangeNotifier)│ │ (Stream-based)  │ │   (Model)       │
          └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
                   │                   │                   │
                   │                   │                   │
                   ▼                   ▼                   ▼
          ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
          │  LaneGame       │ │  WSMessage      │ │  Lane State     │
          │  ────────       │ │  ─────────      │ │  ──────────     │
          │ • lanes[5]      │ │ • type          │ │ • pieces        │
          │ • currentPlayer │ │ • payload       │ │ • triggers      │
          │ • perkSlots[4]  │ │                 │ │ • winner        │
          │ • turnPhase     │ │                 │ │                 │
          │ • lanesWon      │ │                 │ │                 │
          └─────────────────┘ └─────────────────┘ └─────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    SERVER-DRIVEN STATE SYNC                              │
  └─────────────────────────────────────────────────────────────────────────┘

                                 WebSocket
                                    │
                                    ▼
           ┌────────────────────────────────────────────────┐
           │              CombatService                      │
           │ ────────────────────────────────────────────── │
           │  _handleServerMessage(WSMessage message)        │
           └────────────────────────────────────────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │                        │                        │
           ▼                        ▼                        ▼
   ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
   │ laneGameState │       │ autoPlacement │       │  perkResult   │
   ├───────────────┤       ├───────────────┤       ├───────────────┤
   │ Full state    │       │ Lane index    │       │ Success/fail  │
   │ sync from     │       │ where piece   │       │ Affected      │
   │ server        │       │ was placed    │       │ lanes         │
   └───────┬───────┘       └───────┬───────┘       └───────┬───────┘
           │                       │                       │
           └───────────────────────┼───────────────────────┘
                                   │
                                   ▼
                          ┌───────────────┐
                          │ notifyListeners()
                          │ ───────────────│
                          │ Triggers UI   │
                          │ rebuild       │
                          └───────────────┘
                                   │
                                   ▼
                          ┌───────────────┐
                          │ Consumer<T>   │
                          │ widgets       │
                          │ rebuild       │
                          └───────────────┘
```

---

## 7. Complete Game Session Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COMPLETE GAME SESSION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │  MAIN MENU   │────►│ HERO SELECT  │────►│ MATCHMAKING  │
  └──────────────┘     └──────────────┘     └──────┬───────┘
                                                   │
                              ┌─────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                          GAME LOOP                                       │
  └─────────────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
  ┌──────────────────┐                    ┌──────────────────┐
  │    PLAYER 1      │                    │    PLAYER 2      │
  │    TURN          │                    │    TURN          │
  └────────┬─────────┘                    └────────┬─────────┘
           │                                       │
           ▼                                       ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  1. Raid Resolution (if any)                                             │
  │  2. Deferred Effect Resolution                                           │
  │  3. Auto-Placement → Triggers fire → Check lane/game win                 │
  │  4. Perk Selection → Execute → Triggers fire → Check lane/game win      │
  │  5. Switch Turn                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
           │                                       │
           └───────────────────┬───────────────────┘
                               │
                               ▼
                      ┌─────────────────┐
                      │   GAME OVER?    │
                      │  (3 lanes won)  │
                      └────────┬────────┘
                               │
                 ┌─────────────┴─────────────┐
                 │ NO                         │ YES
                 ▼                            ▼
          (Continue Loop)           ┌─────────────────┐
                                    │  SHOW WINNER    │
                                    │  ─────────────  │
                                    │  Return to      │
                                    │  Main Menu      │
                                    └─────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      DISCONNECTION HANDLING                              │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │    ┌──────────┐     ┌──────────────────────┐     ┌──────────────────┐   │
  │    │ Opponent │────►│ opponentDisconnected │────►│ Automatic Win    │   │
  │    │ Leaves   │     │ message received     │     │ for remaining    │   │
  │    └──────────┘     └──────────────────────┘     │ player           │   │
  │                                                   └──────────────────┘   │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Trigger Chain Resolution

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      TRIGGER CHAIN RESOLUTION                                │
└─────────────────────────────────────────────────────────────────────────────┘

  When a piece is placed, multiple triggers can fire in sequence:

  ┌─────────────────┐
  │  Piece Placed   │
  │  on Lane 2      │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    Check Opponent's Triggers on Lane 2                   │
  └─────────────────────────────────────────────────────────────────────────┘
           │
           ├──► PORTAL?  ───YES──► Swap piece to different lane
           │                              │
           │                              ▼
           │                       ┌─────────────────┐
           │                       │ New lane target │
           │                       │ Check triggers  │
           │                       │ on new lane     │
           │                       └─────────────────┘
           │
           ├──► MIRROR?  ───YES──► Copy placement to mirrored lane
           │                              │
           │                              ▼
           │                       ┌─────────────────┐
           │                       │ Original piece  │
           │                       │ + Mirror copy   │
           │                       │ both placed     │
           │                       └─────────────────┘
           │
           ├──► TRAP?    ───YES──► Remove the placed piece
           │                              │
           │                              ▼
           │                       ┌─────────────────┐
           │                       │ Piece removed   │
           │                       │ Trap consumed   │
           │                       └─────────────────┘
           │
           ├──► ECHO?    ───YES──► Duplicate on adjacent lane
           │                              │
           │                              ▼
           │                       ┌─────────────────┐
           │                       │ Check triggers  │
           │                       │ on adjacent     │
           │                       │ lane (recurse)  │
           │                       └─────────────────┘
           │
           └──► No more triggers
                       │
                       ▼
              ┌─────────────────┐
              │ Check Lane Win  │
              │ (4 pieces)      │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Check Game Win  │
              │ (3 lanes)       │
              └─────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    RECURSION DEPTH LIMIT                                 │
  ├─────────────────────────────────────────────────────────────────────────┤
  │  Triggers have a depth parameter to prevent infinite loops.              │
  │  Default max depth: 3 levels of trigger chaining.                        │
  │                                                                          │
  │  FirePlacementTriggers(laneIdx, player, depth=0)                        │
  │    └─► if depth >= MAX_DEPTH: return                                    │
  │    └─► Fire trigger, call FirePlacementTriggers(..., depth+1)           │
  └─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

The Kiddie Chess lane game features a sophisticated perk system with:

1. **Server-driven architecture**: All game logic runs on Go server, client is display-only
2. **Rich perk interactions**: 30+ perks with triggers, durations, and deferred effects
3. **4-phase turn system**: Raid → Deferred → AutoPlace → PerkSelect
4. **Slot-based perk selection**: 4 slots per turn (2 fixed commons + 2 random from pools)
5. **Trigger chains**: Perks can trigger other perks in sequence with depth limiting
6. **Win conditions**: First to capture 3 lanes (4 pieces per lane) wins
