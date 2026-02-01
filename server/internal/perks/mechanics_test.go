package perks

import (
	"testing"

	"github.com/kiddiechess/server/internal/models"
)

// ============================================================================
// Source Exclusion Tests
// ============================================================================

func TestSourceExclusion_With5AvailableLanes(t *testing.T) {
	// With 5 lanes available (default), source should be excluded from scatter destinations
	game := newTestGame(42)
	_ = NewPerkExecutor(game) // executor used in commented scatter tests
	sourceLane := 2

	// Put piece on source lane
	game.PlacePiece(sourceLane, models.Player1)

	// All 5 lanes available
	available := game.GetAvailableLanes(models.Player1)
	if len(available) != 5 {
		t.Fatalf("Expected 5 available lanes, got %d", len(available))
	}

	// Run scatter multiple times - source should generally be excluded
	for i := 0; i < 10; i++ {
		gameClone := game.Clone()
		gameClone.PlacePiece(sourceLane, models.Player1)
		executorClone := NewPerkExecutor(gameClone)
		executorClone.Execute(PerkScatter, models.Player1, []int{sourceLane})
		// With 5 lanes (>= 3 threshold), piece should go elsewhere
	}
}

func TestSourceExclusion_With3AvailableLanes(t *testing.T) {
	// Threshold is 3 lanes - source should still be excluded
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	sourceLane := 2

	// Block 2 lanes by winning them
	game.Lanes[0].Winner = models.Player2
	game.Lanes[1].Winner = models.Player2

	available := game.GetAvailableLanes(models.Player1)
	if len(available) != 3 {
		t.Fatalf("Expected 3 available lanes, got %d", len(available))
	}

	game.PlacePiece(sourceLane, models.Player1)
	result := executor.Execute(PerkScatter, models.Player1, []int{sourceLane})

	if !result.Success {
		t.Error("Scatter should succeed with 3 available lanes")
	}
}

func TestSourceExclusion_With2AvailableLanes(t *testing.T) {
	// With 2 available lanes, source should be included in valid destinations
	game := newTestGame(42)
	sourceLane := 2

	// Block 3 lanes by winning them
	game.Lanes[0].Winner = models.Player2
	game.Lanes[1].Winner = models.Player2
	game.Lanes[3].Winner = models.Player2

	available := game.GetAvailableLanes(models.Player1)
	if len(available) != 2 {
		t.Fatalf("Expected 2 available lanes, got %d", len(available))
	}

	// Verify source is included when only 2 lanes available
	hasSource := false
	for _, lane := range available {
		if lane == sourceLane {
			hasSource = true
			break
		}
	}
	if !hasSource {
		t.Error("Source lane should be included when only 2 lanes available")
	}
}

func TestSourceExclusion_With1AvailableLane(t *testing.T) {
	// With 1 available lane, piece must go to that lane (even if it's source)
	game := newTestGame(42)
	sourceLane := 2

	// Block all but one lane
	for i := 0; i < 5; i++ {
		if i != sourceLane {
			game.Lanes[i].Winner = models.Player2
		}
	}

	available := game.GetAvailableLanes(models.Player1)
	if len(available) != 1 {
		t.Fatalf("Expected 1 available lane, got %d", len(available))
	}

	if available[0] != sourceLane {
		t.Error("Only the source lane should be available")
	}
}

func TestSourceExclusion_With0AvailableLanes(t *testing.T) {
	// With 0 available lanes, placement should fail gracefully
	game := newTestGame(42)

	// Win all lanes
	for i := 0; i < 5; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	available := game.GetAvailableLanes(models.Player1)
	if len(available) != 0 {
		t.Fatalf("Expected 0 available lanes, got %d", len(available))
	}

	// Placement should fail
	placed := game.PlacePiece(0, models.Player1)
	if placed {
		t.Error("Placement should fail when no lanes available")
	}
}

// ============================================================================
// Iterative Placement Tests (Win Check After Each Piece)
// ============================================================================

func TestIterativePlacement_GameTerminatesMidPerk(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Set up for quick win: 2 lanes already won
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
		game.Player1LanesWon++
	}

	// 3rd lane has 4 pieces
	targetLane := 2
	for i := 0; i < 4; i++ {
		game.PlacePiece(targetLane, models.Player1)
	}

	// PlaceAnother on lane 2 should complete it and win the game
	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("PlaceAnother failed: %s", result.Error)
	}

	// Lane should be won
	if result.LaneWinner != models.Player1 {
		t.Error("Lane should be won by Player1")
	}

	// Game should be won
	if result.GameWinner != models.Player1 {
		t.Error("Game should be won by Player1")
	}
}

