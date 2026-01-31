# Kid - Gameplay Design Document

A turn-based two-player lane control strategy game. First to win 3 of 5 lanes wins.

---

## 1. Board Structure

| Parameter | Value |
|-----------|-------|
| Lanes (rows) | 5 |
| Columns per player | 5 |
| Total columns | 10 |
| Lanes to win game | 3 (majority) |

**Layout:** Each lane has 10 columns - Player 1 owns columns 0-4 (left), Player 2 owns columns 5-9 (right). Pieces fill from the outside toward the center.

---

## 2. Win Conditions

**Lane Win:** Fill all 5 columns on your side of a lane.

**Game Win:** Win 3 lanes (majority of 5). Game ends immediately when achieved.

**Tie-breaker:** If both players fill their side simultaneously, the current player (who just acted) wins the lane.

---

## 3. Turn Structure

Each turn has 3 phases executed in order:

### Phase 1: Deferred Resolution
- Resolve pending raids (probability outcomes)
- Tick down duration effects (Cloak, Blind, Freeze)
- Execute queued deferred effects (Signal, Enlist, Ambush, Reinforce)
- Check for lane/game wins

### Phase 2: Auto-Placement
- System randomly selects one available lane
- Automatically places 1 piece on that lane
- Triggers fire if opponent has placement triggers on that lane
- Check for lane/game wins

### Phase 3: Perk Selection (Player Choice)
- Player offered 4 perks (or can Pass)
- Execute selected perk
- Check for lane/game wins
- End turn, switch to opponent

---

## 4. Lane Availability

A lane is available for placement if:
1. Lane is NOT won by anyone
2. Lane is NOT frozen for that player
3. Player's side has at least one empty column

---

## 5. Perk System Overview

### Slot Allocation

| Slot | Type | Contents |
|------|------|----------|
| 1 | Fixed | PlaceAnother |
| 2 | Fixed | RemoveEnemy |
| 3 | Random | 1 from React & Protect pool (15 perks) |
| 4 | Random | 1 from Act & Disrupt pool (15 perks) |

### Perk Categories

- **Immediate:** Execute instantly
- **Trigger:** Set up traps that fire on opponent actions
- **Duration:** Persist for multiple turns
- **Deferred:** Queue effects for next turn start

---

## 6. Complete Perk Reference (32 Perks)

### Fixed Perks (Slots 1-2)

| Perk | Slot | Effect | Target |
|------|------|--------|--------|
| **PlaceAnother** | 1 | +1 your piece on lane | Auto-placed lane only |
| **RemoveEnemy** | 2 | -1 enemy piece (frontmost) | Any lane with enemy pieces |

### Slot 3 Pool: React & Protect (15 Perks)

| Perk | Category | Effect | Duration | Target |
|------|----------|--------|----------|--------|
| **Freeze** | Immediate | Block opponent placement on lane | 1 turn | Enemy lane |
| **Cloak** | Duration | Hide your entire field from opponent | 2 turns | Auto |
| **Sanctuary** | Duration | Your removed pieces redirect to this lane | 2 turns | Your lane |
| **Portal** | Trigger | Opponent's placed piece teleports to random lane | 2 turns | Lane |
| **Trap** | Trigger | Opponent's placed piece is destroyed | 2 turns | Lane |
| **Mirror** | Trigger | When opponent places, you get +2 same lane | 1 turn | Lane |
| **Echo** | Trigger | When opponent places, you get +2 random lanes | 1 turn | Lane |
| **Shockwave** | Trigger | When opponent places, they lose 2 from other lanes | 1 turn | Your lane |
| **Retaliate** | Trigger | When opponent places, your piece spawns as raid on their side | 2 turns | Your lane |
| **Hydra** | Trigger | When your piece removed, you get +2 random lanes | 1 turn | Your lane |
| **Backfire** | Trigger | When your piece removed, opponent loses 2 | 1 turn | Your lane |
| **Absorb** | Trigger | When your piece removed, it reappears on random lane | 1 turn | Your lane |
| **Regroup** | Immediate | Swap all your pieces between 2 lanes | - | 2 lanes |
| **Scatter** | Immediate | Move all your pieces from lane to random lanes | - | Your lane |
| **Signal** | Deferred | +1 now, pull 1 from most populated lane next turn | - | Lane |

