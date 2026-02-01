package models

import (
	"testing"
)

// ============================================================================
// PlayerSide Tests
// ============================================================================

func TestPlayerSide_Opponent(t *testing.T) {
	if Player1.Opponent() != Player2 {
		t.Error("Player1's opponent should be Player2")
	}
	if Player2.Opponent() != Player1 {
		t.Error("Player2's opponent should be Player1")
	}
}

func TestPlayerSide_String(t *testing.T) {
	if Player1.String() != "player1" {
		t.Errorf("Expected 'player1', got '%s'", Player1.String())
	}
	if Player2.String() != "player2" {
		t.Errorf("Expected 'player2', got '%s'", Player2.String())
	}
}

// ============================================================================
// Lane Tests
// ============================================================================

func TestLane_CountPieces(t *testing.T) {
	lane := NewLane()

	if lane.CountPieces(Player1) != 0 {
		t.Error("New lane should have 0 pieces")
	}

	lane.Player1Slots[0] = true
	lane.Player1Slots[2] = true

	if lane.CountPieces(Player1) != 2 {
		t.Errorf("Expected 2 pieces, got %d", lane.CountPieces(Player1))
	}
	if lane.CountPieces(Player2) != 0 {
		t.Error("Player2 should have 0 pieces")
	}
}

func TestLane_IsSideFull(t *testing.T) {
	lane := NewLane()

	if lane.IsSideFull(Player1) {
		t.Error("Empty lane should not be full")
	}

	// Fill all slots
	for i := 0; i < DefaultSlotsPerSide; i++ {
		lane.Player1Slots[i] = true
	}

	if !lane.IsSideFull(Player1) {
		t.Error("Lane with all slots filled should be full")
	}
	if lane.IsSideFull(Player2) {
		t.Error("Player2's side should not be full")
	}
}

func TestLane_IsFrozenFor(t *testing.T) {
	lane := NewLane()

	if lane.IsFrozenFor(Player1) {
		t.Error("New lane should not be frozen")
	}

	lane.SetFreeze(Player1, 2)

	if !lane.IsFrozenFor(Player1) {
		t.Error("Lane should be frozen for Player1")
	}
	if lane.IsFrozenFor(Player2) {
		t.Error("Lane should not be frozen for Player2")
	}
}

func TestLane_DecrementFreeze(t *testing.T) {
	lane := NewLane()
	lane.SetFreeze(Player2, 2)

	lane.DecrementFreeze()
	if lane.FreezeTurns != 1 {
		t.Errorf("Expected 1 turn left, got %d", lane.FreezeTurns)
	}

	lane.DecrementFreeze()
	if lane.FreezeTurns != 0 {
		t.Error("Freeze should be expired")
	}
	if lane.FreezePlayer != 0 {
		t.Error("FreezePlayer should be cleared when expired")
	}
}

func TestLane_GetNextEmptySlot(t *testing.T) {
	lane := NewLane()

	slot := lane.GetNextEmptySlot(Player1)
	if slot != 0 {
		t.Errorf("Expected slot 0, got %d", slot)
	}

	lane.Player1Slots[0] = true
	lane.Player1Slots[1] = true

	slot = lane.GetNextEmptySlot(Player1)
	if slot != 2 {
		t.Errorf("Expected slot 2, got %d", slot)
	}

	// Fill all slots
	for i := 0; i < DefaultSlotsPerSide; i++ {
		lane.Player1Slots[i] = true
	}

	slot = lane.GetNextEmptySlot(Player1)
	if slot != -1 {
		t.Error("Should return -1 when lane is full")
	}
}

func TestLane_IsWon(t *testing.T) {
	lane := NewLane()

	if lane.IsWon() {
		t.Error("New lane should not be won")
	}

	lane.Winner = Player1
	if !lane.IsWon() {
		t.Error("Lane with winner should be won")
	}
}

// ============================================================================
// Lane Trigger Tests
// ============================================================================