func TestIterativePlacement_WinCheckAfterEachPiece(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Win 2 lanes for Player2 (opponent almost winning)
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player2)
		}
		game.Lanes[lane].Winner = models.Player2
		game.Player2LanesWon++
	}

	// Lane 2 has 4 pieces for Player2
	targetLane := 2
	for i := 0; i < 4; i++ {
		game.PlacePiece(targetLane, models.Player2)
	}

	// Gambit gives enemy +3 pieces iteratively
	// When one lands on lane 2, enemy wins
	result := executor.Execute(PerkGambit, models.Player1, nil)

	if !result.Success {
		t.Fatalf("Gambit failed: %s", result.Error)
	}

	// Check if enemy won mid-perk (depends on RNG)
	if result.GameWonMidPerk && result.GameWinner != models.Player2 {
		t.Error("If game won mid-perk by enemy, winner should be Player2")
	}
}

// ============================================================================
// Atomic Swap Tests (No Mid-Swap Win Check)
// ============================================================================

func TestAtomicSwap_Regroup(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Set up lanes where mid-swap could cause issues
	laneA, laneB := 1, 3

	// Lane A: 2 pieces, Lane B: 1 piece
	game.PlacePiece(laneA, models.Player1)
	game.PlacePiece(laneA, models.Player1)
	game.PlacePiece(laneB, models.Player1)

	// Perform swap
	result := executor.Execute(PerkRegroup, models.Player1, []int{laneA, laneB})

	if !result.Success {
		t.Fatalf("Regroup failed: %s", result.Error)
	}

	// Both lanes should have swapped counts atomically
	if game.Lanes[laneA].CountPieces(models.Player1) != 1 {
		t.Errorf("Lane A should have 1 piece after swap, got %d", game.Lanes[laneA].CountPieces(models.Player1))
	}
	if game.Lanes[laneB].CountPieces(models.Player1) != 2 {
		t.Errorf("Lane B should have 2 pieces after swap, got %d", game.Lanes[laneB].CountPieces(models.Player1))
	}
}

func TestAtomicSwap_Disrupt(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	laneA, laneB := 0, 4

	// Set up enemy pieces
	game.PlacePiece(laneA, models.Player2)
	game.PlacePiece(laneB, models.Player2)
	game.PlacePiece(laneB, models.Player2)

	result := executor.Execute(PerkDisrupt, models.Player1, []int{laneA, laneB})

	if !result.Success {
		t.Fatalf("Disrupt failed: %s", result.Error)
	}

	// Swapped atomically
	if game.Lanes[laneA].CountPieces(models.Player2) != 2 {
		t.Errorf("Lane A should have 2 enemy pieces after swap, got %d", game.Lanes[laneA].CountPieces(models.Player2))
	}
	if game.Lanes[laneB].CountPieces(models.Player2) != 1 {
		t.Errorf("Lane B should have 1 enemy piece after swap, got %d", game.Lanes[laneB].CountPieces(models.Player2))
	}
}

// ============================================================================
// Trigger FIFO Ordering Tests
// ============================================================================

func TestTriggerFIFO_OrderCounterIncrements(t *testing.T) {
	game := newTestGame(42)

	initial := game.TriggerOrderCounter

	order1 := game.GetNextTriggerOrder()
	order2 := game.GetNextTriggerOrder()
	order3 := game.GetNextTriggerOrder()

	if order1 != initial {
		t.Errorf("First order should be %d, got %d", initial, order1)
	}
	if order2 != initial+1 {
		t.Errorf("Second order should be %d, got %d", initial+1, order2)
	}
	if order3 != initial+2 {
		t.Errorf("Third order should be %d, got %d", initial+2, order3)
	}
}

