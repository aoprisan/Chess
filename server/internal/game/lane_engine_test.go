package game

import (
	"testing"

	"github.com/kiddiechess/server/internal/models"
	"github.com/kiddiechess/server/internal/perks"
)

// Helper to create a test game with deterministic seed
func newTestGame(seed int64) *models.LaneGame {
	game := models.NewLaneGame()
	game.SetSeed(seed)
	game.Status = models.LaneStatusPlaying
	game.CurrentPhase = models.PhaseRaidResolution
	return game
}

// ============================================================================
// ExecuteRaidResolution Tests
// ============================================================================

func TestExecuteRaidResolution_NoRaids(t *testing.T) {
	game := newTestGame(42)
	engine := NewLaneEngine(game)

	result := engine.ExecuteRaidResolution()

	if !result.Success {
		t.Errorf("Should succeed with no raids: %s", result.Error)
	}
	if result.Phase != models.PhaseRaidResolution {
		t.Error("Phase should be RaidResolution")
	}
	if len(result.RaidResults) != 0 {
		t.Error("Should have no raid results")
	}
	if game.CurrentPhase != models.PhaseDeferredResolution {
		t.Error("Should advance to DeferredResolution phase")
	}
}

func TestExecuteRaidResolution_WithRaids(t *testing.T) {
	game := newTestGame(42)

	// Add a raid that's ready to resolve
	game.PendingRaids = append(game.PendingRaids, models.PendingRaid{
		Owner:             models.Player1,
		Lane:              2,
		TurnsUntilResolve: 0, // Ready to resolve
		Source:            "RAID",
	})
	// Place a piece on enemy side (the raid marker)
	game.PlacePiece(2, models.Player2)

	engine := NewLaneEngine(game)
	result := engine.ExecuteRaidResolution()

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}
	if len(result.RaidResults) != 1 {
		t.Error("Should have 1 raid result")
	}
}

func TestExecuteRaidResolution_WrongPhase(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	engine := NewLaneEngine(game)
	result := engine.ExecuteRaidResolution()

	if result.Success {
		t.Error("Should fail when not in raid resolution phase")
	}
}

func TestExecuteRaidResolution_GameNotPlaying(t *testing.T) {
	game := newTestGame(42)
	game.Status = models.LaneStatusSetup

	engine := NewLaneEngine(game)
	result := engine.ExecuteRaidResolution()

	if result.Success {
		t.Error("Should fail when game not in progress")
	}
}

// ============================================================================
// ExecuteDeferredResolution Tests
// ============================================================================

func TestExecuteDeferredResolution_NoDeferred(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseDeferredResolution

	engine := NewLaneEngine(game)
	result := engine.ExecuteDeferredResolution()

	if !result.Success {
		t.Errorf("Should succeed with no deferred: %s", result.Error)
	}
	if len(result.DeferredResults) != 0 {
		t.Error("Should have no deferred results")
	}
	if game.CurrentPhase != models.PhaseAutoPlacement {
		t.Error("Should advance to AutoPlacement phase")
	}
}

func TestExecuteDeferredResolution_WithDeferred(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseDeferredResolution

	// Add deferred effect
	game.Lanes[2].AddDeferred(models.DeferredEffect{
		Type:       models.DeferredReinforce,
		Owner:      models.Player1,
		TargetLane: 2,
	})

	engine := NewLaneEngine(game)
	result := engine.ExecuteDeferredResolution()

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}
	if len(result.DeferredResults) != 1 {
		t.Error("Should have 1 deferred result")
	}
}

func TestExecuteDeferredResolution_WrongPhase(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)
	result := engine.ExecuteDeferredResolution()

	if result.Success {
		t.Error("Should fail when not in deferred resolution phase")
	}
}

// ============================================================================
// ExecuteAutoPlacement Tests
// ============================================================================

func TestExecuteAutoPlacement_Success(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}
	if result.LaneIndex < 0 || result.LaneIndex >= models.DefaultLaneCount {
		t.Error("Should return valid lane index")
	}
	if len(result.Placements) != 1 {
		t.Error("Should have 1 placement")
	}
	if game.CurrentPhase != models.PhasePerkSelection {
		t.Error("Should advance to PerkSelection phase")
	}
}

func TestExecuteAutoPlacement_WinsLane(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Fill a lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(0, models.Player1)
	}

	// Block all other lanes so auto-place goes to lane 0
	for i := 1; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}
	if result.LaneIndex != 0 {
		t.Error("Should place on lane 0")
	}
	if result.LaneWinner != models.Player1 {
		t.Error("Should win the lane")
	}
}