func TestLane_AddTrigger(t *testing.T) {
	lane := NewLane()
	trigger := Trigger{
		Type:      TriggerMirror,
		Owner:     Player1,
		TurnsLeft: 2,
		OrderID:   0,
	}

	lane.AddTrigger(trigger)

	if len(lane.Triggers) != 1 {
		t.Errorf("Expected 1 trigger, got %d", len(lane.Triggers))
	}
}

func TestLane_HasTriggerType(t *testing.T) {
	lane := NewLane()

	if lane.HasTriggerType(TriggerPortal) {
		t.Error("Empty lane should not have triggers")
	}

	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})

	if !lane.HasTriggerType(TriggerPortal) {
		t.Error("Lane should have Portal trigger")
	}
	if lane.HasTriggerType(TriggerTrap) {
		t.Error("Lane should not have Trap trigger")
	}
}

func TestLane_GetPlacementTriggers(t *testing.T) {
	lane := NewLane()

	// Add placement triggers for Player1
	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	lane.AddTrigger(Trigger{Type: TriggerMirror, Owner: Player1, TurnsLeft: 2, OrderID: 1})
	// Add removal trigger (should not be included)
	lane.AddTrigger(Trigger{Type: TriggerHydra, Owner: Player1, TurnsLeft: 2, OrderID: 2})

	// Get triggers that fire when Player2 places (owned by Player1)
	triggers := lane.GetPlacementTriggers(Player2)

	if len(triggers) != 2 {
		t.Errorf("Expected 2 placement triggers, got %d", len(triggers))
	}

	for _, tr := range triggers {
		if tr.Type == TriggerHydra {
			t.Error("Hydra (removal trigger) should not be in placement triggers")
		}
	}
}

func TestLane_GetRemovalTriggers(t *testing.T) {
	lane := NewLane()

	// Add removal triggers for Player1
	lane.AddTrigger(Trigger{Type: TriggerHydra, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	lane.AddTrigger(Trigger{Type: TriggerBackfire, Owner: Player1, TurnsLeft: 2, OrderID: 1})
	// Add placement trigger (should not be included)
	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 2})

	// Get triggers that fire when Player2 removes (owned by Player1)
	triggers := lane.GetRemovalTriggers(Player2)

	if len(triggers) != 2 {
		t.Errorf("Expected 2 removal triggers, got %d", len(triggers))
	}

	for _, tr := range triggers {
		if tr.Type == TriggerPortal {
			t.Error("Portal (placement trigger) should not be in removal triggers")
		}
	}
}

func TestLane_RemoveTriggerByOrderID(t *testing.T) {
	lane := NewLane()

	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	lane.AddTrigger(Trigger{Type: TriggerMirror, Owner: Player1, TurnsLeft: 2, OrderID: 1})
	lane.AddTrigger(Trigger{Type: TriggerTrap, Owner: Player1, TurnsLeft: 2, OrderID: 2})

	if !lane.RemoveTriggerByOrderID(1) {
		t.Error("Should successfully remove trigger")
	}

	if len(lane.Triggers) != 2 {
		t.Errorf("Expected 2 triggers after removal, got %d", len(lane.Triggers))
	}

	if lane.HasTriggerType(TriggerMirror) {
		t.Error("Mirror trigger should be removed")
	}

	// Try to remove non-existent trigger
	if lane.RemoveTriggerByOrderID(99) {
		t.Error("Should return false for non-existent trigger")
	}
}

func TestLane_DecrementTriggers(t *testing.T) {
	lane := NewLane()

	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	lane.AddTrigger(Trigger{Type: TriggerMirror, Owner: Player1, TurnsLeft: 1, OrderID: 1})

	lane.DecrementTriggers()

	if len(lane.Triggers) != 1 {
		t.Errorf("Expected 1 trigger after decrement, got %d", len(lane.Triggers))
	}

	if lane.HasTriggerType(TriggerMirror) {
		t.Error("Mirror trigger should be expired and removed")
	}
	if !lane.HasTriggerType(TriggerPortal) {
		t.Error("Portal trigger should still exist")
	}
}