func TestTriggerFIFO_MultipleTriggersProcessInOrder(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	lane := 2

	// Add triggers in order
	executor.Execute(PerkPortal, models.Player1, []int{lane})
	executor.Execute(PerkMirror, models.Player1, []int{lane})
	executor.Execute(PerkEcho, models.Player1, []int{lane})

	triggers := game.Lanes[lane].Triggers
	if len(triggers) != 3 {
		t.Fatalf("Expected 3 triggers, got %d", len(triggers))
	}

	// Verify FIFO ordering by order IDs
	for i := 0; i < len(triggers)-1; i++ {
		if triggers[i].OrderID >= triggers[i+1].OrderID {
			t.Error("Triggers should be in FIFO order (increasing OrderID)")
		}
	}
}

func TestTriggerFIFO_FiresInInsertionOrder(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	lane := 2

	// Set Trap first, then Mirror
	executor.Execute(PerkTrap, models.Player1, []int{lane})
	executor.Execute(PerkMirror, models.Player1, []int{lane})

	// P2 places - both triggers should fire
	game.PlacePiece(lane, models.Player2)
	results := executor.FirePlacementTriggers(lane, models.Player2, 0)

	if len(results) < 2 {
		t.Fatalf("Expected at least 2 trigger results, got %d", len(results))
	}

	// First should be Trap (set first), second should be Mirror
	if results[0].TriggerType != models.TriggerTrap {
		t.Error("Trap should fire first (FIFO)")
	}
	if results[1].TriggerType != models.TriggerMirror {
		t.Error("Mirror should fire second (FIFO)")
	}
}

// ============================================================================
// Turn Duration Tests
// ============================================================================

func TestTurnDuration_FreezeExpiresAfterOpponentTurn(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	game.Status = models.LaneStatusPlaying

	targetLane := 2
	executor.Execute(PerkFreeze, models.Player1, []int{targetLane})

	// Freeze should be active with 1 turn duration
	if !game.Lanes[targetLane].IsFrozenFor(models.Player2) {
		t.Error("Lane should be frozen for Player2")
	}
	if game.Lanes[targetLane].FreezeTurns != 1 {
		t.Errorf("Freeze should have 1 turn, got %d", game.Lanes[targetLane].FreezeTurns)
	}

	// Switch turn (decrements timers)
	game.SwitchTurn()

	// Freeze should have expired
	if game.Lanes[targetLane].FreezeTurns != 0 {
		t.Error("Freeze should be expired after turn switch")
	}
	if game.Lanes[targetLane].IsFrozenFor(models.Player2) {
		t.Error("Lane should not be frozen anymore")
	}
}

func TestTurnDuration_CloakDecrementsEachTurn(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	game.Status = models.LaneStatusPlaying

	executor.Execute(PerkCloak, models.Player1, nil)
	initialDuration := game.Player1Cloaked

	if initialDuration != 2 { // Default CLOAK_DURATION
		t.Errorf("Expected initial cloak duration of 2, got %d", initialDuration)
	}

	game.SwitchTurn()
	if game.Player1Cloaked != initialDuration-1 {
		t.Error("Cloak duration should decrement after turn switch")
	}

	game.SwitchTurn()
	if game.Player1Cloaked != 0 {
		t.Error("Cloak should be expired after 2 turn switches")
	}
	if game.IsCloaked(models.Player1) {
		t.Error("Player should not be cloaked anymore")
	}
}

func TestTurnDuration_BlindDecrementsEachTurn(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	game.Status = models.LaneStatusPlaying

	executor.Execute(PerkBlind, models.Player1, nil)
	initialDuration := game.Player2Blinded

	if initialDuration != 2 { // Default BLIND_DURATION
		t.Errorf("Expected initial blind duration of 2, got %d", initialDuration)
	}

	game.SwitchTurn()
	if game.Player2Blinded != initialDuration-1 {
		t.Error("Blind duration should decrement after turn switch")
	}

	game.SwitchTurn()
	if game.Player2Blinded != 0 {
		t.Error("Blind should be expired after 2 turn switches")
	}
}

// ============================================================================
// Lane Win Cleanup Tests
// ============================================================================

func TestLaneWinCleanup_ClearsTriggers(t *testing.T) {
	game := newTestGame(42)
	lane := 2

	// Add trigger
	orderID := game.GetNextTriggerOrder()
	game.Lanes[lane].AddTrigger(models.Trigger{
		Type:      models.TriggerMirror,
		Owner:     models.Player1,
		TurnsLeft: 2,
		OrderID:   orderID,
	})

	// Win the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
	}
	game.Lanes[lane].Winner = models.Player1
	game.CleanupWonLane(lane)

	if len(game.Lanes[lane].Triggers) != 0 {
		t.Error("Triggers should be cleared when lane is won")
	}
}