func TestExecuteAutoPlacement_WinsGame(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Win 2 lanes already
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}
	game.Player1LanesWon = 2

	// Fill 3rd lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	// Block other lanes
	for i := 3; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}
	if result.GameWinner != models.Player1 {
		t.Error("Should win the game")
	}
}

func TestExecuteAutoPlacement_NoAvailableLanes(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Win/fill all lanes
	for i := 0; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if result.Success {
		t.Error("Should fail when no lanes available")
	}
}

func TestExecuteAutoPlacement_WrongPhase(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if result.Success {
		t.Error("Should fail when not in auto-placement phase")
	}
}

func TestExecuteAutoPlacement_FiresTriggers(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Set up a trigger on a lane (owned by opponent)
	executor := perks.NewPerkExecutor(game)
	executor.Execute(perks.PerkMirror, models.Player2, []int{0})

	// Block all lanes except 0
	for i := 1; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}

	// Should have trigger results from Mirror
	if len(result.TriggerResults) == 0 {
		t.Error("Should fire placement triggers")
	}
}

// ============================================================================
// ExecutePerkSelection Tests
// ============================================================================

func TestExecutePerkSelection_Pass(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	engine := NewLaneEngine(game)
	result := engine.ExecutePerkSelection(0, -1)

	if !result.Success {
		t.Errorf("Pass should succeed: %s", result.Error)
	}
	if result.PerkExecuted != 0 {
		t.Error("Should record 0 (pass) as perk executed")
	}
	// After pass, should switch to opponent's turn
	if game.CurrentPlayer != models.Player2 {
		t.Error("Should switch to Player2 after pass")
	}
}

func TestExecutePerkSelection_PlaceAnother(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection
	targetLane := 2

	engine := NewLaneEngine(game)
	result := engine.ExecutePerkSelection(1, targetLane)

	if !result.Success {
		t.Errorf("PlaceAnother should succeed: %s", result.Error)
	}
	if result.PerkExecuted != 1 {
		t.Error("Should record perk ID 1")
	}
	if game.Lanes[targetLane].CountPieces(models.Player1) != 1 {
		t.Error("Should place piece on target lane")
	}
}

func TestExecutePerkSelection_RemoveEnemy(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection
	targetLane := 2

	game.PlacePiece(targetLane, models.Player2)

	engine := NewLaneEngine(game)
	result := engine.ExecutePerkSelection(2, targetLane)

	if !result.Success {
		t.Errorf("RemoveEnemy should succeed: %s", result.Error)
	}
	if game.Lanes[targetLane].CountPieces(models.Player2) != 0 {
		t.Error("Should remove enemy piece")
	}
}

func TestExecutePerkSelection_WrongPhase(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	engine := NewLaneEngine(game)
	result := engine.ExecutePerkSelection(1, 0)

	if result.Success {
		t.Error("Should fail when not in perk selection phase")
	}
}

func TestExecutePerkSelection_InvalidPerk(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	engine := NewLaneEngine(game)
	result := engine.ExecutePerkSelection(999, 0)

	if result.Success {
		t.Error("Should fail with invalid perk ID")
	}
}

func TestExecutePerkSelection_WinsGame(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	// Win 2 lanes
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}
	game.Player1LanesWon = 2

	// Fill 3rd lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	engine := NewLaneEngine(game)
	result := engine.ExecutePerkSelection(1, 2) // PlaceAnother on lane 2

	if !result.Success {
		t.Errorf("Should succeed: %s", result.Error)
	}
	if result.GameWinner != models.Player1 {
		t.Error("Should win the game")
	}
}

func TestExecutePerkSelection_TwoLanePerk(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	// Add pieces to swap
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(2, models.Player1)

	engine := NewLaneEngine(game)
	// Regroup requires 2 lanes
	result := engine.ExecutePerkSelection(33, 0, 2) // Regroup (perk ID 33)

	if !result.Success {
		t.Errorf("Regroup should succeed: %s", result.Error)
	}

	// Pieces should be swapped
	if game.Lanes[0].CountPieces(models.Player1) != 1 {
		t.Errorf("Lane 0 should have 1 piece after swap, got %d", game.Lanes[0].CountPieces(models.Player1))
	}
	if game.Lanes[2].CountPieces(models.Player1) != 2 {
		t.Errorf("Lane 2 should have 2 pieces after swap, got %d", game.Lanes[2].CountPieces(models.Player1))
	}
}

// ============================================================================
// ExecuteFullTurn Tests
// ============================================================================