func TestLane_ClearTriggers(t *testing.T) {
	lane := NewLane()

	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	lane.AddTrigger(Trigger{Type: TriggerMirror, Owner: Player1, TurnsLeft: 2, OrderID: 1})

	lane.ClearTriggers()

	if len(lane.Triggers) != 0 {
		t.Error("All triggers should be cleared")
	}
}

// ============================================================================
// Lane Deferred Tests
// ============================================================================

func TestLane_AddDeferred(t *testing.T) {
	lane := NewLane()
	deferred := DeferredEffect{
		Type:       DeferredReinforce,
		Owner:      Player1,
		TargetLane: 0,
	}

	lane.AddDeferred(deferred)

	if len(lane.Deferred) != 1 {
		t.Errorf("Expected 1 deferred effect, got %d", len(lane.Deferred))
	}
}

func TestLane_PopDeferredFor(t *testing.T) {
	lane := NewLane()

	lane.AddDeferred(DeferredEffect{Type: DeferredReinforce, Owner: Player1, TargetLane: 0})
	lane.AddDeferred(DeferredEffect{Type: DeferredSignal, Owner: Player2, TargetLane: 0})
	lane.AddDeferred(DeferredEffect{Type: DeferredAmbush, Owner: Player1, TargetLane: 0})

	owned := lane.PopDeferredFor(Player1)

	if len(owned) != 2 {
		t.Errorf("Expected 2 deferred effects for Player1, got %d", len(owned))
	}

	if len(lane.Deferred) != 1 {
		t.Errorf("Expected 1 remaining deferred effect, got %d", len(lane.Deferred))
	}

	if lane.Deferred[0].Owner != Player2 {
		t.Error("Remaining effect should belong to Player2")
	}
}

func TestLane_ClearDeferred(t *testing.T) {
	lane := NewLane()

	lane.AddDeferred(DeferredEffect{Type: DeferredReinforce, Owner: Player1, TargetLane: 0})
	lane.AddDeferred(DeferredEffect{Type: DeferredSignal, Owner: Player2, TargetLane: 0})

	lane.ClearDeferred()

	if len(lane.Deferred) != 0 {
		t.Error("All deferred effects should be cleared")
	}
}

func TestLane_ClearAllEffects(t *testing.T) {
	lane := NewLane()

	lane.AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	lane.AddDeferred(DeferredEffect{Type: DeferredReinforce, Owner: Player1, TargetLane: 0})
	lane.SetFreeze(Player2, 3)

	lane.ClearAllEffects()

	if len(lane.Triggers) != 0 {
		t.Error("Triggers should be cleared")
	}
	if len(lane.Deferred) != 0 {
		t.Error("Deferred effects should be cleared")
	}
	if lane.FreezeTurns != 0 || lane.FreezePlayer != 0 {
		t.Error("Freeze should be cleared")
	}
}

// ============================================================================
// LaneGame Tests
// ============================================================================

func TestNewLaneGame(t *testing.T) {
	game := NewLaneGame()

	if game.ID == "" {
		t.Error("Game ID should be set")
	}
	if game.CurrentPlayer != Player1 {
		t.Error("Current player should be Player1")
	}
	if game.Status != LaneStatusSetup {
		t.Error("Status should be setup")
	}
	if game.TurnNumber != 1 {
		t.Error("Turn number should be 1")
	}

	// Check lanes are initialized
	for i, lane := range game.Lanes {
		if lane == nil {
			t.Errorf("Lane %d should not be nil", i)
		}
	}
}