### Slot 4 Pool: Act & Disrupt (15 Perks)

| Perk | Category | Effect | Duration | Target |
|------|----------|--------|----------|--------|
| **Blind** | Duration | Hide opponent's pieces from THEM | 2 turns | Auto |
| **Capture** | Duration | Enemy pieces you remove become yours on target lane | 2 turns | Your lane |
| **Scramble** | Immediate | Collect all enemy pieces, redistribute randomly | - | Auto |
| **Split** | Immediate | Sacrifice 1 your piece, gain 2 on random lanes | - | Your lane |
| **Kamikaze** | Immediate | Sacrifice 1 your piece, remove 2 enemy pieces | - | Your lane |
| **Disrupt** | Immediate | Swap all enemy pieces between 2 lanes | - | 2 enemy lanes |
| **Disperse** | Immediate | Move all enemy pieces from lane to random lanes | - | Enemy lane |
| **Gambit** | Immediate | Enemy gets +3 spread, you get +2 concentrated | - | Auto |
| **Steal** | Immediate | Remove 1 random enemy piece, gain 1 your piece | - | Auto |
| **Rush** | Immediate | Both players +2 on same lane, you -1 elsewhere | - | Lane |
| **Nullify** | Immediate | Cancel all triggers/markers/pending raids on lane | - | Lane |
| **Enlist** | Deferred | +1 now, capture enemy + move both to least populated next turn | - | Your lane |
| **Ambush** | Deferred | +1 now, remove enemy from lane or adjacent next turn | - | Lane |
| **Reinforce** | Deferred | +1 now, +1 more same lane next turn | - | Lane |
| **Raid** | Deferred | Place on enemy side, resolve after 2 turns with probability | - | Enemy lane |

---

## 7. Trigger Mechanics

### Placement Triggers
Fire when opponent places a piece on the trigger's lane:
- **Portal:** Piece teleports (can chain to other triggers)
- **Trap:** Piece destroyed
- **Mirror:** Owner gets +2 same lane
- **Echo:** Owner gets +2 random lanes
- **Shockwave:** Placer loses 2 elsewhere
- **Retaliate:** Owner's piece becomes raid on opponent's side

### Removal Triggers
Fire when owner's piece is removed from the trigger's lane:
- **Hydra:** Owner gets +2 random lanes
- **Backfire:** Remover loses 2 pieces
- **Absorb:** Removed piece reappears elsewhere

### Trigger Rules
- Multiple triggers can exist on same lane
- Fire in FIFO order (first set, first fires)
- One-time triggers removed after firing
- Portal can chain (max depth 10)
- Won lanes clear all triggers

---

## 8. Duration Effects

| Effect | Duration | Scope | Mechanic |
|--------|----------|-------|----------|
| Freeze | 1 opponent turn | Single lane | Blocks placement |
| Cloak | 2 opponent turns | Your entire field | Hides pieces from opponent |
| Blind | 2 opponent turns | Opponent's view | Hides their pieces from them |
| Sanctuary | 2 turns | Your removed pieces | Redirect to marked lane |
| Capture | 2 turns | Enemy pieces you remove | Convert to yours on marked lane |

**Duration decrements** when control passes to the other player.

---

## 9. Deferred Effects

Queued effects that execute at the start of the owner's next turn:

| Effect | Immediate | Next Turn |
|--------|-----------|-----------|
| Signal | +1 piece on target | Pull 1 from most populated lane |
| Reinforce | +1 piece on target | +1 more on same lane |
| Enlist | +1 piece on target | Capture enemy + move both to least populated |
| Ambush | +1 piece on target | Remove enemy from target or adjacent lanes |

---

## 10. Raid System

**Raid** places your piece on the opponent's side. After 2 full turns, it resolves:

| Outcome | Probability | Result |
|---------|-------------|--------|
| Lost | 10% | Piece removed |
| Alone | 45% | Piece converts to your side |
| One Recruit | 30% | Piece + 1 enemy converts |
| Two Recruits | 15% | Piece + 2 enemy converts |

**Retaliate** creates raids automatically when its trigger fires.

---

## 11. Piece Removal & Redirection

When a piece is removed, check these redirects in order:
1. **Capture** (active on remover): Enemy piece becomes yours on capture lane
2. **Sanctuary** (active on owner): Piece relocates to sanctuary lane

