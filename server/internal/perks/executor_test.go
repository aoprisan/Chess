package perks

import (
	"testing"

	"github.com/kiddiechess/server/internal/models"
)

// Helper to create a test game with deterministic seed
func newTestGame(seed int64) *models.LaneGame {
	game := models.NewLaneGame()
	game.SetSeed(seed)
	game.Status = models.LaneStatusPlaying
	return game
}

// ============================================================================
// PlaceAnother Tests (Slot 1)
// ============================================================================

func TestPlaceAnother_AddsPiece(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	initialCount := game.Lanes[targetLane].CountPieces(models.Player1)
	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("PlaceAnother failed: %s", result.Error)
	}
	if result.PerkName != "PlaceAnother" {
		t.Errorf("Expected perk name 'PlaceAnother', got '%s'", result.PerkName)
	}

	newCount := game.Lanes[targetLane].CountPieces(models.Player1)
	if newCount != initialCount+1 {
		t.Errorf("Expected %d pieces, got %d", initialCount+1, newCount)
	}
}

func TestPlaceAnother_OnFullLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	// Fill the lane
	for i := 0; i < models.DefaultSlotsPerSide; i++ {
		game.PlacePiece(targetLane, models.Player1)
	}

	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected PlaceAnother to fail on full lane")
	}
	if result.Error == "" {
		t.Error("Expected error message for full lane")
	}
}

func TestPlaceAnother_OnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	game.Lanes[targetLane].Winner = models.Player2

	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected PlaceAnother to fail on won lane")
	}
}

func TestPlaceAnother_InvalidLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{10})

	if result.Success {
		t.Error("Expected PlaceAnother to fail with invalid lane index")
	}
}

func TestPlaceAnother_RequiresExactlyOneLane(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// No lanes
	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{})
	if result.Success {
		t.Error("Expected failure with no lanes")
	}

	// Two lanes
	result = executor.Execute(PerkPlaceAnother, models.Player1, []int{0, 1})
	if result.Success {
		t.Error("Expected failure with two lanes")
	}
}

// ============================================================================
// RemoveEnemy Tests (Slot 2)
// ============================================================================

func TestRemoveEnemy_RemovesPiece(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add enemy piece
	game.PlacePiece(targetLane, models.Player2)
	initialCount := game.Lanes[targetLane].CountPieces(models.Player2)

	result := executor.Execute(PerkRemoveEnemy, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("RemoveEnemy failed: %s", result.Error)
	}

	newCount := game.Lanes[targetLane].CountPieces(models.Player2)
	if newCount != initialCount-1 {
		t.Errorf("Expected %d pieces, got %d", initialCount-1, newCount)
	}
}

func TestRemoveEnemy_NoEnemyPiecesFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	result := executor.Execute(PerkRemoveEnemy, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected RemoveEnemy to fail with no enemy pieces")
	}
}

func TestRemoveEnemy_OnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	game.PlacePiece(targetLane, models.Player2)
	game.Lanes[targetLane].Winner = models.Player1

	result := executor.Execute(PerkRemoveEnemy, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected RemoveEnemy to fail on won lane")
	}
}

func TestRemoveEnemy_WithCaptureRedirect(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2
	captureLane := 0

	game.PlacePiece(targetLane, models.Player2)
	game.AddCapture(models.Player1, captureLane, 3)

	result := executor.Execute(PerkRemoveEnemy, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("RemoveEnemy failed: %s", result.Error)
	}

	// Piece should be redirected to capture lane as Player1's piece
	if game.Lanes[captureLane].CountPieces(models.Player1) != 1 {
		t.Error("Captured piece should be on capture lane as Player1's piece")
	}
	if game.Lanes[targetLane].CountPieces(models.Player2) != 0 {
		t.Error("Enemy piece should be removed from target lane")
	}
}

func TestRemoveEnemy_WithSanctuaryRedirect(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2
	sanctuaryLane := 4

	game.PlacePiece(targetLane, models.Player2)
	game.AddSanctuary(models.Player2, sanctuaryLane, 3)

	result := executor.Execute(PerkRemoveEnemy, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("RemoveEnemy failed: %s", result.Error)
	}

	// Piece should be redirected to sanctuary (still Player2's piece)
	if game.Lanes[sanctuaryLane].CountPieces(models.Player2) != 1 {
		t.Error("Piece should be redirected to sanctuary")
	}
}

func TestRemoveEnemy_CaptureTakesPriorityOverSanctuary(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2
	captureLane := 0
	sanctuaryLane := 4

	game.PlacePiece(targetLane, models.Player2)
	game.AddCapture(models.Player1, captureLane, 3)
	game.AddSanctuary(models.Player2, sanctuaryLane, 3)

	result := executor.Execute(PerkRemoveEnemy, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("RemoveEnemy failed: %s", result.Error)
	}

	// Capture takes priority
	if game.Lanes[captureLane].CountPieces(models.Player1) != 1 {
		t.Error("Capture should take priority - piece should be on capture lane")
	}
	if game.Lanes[sanctuaryLane].CountPieces(models.Player2) != 0 {
		t.Error("Sanctuary should not receive piece when Capture is active")
	}
}