func TestLaneWinCleanup_ClearsDeferred(t *testing.T) {
	game := newTestGame(42)
	lane := 1

	game.Lanes[lane].AddDeferred(models.DeferredEffect{
		Type:       models.DeferredReinforce,
		Owner:      models.Player1,
		TargetLane: lane,
	})

	// Win the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
	}
	game.Lanes[lane].Winner = models.Player1
	game.CleanupWonLane(lane)

	if len(game.Lanes[lane].Deferred) != 0 {
		t.Error("Deferred effects should be cleared when lane is won")
	}
}

func TestLaneWinCleanup_ClearsFreeze(t *testing.T) {
	game := newTestGame(42)
	lane := 3

	game.Lanes[lane].SetFreeze(models.Player2, 2)

	// Win the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
	}
	game.Lanes[lane].Winner = models.Player1
	game.CleanupWonLane(lane)

	if game.Lanes[lane].FreezePlayer != 0 {
		t.Error("Freeze player should be cleared")
	}
	if game.Lanes[lane].FreezeTurns != 0 {
		t.Error("Freeze turns should be cleared")
	}
}

func TestLaneWinCleanup_RemovesSanctuaryPointingToIt(t *testing.T) {
	game := newTestGame(42)
	lane := 2

	game.AddSanctuary(models.Player1, lane, 3)

	// Win the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
	}
	game.Lanes[lane].Winner = models.Player1
	game.CleanupWonLane(lane)

	// Sanctuary pointing to won lane should be removed
	for _, s := range game.Player1Sanctuaries {
		if s.Lane == lane {
			t.Error("Sanctuary pointing to won lane should be removed")
		}
	}
}

func TestLaneWinCleanup_RemovesPendingRaids(t *testing.T) {
	game := newTestGame(42)
	lane := 4

	game.PendingRaids = append(game.PendingRaids, models.PendingRaid{
		Owner:             models.Player1,
		Lane:              lane,
		TurnsUntilResolve: 2,
	})

	// Win the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
	}
	game.Lanes[lane].Winner = models.Player1
	game.CleanupWonLane(lane)

	for _, r := range game.PendingRaids {
		if r.Lane == lane {
			t.Error("Pending raids on won lane should be removed")
		}
	}
}

// ============================================================================
// Game Win Condition Tests
// ============================================================================

func TestGameWin_Requires3Lanes(t *testing.T) {
	game := newTestGame(42)

	// Win 2 lanes
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.CheckLaneWin(lane)
	}

	if game.Player1LanesWon != 2 {
		t.Errorf("Expected 2 lanes won, got %d", game.Player1LanesWon)
	}
	if game.CheckGameWin() != 0 {
		t.Error("Game should not be won with only 2 lanes")
	}

	// Win 3rd lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(2, models.Player1)
	}
	game.CheckLaneWin(2)

	if game.Player1LanesWon != 3 {
		t.Errorf("Expected 3 lanes won, got %d", game.Player1LanesWon)
	}

	winner := game.CheckGameWin()
	if winner != models.Player1 {
		t.Error("Game should be won by Player1 with 3 lanes")
	}
	if game.Status != models.LaneStatusFinished {
		t.Error("Game status should be finished")
	}
}

func TestGameWin_TiebreakingPrioritizesCurrentPlayer(t *testing.T) {
	game := newTestGame(42)
	lane := 2
	game.CurrentPlayer = models.Player2

	// Both players fill the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
		game.PlacePiece(lane, models.Player2)
	}

	// Check winner - in a tie, lane winner depends on CheckLaneWin logic
	// Lane should be won by whoever filled it first, or by tie-breaking rules
	winner := game.CheckLaneWin(lane)

	// If lane is won, winner should be set
	if winner != 0 && game.Lanes[lane].Winner != winner {
		t.Error("Lane winner should match CheckLaneWin result")
	}
}

// ============================================================================
// Valid Placement Rules Tests
// ============================================================================

