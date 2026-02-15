# Perk Flow Diagram

## High-Level Architecture

```
+-------------------+        WebSocket         +-------------------+
|                   |  ───── selectPerk ─────>  |                   |
|   Flutter Client  |                           |    Go Server      |
|                   |  <──── perkResult ──────  |                   |
+-------------------+                           +-------------------+
        |                                               |
   Provider/UI                                    PerkExecutor
   State Mgmt                                    Lane Engine
                                                        |
                                                +-------------------+
                                                | Python Simulation |
                                                |  (Balance Tests)  |
                                                +-------------------+
```

## Complete Turn Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    TURN START                                │
│                                                             │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │ 1. Raid Resolution   │───>│ 2. Deferred Resolution    │  │
│  │                      │    │                            │  │
│  │ ProcessPendingRaids()│    │ ProcessDeferredEffects()   │  │
│  │ • Roll random (0-99) │    │ • SIGNAL: pull from most   │  │
│  │ • 10%: raid lost     │    │   populated lane           │  │
│  │ • 15%: +2 recruits   │    │ • ENLIST: capture + move   │  │
│  │ • 30%: +1 recruit    │    │   to least populated       │  │
│  │ • 45%: +1 piece      │    │ • AMBUSH: remove enemy     │  │
│  │ • Check lane/game win│    │ • REINFORCE: +1 piece      │  │
│  └──────────────────────┘    │ • Check lane/game win      │  │
│                              └───────────────────────────┘  │
│                                        │                    │
│                                        v                    │
│  ┌──────────────────────┐    ┌───────────────────────────┐  │
│  │ 3. Auto Placement    │───>│ 4. Perk Selection         │  │
│  │                      │    │                            │  │
│  │ ExecuteAutoPlacement()│   │ ExecutePerkSelection()     │  │
│  │ • Place 1 piece on   │    │ • Choose from 4 slots     │  │
│  │   selected lane      │    │ • Execute perk logic      │  │
│  │ • Fire placement     │    │ • Fire triggers/deferred  │  │
│  │   triggers           │    │ • Check lane/game win     │  │
│  │ • Check lane/game win│    │                            │  │
│  └──────────────────────┘    └───────────────────────────┘  │
│                                        │                    │
│                                        v                    │
│                              ┌───────────────────────────┐  │
│                              │ 5. Advance Phase           │  │
│                              │ • Switch active player     │  │
│                              │ • Generate new perk slots  │  │
│                              │ • Send game state update   │  │
│                              └───────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Perk Slot Generation

