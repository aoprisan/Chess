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
                         │ • 32 Perks      │
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
    │  LANE WIN:  Fill all slots on your side (default: 5 pieces)    │
    │  GAME WIN:  Capture more than half the lanes (3 of 5)          │
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
  │                    PERK POOLS (32 Total Perks)                           │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  FIXED COMMONS (Slots 1-2)                                               │
  │  ─────────────────────────                                               │
  │  #1  PlaceAnother    +1 your piece on chosen lane                        │
  │  #2  RemoveEnemy     -1 enemy piece from chosen lane                     │
  │                                                                          │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  SLOT 3 POOL: React & Protect (15 perks)                                 │
  │  ───────────────────────────────────────                                 │
  │                                                                          │
  │  Duration:                                                               │
  │    #4  Freeze       Block lane placement 1 turn                          │
  │    #22 Cloak        Hide your pieces 2 turns                             │
  │    #49 Sanctuary    Redirect your losses to this lane                    │
  │                                                                          │
  │  Placement Triggers (fire when enemy places):                            │
  │    #24 Portal       Teleport placed piece to random lane                 │
  │    #25 Trap         Remove placed piece                                  │
  │    #26 Mirror       You get +2 on same lane                              │
  │    #27 Echo         You get +2 on random lanes                           │
  │    #28 Shockwave    Enemy loses 2 from other lanes                       │
  │    #52 Retaliate    Spawn counter-raid piece                             │
  │                                                                          │
  │  Removal Triggers (fire when enemy removes your piece):                  │
  │    #29 Hydra        You get +2 on random lanes                           │
  │    #30 Backfire     Enemy loses 2 pieces                                 │
  │    #46 Absorb       Removed piece reappears elsewhere                    │
  │                                                                          │
  │  Immediate:                                                              │
  │    #33 Regroup      Swap your pieces between 2 lanes                     │
  │    #35 Scatter      Spread your pieces to random lanes                   │
  │                                                                          │
  │  Deferred:                                                               │
  │    #43 Signal       Pull piece from most populated lane                  │
  │                                                                          │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  SLOT 4 POOL: Act & Disrupt (15 perks)                                   │
  │  ─────────────────────────────────────                                   │
  │                                                                          │
  │  Duration:                                                               │
  │    #23 Blind        Hide enemy pieces from them 2 turns                  │
  │    #50 Capture      Convert removed enemies to your pieces               │
  │                                                                          │
  │  Immediate (auto-target):                                                │
  │    #13 Scramble     Redistribute all enemy pieces randomly               │
  │    #37 Gambit       Enemy +3 spread, you +2 concentrated                 │
  │    #38 Steal        Enemy -1 random, you +1 random                       │
  │                                                                          │
  │  Immediate (choose target):                                              │
  │    #31 Split        Sacrifice 1 yours → +2 random lanes                  │
  │    #32 Kamikaze     Sacrifice 1 yours → enemy -2                         │
  │    #34 Disrupt      Swap enemy pieces between 2 lanes                    │
  │    #36 Disperse     Spread enemy pieces to random lanes                  │
  │    #39 Rush         Both +2 same lane, you -1 elsewhere                  │
  │    #48 Nullify      Cancel all triggers on your lane                     │
  │                                                                          │
  │  Deferred:                                                               │
  │    #40 Enlist       Capture + relocate enemy piece next turn             │
  │    #41 Ambush       Remove enemy from lane/adjacent next turn            │
  │    #42 Reinforce    +1 bonus piece next turn                             │
  │    #51 Raid         Place on enemy side, roll for recruits               │
  │                                                                          │
  └─────────────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                      PERK TARGETING TYPES                                │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   TARGET TYPE       │  DESCRIPTION              │  EXAMPLE PERKS         │
  │   ────────────      │  ───────────              │  ──────────────        │
  │   None (auto)       │  No selection needed      │  Scramble, Gambit,     │
  │                     │                           │  Steal, Cloak, Blind   │
  │                     │                           │                        │
  │   Your Lane         │  Select 1 of your lanes   │  PlaceAnother, Freeze, │
  │                     │                           │  Sanctuary, Signal     │
  │                     │                           │                        │
  │   Enemy Lane        │  Select 1 enemy lane      │  RemoveEnemy, Portal,  │
  │                     │                           │  Trap, Disperse, Raid  │
  │                     │                           │                        │
  │   Your Piece        │  Select 1 of your pieces  │  Split, Kamikaze       │
  │                     │                           │                        │
  │   Two Lanes         │  Select 2 lanes           │  Regroup, Disrupt      │
  │                     │                           │                        │
  └─────────────────────────────────────────────────────────────────────────┘


  ┌─────────────────────────────────────────────────────────────────────────┐
  │                       PERK TIMING TYPES                                  │
  ├─────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │   TIMING        │  WHEN IT EXECUTES              │  EXAMPLES             │
  │   ──────        │  ─────────────────              │  ────────             │
  │   Instant       │  Immediately on selection       │  PlaceAnother,        │
  │                 │                                 │  RemoveEnemy, Scramble│
  │                 │                                 │  Split, Kamikaze      │
  │                 │                                 │                       │
  │   Trigger       │  On opponent's action          │  Portal, Trap, Mirror │
  │   (Placement)   │  when they place a piece       │  Echo, Shockwave,     │
  │                 │                                 │  Retaliate            │
  │                 │                                 │                       │
  │   Trigger       │  On opponent's action          │  Hydra, Backfire,     │
  │   (Removal)     │  when they remove your piece   │  Absorb               │
  │                 │                                 │                       │
  │   Duration      │  Lasts 1-2 turns               │  Freeze (1), Cloak (2)│
  │                 │                                 │  Blind (2), Sanctuary │
  │                 │                                 │  Capture              │
  │                 │                                 │                       │
  │   Deferred      │  Executes at START of your     │  Signal, Enlist,      │
  │                 │  NEXT turn                      │  Ambush, Reinforce,   │
  │                 │                                 │  Raid                 │
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

1. **32 total perks**: 2 fixed commons + 15 React & Protect + 15 Act & Disrupt
2. **Slot-based selection**: Each turn offers 4 perk options:
   - Slot 1: PlaceAnother (always available)
   - Slot 2: RemoveEnemy (always available)
   - Slot 3: Random from React & Protect pool
   - Slot 4: Random from Act & Disrupt pool
   - Pass option always available
3. **4-phase turn system**: Deferred Resolution → Auto-Placement → Perk Selection → Turn Switch
4. **Multiple perk timings**: Instant, Trigger (placement/removal), Duration, Deferred
5. **Trigger chains**: Perks can trigger other perks in sequence (FIFO order)
6. **Win conditions**: First to capture 3 of 5 lanes wins (5 pieces fills a lane side)
7. **Server-driven architecture**: All game logic runs on Go server, client is display-only