func TestExecuteFullTurn_Complete(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)
	results := engine.ExecuteFullTurn(0, -1) // Pass

	// Should have 4 results (raid, deferred, auto, perk)
	if len(results) < 3 {
		t.Errorf("Expected at least 3 results, got %d", len(results))
	}

	// All phases should succeed
	for _, r := range results {
		if !r.Success {
			t.Errorf("Phase %s failed: %s", r.Phase, r.Error)
		}
	}

	// Should be Player2's turn now
	if game.CurrentPlayer != models.Player2 {
		t.Error("Should switch to Player2 after full turn")
	}
}

func TestExecuteFullTurn_GameEndsEarly(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	// Set up to win during auto-placement
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}
	game.Player1LanesWon = 2

	// Fill 3rd lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	// Block other lanes
	for i := 3; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	engine := NewLaneEngine(game)
	results := engine.ExecuteFullTurn(1, 2)

	// Should end early with game winner
	lastResult := results[len(results)-1]
	if lastResult.GameWinner != models.Player1 {
		t.Error("Game should be won by Player1")
	}
}

// ============================================================================
// LaneAI Tests
// ============================================================================

func TestLaneAI_ChoosePerk_Easy(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	ai := NewLaneAI("easy")

	// Run multiple times to test randomness
	for i := 0; i < 10; i++ {
		perkID, targetLane := ai.ChoosePerk(game)

		// Easy AI should choose: 0 (pass), 1 (PlaceAnother), or 2 (RemoveEnemy)
		if perkID < 0 || perkID > 2 {
			t.Errorf("Easy AI should choose perk 0-2, got %d", perkID)
		}

		// If choosing PlaceAnother, target should be valid
		if perkID == 1 {
			if targetLane < 0 || targetLane >= models.DefaultLaneCount {
				t.Errorf("Invalid target lane for PlaceAnother: %d", targetLane)
			}
		}
	}
}

func TestLaneAI_ChoosePerk_Medium_CompletesLane(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	// Set up lane with 4 pieces (AI should complete it)
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	ai := NewLaneAI("medium")
	perkID, targetLane := ai.ChoosePerk(game)

	if perkID != 1 || targetLane != 2 {
		t.Errorf("Medium AI should complete lane 2, got perk %d, lane %d", perkID, targetLane)
	}
}

func TestLaneAI_ChoosePerk_Medium_BlocksOpponent(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	// Set up opponent near-win (4+ pieces)
	for i := 0; i < 4; i++ {
		game.PlacePiece(3, models.Player2)
	}

	ai := NewLaneAI("medium")
	perkID, targetLane := ai.ChoosePerk(game)

	if perkID != 2 || targetLane != 3 {
		t.Errorf("Medium AI should block opponent on lane 3, got perk %d, lane %d", perkID, targetLane)
	}
}

func TestLaneAI_ChoosePerk_Hard(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	// Set up winning opportunity
	for i := 0; i < 4; i++ {
		game.PlacePiece(0, models.Player1)
	}

	ai := NewLaneAI("hard")
	perkID, targetLane := ai.ChoosePerk(game)

	// Hard AI should recognize winning move
	if perkID != 1 || targetLane != 0 {
		t.Errorf("Hard AI should win on lane 0, got perk %d, lane %d", perkID, targetLane)
	}
}

func TestLaneAI_ChoosePerk_Hard_BlocksWin(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection

	// Set up opponent about to win
	for i := 0; i < 5; i++ {
		game.PlacePiece(2, models.Player2)
	}

	ai := NewLaneAI("hard")
	perkID, targetLane := ai.ChoosePerk(game)

	// Hard AI should block the winning lane
	if perkID != 2 || targetLane != 2 {
		t.Errorf("Hard AI should block opponent's win on lane 2, got perk %d, lane %d", perkID, targetLane)
	}
}

// ============================================================================
// ExecuteAITurn Tests
// ============================================================================

func TestExecuteAITurn_Complete(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	ai := NewLaneAI("medium")
	engine := NewLaneEngine(game)
	results := engine.ExecuteAITurn(ai)

	// Should have 4 results
	if len(results) != 4 {
		t.Errorf("Expected 4 results, got %d", len(results))
	}

	// All should succeed
	for _, r := range results {
		if !r.Success {
			t.Errorf("Phase %s failed: %s", r.Phase, r.Error)
		}
	}
}

func TestExecuteAITurn_GameEndsEarly(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	// Set up to win during auto-placement
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}
	game.Player1LanesWon = 2

	// Fill 3rd lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	// Block other lanes
	for i := 3; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}

	ai := NewLaneAI("easy")
	engine := NewLaneEngine(game)
	results := engine.ExecuteAITurn(ai)

	// Should end early
	if len(results) == 4 {
		t.Error("Should end early when game is won")
	}

	// Last result should have game winner
	lastResult := results[len(results)-1]
	if lastResult.GameWinner != models.Player1 {
		t.Error("Game should be won")
	}
}