```
┌─────────────────────────────────────────────────────────┐
│             generatePerkSlots()                         │
│                                                         │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Slot 1  │  │ Slot 2  │  │ Slot 3   │  │ Slot 4   │ │
│  │ (Fixed) │  │ (Fixed) │  │ (Random) │  │ (Random) │ │
│  │         │  │         │  │          │  │          │ │
│  │ Place   │  │ Remove  │  │ React &  │  │ Act &    │ │
│  │ Another │  │ Enemy   │  │ Protect  │  │ Disrupt  │ │
│  │ (ID: 1) │  │ (ID: 2) │  │ Pool     │  │ Pool     │ │
│  └─────────┘  └─────────┘  └────┬─────┘  └────┬─────┘ │
│                                  │              │       │
│                    ┌─────────────┘   ┌──────────┘       │
│                    v                 v                   │
│  ┌─────────────────────┐  ┌─────────────────────┐       │
│  │ Slot 3 Pool (15)    │  │ Slot 4 Pool (15)    │       │
│  │                     │  │                     │       │
│  │ Freeze    Portal    │  │ Scramble   Split    │       │
│  │ Trap      Mirror    │  │ Kamikaze   Disrupt  │       │
│  │ Regroup   Echo      │  │ Disperse   Gambit   │       │
│  │ Signal    Shockwave │  │ Steal      Rush     │       │
│  │ Cloak     Scatter   │  │ Nullify    Enlist   │       │
│  │ Sanctuary Hydra     │  │ Ambush     Reinforce│       │
│  │ Backfire  Absorb    │  │ Capture    Raid     │       │
│  │ Retaliate           │  │ Blind               │       │
│  └─────────────────────┘  └─────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Perk Selection & Execution Flow

```
CLIENT                          SERVER
  │                                │
  │  User taps perk card           │
  │  ┌──────────────────────┐      │
  │  │ PerkSelectionPanel   │      │
  │  │ _onPerkTapped(id)    │      │
  │  └──────────┬───────────┘      │
  │             │                  │
  │  ┌──────────v───────────┐      │
  │  │ CombatService        │      │
  │  │ selectPerk(id, lane) │      │
  │  └──────────┬───────────┘      │
  │             │                  │
  │  ┌──────────v───────────┐      │
  │  │ WebSocketService     │      │
  │  │ selectPerk()         │      │
  │  │                      │      │
  │  │ WSMessage {          │      │
  │  │   type: "selectPerk" │──────>  ┌──────────────────────┐
  │  │   payload: {         │      │  │ handleSelectPerk()   │
  │  │     gameId,          │      │  │                      │
  │  │     perkId,          │      │  │ 1. Validate player   │
  │  │     targetLane       │      │  │ 2. Validate turn     │
  │  │   }                  │      │  │ 3. Validate phase    │
  │  │ }                    │      │  └──────────┬───────────┘
  │  └──────────────────────┘      │             │
  │                                │  ┌──────────v───────────┐
  │                                │  │ LaneEngine           │
  │                                │  │ ExecutePerkSelection()│
  │                                │  └──────────┬───────────┘
  │                                │             │
  │                                │  ┌──────────v───────────┐
  │                                │  │ PerkExecutor         │
  │                                │  │ Execute(id, player,  │
  │                                │  │         targets)     │
  │                                │  │                      │
  │                                │  │ Switch on PerkID:    │
  │                                │  │ ├─ PlaceAnother      │
  │                                │  │ ├─ RemoveEnemy       │
  │                                │  │ ├─ Freeze            │
  │                                │  │ ├─ Portal            │
  │                                │  │ ├─ Scramble          │
  │                                │  │ ├─ ... (25+ perks)   │
  │                                │  └──────────┬───────────┘
  │                                │             │
  │                                │             v
  │                                │  ┌───────────────────────┐
  │                                │  │ PerkResult {          │
  │                                │  │   Success, Error,     │
  │                                │  │   AffectedLanes,      │
  │                                │  │   Placements,         │
  │  ┌──────────────────────┐      │  │   Removals,           │
  │  │ _handlePerkResult()  │<─────── │   TriggerResults,     │
  │  │                      │      │  │   LaneWinner,         │
  │  │ Update local state   │      │  │   GameWinner          │
  │  │ notifyListeners()    │      │  │ }                     │
  │  │ UI rebuilds          │      │  └───────────────────────┘
  │  └──────────────────────┘      │
  │                                │