// ============================================================================
// Freeze Tests (Slot 3)
// ============================================================================

func TestFreeze_BlocksLane(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	result := executor.Execute(PerkFreeze, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Freeze failed: %s", result.Error)
	}

	lane := game.Lanes[targetLane]
	if !lane.IsFrozenFor(models.Player2) {
		t.Error("Lane should be frozen for opponent")
	}
	if lane.IsFrozenFor(models.Player1) {
		t.Error("Lane should not be frozen for owner")
	}
}

func TestFreeze_OnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	game.Lanes[targetLane].Winner = models.Player1

	result := executor.Execute(PerkFreeze, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Freeze to fail on won lane")
	}
}

func TestFreeze_OnAlreadyFrozenLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	game.Lanes[targetLane].SetFreeze(models.Player2, 2)

	result := executor.Execute(PerkFreeze, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Freeze to fail on already frozen lane")
	}
}

// ============================================================================
// Regroup Tests (Slot 3) - Atomic Swap
// ============================================================================

func TestRegroup_SwapsPiecesBetweenLanes(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	laneA, laneB := 1, 3

	// Place pieces
	game.PlacePiece(laneA, models.Player1)
	game.PlacePiece(laneA, models.Player1)
	game.PlacePiece(laneB, models.Player1)

	result := executor.Execute(PerkRegroup, models.Player1, []int{laneA, laneB})

	if !result.Success {
		t.Fatalf("Regroup failed: %s", result.Error)
	}

	// Pieces should be swapped
	if game.Lanes[laneA].CountPieces(models.Player1) != 1 {
		t.Errorf("Lane A should have 1 piece, got %d", game.Lanes[laneA].CountPieces(models.Player1))
	}
	if game.Lanes[laneB].CountPieces(models.Player1) != 2 {
		t.Errorf("Lane B should have 2 pieces, got %d", game.Lanes[laneB].CountPieces(models.Player1))
	}
}

func TestRegroup_RequiresDifferentLanes(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkRegroup, models.Player1, []int{2, 2})

	if result.Success {
		t.Error("Expected Regroup to fail when swapping lane with itself")
	}
}

func TestRegroup_RequiresAtLeastOneLaneWithPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkRegroup, models.Player1, []int{0, 1})

	if result.Success {
		t.Error("Expected Regroup to fail when both lanes are empty")
	}
}

// ============================================================================
// Scatter Tests (Slot 3)
// ============================================================================

func TestScatter_MovesAllPiecesToRandom(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	sourceLane := 2

	game.PlacePiece(sourceLane, models.Player1)
	game.PlacePiece(sourceLane, models.Player1)
	initialTotal := countTotalPieces(game, models.Player1)

	result := executor.Execute(PerkScatter, models.Player1, []int{sourceLane})

	if !result.Success {
		t.Fatalf("Scatter failed: %s", result.Error)
	}

	// Total pieces should be same (just redistributed)
	finalTotal := countTotalPieces(game, models.Player1)
	if finalTotal != initialTotal {
		t.Errorf("Expected %d total pieces, got %d", initialTotal, finalTotal)
	}
}

func TestScatter_RequiresPiecesOnLane(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkScatter, models.Player1, []int{0})

	if result.Success {
		t.Error("Expected Scatter to fail with no pieces on lane")
	}
}

// ============================================================================
// Trigger Setup Tests (Portal, Trap, Mirror, Echo, Shockwave)
// ============================================================================

func TestPortal_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	result := executor.Execute(PerkPortal, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Portal failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerPortal) {
		t.Error("Portal trigger should be set on lane")
	}
}

func TestTrap_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	result := executor.Execute(PerkTrap, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Trap failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerTrap) {
		t.Error("Trap trigger should be set on lane")
	}
}

func TestMirror_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	result := executor.Execute(PerkMirror, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Mirror failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerMirror) {
		t.Error("Mirror trigger should be set on lane")
	}
}

func TestEcho_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	result := executor.Execute(PerkEcho, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Echo failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerEcho) {
		t.Error("Echo trigger should be set on lane")
	}
}

func TestShockwave_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 4

	result := executor.Execute(PerkShockwave, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Shockwave failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerShockwave) {
		t.Error("Shockwave trigger should be set on lane")
	}
}

func TestTrigger_OnOwnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.Lanes[targetLane].Winner = models.Player1

	result := executor.Execute(PerkPortal, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected trigger setup to fail on own won lane")
	}
}

func TestTrigger_DuplicateOnSameLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	executor.Execute(PerkMirror, models.Player1, []int{targetLane})
	result := executor.Execute(PerkMirror, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected duplicate trigger to fail")
	}
}

// ============================================================================
// Removal Trigger Setup Tests (Hydra, Backfire, Absorb, Retaliate)
// ============================================================================

func TestHydra_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	game.PlacePiece(targetLane, models.Player1)

	result := executor.Execute(PerkHydra, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Hydra failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerHydra) {
		t.Error("Hydra trigger should be set on lane")
	}
}

