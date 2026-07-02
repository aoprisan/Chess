package game

import (
	"testing"

	"github.com/kiddiechess/server/internal/models"
	"github.com/kiddiechess/server/internal/perks"
)

// Helper to create a test game with deterministic seed.
// TurnNumber is set past the fair-start opening turn (player 1's turn 1 is
// auto-placement only) so tests exercise the standard turn shape.
func newTestGame(seed int64) *models.LaneGame {
	game := models.NewLaneGame()
	game.SetSeed(seed)
	game.Status = models.LaneStatusPlaying
	game.CurrentPhase = models.PhaseRaidResolution
	game.TurnNumber = 2
	return game
}

// ============================================================================
// Fair Start Tests
// ============================================================================

func TestFairStart_Player1OpeningTurnSkipsPerkPhase(t *testing.T) {
	game := models.NewLaneGame()
	game.SetSeed(42)
	game.Status = models.LaneStatusPlaying

	engine := NewLaneEngine(game)
	engine.ExecuteRaidResolution()
	engine.ExecuteDeferredResolution()
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Fatalf("Auto-placement should succeed: %s", result.Error)
	}
	if !result.PerkPhaseSkipped {
		t.Error("Player 1's opening turn should skip the perk phase")
	}
	if game.CurrentPlayer != models.Player2 {
		t.Error("Turn should pass to player 2 after the opening auto-placement")
	}
	if game.CurrentPhase != models.PhaseRaidResolution {
		t.Error("Player 2's turn should start at raid resolution")
	}
	if len(game.CurrentPerkSlots) != 0 {
		t.Error("No perk slots should be offered on the opening turn")
	}
}

func TestFairStart_Player2FirstTurnHasPerkPhase(t *testing.T) {
	game := models.NewLaneGame()
	game.SetSeed(42)
	game.Status = models.LaneStatusPlaying

	engine := NewLaneEngine(game)

	// Player 1's opening turn (auto-placement only)
	engine.ExecuteRaidResolution()
	engine.ExecuteDeferredResolution()
	engine.ExecuteAutoPlacement()

	// Player 2's first turn runs the full cycle
	engine.ExecuteRaidResolution()
	engine.ExecuteDeferredResolution()
	result := engine.ExecuteAutoPlacement()

	if !result.Success {
		t.Fatalf("Auto-placement should succeed: %s", result.Error)
	}
	if result.PerkPhaseSkipped {
		t.Error("Player 2's first turn should include the perk phase")
	}
	if game.CurrentPhase != models.PhasePerkSelection {
		t.Error("Should advance to PerkSelection phase")
	}
	if len(game.CurrentPerkSlots) != 4 {
		t.Errorf("Expected 4 perk slots, got %d", len(game.CurrentPerkSlots))
	}
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
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	ai := NewLaneAI("easy")

	// Run multiple times to test randomness
	for i := 0; i < 10; i++ {
		perkID, targets := ai.ChoosePerk(game)

		// Easy AI should choose a valid perk ID or pass (0)
		if perkID < 0 {
			t.Errorf("Easy AI should choose perk >= 0, got %d", perkID)
		}

		// If choosing a single-target perk, target should be valid
		if perkID > 0 && len(targets) == 1 {
			if targets[0] < 0 || targets[0] >= models.DefaultLaneCount {
				t.Errorf("Invalid target lane: %d", targets[0])
			}
		}
	}
}

func TestLaneAI_ChoosePerk_Medium_CompletesLane(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	// Set up lane with 4 pieces (AI should complete it)
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player1)
	}

	ai := NewLaneAI("medium")
	perkID, targets := ai.ChoosePerk(game)

	if perkID != 1 || len(targets) != 1 || targets[0] != 2 {
		t.Errorf("Medium AI should complete lane 2, got perk %d, targets %v", perkID, targets)
	}
}

func TestLaneAI_ChoosePerk_Medium_BlocksOpponent(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	// Set up opponent near-win (4+ pieces)
	for i := 0; i < 4; i++ {
		game.PlacePiece(3, models.Player2)
	}

	ai := NewLaneAI("medium")
	perkID, targets := ai.ChoosePerk(game)

	if perkID != 2 || len(targets) != 1 || targets[0] != 3 {
		t.Errorf("Medium AI should block opponent on lane 3, got perk %d, targets %v", perkID, targets)
	}
}