func TestLaneGame_SetSeed(t *testing.T) {
	game1 := NewLaneGame()
	game1.SetSeed(42)

	game2 := NewLaneGame()
	game2.SetSeed(42)

	// Same seed should produce same random sequence
	r1 := game1.Rand().Intn(100)
	r2 := game2.Rand().Intn(100)

	if r1 != r2 {
		t.Error("Same seed should produce same random numbers")
	}
}

func TestLaneGame_GetNextTriggerOrder(t *testing.T) {
	game := NewLaneGame()

	order1 := game.GetNextTriggerOrder()
	order2 := game.GetNextTriggerOrder()
	order3 := game.GetNextTriggerOrder()

	if order1 != 0 || order2 != 1 || order3 != 2 {
		t.Error("Trigger order should increment")
	}
}

// ============================================================================
// LaneGame Duration Effects Tests
// ============================================================================

func TestLaneGame_CloakAndBlind(t *testing.T) {
	game := NewLaneGame()

	// Test cloak
	if game.IsCloaked(Player1) {
		t.Error("Should not be cloaked initially")
	}

	game.SetCloaked(Player1, 2)
	if !game.IsCloaked(Player1) {
		t.Error("Should be cloaked after SetCloaked")
	}
	if game.IsCloaked(Player2) {
		t.Error("Player2 should not be affected")
	}

	// Test blind
	if game.IsBlinded(Player2) {
		t.Error("Should not be blinded initially")
	}

	game.SetBlinded(Player2, 3)
	if !game.IsBlinded(Player2) {
		t.Error("Should be blinded after SetBlinded")
	}
	if game.IsBlinded(Player1) {
		t.Error("Player1 should not be affected")
	}
}

func TestLaneGame_Sanctuary(t *testing.T) {
	game := NewLaneGame()

	game.AddSanctuary(Player1, 2, 3)
	game.AddSanctuary(Player1, 4, 2)

	if len(game.Player1Sanctuaries) != 2 {
		t.Errorf("Expected 2 sanctuaries, got %d", len(game.Player1Sanctuaries))
	}

	// Get valid sanctuary
	lane := game.GetSanctuaryLane(Player1)
	if lane != 2 && lane != 4 {
		t.Errorf("Expected sanctuary lane 2 or 4, got %d", lane)
	}

	// No sanctuary for Player2
	lane = game.GetSanctuaryLane(Player2)
	if lane != -1 {
		t.Error("Player2 should have no sanctuary")
	}
}

func TestLaneGame_Capture(t *testing.T) {
	game := NewLaneGame()

	game.AddCapture(Player1, 1, 2)
	game.AddCapture(Player1, 3, 3)

	if len(game.Player1Captures) != 2 {
		t.Errorf("Expected 2 captures, got %d", len(game.Player1Captures))
	}

	lane := game.GetCaptureLane(Player1)
	if lane != 1 && lane != 3 {
		t.Errorf("Expected capture lane 1 or 3, got %d", lane)
	}
}

// ============================================================================
// LaneGame Piece Placement/Removal Tests
// ============================================================================

func TestLaneGame_PlacePiece(t *testing.T) {
	game := NewLaneGame()

	if !game.PlacePiece(0, Player1) {
		t.Error("Should successfully place piece")
	}

	if game.Lanes[0].CountPieces(Player1) != 1 {
		t.Error("Lane should have 1 piece")
	}

	// Place more pieces
	for i := 0; i < DefaultSlotsPerSide-1; i++ {
		game.PlacePiece(0, Player1)
	}

	// Lane should be full now
	if game.PlacePiece(0, Player1) {
		t.Error("Should fail to place on full lane")
	}
}

func TestLaneGame_PlacePiece_InvalidLane(t *testing.T) {
	game := NewLaneGame()

	if game.PlacePiece(-1, Player1) {
		t.Error("Should fail with negative lane")
	}
	if game.PlacePiece(10, Player1) {
		t.Error("Should fail with out-of-bounds lane")
	}
}