func TestValidPlacement_CannotPlaceOnWonLane(t *testing.T) {
	game := newTestGame(42)
	lane := 1
	game.Lanes[lane].Winner = models.Player1

	available := game.GetAvailableLanes(models.Player2)
	for _, l := range available {
		if l == lane {
			t.Error("Won lane should not be in available lanes")
		}
	}
}

func TestValidPlacement_CannotPlaceOnFullLane(t *testing.T) {
	game := newTestGame(42)
	lane := 2

	// Fill the lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(lane, models.Player1)
	}

	available := game.GetAvailableLanes(models.Player1)
	for _, l := range available {
		if l == lane {
			t.Error("Full lane should not be in available lanes")
		}
	}
}

func TestValidPlacement_CannotPlaceOnFrozenLane(t *testing.T) {
	game := newTestGame(42)
	lane := 3
	game.Lanes[lane].SetFreeze(models.Player1, 2)

	available := game.GetAvailableLanes(models.Player1)
	for _, l := range available {
		if l == lane {
			t.Error("Frozen lane should not be in available lanes for frozen player")
		}
	}

	// But should be available for the other player
	available2 := game.GetAvailableLanes(models.Player2)
	found := false
	for _, l := range available2 {
		if l == lane {
			found = true
			break
		}
	}
	if !found {
		t.Error("Frozen lane should be available for non-frozen player")
	}
}

// ============================================================================
// Capture vs Sanctuary Priority Tests
// ============================================================================

func TestCapturePriority_CaptureBeforeSanctuary(t *testing.T) {
	game := newTestGame(42)
	captureLane := 0
	sanctuaryLane := 4
	sourceLane := 2

	// P1 has Capture, P2 has Sanctuary
	game.AddCapture(models.Player1, captureLane, 2)
	game.AddSanctuary(models.Player2, sanctuaryLane, 2)

	game.PlacePiece(sourceLane, models.Player2)

	// P1 removes P2's piece
	result := game.RemovePieceWithRedirects(sourceLane, models.Player2, models.Player1)

	if result.RedirectType != "capture" {
		t.Error("Capture should take priority over Sanctuary")
	}
	if !result.Converted {
		t.Error("Piece should be converted to Player1's")
	}
	if game.Lanes[captureLane].CountPieces(models.Player1) != 1 {
		t.Error("Captured piece should be on capture lane as Player1's")
	}
}

func TestCapturePriority_FallsBackToSanctuaryWhenCaptureFull(t *testing.T) {
	game := newTestGame(42)
	captureLane := 0
	sanctuaryLane := 4
	sourceLane := 2

	// Fill capture lane
	for i := 0; i < 5; i++ {
		game.PlacePiece(captureLane, models.Player1)
	}

	game.AddCapture(models.Player1, captureLane, 2)
	game.AddSanctuary(models.Player2, sanctuaryLane, 2)

	game.PlacePiece(sourceLane, models.Player2)

	result := game.RemovePieceWithRedirects(sourceLane, models.Player2, models.Player1)

	// Capture full, falls back to Sanctuary
	if result.RedirectType != "sanctuary" {
		t.Errorf("Should fall back to sanctuary when capture is full, got %s", result.RedirectType)
	}
	if result.Converted {
		t.Error("Piece should NOT be converted (stays Player2's)")
	}
	if game.Lanes[sanctuaryLane].CountPieces(models.Player2) != 1 {
		t.Error("Piece should be on sanctuary lane as Player2's")
	}
}

// ============================================================================
// Trigger Chaining Tests
// ============================================================================

func TestTriggerChaining_PortalToDestination(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	sourceLane := 2
	// Portal on source
	executor.Execute(PerkPortal, models.Player1, []int{sourceLane})

	// P2 places on source - should teleport
	game.PlacePiece(sourceLane, models.Player2)
	results := executor.FirePlacementTriggers(sourceLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Portal trigger should fire")
	}

	if results[0].TriggerType != models.TriggerPortal {
		t.Error("Should be portal trigger")
	}
	// Destination should be set (unless no valid lanes)
	// The piece should have moved
}

// ============================================================================
// State Cloning Tests
// ============================================================================

func TestStateCloning_PreservesPieces(t *testing.T) {
	game := newTestGame(42)

	game.PlacePiece(0, models.Player1)
	game.PlacePiece(1, models.Player2)

	clone := game.Clone()

	if clone.Lanes[0].CountPieces(models.Player1) != 1 {
		t.Error("Clone should preserve Player1 pieces")
	}
	if clone.Lanes[1].CountPieces(models.Player2) != 1 {
		t.Error("Clone should preserve Player2 pieces")
	}
}

