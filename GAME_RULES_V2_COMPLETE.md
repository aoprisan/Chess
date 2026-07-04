# Game Rules V2 - Complete Reference

This document provides the complete rules for the V2 game system, including all 32 perks.

---

## 1. Core Rules

### Board Layout
- **5 lanes** (rows), each with slots for pieces
- Each player has their own side of each lane
- Pieces are placed from edge toward center (front = closest to center)

### Board Configuration
- **Lanes**: Configurable, must be ODD number (5, 7, 9, etc.) - default 5
- **Slots per side**: Configurable per lane (default 5)
- Board dimensions can scale for complexity; rules remain consistent

### Piece Placement
- **Front placement only**: New pieces always go to the next available slot toward center
- **No gaps**: Pieces are always contiguous from edge toward center
- **Full lane = locked**: Once a lane has no empty slots on a side, that side is complete

### Resources
- **No reserves**: Unlimited pieces available (no resource tracking)

### Win Condition
- **Win more than half the lanes** (e.g., 3 of 5 lanes)
- A lane is won when one side fills all their slots

### Won Lane Rules
- **Won lanes cannot be targeted by any perk** - all perk targeting is limited to available (not won) lanes
- Won lanes are excluded from random lane selection
- Won lanes are skipped during auto-placement

---

## 2. Turn Structure

### Fair Start Rule

**Player 1's opening turn is auto-placement only** — no perk selection is offered; the turn ends immediately after the auto-placed piece lands. This offsets the first-mover advantage (mirror-match simulations measured a 59-67% win rate for player 1 without the rule, ~53/47 with it). Every turn after that follows the full structure below.

```
1. DEFERRED RESOLUTION (if any)
   - Deferred perks from previous turn resolve
   - CHECK LANE WIN after each resolution
   - CHECK GAME WIN (if enough lanes won)

2. AUTO-PLACEMENT
   - 1 piece automatically places on a random available lane
   - If lane side is full, pick another random available lane
   - Both players see where piece landed
   - CHECK LANE WIN (if lane is now full)
   - CHECK GAME WIN (if enough lanes won)

3. PERK SELECTION
   - Player sees 4 perk options + pass
   - Player picks ONE option (or pass)
   - Perk executes immediately
   - CHECK LANE WIN (after perk effects resolve)
   - CHECK GAME WIN (if enough lanes won)

4. TURN END
   - Switch to opponent's turn
```

---

## 3. Perk Slot System

| Slot | Contents |
|------|----------|
| 1 | PlaceAnother (fixed) |
| 2 | RemoveEnemy (fixed) |
| 3 | Random perk from pool |
| 4 | Random perk from pool |
| - | Pass (always available) |

*Note: Perk-to-pool allocation is subject to balancing and may change.*

---

## 4. All 32 Perks