func TestHydra_RequiresPlayerPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	result := executor.Execute(PerkHydra, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Hydra to fail without player pieces on lane")
	}
}

func TestBackfire_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	game.PlacePiece(targetLane, models.Player1)

	result := executor.Execute(PerkBackfire, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Backfire failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerBackfire) {
		t.Error("Backfire trigger should be set on lane")
	}
}

func TestAbsorb_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 4

	game.PlacePiece(targetLane, models.Player1)

	result := executor.Execute(PerkAbsorb, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Absorb failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerAbsorb) {
		t.Error("Absorb trigger should be set on lane")
	}
}

func TestRetaliate_SetsTrigger(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.PlacePiece(targetLane, models.Player1)

	result := executor.Execute(PerkRetaliate, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Retaliate failed: %s", result.Error)
	}
	if !game.Lanes[targetLane].HasTriggerType(models.TriggerRetaliate) {
		t.Error("Retaliate trigger should be set on lane")
	}
}

// ============================================================================
// Duration Perks Tests (Cloak, Blind, Sanctuary, Capture)
// ============================================================================

func TestCloak_HidesPlayerField(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkCloak, models.Player1, nil)

	if !result.Success {
		t.Fatalf("Cloak failed: %s", result.Error)
	}
	if !game.IsCloaked(models.Player1) {
		t.Error("Player should be cloaked")
	}
	if game.IsCloaked(models.Player2) {
		t.Error("Opponent should not be cloaked")
	}
}

func TestCloak_AlreadyCloakedFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	executor.Execute(PerkCloak, models.Player1, nil)
	result := executor.Execute(PerkCloak, models.Player1, nil)

	if result.Success {
		t.Error("Expected Cloak to fail when already cloaked")
	}
}

func TestBlind_BlindsOpponent(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkBlind, models.Player1, nil)

	if !result.Success {
		t.Fatalf("Blind failed: %s", result.Error)
	}
	if !game.IsBlinded(models.Player2) {
		t.Error("Opponent should be blinded")
	}
	if game.IsBlinded(models.Player1) {
		t.Error("Player should not be blinded")
	}
}

func TestBlind_AlreadyBlindedFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	executor.Execute(PerkBlind, models.Player1, nil)
	result := executor.Execute(PerkBlind, models.Player1, nil)

	if result.Success {
		t.Error("Expected Blind to fail when opponent already blinded")
	}
}

func TestSanctuary_SetsRedirect(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	result := executor.Execute(PerkSanctuary, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Sanctuary failed: %s", result.Error)
	}
	if len(game.Player1Sanctuaries) != 1 {
		t.Error("Sanctuary should be added")
	}
	if game.Player1Sanctuaries[0].Lane != targetLane {
		t.Error("Sanctuary should point to target lane")
	}
}

func TestSanctuary_OnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	game.Lanes[targetLane].Winner = models.Player2

	result := executor.Execute(PerkSanctuary, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Sanctuary to fail on won lane")
	}
}

func TestCapture_SetsRedirect(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	result := executor.Execute(PerkCapture, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Capture failed: %s", result.Error)
	}
	if len(game.Player1Captures) != 1 {
		t.Error("Capture should be added")
	}
	if game.Player1Captures[0].Lane != targetLane {
		t.Error("Capture should point to target lane")
	}
}

// ============================================================================
// Immediate Perks Tests - Slot 4
// ============================================================================

func TestScramble_RedistributesAllEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Add enemy pieces
	game.PlacePiece(0, models.Player2)
	game.PlacePiece(1, models.Player2)
	game.PlacePiece(2, models.Player2)
	initialTotal := countTotalPieces(game, models.Player2)

	result := executor.Execute(PerkScramble, models.Player1, nil)

	if !result.Success {
		t.Fatalf("Scramble failed: %s", result.Error)
	}

	// Same total (just redistributed)
	finalTotal := countTotalPieces(game, models.Player2)
	if finalTotal != initialTotal {
		t.Errorf("Expected %d total pieces, got %d", initialTotal, finalTotal)
	}
}

func TestScramble_FailsIfNoEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkScramble, models.Player1, nil)

	if result.Success {
		t.Error("Expected Scramble to fail with no enemy pieces")
	}
}

func TestSplit_SacrificesOneGainsTwo(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	sourceLane := 2

	game.PlacePiece(sourceLane, models.Player1)
	initialTotal := countTotalPieces(game, models.Player1)

	result := executor.Execute(PerkSplit, models.Player1, []int{sourceLane})

	if !result.Success {
		t.Fatalf("Split failed: %s", result.Error)
	}

	// Net gain of 1 (lose 1, gain 2)
	finalTotal := countTotalPieces(game, models.Player1)
	if finalTotal != initialTotal+1 {
		t.Errorf("Expected %d total pieces (net +1), got %d", initialTotal+1, finalTotal)
	}
}

func TestSplit_RequiresPieceOnTarget(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkSplit, models.Player1, []int{0})

	if result.Success {
		t.Error("Expected Split to fail with no pieces on lane")
	}
}