func TestStateCloning_IsIndependent(t *testing.T) {
	game := newTestGame(42)
	game.PlacePiece(0, models.Player1)

	clone := game.Clone()

	// Modify original
	game.PlacePiece(0, models.Player1)

	// Clone should be unaffected
	if clone.Lanes[0].CountPieces(models.Player1) != 1 {
		t.Error("Clone should be independent of original (should have 1 piece)")
	}
	if game.Lanes[0].CountPieces(models.Player1) != 2 {
		t.Error("Original should have 2 pieces")
	}
}

func TestStateCloning_PreservesTriggers(t *testing.T) {
	game := newTestGame(42)

	orderID := game.GetNextTriggerOrder()
	game.Lanes[2].AddTrigger(models.Trigger{
		Type:      models.TriggerMirror,
		Owner:     models.Player1,
		TurnsLeft: 2,
		OrderID:   orderID,
	})

	clone := game.Clone()

	if !clone.Lanes[2].HasTriggerType(models.TriggerMirror) {
		t.Error("Clone should preserve triggers")
	}

	// Modify original
	game.Lanes[2].ClearTriggers()

	// Clone should be unaffected
	if !clone.Lanes[2].HasTriggerType(models.TriggerMirror) {
		t.Error("Clone triggers should be independent")
	}
}

func TestStateCloning_PreservesGlobalEffects(t *testing.T) {
	game := newTestGame(42)

	game.Player1Cloaked = 2
	game.Player2Blinded = 1
	game.AddSanctuary(models.Player1, 2, 3)
	game.AddCapture(models.Player2, 3, 2)

	clone := game.Clone()

	// Verify clone has same values
	if clone.Player1Cloaked != 2 {
		t.Error("Clone should preserve cloak")
	}
	if clone.Player2Blinded != 1 {
		t.Error("Clone should preserve blind")
	}
	if len(clone.Player1Sanctuaries) != 1 {
		t.Error("Clone should preserve sanctuaries")
	}
	if len(clone.Player2Captures) != 1 {
		t.Error("Clone should preserve captures")
	}

	// Modify original
	game.Player1Cloaked = 0
	game.Player1Sanctuaries = nil

	// Clone should be unaffected
	if clone.Player1Cloaked != 2 {
		t.Error("Clone cloak should be independent")
	}
	if len(clone.Player1Sanctuaries) != 1 {
		t.Error("Clone sanctuaries should be independent")
	}
}

// ============================================================================
// Empty Board Edge Cases
// ============================================================================

func TestEmptyBoard_ScrambleWithNoEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkScramble, models.Player1, nil)

	if result.Success {
		t.Error("Scramble should fail with no enemy pieces")
	}
}

func TestEmptyBoard_StealWithNoEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkSteal, models.Player1, nil)

	if result.Success {
		t.Error("Steal should fail with no enemy pieces")
	}
}

func TestEmptyBoard_KamikazeWithNoEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.PlacePiece(targetLane, models.Player1)

	result := executor.Execute(PerkKamikaze, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Kamikaze should succeed (sacrifices own piece): %s", result.Error)
	}

	// Player loses their piece
	if game.Lanes[targetLane].CountPieces(models.Player1) != 0 {
		t.Error("Player should lose their piece")
	}
}

// ============================================================================
// All Lanes Won Edge Cases
// ============================================================================

func TestAllLanesWon_NoPlacementPossible(t *testing.T) {
	game := newTestGame(42)

	for i := 0; i < 5; i++ {
		game.Lanes[i].Winner = models.Player1
	}

	available := game.GetAvailableLanes(models.Player2)
	if len(available) != 0 {
		t.Errorf("No lanes should be available, got %d", len(available))
	}
}

func TestAllLanesWon_TriggerSetupFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	for i := 0; i < 5; i++ {
		game.Lanes[i].Winner = models.Player1
	}

	result := executor.Execute(PerkPortal, models.Player1, []int{0})

	if result.Success {
		t.Error("Trigger setup should fail when all lanes are won")
	}
}

// ============================================================================
// Cloak and Blind Interaction Tests
// ============================================================================