**Note on Perk IDs:** Perk numbers (e.g., #1, #4, #22) are **permanent IDs**, not sequential numbers. Gaps in numbering (e.g., #3 being absent) are intentional - IDs are preserved for consistency across versions even when perks are removed or reorganized.

### Legend

| Field | Meaning |
|-------|---------|
| **Category** | Offensive (gains you pieces or removes enemy) / Defensive (protects or triggers on enemy action) / Utility (repositions or counters) |
| **Target** | Where perk is played: Your Lane, Enemy Lane, Your Piece, Enemy Piece, etc. |
| **Timing** | Instant (immediate effect) / Trigger (fires on condition) / Duration (lasts N turns) / Deferred (fires at start of your next turn) |

---

### Fixed Commons

#### #1 PlaceAnother
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your side of chosen lane |
| **Timing** | Instant |
| **Effect** | Place 1 of your pieces on any lane you choose (front position) |

#### #2 RemoveEnemy
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Enemy side of chosen lane |
| **Timing** | Instant |
| **Effect** | Remove 1 enemy piece from any lane you choose (frontmost piece only) |

---

### Protection & Control Perks

#### #4 Freeze
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Your side of chosen lane |
| **Timing** | Duration |
| **Duration** | 1 turn |
| **Effect** | Place a freeze marker on your side of the lane. Opponent cannot place pieces on this lane for 1 turn. Auto-placement skips frozen lanes. **Scope:** Freeze ONLY blocks piece placement. It does not affect, pause, or cancel any other active effects on the lane (triggers, Sanctuary, Capture, deferred pieces, etc.). |

#### #22 Cloak
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Your pieces (all lanes) |
| **Timing** | Duration |
| **Duration** | 2 turns |
| **Effect** | Hide ALL your pieces from opponent's view. Opponent cannot see your piece positions. Placement still works normally. Won lanes are not affected. **Targeting:** While your pieces are cloaked, the opponent's targeted enemy-piece perks — RemoveEnemy (#2), Disrupt (#34), and Disperse (#36) — have NO valid lanes. Untargeted and area effects (Scramble, Kamikaze, Shockwave, Steal, raids, etc.) still work normally. |

#### #23 Blind
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Enemy pieces (all lanes) |
| **Timing** | Duration |
| **Duration** | 2 turns |
| **Effect** | Hide opponent's pieces FROM THEM. Opponent cannot see their own piece positions. Placement still works normally (visual effect only). Won lanes are not affected. **Targeting:** Memory-based - no mechanical targeting restriction. Opponent must remember piece positions to select lanes for perks; all perks still function normally if they remember correctly. |

**AI/Simulation Behavior for Cloak and Blind (design intent — NOT implemented):**

> The shipped engine implements Cloak's targeting restriction (above) and hides
> pieces in the UI for pass-and-play, but the AI always sees the true board.
> Blind is therefore purely visual against the AI. The belief-state design below
> is retained as future work.

- AI maintains a "belief state" (snapshot of board) that freezes when these perks activate
- While active: AI reasons from stale information, not real board state
- Won lanes remain visible even when these perks are active
- Valid moves silently succeed; invalid moves (based on stale belief) silently fail without changing board state
- AI does not learn whether moves succeeded until the perk expires and a fresh snapshot is obtained
- This creates genuine strategic uncertainty in automated play

---

### Placement Triggers

*These perks are set on a lane. They trigger when opponent PLACES a piece there. All triggers are VISIBLE to opponent.*

> **Shipped balance buff:** Mirror, Echo, Shockwave, and Retaliate also place **+1 of your pieces on the target lane immediately when cast** (if that +1 wins the lane, no trigger is set), and the trigger then waits up to **2 opponent turns**. Portal and Trap have no cast bonus and wait 1 opponent turn.

#### #24 Portal
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Enemy side of chosen lane |
| **Timing** | Trigger (on enemy placement) |
| **Duration** | 2 turns |
| **Effect** | When enemy places a piece on this lane, that piece teleports to a random OTHER lane. Uses source exclusion: if 3+ lanes available, excludes source lane; if only 2 lanes, any available; if only source available, piece stays. **Chaining:** Teleported piece DOES trigger any placement effects on destination lane (Trap, Mirror, etc.). |

#### #25 Trap
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Enemy side of chosen lane |
| **Timing** | Trigger (on enemy placement) |
| **Duration** | 2 turns |
| **Effect** | When enemy places a piece on this lane, that piece vanishes (removed from game). |

#### #26 Mirror
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Enemy side of chosen lane |
| **Timing** | Trigger (on enemy placement) |
| **Duration** | 2 opponent turns |
| **Effect** | When enemy places a piece on this lane, YOU get 2 pieces on the SAME lane (your side, front positions). Enemy piece stays. If your side fills after the first piece, the second piece is lost. |

#### #27 Echo
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Enemy side of chosen lane |
| **Timing** | Trigger (on enemy placement) |
| **Duration** | 2 opponent turns |
| **Effect** | When enemy places a piece on this lane, YOU get 2 pieces on RANDOM lanes. Uses source exclusion. Enemy piece stays. |

#### #28 Shockwave
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Enemy side of chosen lane |
| **Timing** | Trigger (on enemy placement) |
| **Duration** | 2 opponent turns |
| **Effect** | When enemy places a piece on this lane, enemy loses 2 pieces from OTHER lanes (random selection from non-empty lanes, frontmost pieces). Placed piece stays. |

---

### Removal Triggers

*These perks are set on YOUR lane. They trigger when opponent REMOVES your piece from there. All triggers are VISIBLE to opponent.*

> **Shipped balance buff:** Hydra, Backfire, and Absorb also place **+1 of your pieces on the target lane immediately when cast** (if that +1 wins the lane, no trigger is set), and the trigger then waits up to **2 opponent turns**.
>
> **Shipped scope:** removal triggers fire only when a piece is removed by **RemoveEnemy (#2)**. Removals caused by Kamikaze, Steal, Ambush, Enlist, Rush, Scramble, Disperse, raid losses, or other triggers do NOT fire them.

#### #29 Hydra
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Your side of chosen lane |
| **Timing** | Trigger (on enemy removal) |
| **Duration** | 2 opponent turns |
| **Effect** | When enemy removes your piece from this lane, you get 2 pieces on RANDOM lanes. Uses source exclusion. Net effect: you lose 1, gain 2 = +1 piece. |

#### #30 Backfire
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your side of chosen lane |
| **Timing** | Trigger (on enemy removal) |
| **Duration** | 2 opponent turns |
| **Effect** | When enemy removes your piece from this lane, enemy loses 2 pieces (random selection from their non-empty lanes, frontmost pieces). Net effect: you lose 1, they lose 2. |

#### #46 Absorb
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Your side of chosen lane |
| **Timing** | Trigger (on enemy removal) |
| **Duration** | 2 opponent turns |
| **Effect** | When enemy removes your piece from this lane, that piece reappears on a random AVAILABLE lane (your side). Net effect: piece is not lost, just repositioned. Uses source exclusion. |

---

### Conversion Perks

*Sacrifice one of your pieces for an effect.*

#### #31 Split
| | |
|---|---|
| **Category** | Utility |
| **Target** | Your piece (you choose which) |
| **Timing** | Instant |
| **Effect** | Sacrifice 1 of your pieces from any lane. Gain 2 pieces on RANDOM lanes. Uses source exclusion. Net effect: -1 +2 = +1 piece, but repositioned. |

#### #32 Kamikaze
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your piece (you choose which) |
| **Timing** | Instant |
| **Effect** | Sacrifice 1 of your pieces from any lane. Enemy loses 2 pieces (random selection from their non-empty lanes, frontmost pieces). Net effect: you -1, enemy -2. |

---

### Repositioning Perks (Your Pieces)

#### #33 Regroup
| | |
|---|---|
| **Category** | Utility |
| **Target** | Your pieces on 2 chosen lanes |
| **Timing** | Instant |
| **Effect** | Swap ALL your pieces between 2 chosen lanes. Atomic operation: remove all from both lanes first, then add to opposite lanes. No win check mid-swap. |

#### #35 Scatter
| | |
|---|---|
| **Category** | Utility |
| **Target** | Your pieces on 1 chosen lane |
| **Timing** | Instant |
| **Effect** | Move ALL your pieces from 1 chosen lane to RANDOM other lanes. Pieces placed one by one (iterative). Uses source exclusion. Lane win checked after each placement. If no valid destination, piece is removed. |

#### #43 Signal (Deferred)
| | |
|---|---|
| **Category** | Utility |
| **Target** | Your side of chosen lane |
| **Timing** | Deferred |
| **Effect** | Place 1 of your pieces on lane X. At START of your NEXT turn: pull 1 of your pieces from your MOST populated lane (excluding X) to join lane X. If tied for most populated, random selection among ties. If no pieces elsewhere, no move happens. If lane X is full when the deferred effect resolves, no move happens (source piece stays where it is). Visible to opponent. |

---

### Repositioning Perks (Enemy Pieces)

#### #34 Disrupt
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Enemy pieces on 2 chosen lanes |
| **Timing** | Instant |
| **Effect** | Swap ALL enemy pieces between 2 chosen lanes. Atomic operation: remove all from both lanes first, then add to opposite lanes. No win check mid-swap. |

#### #36 Disperse
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Enemy pieces on 1 chosen lane |
| **Timing** | Instant |
| **Effect** | Move ALL enemy pieces from 1 chosen lane to RANDOM other lanes. Pieces placed one by one (iterative). Uses source exclusion. Lane win checked after each placement. If no valid destination, piece is removed. |

#### #13 Scramble
| | |
|---|---|
| **Category** | Offensive |
| **Target** | None (fully automatic) |
| **Timing** | Instant |
| **Effect** | No selection required. Remove ALL enemy pieces from the board, then redistribute them one by one to RANDOM available lanes. No source exclusion (all lanes valid). Lane win checked after each placement. |

---

### Trade Perks

#### #37 Gambit
| | |
|---|---|
| **Category** | Utility |
| **Target** | None (fully automatic) |
| **Timing** | Instant |
| **Effect** | No selection required. **Enemy phase:** Enemy gains 3 pieces placed one by one, each to a random available lane (same lane CAN be selected multiple times). Lane win and game win checked after EACH placement - enemy can win lanes or even the game during this phase. **Your phase:** Only executes if game not won. You gain 2 pieces on a single randomly-picked available lane (ONE roll, both pieces go there iteratively). If your target lane fills after the first piece, the second piece is lost. Net: enemy +3 (spread), you +2 (concentrated). |

#### #38 Steal
| | |
|---|---|
| **Category** | Offensive |
| **Target** | None (fully automatic) |
| **Timing** | Instant |
| **Effect** | No selection required. Enemy loses 1 piece (random lane, frontmost). You gain 1 piece (random lane). Net: enemy -1, you +1. |

#### #39 Rush
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your available lane (you choose) |
| **Timing** | Instant |
| **Effect** | Choose a lane. **Placement order:** (1) You place 2 pieces on that lane (one by one, win check after each), (2) Enemy places 2 pieces on that lane (one by one, win check after each), (3) You lose 1 piece from a DIFFERENT lane (random; if no other lane has your pieces, lose from same lane). "Lose" = piece removed from game entirely. If the lane is won during ANY of the 4 placements, the "lose 1 piece" step is cancelled. Net: you +1, enemy +2, accelerates lane completion. |

---

### Deferred Perks

*Place a piece that triggers an effect at the START of your NEXT turn. All deferred pieces are VISIBLE to opponent.*

#### #40 Enlist
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your side of chosen lane |
| **Timing** | Deferred |
| **Effect** | Place 1 of your pieces on lane X. At START of your NEXT turn: take 1 enemy piece from lane X (if available) and move BOTH pieces (yours and captured enemy) to your LEAST populated available lane. If tied for least populated, random selection among ties. If no enemy piece on X, only your piece moves. If destination lane is full when effect resolves, pieces are removed. |

#### #41 Ambush
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your side of chosen lane |
| **Timing** | Deferred |
| **Effect** | Place 1 of your pieces on lane X. At START of your NEXT turn: remove 1 enemy piece from lane X OR adjacent lanes (X-1, X+1). Adjacency does NOT wrap (lane 1 only adjacent to lane 2; last lane only adjacent to previous). Random pick from available targets. If no enemies in range, no removal. |

#### #42 Reinforce
| | |
|---|---|
| **Category** | Utility |
| **Target** | Your side of chosen lane |
| **Timing** | Deferred |
| **Effect** | Place 1 of your pieces on lane X. At START of your NEXT turn: +1 additional piece joins lane X (you get 2 pieces total on that lane from one perk use). If lane X is full when the deferred effect resolves, the bonus piece is lost. |

---

### Duration Perks

#### #49 Sanctuary
| | |
|---|---|
| **Category** | Defensive |
| **Target** | Your side of chosen lane (marker) |
| **Timing** | Duration |
| **Duration** | 2 turns |
| **Effect** | Mark 1 lane as sanctuary. While active, your pieces removed by the opponent's RemoveEnemy, Trap, Shockwave, or Backfire go to the sanctuary lane instead of being lost (removals from Kamikaze, Steal, Ambush, Enlist, Rush, and raid losses are NOT redirected). Stops if lane is won. If sanctuary lane is full, pieces are lost as normal. Multiple Sanctuary markers may be active simultaneously; the earliest-placed active Sanctuary receives the piece. |

#### #50 Capture
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your side of chosen lane (marker) |
| **Timing** | Duration |
| **Duration** | 2 turns |
| **Effect** | Mark 1 lane as capture zone. While active, enemy pieces YOU remove via RemoveEnemy, Trap, Shockwave, or Backfire become YOUR pieces and go to this lane (removals via Kamikaze, Steal, Ambush, Enlist, Scramble, or Disperse are NOT captured). Stops if lane is won. If lane is full, capture fails and enemy piece is removed normally (not converted). Multiple Capture markers may be active simultaneously; the earliest-placed active Capture zone receives the piece. Capture is checked before the opponent's Sanctuary. |

---

### Raid Perks

#### #51 Raid
| | |
|---|---|
| **Category** | Offensive |
| **Target** | ENEMY's side of chosen lane (unique mechanic) |
| **Timing** | Deferred (resolves at start of your next turn) |
| **Effect** | Place 1 of YOUR pieces on the ENEMY's side of a lane. At START of your NEXT turn, roll for outcome: |

| Outcome | Probability | Result |
|---------|-------------|--------|
| Lost | 10% | Piece is removed, nothing returns |
| +2 Recruits | 15% | Piece returns to your side with 2 bonus pieces |
| +1 Recruit | 30% | Piece returns to your side with 1 bonus piece |
| Alone | 45% | Piece returns safely to your side, no recruits |

*Recruits are new pieces added to your side of the lane; they do not remove pieces from the enemy's side.*

**Raid Piece Mechanics:**
- Raid piece is **mechanically the enemy's piece** once placed on their side
- For lane win calculations: counts as THEIR piece
  - Lane targeting excludes lanes where the enemy already has 4 pieces, so a Raid can never hand the enemy a lane win
  - Placing Raid on your own near-win lane (enemy's side) does NOT win for you
- For targeting: all perks treat it as enemy's piece
  - YOUR RemoveEnemy CAN target it (it's enemy's piece from your perspective)
  - THEIR RemoveEnemy CANNOT target it (can't remove own pieces)
  - Disperse/Scramble (yours) CAN affect it (targets enemy pieces)
- Only the deferred Raid resolution mechanic "reclaims" it for you

**Multiple Raids:**
- Multiple Raid pieces can be active simultaneously
- Can Raid the same lane multiple times or different lanes
- Each Raid resolves independently at the start of owner's turn

**Raid Cancelled (Lane Won):**
- If lane is won before resolution, Raid piece counts toward the winner's total (it's mechanically their piece)
- Raid effect is cancelled - no probability roll, no recruits
- Enemy wins lane: their win, Raid piece contributed to their count, no reclaim
- You win lane: lane closed, Raid piece removed with lane cleanup

**Raid Vulnerabilities:**
- Lane won by enemy before resolution: they win, piece stays as theirs (no Raid effect)
- Nullify: CAN cancel Raid effect (piece stays on lane as normal enemy piece, no probability roll occurs)
- Your own Trap on that lane: does NOT trigger (Trap triggers on enemy placement, Raid is mechanically their piece now)
- Your Shockwave/Backfire/Kamikaze: CAN target it (it's enemy piece from your perspective)

**Raid Protections:**
- Enemy's RemoveEnemy: CANNOT target (can't remove own pieces)
- Enemy's removal perks targeting their own pieces: CANNOT target
- Enemy moving their pieces: Raid resolution still attempts if piece survives to resolution

**Raid Piece Movement:**
- If a Raid piece is moved to YOUR side (via Capture, Disrupt, or any other effect), it becomes your normal piece
- Raid status is cancelled - no probability roll occurs
- Piece ownership is determined by board position, not original owner

#### #52 Retaliate
| | |
|---|---|
| **Category** | Offensive |
| **Target** | Your side of chosen lane |
| **Timing** | Trigger (on enemy placement) → creates Raid piece |
| **Duration** | 2 opponent turns (triggers once) |
| **Effect** | Set on your lane. When enemy PLACES a piece on this lane, a NEW piece of yours appears on ENEMY's side of the SAME lane as a Raid piece. That Raid piece follows normal Raid timing: |

**Retaliate → Raid Timeline (Confirmed: 2 full turns after trigger):**
1. Enemy places piece → Retaliate triggers → raid piece appears on enemy's side
2. Your turn (raid NOT resolved yet)
3. Enemy's turn (they can react to raid piece)
4. Your NEXT turn START → Raid probability roll resolves

Note: This means 2 full turns pass before resolution, giving opponent time to react.

**Retaliate-Spawned Raid Piece Ownership:**
- Same mechanics as regular Raid: piece is **mechanically enemy's piece** once on their side
- Counts toward enemy's lane win, targetable as enemy piece (see Raid Mechanics above)

---

### Counter Perk

#### #48 Nullify
| | |
|---|---|
| **Category** | Utility |
| **Target** | Your side of chosen lane |
| **Timing** | Instant |
| **Effect** | Cancel and remove ALL effects on the chosen lane, regardless of who placed them. Removes: placement triggers (Portal, Trap, Mirror, Echo, Shockwave, Retaliate), removal triggers (Hydra, Backfire, Absorb), deferred effects (not the pieces themselves), pending Raids targeting the lane, Freeze on the lane, and both players' Sanctuary/Capture markers on the lane. **Primary use:** Defensive - clear opponent's traps and triggers from your lane. **Side effect:** Your own effects on that lane are also removed. **Raid/Deferred pieces:** Nullify removes the pending effect but the piece itself stays on the lane as a normal piece. |

---

## 5. Global Mechanics Reference

### Source Exclusion Rule

When placing pieces to "random lanes" (Split, Scatter, Portal, Echo, Hydra, etc.):

| Available Lanes | Rule |
|-----------------|------|
| 3+ lanes | Exclude source lane from random selection |
| 2 lanes | Include source lane in random selection |
| 1 lane (source only) | Piece goes to source lane (perk effectively does nothing) |
| 0 lanes | Piece is lost |

**Perks using source exclusion:** Portal, Echo, Hydra, Split, Scatter, Disperse, Absorb

**Perks NOT using source exclusion:** Scramble (all lanes valid), Shockwave/Backfire/Kamikaze (removal from any non-empty lane)

### Iterative Placement Model

When placing multiple pieces to random lanes:
1. Remove all affected pieces first (atomic)
2. Place each piece one by one
3. Before each placement: check which lanes are available (won lanes excluded from pool)
4. Randomly select from available lanes (with source exclusion if applicable)
5. Place piece, check lane win, check game win
6. If game is won, perk terminates immediately
7. Repeat until all pieces placed or game ends

**Excess Pieces Lost:**
When placing multiple pieces on a single lane, if the lane fills before all pieces are placed, remaining pieces are lost. This applies to all multi-piece placements including triggers (Mirror), deferred effects (Reinforce), and trade perks (Gambit).

### Iterative Placement Examples

**Rush example:**
1. Player chooses lane 3
2. Player places piece 1 on lane 3 → check lane win
3. Player places piece 2 on lane 3 → check lane win (if won, skip to end)
4. Enemy places piece 1 on lane 3 → check lane win
5. Enemy places piece 2 on lane 3 → check lane win (if won, skip to end)
6. Player loses 1 piece from different lane (only if lane 3 not won during steps 2-5)

**Gambit example:**
1. Enemy receives piece 1 on random lane → check lane/game win
2. Enemy receives piece 2 on random lane → check lane/game win
3. Enemy receives piece 3 on random lane → check lane/game win (if game won, stop)
4. Player receives piece 1 on random lane → check lane/game win
5. Player receives piece 2 on same lane → check lane/game win (if lane full after piece 1, piece 2 lost)

### Atomic Swap Operations

For Regroup (#33) and Disrupt (#34):
1. Remove ALL pieces from both lanes first
2. Then add to opposite lanes
3. No win check mid-swap
4. Win check only after swap completes

### Trigger Chaining

When a perk causes pieces to move/place on lanes with triggers:
1. Execute the perk effect
2. Each destination lane processes its triggers in landing order
3. If trigger causes more movement, chain continues

Example: Scatter moves 3 pieces → 2 land on lane with Trap → Trap triggers for each

### Visibility Rules

**All special markers are VISIBLE to opponent:**
- Placement triggers (Portal, Trap, Mirror, Echo, Shockwave, Retaliate)
- Removal triggers (Hydra, Backfire, Absorb)
- Deferred pieces (Enlist, Ambush, Reinforce, Signal)
- Raid pieces (on enemy's field)
- Duration markers (Sanctuary, Capture, Freeze)

**Only Cloak and Blind hide pieces.**

### Turn Duration Definition

When a perk lasts "N turns":
- **1 turn** = the opponent's complete turn (auto-placement + perk phase)
- Effect expires immediately AFTER opponent's turn ends, BEFORE your turn begins
- **2 turns** = opponent's turn + your turn + opponent's turn (expires before your second turn)

Example: Freeze (1 turn) placed on your turn → blocks opponent's next turn → expires before your following turn starts.

### Available Lane Definition

A lane is "available" if ALL of these are true:
- Lane is not won by either player
- Lane has at least 1 empty slot on the relevant side
- No active Freeze effect blocking placement
- No other active effect forbidding placement

### Tie-Breaking Rules

When both players fill their side of a lane on the same action (rare, but possible with certain perks):
- The player whose piece placement **CAUSED** the fill wins the lane (action order)
- In atomic swap operations (Regroup, Disrupt), if both sides end up full, the current player wins
- Example: If a perk places pieces for both players and both fill, the player who activated the perk wins

### Trigger Resolution Rules

**One-Time Triggers:**
- All placement and removal triggers are **ONE-TIME USE**
- When a trigger fires, it is immediately removed regardless of remaining duration
- Duration only determines how long the trigger WAITS to be activated, not how many times it can fire

**Multiple Triggers on Same Lane:**
- Triggers fire in **FIFO order** (first-set triggers first, regardless of which player set them)
- FIFO applies to ALL triggers, including cross-player interactions (e.g., your Capture vs enemy's Absorb)
- Example: If Player A sets Portal, then Player B sets Trap on same lane, Portal fires first
- Example: If Player A sets Capture, then Player B sets Absorb, Capture fires first when removal occurs
- Multiple instances of same trigger type CAN exist and fire sequentially
- Example: 2 Traps → first removes placed piece, second removes frontmost existing piece

**Trigger Chaining:**
- YES, triggers can chain into other triggers
- If Portal teleports a piece to a lane with Trap, Trap fires
- Win checked after EACH landing in a chain

**Lane Win During Trigger Chain:**
- Lane win is checked after EACH trigger resolves in a chain
- If a lane is won mid-chain, remaining triggers on that lane are cancelled and removed
- Triggers on OTHER lanes continue to fire normally

**Duplicate Trigger Behavior:**
- Stacking triggers: Each fires in order, may have cascading effects
- Duration effects (Freeze, Cloak, Blind, Sanctuary, Capture) use **independent timers**
- Multiple instances on the same lane/target run concurrently with separate countdowns
- While active simultaneously, the effect is effectively redundant
- Later-placed instances continue after earlier ones expire (useful for extending protection)

### Deferred Piece Rules

- Deferred pieces (Enlist, Ambush, Reinforce, Signal) ARE normal pieces
- CAN be removed by RemoveEnemy or other removal effects
- If removed before resolution, deferred effect is cancelled
- Removal triggers (Hydra, Backfire, Absorb) mark LANES, not pieces
- Removal of a piece on a marked lane by **RemoveEnemy (#2)** triggers the effect (other removal sources do not — see the shipped-scope note under Removal Triggers)
- **Example:** If a piece on a Hydra lane is removed by RemoveEnemy, Hydra fires (you get +2 pieces on random lanes)

**Nullify interaction:** When Nullify targets a lane with deferred pieces, the deferred EFFECT is cancelled but the piece itself remains as a normal piece. This differs from opponent removal (which removes both piece and effect). This asymmetry is intentional - Nullify has a "softer" cost when used on your own effects.

### Lane Win Cleanup

When a lane is won:
- ALL triggers on that lane are removed immediately
- ALL markers (Sanctuary, Capture, Freeze) are removed
- ALL deferred pieces on that lane are removed (effects cancelled)
- Won lanes excluded from all future targeting

### Iterative vs Atomic Operations

**Iterative (win check after each piece):**
- Scatter, Disperse, Scramble, Gambit, Echo, Hydra, Split, and all multi-piece placements
- Lane win AND game win checked after EACH piece lands
- If lane won mid-operation, that lane excluded from remaining placements
- If game won mid-operation, perk terminates immediately
- Triggers fire for each landing

**Atomic (no mid-operation win check):**
- Regroup, Disrupt (swap operations)
- All pieces removed first, then all placed
- Single win check after operation completes

---

## Appendix: Perk Quick Reference

### Fixed Commons (Slots 1-2)

| # | Name | Category | Target | Timing | Short Effect |
|---|------|----------|--------|--------|--------------|
| 1 | PlaceAnother | Offensive | Choose your lane | Instant | +1 your piece |
| 2 | RemoveEnemy | Offensive | Choose enemy lane | Instant | -1 enemy piece |

### Slot 3 Pool: React & Protect (15 perks)

| # | Name | Category | Target | Timing | Short Effect |
|---|------|----------|--------|--------|--------------|
| 4 | Freeze | Defensive | Choose your lane | Duration | Block lane for 1 turn |
| 22 | Cloak | Defensive | Auto (all yours) | Duration | Hide your pieces (2 turns) |
| 24 | Portal | Defensive | Choose enemy lane | Trigger | Placed piece teleports |
| 25 | Trap | Defensive | Choose enemy lane | Trigger | Placed piece vanishes |
| 26 | Mirror | Defensive | Choose enemy lane | Trigger | You get +2 same lane |
| 27 | Echo | Defensive | Choose enemy lane | Trigger | You get +2 random lanes |
| 28 | Shockwave | Offensive | Choose enemy lane | Trigger | Enemy loses 2 elsewhere |
| 29 | Hydra | Defensive | Choose your lane | Trigger | You get +2 on removal |
| 30 | Backfire | Offensive | Choose your lane | Trigger | Enemy loses 2 on removal |
| 33 | Regroup | Utility | Choose 2 your lanes | Instant | Swap your pieces between lanes |
| 35 | Scatter | Utility | Choose your lane | Instant | Spread your pieces to random |
| 43 | Signal | Utility | Choose your lane | Deferred | Pull piece from most populated |
| 46 | Absorb | Defensive | Choose your lane | Trigger | Removed piece reappears |
| 49 | Sanctuary | Defensive | Choose your lane | Duration | Removed pieces go here |
| 52 | Retaliate | Offensive | Choose your lane | Trigger | Enemy placement spawns raid |

### Slot 4 Pool: Act & Disrupt (15 perks)

| # | Name | Category | Target | Timing | Short Effect |
|---|------|----------|--------|--------|--------------|
| 13 | Scramble | Offensive | Auto (all enemy) | Instant | Redistribute all enemy pieces |
| 23 | Blind | Offensive | Auto (all enemy) | Duration | Hide enemy pieces from them |
| 31 | Split | Utility | Choose your piece | Instant | Sacrifice 1 → get 2 random |
| 32 | Kamikaze | Offensive | Choose your piece | Instant | Sacrifice 1 → enemy -2 |
| 34 | Disrupt | Offensive | Choose 2 enemy lanes | Instant | Swap enemy pieces between lanes |
| 36 | Disperse | Offensive | Choose enemy lane | Instant | Spread enemy pieces to random |
| 37 | Gambit | Utility | Auto | Instant | Enemy +3 spread, you +2 concentrated |
| 38 | Steal | Offensive | Auto | Instant | Enemy -1 random, you +1 random |
| 39 | Rush | Offensive | Choose lane | Instant | Both +2 same lane, you -1 elsewhere |
| 40 | Enlist | Offensive | Choose your lane | Deferred | Capture + relocate enemy piece |
| 41 | Ambush | Offensive | Choose your lane | Deferred | Remove enemy from lane/adjacent |
| 42 | Reinforce | Utility | Choose your lane | Deferred | +1 bonus piece next turn |
| 48 | Nullify | Utility | Choose your lane | Instant | Cancel all triggers & markers on a lane |
| 50 | Capture | Offensive | Choose your lane | Duration | Removed enemies become yours |
| 51 | Raid | Offensive | Choose enemy lane | Deferred | Place on enemy side, roll for recruits |

*Note: Slot allocation is experimental and subject to balancing changes.*

---

## Appendix: Verification Checklist

This checklist confirms all ambiguities have been resolved in this document:

- [x] What are perk IDs vs sequential numbers? → Permanent IDs, gaps are intentional
- [x] How does Cloak/Blind affect targeting? → Cloak blocks RemoveEnemy/Disrupt/Disperse targeting; Blind is visual-only
- [x] What order do triggers fire when multiple exist? → FIFO by placement order
- [x] What can Nullify target? → Your lane only (defensive perk)
- [x] Who wins if both fill a lane simultaneously? → First to fill / action order
- [x] Do Portal-teleported pieces trigger destination effects? → Yes
- [x] Does Freeze pause Sanctuary/Capture? → No. Freeze ONLY blocks placement; other effects continue normally.
- [x] Can you have multiple Raids? → Yes, unlimited
- [x] Do triggers fire once or multiple times? → Once, then removed
- [x] Do deferred pieces trigger removal effects? → Yes
- [x] What happens to triggers when lane is won mid-chain? → Cancelled and removed
- [x] What if Rush has no pieces elsewhere? → Lose from same lane
- [x] What if Gambit's lane fills? → Second piece lost
- [x] What happens to Raid on won lane? → Counts for winner, no raid effect