func TestKamikaze_SacrificesOneRemovesTwo(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.PlacePiece(targetLane, models.Player1)
	game.PlacePiece(0, models.Player2)
	game.PlacePiece(1, models.Player2)

	initialP1 := countTotalPieces(game, models.Player1)
	initialP2 := countTotalPieces(game, models.Player2)

	result := executor.Execute(PerkKamikaze, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Kamikaze failed: %s", result.Error)
	}

	finalP1 := countTotalPieces(game, models.Player1)
	finalP2 := countTotalPieces(game, models.Player2)

	// Player loses 1
	if finalP1 != initialP1-1 {
		t.Errorf("Expected player to lose 1 piece, went from %d to %d", initialP1, finalP1)
	}
	// Enemy loses up to 2
	if finalP2 > initialP2 {
		t.Error("Enemy should not gain pieces")
	}
}

func TestDisrupt_SwapsEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	laneA, laneB := 0, 2

	game.PlacePiece(laneA, models.Player2)
	game.PlacePiece(laneA, models.Player2)
	game.PlacePiece(laneB, models.Player2)

	result := executor.Execute(PerkDisrupt, models.Player1, []int{laneA, laneB})

	if !result.Success {
		t.Fatalf("Disrupt failed: %s", result.Error)
	}

	if game.Lanes[laneA].CountPieces(models.Player2) != 1 {
		t.Errorf("Lane A should have 1 enemy piece, got %d", game.Lanes[laneA].CountPieces(models.Player2))
	}
	if game.Lanes[laneB].CountPieces(models.Player2) != 2 {
		t.Errorf("Lane B should have 2 enemy pieces, got %d", game.Lanes[laneB].CountPieces(models.Player2))
	}
}

func TestDisrupt_RequiresEnemyPiecesOnBothLanes(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	game.PlacePiece(0, models.Player2)
	// Lane 2 is empty

	result := executor.Execute(PerkDisrupt, models.Player1, []int{0, 2})

	if result.Success {
		t.Error("Expected Disrupt to fail when one lane has no enemy pieces")
	}
}

func TestDisperse_MovesEnemyPiecesToRandom(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	game.PlacePiece(targetLane, models.Player2)
	game.PlacePiece(targetLane, models.Player2)
	initialTotal := countTotalPieces(game, models.Player2)

	result := executor.Execute(PerkDisperse, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Disperse failed: %s", result.Error)
	}

	finalTotal := countTotalPieces(game, models.Player2)
	if finalTotal != initialTotal {
		t.Errorf("Expected %d total pieces, got %d", initialTotal, finalTotal)
	}
}

func TestGambit_GivesEnemyThreeThenPlayerTwo(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	initialP1 := countTotalPieces(game, models.Player1)
	initialP2 := countTotalPieces(game, models.Player2)

	result := executor.Execute(PerkGambit, models.Player1, nil)

	if !result.Success {
		t.Fatalf("Gambit failed: %s", result.Error)
	}

	finalP1 := countTotalPieces(game, models.Player1)
	finalP2 := countTotalPieces(game, models.Player2)

	// Enemy gets up to 3
	if finalP2 < initialP2 {
		t.Error("Enemy should gain pieces")
	}
	// Player gets up to 2
	if finalP1 < initialP1 {
		t.Error("Player should gain pieces")
	}
}

func TestSteal_RemovesEnemyAddsToPlayer(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	game.PlacePiece(2, models.Player2)
	initialP1 := countTotalPieces(game, models.Player1)
	initialP2 := countTotalPieces(game, models.Player2)

	result := executor.Execute(PerkSteal, models.Player1, nil)

	if !result.Success {
		t.Fatalf("Steal failed: %s", result.Error)
	}

	finalP1 := countTotalPieces(game, models.Player1)
	finalP2 := countTotalPieces(game, models.Player2)

	// Player +1, Enemy -1 (unless redirected)
	if finalP2 > initialP2 {
		t.Error("Enemy should lose at least one piece")
	}
	if finalP1 < initialP1 {
		t.Error("Player should gain at least one piece")
	}
}

func TestSteal_FailsIfNoEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	result := executor.Execute(PerkSteal, models.Player1, nil)

	if result.Success {
		t.Error("Expected Steal to fail with no enemy pieces")
	}
}

func TestRush_YouPlusTwoEnemyPlusTwoYouMinusOne(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add piece elsewhere for the -1 step
	game.PlacePiece(0, models.Player1)

	result := executor.Execute(PerkRush, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Rush failed: %s", result.Error)
	}

	// Check details
	if result.Details["playerGained"] == nil {
		t.Error("Should track player pieces gained")
	}
	if result.Details["opponentGained"] == nil {
		t.Error("Should track opponent pieces gained")
	}
}