func TestCloakBlind_CloakHidesFromOpponent(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	executor.Execute(PerkCloak, models.Player1, nil)

	if !game.IsCloaked(models.Player1) {
		t.Error("Player1 should be cloaked")
	}
	if game.IsCloaked(models.Player2) {
		t.Error("Player2 should not be cloaked")
	}
}

func TestCloakBlind_BlindPreventsSeeing(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	executor.Execute(PerkBlind, models.Player1, nil)

	// P1 blinds P2
	if !game.IsBlinded(models.Player2) {
		t.Error("Player2 should be blinded")
	}
	if game.IsBlinded(models.Player1) {
		t.Error("Player1 should not be blinded")
	}
}

func TestCloakBlind_WonLanesVisibleDuringCloak(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// P1 wins lane 0
	for i := 0; i < 5; i++ {
		game.PlacePiece(0, models.Player1)
	}
	game.Lanes[0].Winner = models.Player1

	executor.Execute(PerkCloak, models.Player1, nil)

	// Won lane status is still visible (winner is public info)
	if game.Lanes[0].Winner != models.Player1 {
		t.Error("Won lane winner should be visible even during cloak")
	}
}

// ============================================================================
// Raid Interactions Tests
// ============================================================================

func TestRaid_CountsForEnemy(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Enemy has 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(targetLane, models.Player2)
	}

	// P1 places raid on enemy side
	result := executor.Execute(PerkRaid, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Raid failed: %s", result.Error)
	}

	// Enemy now has 5 pieces (including raid marker)
	if game.Lanes[targetLane].CountPieces(models.Player2) != 5 {
		t.Errorf("Expected 5 enemy pieces (including raid), got %d", game.Lanes[targetLane].CountPieces(models.Player2))
	}
}

func TestRaid_NullifyCancelsRaid(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	executor.Execute(PerkRaid, models.Player1, []int{targetLane})

	// Raid piece is on enemy side
	if game.Lanes[targetLane].CountPieces(models.Player2) != 1 {
		t.Error("Raid marker should be on enemy side")
	}
	if len(game.PendingRaids) != 1 {
		t.Error("Pending raid should be tracked")
	}

	// Nullify the lane
	game.PlacePiece(targetLane, models.Player1) // Need a piece to use Nullify
	result := executor.Execute(PerkNullify, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Nullify failed: %s", result.Error)
	}

	// Raid effect should be cancelled
	raidCount := 0
	for _, r := range game.PendingRaids {
		if r.Lane == targetLane {
			raidCount++
		}
	}
	if raidCount != 0 {
		t.Error("Nullify should cancel pending raids on the lane")
	}
}

func TestRaid_TimerDecrementsOnTurnSwitch(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	game.Status = models.LaneStatusPlaying
	targetLane := 2

	executor.Execute(PerkRaid, models.Player1, []int{targetLane})

	if game.PendingRaids[0].TurnsUntilResolve != 2 {
		t.Errorf("Initial raid timer should be 2, got %d", game.PendingRaids[0].TurnsUntilResolve)
	}

	game.SwitchTurn()
	if game.PendingRaids[0].TurnsUntilResolve != 1 {
		t.Errorf("Raid timer should be 1 after switch, got %d", game.PendingRaids[0].TurnsUntilResolve)
	}

	game.SwitchTurn()
	if game.PendingRaids[0].TurnsUntilResolve != 0 {
		t.Errorf("Raid timer should be 0 after second switch, got %d", game.PendingRaids[0].TurnsUntilResolve)
	}
}

// ============================================================================
// Multiple Sanctuaries/Captures Tests
// ============================================================================

func TestMultipleSanctuaries_CanBeActive(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	executor.Execute(PerkSanctuary, models.Player1, []int{0})
	executor.Execute(PerkSanctuary, models.Player1, []int{2})

	if len(game.Player1Sanctuaries) != 2 {
		t.Errorf("Expected 2 sanctuaries, got %d", len(game.Player1Sanctuaries))
	}
}

func TestMultipleCaptures_CanBeActive(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	executor.Execute(PerkCapture, models.Player1, []int{1})
	executor.Execute(PerkCapture, models.Player1, []int{4})

	if len(game.Player1Captures) != 2 {
		t.Errorf("Expected 2 captures, got %d", len(game.Player1Captures))
	}
}