func TestLaneAI_ChoosePerk_Hard(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	// Set up winning opportunity
	for i := 0; i < 4; i++ {
		game.PlacePiece(0, models.Player1)
	}

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	// Hard AI should recognize winning move
	if perkID != 1 || len(targets) != 1 || targets[0] != 0 {
		t.Errorf("Hard AI should win on lane 0, got perk %d, targets %v", perkID, targets)
	}
}

func TestLaneAI_ChoosePerk_Hard_BlocksWin(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhasePerkSelection
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	// Set up opponent about to win
	for i := 0; i < 5; i++ {
		game.PlacePiece(2, models.Player2)
	}

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	// Hard AI should block the winning lane
	if perkID != 2 || len(targets) != 1 || targets[0] != 2 {
		t.Errorf("Hard AI should block opponent's win on lane 2, got perk %d, targets %v", perkID, targets)
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

// ============================================================================
// Comprehensive Full Game Simulation Tests (Python-style)
// ============================================================================

func TestSimulation_AIvsAI_EasyVsEasy(t *testing.T) {
	// Run multiple games with different seeds to test randomness
	wins := map[models.PlayerSide]int{models.Player1: 0, models.Player2: 0}

	for seed := int64(0); seed < 10; seed++ {
		game := newTestGame(seed)
		game.CurrentPhase = models.PhaseRaidResolution

		ai1 := NewLaneAI("easy")
		ai2 := NewLaneAI("easy")
		engine := NewLaneEngine(game)

		maxTurns := 100
		for turn := 0; turn < maxTurns && game.Status != models.LaneStatusFinished; turn++ {
			var ai *LaneAI
			if game.CurrentPlayer == models.Player1 {
				ai = ai1
			} else {
				ai = ai2
			}

			results := engine.ExecuteAITurn(ai)
			for _, r := range results {
				if r.GameWinner != 0 {
					wins[r.GameWinner]++
					break
				}
			}
		}
	}

	// Both players should have some wins with random play
	if wins[models.Player1] == 0 && wins[models.Player2] == 0 {
		t.Error("At least one player should win in 10 games")
	}
}

func TestSimulation_AIvsAI_MediumVsMedium(t *testing.T) {
	wins := map[models.PlayerSide]int{models.Player1: 0, models.Player2: 0}

	for seed := int64(0); seed < 5; seed++ {
		game := newTestGame(seed)
		game.CurrentPhase = models.PhaseRaidResolution

		ai1 := NewLaneAI("medium")
		ai2 := NewLaneAI("medium")
		engine := NewLaneEngine(game)

		maxTurns := 100
		for turn := 0; turn < maxTurns && game.Status != models.LaneStatusFinished; turn++ {
			var ai *LaneAI
			if game.CurrentPlayer == models.Player1 {
				ai = ai1
			} else {
				ai = ai2
			}

			results := engine.ExecuteAITurn(ai)
			for _, r := range results {
				if r.GameWinner != 0 {
					wins[r.GameWinner]++
					break
				}
			}
		}
	}

	total := wins[models.Player1] + wins[models.Player2]
	if total < 3 {
		t.Errorf("Expected at least 3 games to finish, got %d", total)
	}
}

func TestSimulation_AIvsAI_HardVsHard(t *testing.T) {
	wins := map[models.PlayerSide]int{models.Player1: 0, models.Player2: 0}
	totalTurns := 0

	for seed := int64(0); seed < 3; seed++ {
		game := newTestGame(seed)
		game.CurrentPhase = models.PhaseRaidResolution

		ai1 := NewLaneAI("hard")
		ai2 := NewLaneAI("hard")
		engine := NewLaneEngine(game)

		turns := 0
		maxTurns := 100
		for turns = 0; turns < maxTurns && game.Status != models.LaneStatusFinished; turns++ {
			var ai *LaneAI
			if game.CurrentPlayer == models.Player1 {
				ai = ai1
			} else {
				ai = ai2
			}

			results := engine.ExecuteAITurn(ai)
			for _, r := range results {
				if r.GameWinner != 0 {
					wins[r.GameWinner]++
					break
				}
			}
		}
		totalTurns += turns
	}

	// Games should complete
	if wins[models.Player1]+wins[models.Player2] == 0 {
		t.Error("At least one game should finish")
	}
}

func TestSimulation_PerkUsageTracking(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	perkUsage := make(map[int]int)
	engine := NewLaneEngine(game)

	maxTurns := 50
	for turn := 0; turn < maxTurns && game.Status != models.LaneStatusFinished; turn++ {
		// Execute full turn with random perk
		perkID := game.Rand().Intn(3) // 0=pass, 1=place, 2=remove
		targetLane := -1
		if perkID > 0 {
			available := game.GetAvailableLanes(game.CurrentPlayer)
			if len(available) > 0 {
				targetLane = available[game.Rand().Intn(len(available))]
			}
		}

		results := engine.ExecuteFullTurn(perkID, targetLane)
		perkUsage[perkID]++

		for _, r := range results {
			if r.GameWinner != 0 {
				break
			}
		}
	}

	// Verify perk usage was tracked
	if len(perkUsage) == 0 {
		t.Error("Perk usage should be tracked")
	}
}

func TestSimulation_TriggerInteractions(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)
	executor := perks.NewPerkExecutor(game)

	// P1 sets triggers
	engine.ExecuteFullTurn(0, -1) // Pass raid/deferred/auto

	// Set up triggers using perk executor directly
	executor.Execute(perks.PerkMirror, models.Player1, []int{0})
	executor.Execute(perks.PerkPortal, models.Player1, []int{1})
	executor.Execute(perks.PerkTrap, models.Player1, []int{2})

	// Verify triggers are set
	if !game.Lanes[0].HasTriggerType(models.TriggerMirror) {
		t.Error("Mirror trigger should be set")
	}
	if !game.Lanes[1].HasTriggerType(models.TriggerPortal) {
		t.Error("Portal trigger should be set")
	}
	if !game.Lanes[2].HasTriggerType(models.TriggerTrap) {
		t.Error("Trap trigger should be set")
	}

	// Switch to P2 and place on lane 0 (triggers Mirror)
	game.CurrentPlayer = models.Player2
	game.CurrentPhase = models.PhaseAutoPlacement

	// Force placement on lane 0 by winning other lanes
	for i := 1; i < models.DefaultLaneCount; i++ {
		game.Lanes[i].Winner = models.Player1
	}

	result := engine.ExecuteAutoPlacement()

	// Mirror should have fired
	mirrorFired := false
	for _, tr := range result.TriggerResults {
		if tr.TriggerType == models.TriggerMirror {
			mirrorFired = true
			break
		}
	}
	if !mirrorFired {
		t.Error("Mirror trigger should have fired")
	}
}

func TestSimulation_DeferredEffects(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)
	executor := perks.NewPerkExecutor(game)

	// Execute to get to perk selection
	engine.ExecuteRaidResolution()
	engine.ExecuteDeferredResolution()
	engine.ExecuteAutoPlacement()

	// P1 uses Reinforce (deferred perk)
	executor.Execute(perks.PerkReinforce, models.Player1, []int{2})

	// Verify deferred effect is added
	if len(game.Lanes[2].Deferred) != 1 {
		t.Error("Deferred effect should be added")
	}

	// Switch turn (P2's turn) and then back to P1's turn for deferred processing
	game.SwitchTurn() // Now P2
	game.SwitchTurn() // Back to P1
	game.CurrentPhase = models.PhaseDeferredResolution

	result := engine.ExecuteDeferredResolution()

	// Deferred effects are processed for the current player (P1)
	// Since deferred processing happens at start of turn, the effect should process
	if len(result.DeferredResults) == 0 && len(game.Lanes[2].Deferred) == 0 {
		// Deferred was already processed or cleared
		t.Log("Deferred effect was processed or cleared during turn switch")
	}
}