// ============================================================================
// Integration Tests - Full Game Simulation
// ============================================================================

func TestFullGameSimulation_AIvsAI(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	ai1 := NewLaneAI("medium")
	ai2 := NewLaneAI("medium")
	engine := NewLaneEngine(game)

	maxTurns := 100 // Prevent infinite loops
	for turn := 0; turn < maxTurns && game.Status != models.LaneStatusFinished; turn++ {
		var ai *LaneAI
		if game.CurrentPlayer == models.Player1 {
			ai = ai1
		} else {
			ai = ai2
		}

		results := engine.ExecuteAITurn(ai)

		// Check for game end
		for _, r := range results {
			if r.GameWinner != 0 {
				if game.Status != models.LaneStatusFinished {
					t.Error("Game status should be finished when winner is set")
				}
				return
			}
		}
	}

	if game.Status != models.LaneStatusFinished {
		t.Error("Game should finish within max turns")
	}
}

func TestFullGameSimulation_Player1Wins(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)

	// Simulate Player1 winning 3 lanes
	for lane := 0; lane < 3; lane++ {
		// P1 fills lane while P2 does nothing
		for i := 0; i < 5; i++ {
			// P1 turn - place on target lane
			results := engine.ExecuteFullTurn(1, lane)
			for _, r := range results {
				if r.GameWinner != 0 {
					if r.GameWinner != models.Player1 {
						t.Errorf("Expected Player1 to win, got %v", r.GameWinner)
					}
					return
				}
			}

			// P2 turn - pass
			if game.CurrentPlayer == models.Player2 {
				engine.ExecuteFullTurn(0, -1)
			}
		}
	}

	if game.Winner != models.Player1 {
		t.Error("Player1 should win")
	}
}

func TestFullGameSimulation_MixedPerks(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)

	// P1 places pieces
	engine.ExecuteFullTurn(1, 0) // PlaceAnother on lane 0
	// P2 places pieces
	engine.ExecuteFullTurn(1, 1) // PlaceAnother on lane 1

	// Verify pieces are placed
	if game.Lanes[0].CountPieces(models.Player1) < 1 {
		t.Error("P1 should have piece on lane 0")
	}
	if game.Lanes[1].CountPieces(models.Player2) < 1 {
		t.Error("P2 should have piece on lane 1")
	}

	// P1 removes P2's piece
	engine.ExecuteFullTurn(2, 1) // RemoveEnemy on lane 1

	// P2's piece count on lane 1 should be reduced
	// (accounting for auto-placement that adds pieces each turn)
}

// ============================================================================
// Edge Case Tests
// ============================================================================

func TestEdgeCase_AllLanesWon(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Win all lanes by P2
	for i := 0; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player2
	}
	game.Player2LanesWon = 5
	game.Winner = models.Player2
	game.Status = models.LaneStatusFinished

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if result.Success {
		t.Error("Should fail when game is finished")
	}
}

func TestEdgeCase_FrozenLaneSkipped(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Freeze all lanes except one
	for i := 0; i < models.DefaultLaneCount-1; i++ {
		game.Lanes[i].SetFreeze(models.Player1, 2)
	}

	engine := NewLaneEngine(game)
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Errorf("Should succeed with one available lane: %s", result.Error)
	}

	// Should place on the non-frozen lane (lane 4)
	if result.LaneIndex != 4 {
		t.Errorf("Should place on non-frozen lane 4, got %d", result.LaneIndex)
	}
}

func TestEdgeCase_TriggerChainWinsGame(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseAutoPlacement

	// Win 2 lanes
	for lane := 0; lane < 2; lane++ {
		for i := 0; i < 5; i++ {
			game.PlacePiece(lane, models.Player1)
		}
		game.Lanes[lane].Winner = models.Player1
	}
	game.Player1LanesWon = 2

	// Fill 3rd lane to 4 pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	// Set up Mirror trigger on lane 3 (owned by P1)
	executor := perks.NewPerkExecutor(game)
	executor.Execute(perks.PerkMirror, models.Player1, []int{2})

	// Block all lanes except 2
	for i := 0; i < models.DefaultLaneCount; i++ {
		if i != 2 {
			game.Lanes[i].Winner = models.Player2
		}
	}

	// Now when P2 places on lane 2, Mirror fires and might win for P1
	game.CurrentPlayer = models.Player2
	engine := NewLaneEngine(game)

	result := engine.ExecuteAutoPlacement()

	// Mirror should fire and potentially win the game for P1
	if len(result.TriggerResults) == 0 {
		t.Error("Mirror trigger should fire")
	}
}