func TestLaneGame_PlacePiece_WonLane(t *testing.T) {
	game := NewLaneGame()
	game.Lanes[0].Winner = Player2

	if game.PlacePiece(0, Player1) {
		t.Error("Should fail to place on won lane")
	}
}

func TestLaneGame_RemovePiece(t *testing.T) {
	game := NewLaneGame()

	// Place pieces
	game.PlacePiece(0, Player1)
	game.PlacePiece(0, Player1)
	game.PlacePiece(0, Player1)

	if !game.RemovePiece(0, Player1) {
		t.Error("Should successfully remove piece")
	}

	if game.Lanes[0].CountPieces(Player1) != 2 {
		t.Error("Should have 2 pieces after removal")
	}

	// Remove all pieces
	game.RemovePiece(0, Player1)
	game.RemovePiece(0, Player1)

	// Try to remove from empty
	if game.RemovePiece(0, Player1) {
		t.Error("Should fail to remove from empty lane")
	}
}

func TestLaneGame_RemovePieceWithRedirects_Capture(t *testing.T) {
	game := NewLaneGame()
	game.SetSeed(42)

	// Add capture zone for Player1
	game.AddCapture(Player1, 3, 2)

	// Add enemy piece
	game.PlacePiece(0, Player2)

	// Remove with redirect
	result := game.RemovePieceWithRedirects(0, Player2, Player1)

	if !result.Removed {
		t.Error("Piece should be removed")
	}
	if !result.Redirected {
		t.Error("Piece should be redirected")
	}
	if result.RedirectType != "capture" {
		t.Error("Redirect type should be 'capture'")
	}
	if result.Destination != 3 {
		t.Errorf("Destination should be capture lane 3, got %d", result.Destination)
	}
	if !result.Converted {
		t.Error("Piece should be converted to Player1's")
	}

	// Piece should be on capture lane as Player1's
	if game.Lanes[3].CountPieces(Player1) != 1 {
		t.Error("Captured piece should be on capture lane")
	}
}

func TestLaneGame_RemovePieceWithRedirects_Sanctuary(t *testing.T) {
	game := NewLaneGame()
	game.SetSeed(42)

	// Add sanctuary for Player2
	game.AddSanctuary(Player2, 4, 2)

	// Add enemy piece
	game.PlacePiece(0, Player2)

	// Remove with redirect (Player1 removing Player2's piece)
	result := game.RemovePieceWithRedirects(0, Player2, Player1)

	if !result.Removed {
		t.Error("Piece should be removed")
	}
	if !result.Redirected {
		t.Error("Piece should be redirected")
	}
	if result.RedirectType != "sanctuary" {
		t.Error("Redirect type should be 'sanctuary'")
	}
	if result.Converted {
		t.Error("Piece should NOT be converted (stays Player2's)")
	}

	// Piece should be on sanctuary lane as Player2's
	if game.Lanes[4].CountPieces(Player2) != 1 {
		t.Error("Piece should be on sanctuary lane")
	}
}

func TestLaneGame_RemovePieceWithRedirects_CapturePriority(t *testing.T) {
	game := NewLaneGame()
	game.SetSeed(42)

	// Both Capture and Sanctuary active
	game.AddCapture(Player1, 1, 2)
	game.AddSanctuary(Player2, 4, 2)

	game.PlacePiece(0, Player2)

	result := game.RemovePieceWithRedirects(0, Player2, Player1)

	if result.RedirectType != "capture" {
		t.Error("Capture should take priority over Sanctuary")
	}
	if game.Lanes[1].CountPieces(Player1) != 1 {
		t.Error("Piece should go to capture lane as Player1's")
	}
}

// ============================================================================
// LaneGame Lane/Game Win Tests
// ============================================================================