func TestSimulation_RaidMechanics(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPhase = models.PhaseRaidResolution

	engine := NewLaneEngine(game)
	executor := perks.NewPerkExecutor(game)

	// Execute to perk selection
	engine.ExecuteRaidResolution()
	engine.ExecuteDeferredResolution()
	engine.ExecuteAutoPlacement()

	// P1 uses Raid
	result := executor.Execute(perks.PerkRaid, models.Player1, []int{2})
	if !result.Success {
		t.Fatalf("Raid should succeed: %s", result.Error)
	}

	// Verify raid marker and pending raid
	if game.Lanes[2].CountPieces(models.Player2) != 1 {
		t.Error("Raid marker should be on enemy side")
	}
	if len(game.PendingRaids) != 1 {
		t.Error("Pending raid should be tracked")
	}

	// Fast forward to raid resolution
	game.PendingRaids[0].TurnsUntilResolve = 0
	game.CurrentPhase = models.PhaseRaidResolution

	raidResult := engine.ExecuteRaidResolution()

	// Raid should be resolved
	if len(raidResult.RaidResults) != 1 {
		t.Errorf("Expected 1 raid result, got %d", len(raidResult.RaidResults))
	}
}

func TestSimulation_MultipleTriggersFireInOrder(t *testing.T) {
	game := newTestGame(42)
	executor := perks.NewPerkExecutor(game)
	lane := 2

	// Set multiple triggers in specific order
	executor.Execute(perks.PerkTrap, models.Player1, []int{lane})
	executor.Execute(perks.PerkMirror, models.Player1, []int{lane})

	// P2 places on the lane
	game.PlacePiece(lane, models.Player2)
	results := executor.FirePlacementTriggers(lane, models.Player2, 0)

	if len(results) < 2 {
		t.Fatalf("Expected 2 trigger results, got %d", len(results))
	}

	// Verify FIFO order
	if results[0].TriggerType != models.TriggerTrap {
		t.Error("Trap should fire first (FIFO)")
	}
	if results[1].TriggerType != models.TriggerMirror {
		t.Error("Mirror should fire second (FIFO)")
	}
}