If multiple markers active, one is randomly selected.

---

## 12. Source Exclusion

Perks that distribute pieces to "random lanes" use **source exclusion** when 3+ lanes are available - the source lane is excluded from random selection.

Applies to: Portal, Echo, Hydra, Absorb, Split, Scatter, Disperse

Does NOT apply to: Scramble, Shockwave, Backfire, Kamikaze

---

## 13. Atomic Operations

Some perks execute atomically without mid-operation win checks:
- **Regroup:** Swap both lanes simultaneously
- **Disrupt:** Swap both lanes simultaneously

Win checks occur after the atomic operation completes.

---

## 14. Perk Availability Rules

**PlaceAnother:** Requires auto-placed lane to have empty space

**RemoveEnemy:** Requires opponent to have pieces on non-won lanes

**Placement perks:** Need empty column on target lane

**Removal perks:** Need enemy pieces to target

**Cloaked opponent:** Enemy-targeting perks unavailable (can't see targets)

**Won lanes:** Excluded from ALL perk targeting

---

## 15. Configuration Constants

```
Board:
  ROWS = 5
  COLS_PER_PLAYER = 5
  LANES_TO_WIN = 3
  PERKS_OFFERED = 4

Durations:
  FREEZE = 1 turn
  CLOAK = 2 turns
  BLIND = 2 turns
  SANCTUARY = 2 turns
  CAPTURE = 2 turns
  PORTAL/TRAP = 2 turns
  MIRROR/ECHO/SHOCKWAVE = 1 turn
  HYDRA/BACKFIRE/ABSORB = 1 turn
  RETALIATE = 2 turns

Magnitudes:
  MIRROR_PIECES = 2
  ECHO_PIECES = 2
  SHOCKWAVE_REMOVES = 2
  HYDRA_PIECES = 2
  BACKFIRE_REMOVES = 2
  SPLIT_GAIN = 2
  KAMIKAZE_REMOVES = 2
  GAMBIT_ENEMY_GAIN = 3
  GAMBIT_PLAYER_GAIN = 2
  RUSH_PIECES_EACH = 2
  RUSH_PLAYER_LOSS = 1

Source Exclusion Threshold: 3 lanes
```

---

## 16. Game Events

Key events for UI/networking:

| Event | Data |
|-------|------|
| GameStarted | Players |
| TurnChanged | NewPlayer, Phase |
| AutoPlacement | Player, Lane, Column |
| PiecePlaced | Player, Lane, Column, Flags |
| PieceRemoved | Owner, Lane, Column, Reason |
| PerksOffered | Player, PerkTypes[4] |
| PerkSelected | Player, PerkType, Targets |
| PerkSkipped | Player |
| TriggerFired | Type, Owner, Lane |
| LaneWon | Winner, Lane |
| GameEnded | Winner, Reason |

---

## 17. AI Considerations

### Belief State
When Cloak/Blind is active, AI uses frozen "last seen" board state. Invalid moves fail silently.

### Decision Points
1. Perk selection from 4 options (or pass)
2. Lane targeting when required
3. Second lane targeting for Regroup/Disrupt

### Scoring Factors
- Win lane opportunity (highest priority)
- Block opponent win threat
- Advance own position
- Disrupt opponent progress

---

## 18. Edge Cases

1. **Lane overflow:** Pieces exceeding 5 are lost (placement fails)
2. **Simultaneous fill:** Current player wins lane
3. **Frozen lane:** Player can't place, but can target for non-placement perks
4. **Raid on won lane:** Raid cancelled/removed
5. **Deferred on won lane:** Effect cleared
6. **Multiple triggers:** Fire in set order (FIFO)
7. **Portal chains:** Max depth 10 to prevent infinite loops

---

## 19. Turn Flow Summary

```
START TURN
  |
  v
[1] DEFERRED RESOLUTION
  - Resolve raids
  - Tick durations
  - Execute deferred effects
  - Check wins
  |
  v
[2] AUTO-PLACEMENT
  - Pick random available lane
  - Place 1 piece
  - Fire placement triggers
  - Check wins
  |
  v
[3] PERK SELECTION
  - Offer 4 perks
  - Player selects or passes
  - Execute perk
  - Check wins
  |
  v
END TURN -> Switch player -> START TURN
```

---

*This document provides complete specifications for reimplementing the Kid game engine.*