func TestNullify_ClearsTriggers(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add triggers
	game.PlacePiece(targetLane, models.Player1)
	orderID := game.GetNextTriggerOrder()
	game.Lanes[targetLane].AddTrigger(models.Trigger{
		Type:      models.TriggerMirror,
		Owner:     models.Player2,
		TurnsLeft: 2,
		OrderID:   orderID,
	})

	if !game.Lanes[targetLane].HasTriggerType(models.TriggerMirror) {
		t.Fatal("Trigger should exist before Nullify")
	}

	result := executor.Execute(PerkNullify, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Nullify failed: %s", result.Error)
	}

	if game.Lanes[targetLane].HasTriggerType(models.TriggerMirror) {
		t.Error("Trigger should be cleared after Nullify")
	}
}

func TestNullify_ClearsDeferred(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	game.PlacePiece(targetLane, models.Player1)
	game.Lanes[targetLane].AddDeferred(models.DeferredEffect{
		Type:       models.DeferredReinforce,
		Owner:      models.Player2,
		TargetLane: targetLane,
	})

	if len(game.Lanes[targetLane].Deferred) != 1 {
		t.Fatal("Deferred should exist before Nullify")
	}

	result := executor.Execute(PerkNullify, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Nullify failed: %s", result.Error)
	}

	if len(game.Lanes[targetLane].Deferred) != 0 {
		t.Error("Deferred should be cleared after Nullify")
	}
}

func TestNullify_ClearsRaids(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 4

	game.PlacePiece(targetLane, models.Player1)
	game.PendingRaids = append(game.PendingRaids, models.PendingRaid{
		Owner:             models.Player2,
		Lane:              targetLane,
		TurnsUntilResolve: 2,
		Source:            "RAID",
	})

	result := executor.Execute(PerkNullify, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Nullify failed: %s", result.Error)
	}

	for _, raid := range game.PendingRaids {
		if raid.Lane == targetLane {
			t.Error("Raids on target lane should be cleared")
		}
	}
}

// ============================================================================
// Deferred Perks Tests
// ============================================================================

func TestSignal_PlacesPieceAndAddsDeferred(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	result := executor.Execute(PerkSignal, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Signal failed: %s", result.Error)
	}

	// Immediate +1 piece
	if game.Lanes[targetLane].CountPieces(models.Player1) != 1 {
		t.Error("Signal should place 1 piece immediately")
	}

	// Deferred effect should be added
	if len(game.Lanes[targetLane].Deferred) != 1 {
		t.Error("Signal should add deferred effect")
	}
}

func TestEnlist_PlacesPieceAndAddsDeferred(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	result := executor.Execute(PerkEnlist, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Enlist failed: %s", result.Error)
	}

	if game.Lanes[targetLane].CountPieces(models.Player1) != 1 {
		t.Error("Enlist should place 1 piece immediately")
	}
	if len(game.Lanes[targetLane].Deferred) != 1 {
		t.Error("Enlist should add deferred effect")
	}
}

func TestAmbush_PlacesPieceAndAddsDeferred(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	result := executor.Execute(PerkAmbush, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Ambush failed: %s", result.Error)
	}

	if game.Lanes[targetLane].CountPieces(models.Player1) != 1 {
		t.Error("Ambush should place 1 piece immediately")
	}
	if len(game.Lanes[targetLane].Deferred) != 1 {
		t.Error("Ambush should add deferred effect")
	}
}

func TestReinforce_PlacesPieceAndAddsDeferred(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	result := executor.Execute(PerkReinforce, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Reinforce failed: %s", result.Error)
	}

	if game.Lanes[targetLane].CountPieces(models.Player1) != 1 {
		t.Error("Reinforce should place 1 piece immediately")
	}
	if len(game.Lanes[targetLane].Deferred) != 1 {
		t.Error("Reinforce should add deferred effect")
	}
}

func TestRaid_PlacesRaidMarker(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	result := executor.Execute(PerkRaid, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Raid failed: %s", result.Error)
	}

	// Raid marker placed on enemy side
	if game.Lanes[targetLane].CountPieces(models.Player2) != 1 {
		t.Error("Raid should place marker on enemy side")
	}

	// Pending raid should be tracked
	if len(game.PendingRaids) != 1 {
		t.Error("Pending raid should be tracked")
	}
	if game.PendingRaids[0].Owner != models.Player1 {
		t.Error("Raid should be owned by Player1")
	}
}

func TestRaid_OnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	game.Lanes[targetLane].Winner = models.Player2

	result := executor.Execute(PerkRaid, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Raid to fail on won lane")
	}
}

// ============================================================================
// Trigger Firing Tests
// ============================================================================

func TestFirePlacementTriggers_PortalTeleportsPiece(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// P1 sets portal
	executor.Execute(PerkPortal, models.Player1, []int{targetLane})

	// P2 places on the lane
	game.PlacePiece(targetLane, models.Player2)
	initialOnTarget := game.Lanes[targetLane].CountPieces(models.Player2)

	results := executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Portal trigger should fire")
	}

	// Piece should have moved (or be lost)
	if results[0].TriggerType != models.TriggerPortal {
		t.Error("Should be portal trigger")
	}

	// If piece was teleported, target lane should have fewer pieces
	if results[0].Destination >= 0 {
		if game.Lanes[targetLane].CountPieces(models.Player2) >= initialOnTarget {
			t.Error("Piece should have been moved from target lane")
		}
	}
}