func TestLaneGame_CheckLaneWin(t *testing.T) {
	game := NewLaneGame()

	// Fill a lane
	for i := 0; i < DefaultSlotsPerSide; i++ {
		game.PlacePiece(0, Player1)
	}

	winner := game.CheckLaneWin(0)
	if winner != Player1 {
		t.Error("Lane should be won by Player1")
	}
	if game.Player1LanesWon != 1 {
		t.Error("Player1LanesWon should be 1")
	}

	// Check again (should return same winner)
	winner = game.CheckLaneWin(0)
	if winner != Player1 {
		t.Error("Should still return Player1 as winner")
	}
}

func TestLaneGame_CheckGameWin(t *testing.T) {
	game := NewLaneGame()

	// Win 2 lanes
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < DefaultSlotsPerSide; i++ {
			game.PlacePiece(lane, Player1)
		}
		game.CheckLaneWin(lane)
	}

	// Not yet won
	if game.CheckGameWin() != 0 {
		t.Error("Game should not be won with 2 lanes")
	}

	// Win 3rd lane
	for i := 0; i < DefaultSlotsPerSide; i++ {
		game.PlacePiece(2, Player1)
	}
	game.CheckLaneWin(2)

	winner := game.CheckGameWin()
	if winner != Player1 {
		t.Error("Game should be won by Player1")
	}
	if game.Status != LaneStatusFinished {
		t.Error("Game status should be finished")
	}
}

// ============================================================================
// LaneGame Available Lanes Tests
// ============================================================================

func TestLaneGame_GetAvailableLanes(t *testing.T) {
	game := NewLaneGame()

	available := game.GetAvailableLanes(Player1)
	if len(available) != DefaultLaneCount {
		t.Errorf("Expected %d available lanes, got %d", DefaultLaneCount, len(available))
	}

	// Win a lane
	game.Lanes[0].Winner = Player2

	// Fill a lane
	for i := 0; i < DefaultSlotsPerSide; i++ {
		game.PlacePiece(1, Player1)
	}

	// Freeze a lane
	game.Lanes[2].SetFreeze(Player1, 2)

	available = game.GetAvailableLanes(Player1)
	if len(available) != 2 {
		t.Errorf("Expected 2 available lanes (3,4), got %d", len(available))
	}
}

func TestLaneGame_GetAvailableLanesIgnoreFreeze(t *testing.T) {
	game := NewLaneGame()

	// Freeze a lane
	game.Lanes[2].SetFreeze(Player1, 2)

	available := game.GetAvailableLanes(Player1)
	availableIgnoreFreeze := game.GetAvailableLanesIgnoreFreeze(Player1)

	if len(availableIgnoreFreeze) != len(available)+1 {
		t.Error("GetAvailableLanesIgnoreFreeze should include frozen lane")
	}
}

func TestLaneGame_GetNonEmptyLanes(t *testing.T) {
	game := NewLaneGame()

	nonEmpty := game.GetNonEmptyLanes(Player1)
	if len(nonEmpty) != 0 {
		t.Error("No lanes should have pieces initially")
	}

	game.PlacePiece(1, Player1)
	game.PlacePiece(3, Player1)

	nonEmpty = game.GetNonEmptyLanes(Player1)
	if len(nonEmpty) != 2 {
		t.Errorf("Expected 2 non-empty lanes, got %d", len(nonEmpty))
	}
}

// ============================================================================
// LaneGame AutoPlace Tests
// ============================================================================

func TestLaneGame_AutoPlace(t *testing.T) {
	game := NewLaneGame()
	game.SetSeed(42)

	laneIdx := game.AutoPlace(Player1)
	if laneIdx < 0 || laneIdx >= DefaultLaneCount {
		t.Errorf("AutoPlace should return valid lane index, got %d", laneIdx)
	}

	if game.Lanes[laneIdx].CountPieces(Player1) != 1 {
		t.Error("Piece should be placed on returned lane")
	}
}

func TestLaneGame_AutoPlace_NoAvailable(t *testing.T) {
	game := NewLaneGame()

	// Win all lanes
	for i := 0; i < DefaultLaneCount; i++ {
		game.Lanes[i].Winner = Player2
	}

	laneIdx := game.AutoPlace(Player1)
	if laneIdx != -1 {
		t.Error("Should return -1 when no lanes available")
	}
}