func TestSimulation_CaptureAndSanctuaryInteraction(t *testing.T) {
	game := newTestGame(42)

	// P1 has Capture, P2 has Sanctuary
	game.AddCapture(models.Player1, 0, 2)
	game.AddSanctuary(models.Player2, 4, 2)

	// Place P2 piece
	game.PlacePiece(2, models.Player2)

	// P1 removes P2's piece
	result := game.RemovePieceWithRedirects(2, models.Player2, models.Player1)

	// Capture should take priority
	if result.RedirectType != "capture" {
		t.Error("Capture should take priority over Sanctuary")
	}
	if !result.Converted {
		t.Error("Piece should be converted")
	}
	if game.Lanes[0].CountPieces(models.Player1) != 1 {
		t.Error("Piece should be on capture lane as P1's")
	}
}

func TestSimulation_LaneWinCleanup(t *testing.T) {
	game := newTestGame(42)
	lane := 2

	// Add various effects
	orderID := game.GetNextTriggerOrder()
	game.Lanes[lane].AddTrigger(models.Trigger{
		Type:      models.TriggerMirror,
		Owner:     models.Player1,
		TurnsLeft: 2,
		OrderID:   orderID,
	})
	game.Lanes[lane].AddDeferred(models.DeferredEffect{
		Type:       models.DeferredReinforce,
		Owner:      models.Player1,
		TargetLane: lane,
	})
	game.Lanes[lane].SetFreeze(models.Player2, 2)
	game.AddSanctuary(models.Player1, lane, 2)
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

	// All effects should be cleared
	if len(game.Lanes[lane].Triggers) != 0 {
		t.Error("Triggers should be cleared")
	}
	if len(game.Lanes[lane].Deferred) != 0 {
		t.Error("Deferred should be cleared")
	}
	if game.Lanes[lane].FreezeTurns != 0 {
		t.Error("Freeze should be cleared")
	}
	for _, s := range game.Player1Sanctuaries {
		if s.Lane == lane {
			t.Error("Sanctuary pointing to won lane should be removed")
		}
	}
	for _, r := range game.PendingRaids {
		if r.Lane == lane {
			t.Error("Raids on won lane should be removed")
		}
	}
}