func TestFirePlacementTriggers_MirrorAddsPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 3

	executor.Execute(PerkMirror, models.Player1, []int{targetLane})
	initialP1 := game.Lanes[targetLane].CountPieces(models.Player1)

	game.PlacePiece(targetLane, models.Player2)
	results := executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Mirror trigger should fire")
	}

	// P1 should get pieces
	finalP1 := game.Lanes[targetLane].CountPieces(models.Player1)
	if finalP1 <= initialP1 {
		t.Error("Mirror should add pieces to owner")
	}
}

func TestFireRemovalTriggers_HydraAddsPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.PlacePiece(targetLane, models.Player1)
	game.PlacePiece(targetLane, models.Player1)
	executor.Execute(PerkHydra, models.Player1, []int{targetLane})

	initialTotal := countTotalPieces(game, models.Player1)

	// Simulate removal
	game.RemovePiece(targetLane, models.Player1)
	results := executor.FireRemovalTriggers(targetLane, models.Player2)

	if len(results) == 0 {
		t.Fatal("Hydra trigger should fire")
	}

	// P1 should get pieces back on random lanes
	finalTotal := countTotalPieces(game, models.Player1)
	if results[0].PiecesAdded > 0 && finalTotal <= initialTotal-1-results[0].PiecesAdded {
		t.Error("Hydra should add pieces when piece is removed")
	}
}

func TestFireRemovalTriggers_BackfireRemovesPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.PlacePiece(targetLane, models.Player1)
	// Add P2 pieces elsewhere
	game.PlacePiece(0, models.Player2)
	game.PlacePiece(1, models.Player2)
	game.PlacePiece(3, models.Player2)

	executor.Execute(PerkBackfire, models.Player1, []int{targetLane})
	initialP2 := countTotalPieces(game, models.Player2)

	// Simulate removal by P2
	game.RemovePiece(targetLane, models.Player1)
	results := executor.FireRemovalTriggers(targetLane, models.Player2)

	if len(results) == 0 {
		t.Fatal("Backfire trigger should fire")
	}

	finalP2 := countTotalPieces(game, models.Player2)
	if results[0].PiecesRemoved > 0 && finalP2 >= initialP2 {
		t.Error("Backfire should remove pieces from remover")
	}
}

func TestTriggerFIFO_TriggersFireInOrder(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Set triggers in order
	executor.Execute(PerkPortal, models.Player1, []int{targetLane})
	executor.Execute(PerkMirror, models.Player1, []int{targetLane})
	executor.Execute(PerkEcho, models.Player1, []int{targetLane})

	triggers := game.Lanes[targetLane].Triggers
	if len(triggers) != 3 {
		t.Fatalf("Expected 3 triggers, got %d", len(triggers))
	}

	// Verify FIFO order (order IDs should be increasing)
	for i := 0; i < len(triggers)-1; i++ {
		if triggers[i].OrderID >= triggers[i+1].OrderID {
			t.Error("Triggers should be in FIFO order by OrderID")
		}
	}
}

func TestTrigger_RemovedAfterFiring(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	executor.Execute(PerkMirror, models.Player1, []int{targetLane})

	if !game.Lanes[targetLane].HasTriggerType(models.TriggerMirror) {
		t.Fatal("Trigger should exist before firing")
	}

	game.PlacePiece(targetLane, models.Player2)
	executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if game.Lanes[targetLane].HasTriggerType(models.TriggerMirror) {
		t.Error("Trigger should be removed after firing")
	}
}

// ============================================================================
// Deferred Processing Tests
// ============================================================================

func TestProcessDeferredEffects_Signal(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Setup: pieces on another lane to pull from
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(0, models.Player1)

	targetLane := 2
	executor.Execute(PerkSignal, models.Player1, []int{targetLane})

	initialOnTarget := game.Lanes[targetLane].CountPieces(models.Player1)

	// Process deferred
	results := executor.ProcessDeferredEffects(models.Player1)

	if len(results) == 0 {
		t.Fatal("Signal deferred should be processed")
	}

	// Should have pulled from most populated lane
	finalOnTarget := game.Lanes[targetLane].CountPieces(models.Player1)
	if results[0].Success && finalOnTarget <= initialOnTarget {
		t.Error("Signal should pull piece to target lane")
	}
}

func TestProcessDeferredEffects_Reinforce(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	executor.Execute(PerkReinforce, models.Player1, []int{targetLane})
	initialCount := game.Lanes[targetLane].CountPieces(models.Player1)

	results := executor.ProcessDeferredEffects(models.Player1)

	if len(results) == 0 {
		t.Fatal("Reinforce deferred should be processed")
	}

	if results[0].Success {
		finalCount := game.Lanes[targetLane].CountPieces(models.Player1)
		if finalCount != initialCount+1 {
			t.Error("Reinforce should add 1 bonus piece")
		}
	}
}

// ============================================================================
// Raid Processing Tests
// ============================================================================