// ============================================================================
// LaneGame Turn Switching Tests
// ============================================================================

func TestLaneGame_SwitchTurn(t *testing.T) {
	game := NewLaneGame()
	game.Status = LaneStatusPlaying

	if game.CurrentPlayer != Player1 {
		t.Error("Should start with Player1")
	}

	game.SwitchTurn()

	if game.CurrentPlayer != Player2 {
		t.Error("Should be Player2 after switch")
	}
	if game.TurnNumber != 2 {
		t.Error("Turn number should increment")
	}
	if game.CurrentPhase != PhaseRaidResolution {
		t.Error("Phase should reset to RaidResolution")
	}
}

func TestLaneGame_SwitchTurn_DecrementsDuration(t *testing.T) {
	game := NewLaneGame()
	game.Status = LaneStatusPlaying

	// Set up duration effects
	game.Player1Cloaked = 2
	game.Player2Blinded = 1
	game.Lanes[0].SetFreeze(Player2, 2)
	game.Lanes[1].AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 1, OrderID: 0})
	game.AddSanctuary(Player1, 2, 2)
	game.AddCapture(Player2, 3, 1)
	game.PendingRaids = append(game.PendingRaids, PendingRaid{
		Owner:             Player1,
		Lane:              4,
		TurnsUntilResolve: 2,
	})

	game.SwitchTurn()

	// Check decremented values
	if game.Player1Cloaked != 1 {
		t.Error("Cloak duration should decrement")
	}
	if game.Player2Blinded != 0 {
		t.Error("Blind duration should decrement to 0")
	}
	if game.Lanes[0].FreezeTurns != 1 {
		t.Error("Freeze duration should decrement")
	}
	if game.Lanes[1].HasTriggerType(TriggerPortal) {
		t.Error("Expired trigger should be removed")
	}
	if len(game.Player1Sanctuaries) != 1 {
		t.Error("Sanctuary should still exist (1 turn left)")
	}
	if len(game.Player2Captures) != 0 {
		t.Error("Expired capture should be removed")
	}
	if game.PendingRaids[0].TurnsUntilResolve != 1 {
		t.Error("Raid timer should decrement")
	}
}

func TestLaneGame_AdvancePhase(t *testing.T) {
	game := NewLaneGame()
	game.Status = LaneStatusPlaying

	phases := []LaneTurnPhase{
		PhaseRaidResolution,
		PhaseDeferredResolution,
		PhaseAutoPlacement,
		PhasePerkSelection,
	}

	for i, expectedPhase := range phases {
		if game.CurrentPhase != expectedPhase {
			t.Errorf("Step %d: Expected phase %s, got %s", i, expectedPhase, game.CurrentPhase)
		}
		game.AdvancePhase()
	}

	// After PerkSelection, should switch turn and go back to RaidResolution
	if game.CurrentPhase != PhaseRaidResolution {
		t.Error("Should reset to RaidResolution after turn ends")
	}
	if game.CurrentPlayer != Player2 {
		t.Error("Should switch to Player2")
	}
}

// ============================================================================
// LaneGame Cleanup Tests
// ============================================================================