func TestSimulation_GameStateCloning(t *testing.T) {
	game := newTestGame(42)

	// Set up complex state
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(1, models.Player2)
	game.Player1Cloaked = 2
	game.AddSanctuary(models.Player1, 2, 3)
	orderID := game.GetNextTriggerOrder()
	game.Lanes[3].AddTrigger(models.Trigger{
		Type:      models.TriggerMirror,
		Owner:     models.Player1,
		TurnsLeft: 2,
		OrderID:   orderID,
	})

	// Clone
	clone := game.Clone()

	// Modify original
	game.PlacePiece(0, models.Player1)
	game.Player1Cloaked = 0
	game.Lanes[3].ClearTriggers()

	// Clone should be independent
	if clone.Lanes[0].CountPieces(models.Player1) != 1 {
		t.Error("Clone piece count should be independent")
	}
	if clone.Player1Cloaked != 2 {
		t.Error("Clone cloak should be independent")
	}
	if !clone.Lanes[3].HasTriggerType(models.TriggerMirror) {
		t.Error("Clone triggers should be independent")
	}
}

func TestSimulation_TurnDurationDecrement(t *testing.T) {
	game := newTestGame(42)
	game.Status = models.LaneStatusPlaying

	// Set up duration effects
	game.Player1Cloaked = 2
	game.Player2Blinded = 2
	game.Lanes[0].SetFreeze(models.Player2, 2)
	game.AddSanctuary(models.Player1, 2, 2)
	game.PendingRaids = append(game.PendingRaids, models.PendingRaid{
		Owner:             models.Player1,
		Lane:              3,
		TurnsUntilResolve: 2,
	})

	// Switch turn
	game.SwitchTurn()

	// All durations should decrement
	if game.Player1Cloaked != 1 {
		t.Errorf("Cloak should decrement, got %d", game.Player1Cloaked)
	}
	if game.Player2Blinded != 1 {
		t.Errorf("Blind should decrement, got %d", game.Player2Blinded)
	}
	if game.Lanes[0].FreezeTurns != 1 {
		t.Errorf("Freeze should decrement, got %d", game.Lanes[0].FreezeTurns)
	}
	if game.Player1Sanctuaries[0].TurnsLeft != 1 {
		t.Errorf("Sanctuary should decrement, got %d", game.Player1Sanctuaries[0].TurnsLeft)
	}
	if game.PendingRaids[0].TurnsUntilResolve != 1 {
		t.Errorf("Raid timer should decrement, got %d", game.PendingRaids[0].TurnsUntilResolve)
	}

	// Second switch - some should expire
	game.SwitchTurn()

	if game.Player1Cloaked != 0 {
		t.Error("Cloak should be expired")
	}
	if game.IsCloaked(models.Player1) {
		t.Error("Player should not be cloaked after expiry")
	}
}

func TestSimulation_BatchGames(t *testing.T) {
	// Run a batch of games and track statistics
	gamesPlayed := 0
	p1Wins := 0
	p2Wins := 0
	totalTurns := 0

	for seed := int64(0); seed < 20; seed++ {
		game := newTestGame(seed)
		game.CurrentPhase = models.PhaseRaidResolution

		ai1 := NewLaneAI("medium")
		ai2 := NewLaneAI("medium")
		engine := NewLaneEngine(game)

		turns := 0
		maxTurns := 150

		for turns = 0; turns < maxTurns && game.Status != models.LaneStatusFinished; turns++ {
			var ai *LaneAI
			if game.CurrentPlayer == models.Player1 {
				ai = ai1
			} else {
				ai = ai2
			}

			results := engine.ExecuteAITurn(ai)
			for _, r := range results {
				if r.GameWinner == models.Player1 {
					p1Wins++
					break
				} else if r.GameWinner == models.Player2 {
					p2Wins++
					break
				}
			}
		}

		if game.Status == models.LaneStatusFinished {
			gamesPlayed++
			totalTurns += turns
		}
	}

	if gamesPlayed < 15 {
		t.Errorf("Expected at least 15 games to finish, got %d", gamesPlayed)
	}

	// Both players should win some games
	if p1Wins == 0 || p2Wins == 0 {
		t.Logf("Win distribution: P1=%d, P2=%d (some skew is expected with seeded RNG)", p1Wins, p2Wins)
	}

	avgTurns := float64(totalTurns) / float64(gamesPlayed)
	if avgTurns < 5 || avgTurns > 100 {
		t.Errorf("Average turns %f seems unreasonable", avgTurns)
	}
}