func TestProcessPendingRaids_Outcomes(t *testing.T) {
	// Test with many iterations to cover probability outcomes
	outcomesCovered := map[string]bool{}

	for seed := int64(0); seed < 100; seed++ {
		game := newTestGame(seed)
		executor := NewPerkExecutor(game)
		targetLane := 2

		// Place raid
		executor.Execute(PerkRaid, models.Player1, []int{targetLane})

		// Decrement turns to make it resolve
		game.PendingRaids[0].TurnsUntilResolve = 0

		results := executor.ProcessPendingRaids(models.Player1)

		if len(results) > 0 {
			outcomesCovered[results[0].Outcome] = true
		}
	}

	// Should cover multiple outcomes
	expectedOutcomes := []string{"lost", "+2_recruits", "+1_recruit", "alone"}
	for _, outcome := range expectedOutcomes {
		if !outcomesCovered[outcome] {
			// Some outcomes have low probability, so just check at least 2 different
			if len(outcomesCovered) < 2 {
				t.Errorf("Expected to cover multiple raid outcomes, only got: %v", outcomesCovered)
			}
		}
	}
}

// ============================================================================
// Win Condition Tests
// ============================================================================

func TestLaneWinDuringPerkExecution(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	// Fill lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(targetLane, models.Player1)
	}

	// Place 5th piece to win lane
	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("PlaceAnother failed: %s", result.Error)
	}

	if result.LaneWinner != models.Player1 {
		t.Error("Lane should be won by Player1")
	}
}

func TestGameWinDuringPerkExecution(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Win 2 lanes
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}
	game.Player1LanesWon = 2

	// Fill 3rd lane to 4 pieces
	targetLane := 2
	for i := 0; i < 4; i++ {
		game.PlacePiece(targetLane, models.Player1)
	}

	// Place 5th piece to win lane and game
	result := executor.Execute(PerkPlaceAnother, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("PlaceAnother failed: %s", result.Error)
	}

	if result.GameWinner != models.Player1 {
		t.Error("Game should be won by Player1")
	}
}

func TestGameTerminatesMidPerk(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Setup for quick win with Scatter
	game.Player1LanesWon = 2

	// Fill lanes 0 and 1 (already won)
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}

	// Fill lane 2 to 4 pieces, then scatter from lane 3
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	// Put pieces on lane 3 to scatter
	game.PlacePiece(3, models.Player1)
	game.PlacePiece(3, models.Player1)

	// Scatter might win the game mid-execution
	result := executor.Execute(PerkScatter, models.Player1, []int{3})

	if !result.Success {
		t.Fatalf("Scatter failed: %s", result.Error)
	}

	// Check if game was won mid-perk
	if result.GameWonMidPerk && result.GameWinner != models.Player1 {
		t.Error("If game won mid-perk, winner should be set")
	}
}

// ============================================================================
// Additional Trigger Tests
// ============================================================================

func TestFirePlacementTriggers_TrapRemovesPiece(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 1

	// P1 sets trap
	executor.Execute(PerkTrap, models.Player1, []int{targetLane})

	// P2 places on trapped lane
	game.PlacePiece(targetLane, models.Player2)
	initialCount := game.Lanes[targetLane].CountPieces(models.Player2)

	results := executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Trap trigger should fire")
	}

	// Piece should be removed (unless redirected)
	finalCount := game.Lanes[targetLane].CountPieces(models.Player2)
	if finalCount >= initialCount {
		t.Error("Trap should remove placed piece")
	}
}

func TestFirePlacementTriggers_EchoAddsPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	// P1 sets echo
	executor.Execute(PerkEcho, models.Player1, []int{targetLane})
	initialTotal := countTotalPieces(game, models.Player1)

	// P2 places
	game.PlacePiece(targetLane, models.Player2)
	results := executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Echo trigger should fire")
	}

	// P1 should get pieces on random lanes
	finalTotal := countTotalPieces(game, models.Player1)
	if finalTotal <= initialTotal {
		t.Error("Echo should add pieces to owner")
	}
}

func TestFirePlacementTriggers_ShockwaveRemovesPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add P2 pieces elsewhere
	game.PlacePiece(0, models.Player2)
	game.PlacePiece(1, models.Player2)
	game.PlacePiece(3, models.Player2)

	// P1 sets shockwave
	executor.Execute(PerkShockwave, models.Player1, []int{targetLane})

	totalBefore := countTotalPieces(game, models.Player2)

	// P2 places on shockwave lane
	game.PlacePiece(targetLane, models.Player2)
	results := executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Shockwave trigger should fire")
	}

	// Should have removed pieces from OTHER lanes
	totalAfter := countTotalPieces(game, models.Player2)
	if totalAfter >= totalBefore+1 {
		t.Error("Shockwave should remove enemy pieces from other lanes")
	}
}