```

## Perk Execution Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PERK EXECUTION TYPES                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  IMMEDIATE (Instant Effect)                                         │
│  ═══════════════════════════                                        │
│  ┌──────────┐                                                       │
│  │ Execute  │──> Modify lane state ──> Fire triggers ──> Check win  │
│  └──────────┘                                                       │
│  Perks: PlaceAnother, RemoveEnemy, Freeze, Regroup, Scatter,        │
│         Scramble, Split, Kamikaze, Disrupt, Disperse, Gambit,       │
│         Steal, Rush, Nullify                                        │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  TRIGGER (Fire on Opponent Action)                                  │
│  ══════════════════════════════════                                  │
│                                                                     │
│  Setup Phase:                                                       │
│  ┌──────────┐                                                       │
│  │ Execute  │──> Place trigger on lane ──> Wait for opponent action  │
│  └──────────┘                                                       │
│                                                                     │
│  Fire Phase (when opponent acts):                                   │
│  ┌──────────────────┐    ┌──────────────────┐                       │
│  │ Placement Trigger │    │ Removal Trigger   │                     │
│  │ (enemy places)    │    │ (enemy removes)   │                     │
│  │                   │    │                   │                     │
│  │ Portal: teleport  │    │ Hydra: +2 pieces  │                     │
│  │ Trap: remove      │    │ Backfire: +1 each │                     │
│  │ Mirror: +2 owner  │    │ Absorb: +1 owner  │                     │
│  │ Echo: +2 random   │    │                   │                     │
│  │ Shock: -1 each    │    └──────────┬────────┘                     │
│  │ Retaliate: -1     │               │                              │
│  └──────────┬────────┘               │                              │
│             │                        │                              │
│             v                        v                              │
│  ┌────────────────────────────────────────┐                         │
│  │ Trigger Chaining (max depth: 10)       │                         │
│  │ Trigger A fires ──> causes placement   │                         │
│  │ ──> fires Trigger B ──> causes removal │                         │
│  │ ──> fires Trigger C ──> ...            │                         │
│  └────────────────────────────────────────┘                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DEFERRED (Next Turn Effect)                                        │
│  ═══════════════════════════                                        │
│  ┌──────────┐    ┌────────────────┐    ┌──────────────────────┐     │
│  │ Execute  │──> │ Immediate: +1  │──> │ Queue deferred effect │    │
│  └──────────┘    │ piece on lane  │    │ for next turn         │    │
│                  └────────────────┘    └──────────┬───────────┘     │
│                                                   │                 │
│                          Next Turn ───────────────┘                 │
│                              │                                      │
│                              v                                      │
│                  ┌────────────────────────┐                         │
│                  │ ProcessDeferredEffects  │                        │
│                  │                        │                         │
│                  │ Signal: pull from most │                         │
│                  │   populated lane       │                         │
│                  │ Enlist: capture + move │                         │
│                  │   to least populated   │                         │
│                  │ Ambush: remove enemy   │                         │
│                  │   from lane/adjacent   │                         │
│                  │ Reinforce: +1 piece    │                         │
│                  └────────────────────────┘                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  DURATION (Time-Based State)                                        │
│  ═══════════════════════════                                        │
│  ┌──────────┐    ┌─────────────────┐    ┌────────────────────┐      │
│  │ Execute  │──> │ Set state on    │──> │ Decrement each     │      │
│  └──────────┘    │ lane/player     │    │ turn, expire at 0  │      │
│                  └─────────────────┘    └────────────────────┘      │
│  Perks: Cloak (hide pieces), Sanctuary (protect lane),             │
│         Blind (hide enemy), Capture (convert pieces)               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  RAID (Queued + Random Resolution)                                  │
│  ══════════════════════════════════                                  │
│  ┌──────────┐    ┌─────────────────┐    ┌────────────────────┐      │
│  │ Execute  │──> │ Queue raid on   │──> │ ProcessPendingRaids│      │
│  └──────────┘    │ lane (N turns)  │    │ at turn start      │      │
│                  └─────────────────┘    │                    │      │
│                                         │ Roll random 0-99: │      │
│                                         │  10%: raid lost   │      │
│                                         │  15%: +2 recruits │      │
│                                         │  30%: +1 recruit  │      │
│                                         │  45%: +1 piece    │      │
│                                         └────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Validation Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│                   VALIDATION CHAIN                            │
│                                                              │
│  Client (UI)           Server (Handler)     Server (Executor)│
│  ───────────           ─────────────────    ──────────────── │
│                                                              │
│  ┌────────────┐        ┌────────────────┐  ┌──────────────┐ │
│  │ Disable    │        │ Player owns    │  │ Lane not won │ │
│  │ invalid    │───────>│ the game?      │─>│ already?     │ │
│  │ perk cards │        └────────────────┘  └──────────────┘ │
│  │ in UI      │        ┌────────────────┐  ┌──────────────┐ │
│  └────────────┘        │ Player's turn? │  │ Valid target  │ │
│                        └────────────────┘  │ lane?         │ │
│                        ┌────────────────┐  └──────────────┘ │
│                        │ Phase is Perk  │  ┌──────────────┐ │
│                        │ Selection?     │  │ Perk-specific │ │
│                        └────────────────┘  │ requirements? │ │
│                                            │ (e.g. pieces  │ │
│                        TargetingHelper:    │  exist, lane  │ │
│                        ┌────────────────┐  │  not frozen)  │ │
│                        │ GetValidTargets│  └──────────────┘ │
│                        │ ForPerk()      │                   │
│                        │ CanUsePerk()   │  Trigger depth:   │
│                        │ RequiresLane   │  ┌──────────────┐ │
│                        │ Selection()    │  │ Max chain     │ │
│                        └────────────────┘  │ depth: 10     │ │
│                                            └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Three-Layer Parity

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Python Sim      │  │  Go Server       │  │  Flutter Client  │
│  (Balance Test)  │  │  (Authority)     │  │  (Presentation)  │
├──────────────────┤  ├──────────────────┤  ├──────────────────┤
│                  │  │                  │  │                  │
│  PerkType enum   │  │  PerkID consts   │  │  PerkSlot class  │
│  execute_perk()  │  │  Execute()       │  │  selectPerk()    │
│                  │  │                  │  │                  │
│  immediate.py    │  │  executor.go     │  │  combat_service  │
│  triggers.py     │  │  (all-in-one)    │  │  .dart           │
│  deferred.py     │  │                  │  │                  │
│  duration.py     │  │  targeting.go    │  │  perk_selection   │
│                  │  │                  │  │  _panel.dart     │
│  Offline balance │  │  Real-time game  │  │  UI display +    │
│  testing & AI    │  │  execution       │  │  local effects   │
│  simulation      │  │  (authoritative) │  │                  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
        │                      │                      │
        │     Same perk IDs, same pools, same logic   │
        └──────────────────────┴──────────────────────┘
```