func TestLaneGame_CleanupWonLane(t *testing.T) {
	game := NewLaneGame()
	laneIdx := 2

	// Set up various effects on the lane
	game.Lanes[laneIdx].AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	game.Lanes[laneIdx].AddDeferred(DeferredEffect{Type: DeferredReinforce, Owner: Player1, TargetLane: laneIdx})
	game.Lanes[laneIdx].SetFreeze(Player2, 2)
	game.AddSanctuary(Player1, laneIdx, 2)
	game.AddCapture(Player2, laneIdx, 2)
	game.PendingRaids = append(game.PendingRaids, PendingRaid{
		Owner:             Player1,
		Lane:              laneIdx,
		TurnsUntilResolve: 2,
	})

	game.CleanupWonLane(laneIdx)

	// All effects should be cleared
	if len(game.Lanes[laneIdx].Triggers) != 0 {
		t.Error("Triggers should be cleared")
	}
	if len(game.Lanes[laneIdx].Deferred) != 0 {
		t.Error("Deferred should be cleared")
	}
	if game.Lanes[laneIdx].FreezeTurns != 0 {
		t.Error("Freeze should be cleared")
	}
	if len(game.Player1Sanctuaries) != 0 {
		t.Error("Sanctuary pointing to won lane should be removed")
	}
	if len(game.Player2Captures) != 0 {
		t.Error("Capture pointing to won lane should be removed")
	}
	if len(game.PendingRaids) != 0 {
		t.Error("Raids on won lane should be removed")
	}
}

// ============================================================================
// LaneGame Clone Tests
// ============================================================================

func TestLaneGame_Clone(t *testing.T) {
	game := NewLaneGame()
	game.SetSeed(42)
	game.Status = LaneStatusPlaying

	// Set up some state
	game.PlacePiece(0, Player1)
	game.PlacePiece(1, Player2)
	game.Lanes[2].AddTrigger(Trigger{Type: TriggerPortal, Owner: Player1, TurnsLeft: 2, OrderID: 0})
	game.AddSanctuary(Player1, 3, 2)
	game.Player1Cloaked = 1

	clone := game.Clone()

	// Verify clone is independent
	if clone.ID != game.ID {
		t.Error("Clone should have same ID")
	}

	// Modify original
	game.PlacePiece(0, Player1)
	game.Lanes[2].ClearTriggers()
	game.Player1Cloaked = 0

	// Clone should be unaffected
	if clone.Lanes[0].CountPieces(Player1) != 1 {
		t.Error("Clone should have original piece count")
	}
	if len(clone.Lanes[2].Triggers) != 1 {
		t.Error("Clone should have original triggers")
	}
	if clone.Player1Cloaked != 1 {
		t.Error("Clone should have original cloak duration")
	}
}

// ============================================================================
// LaneGame Player Tests
// ============================================================================

func TestLaneGame_GetPlayer(t *testing.T) {
	game := NewLaneGame()
	game.Player1 = &LanePlayer{ID: "p1", Side: Player1}
	game.Player2 = &LanePlayer{ID: "p2", Side: Player2}

	p := game.GetPlayer(Player1)
	if p.ID != "p1" {
		t.Error("Should return Player1")
	}

	p = game.GetPlayer(Player2)
	if p.ID != "p2" {
		t.Error("Should return Player2")
	}
}

func TestLaneGame_GetPlayerByConnectionID(t *testing.T) {
	game := NewLaneGame()
	game.Player1 = &LanePlayer{ID: "p1", ConnectionID: "conn1", Side: Player1}
	game.Player2 = &LanePlayer{ID: "p2", ConnectionID: "conn2", Side: Player2}

	p := game.GetPlayerByConnectionID("conn1")
	if p == nil || p.ID != "p1" {
		t.Error("Should find Player1 by connection ID")
	}

	p = game.GetPlayerByConnectionID("conn2")
	if p == nil || p.ID != "p2" {
		t.Error("Should find Player2 by connection ID")
	}

	p = game.GetPlayerByConnectionID("unknown")
	if p != nil {
		t.Error("Should return nil for unknown connection ID")
	}
}

func TestLaneGame_GetLanesWon(t *testing.T) {
	game := NewLaneGame()
	game.Player1LanesWon = 2
	game.Player2LanesWon = 1

	if game.GetLanesWon(Player1) != 2 {
		t.Error("Player1 should have 2 lanes won")
	}
	if game.GetLanesWon(Player2) != 1 {
		t.Error("Player2 should have 1 lane won")
	}
}