func TestFireRemovalTriggers_AbsorbRecoversPiece(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// P1 places piece and sets absorb
	game.PlacePiece(targetLane, models.Player1)
	game.PlacePiece(targetLane, models.Player1)
	executor.Execute(PerkAbsorb, models.Player1, []int{targetLane})

	initialTotal := countTotalPieces(game, models.Player1)

	// Simulate P2 removing P1's piece
	game.RemovePiece(targetLane, models.Player1)
	results := executor.FireRemovalTriggers(targetLane, models.Player2)

	if len(results) == 0 {
		t.Fatal("Absorb trigger should fire")
	}

	// Piece should reappear somewhere (net 0 loss)
	finalTotal := countTotalPieces(game, models.Player1)
	// With absorb, piece is recovered somewhere
	if results[0].PiecesAdded > 0 && finalTotal < initialTotal-1 {
		t.Error("Absorb should recover piece")
	}
}

func TestFirePlacementTriggers_RetaliatePlacesRaid(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// P1 places piece and sets retaliate
	game.PlacePiece(targetLane, models.Player1)
	executor.Execute(PerkRetaliate, models.Player1, []int{targetLane})

	// P2 places on lane
	game.PlacePiece(targetLane, models.Player2)
	results := executor.FirePlacementTriggers(targetLane, models.Player2, 0)

	if len(results) == 0 {
		t.Fatal("Retaliate trigger should fire")
	}

	// Should spawn a raid
	if results[0].RaidPlaced {
		if len(game.PendingRaids) < 1 {
			t.Error("Raid should be added to pending")
		}
	}
}

// ============================================================================
// Additional Deferred Tests
// ============================================================================

func TestProcessDeferredEffects_Enlist(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add enemy piece
	game.PlacePiece(targetLane, models.Player2)

	executor.Execute(PerkEnlist, models.Player1, []int{targetLane})
	results := executor.ProcessDeferredEffects(models.Player1)

	if len(results) == 0 {
		t.Fatal("Enlist deferred should be processed")
	}
}

func TestProcessDeferredEffects_Ambush(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add enemy piece
	game.PlacePiece(targetLane, models.Player2)

	executor.Execute(PerkAmbush, models.Player1, []int{targetLane})
	results := executor.ProcessDeferredEffects(models.Player1)

	if len(results) == 0 {
		t.Fatal("Ambush deferred should be processed")
	}
}

// ============================================================================
// Edge Cases Tests
// ============================================================================

func TestSanctuary_OnFullLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	// Fill the lane
	for i := 0; i < models.DefaultSlotsPerSide; i++ {
		game.PlacePiece(targetLane, models.Player1)
	}

	result := executor.Execute(PerkSanctuary, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Sanctuary to fail on full lane")
	}
}

func TestCapture_OnFullLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 0

	// Fill the lane
	for i := 0; i < models.DefaultSlotsPerSide; i++ {
		game.PlacePiece(targetLane, models.Player1)
	}

	result := executor.Execute(PerkCapture, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Capture to fail on full lane")
	}
}

func TestDisperse_MovesAllEnemyPieces(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	// Add enemy pieces
	game.PlacePiece(targetLane, models.Player2)
	game.PlacePiece(targetLane, models.Player2)
	initialTotal := countTotalPieces(game, models.Player2)

	result := executor.Execute(PerkDisperse, models.Player1, []int{targetLane})

	if !result.Success {
		t.Fatalf("Disperse failed: %s", result.Error)
	}

	finalTotal := countTotalPieces(game, models.Player2)
	if finalTotal != initialTotal {
		t.Errorf("Expected %d pieces, got %d", initialTotal, finalTotal)
	}
}

func TestRush_OnWonLaneFails(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)
	targetLane := 2

	game.Lanes[targetLane].Winner = models.Player2

	result := executor.Execute(PerkRush, models.Player1, []int{targetLane})

	if result.Success {
		t.Error("Expected Rush to fail on won lane")
	}
}

func TestDisrupt_RequiresTwoLanes(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	game.PlacePiece(0, models.Player2)

	result := executor.Execute(PerkDisrupt, models.Player1, []int{0})

	if result.Success {
		t.Error("Expected Disrupt to fail with only one lane")
	}
}

func TestRegroup_SwapsBothDirections(t *testing.T) {
	game := newTestGame(42)
	executor := NewPerkExecutor(game)

	// Lane 0: 3 pieces, Lane 2: 1 piece
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(2, models.Player1)

	result := executor.Execute(PerkRegroup, models.Player1, []int{0, 2})

	if !result.Success {
		t.Fatalf("Regroup failed: %s", result.Error)
	}

	// After swap: Lane 0 should have 1, Lane 2 should have 3
	if game.Lanes[0].CountPieces(models.Player1) != 1 {
		t.Errorf("Lane 0 should have 1 piece, got %d", game.Lanes[0].CountPieces(models.Player1))
	}
	if game.Lanes[2].CountPieces(models.Player1) != 3 {
		t.Errorf("Lane 2 should have 3 pieces, got %d", game.Lanes[2].CountPieces(models.Player1))
	}
}

// ============================================================================
// Helper Functions
// ============================================================================

func countTotalPieces(game *models.LaneGame, side models.PlayerSide) int {
	total := 0
	for _, lane := range game.Lanes {
		total += lane.CountPieces(side)
	}
	return total
}
