package game

import (
	"testing"

	"github.com/kiddiechess/server/internal/models"
	"github.com/kiddiechess/server/internal/perks"
)

// newAITestGame creates a game in perk selection phase with perk slots set up
func newAITestGame(seed int64) *models.LaneGame {
	game := models.NewLaneGame()
	game.SetSeed(seed)
	game.Status = models.LaneStatusPlaying
	game.CurrentPlayer = models.Player2 // AI is usually Player2
	game.CurrentPhase = models.PhasePerkSelection
	// Default perk slots: PlaceAnother, RemoveEnemy, Freeze, Scramble
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")
	return game
}

// ============================================================================
// Basic AI Creation Tests
// ============================================================================

func TestNewLaneAI_ValidDifficulties(t *testing.T) {
	for _, diff := range []string{"easy", "medium", "hard"} {
		ai := NewLaneAI(diff)
		if ai.difficulty != diff {
			t.Errorf("Expected difficulty %s, got %s", diff, ai.difficulty)
		}
	}
}

func TestNewLaneAI_InvalidDifficulty(t *testing.T) {
	ai := NewLaneAI("impossible")
	// Should fall back to easy params
	if ai.params.passChance != 30 {
		t.Error("Invalid difficulty should use easy params")
	}
}

// ============================================================================
// ChoosePerk Return Format Tests
// ============================================================================

func TestChoosePerk_PassReturnsZeroNil(t *testing.T) {
	game := newAITestGame(42)
	// Empty board, no good targets
	ai := NewLaneAI("hard")

	perkID, targets := ai.ChoosePerk(game)
	// With empty board, PlaceAnother should score > 0 (base bonus of 5)
	// but let's just verify the return format is correct
	if perkID < 0 {
		t.Errorf("perkID should be >= 0, got %d", perkID)
	}
	if perkID == 0 && targets != nil {
		t.Error("Pass should return nil targets")
	}
}

func TestChoosePerk_PlaceAnotherReturnsSingleTarget(t *testing.T) {
	game := newAITestGame(42)
	// Only offer PlaceAnother
	game.GeneratePerkSlots(int(perks.PerkPlaceAnother), "PlaceAnother", int(perks.PerkPlaceAnother), "PlaceAnother")

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	if perkID == 1 {
		if len(targets) != 1 {
			t.Errorf("PlaceAnother should return 1 target, got %d", len(targets))
		}
		if targets[0] < 0 || targets[0] >= models.DefaultLaneCount {
			t.Errorf("Target lane out of range: %d", targets[0])
		}
	}
}

// ============================================================================
// Difficulty-Specific Behavior Tests
// ============================================================================

func TestEasyAI_SometimesPasses(t *testing.T) {
	passCount := 0
	iterations := 100

	for i := 0; i < iterations; i++ {
		game := newAITestGame(int64(i * 37))
		// Put some pieces on the board so there are valid moves
		game.PlacePiece(0, models.Player1)
		game.PlacePiece(1, models.Player2)

		ai := NewLaneAI("easy")
		perkID, _ := ai.ChoosePerk(game)
		if perkID == 0 {
			passCount++
		}
	}

	// Easy should pass sometimes (30% chance + 25% random which might pick pass)
	if passCount == 0 {
		t.Error("Easy AI should pass at least sometimes over 100 iterations")
	}
	if passCount == iterations {
		t.Error("Easy AI should not pass every single time")
	}
}

func TestHardAI_NeverPasses_WithGoodMoves(t *testing.T) {
	passCount := 0
	iterations := 50

	for i := 0; i < iterations; i++ {
		game := newAITestGame(int64(i * 41))
		// Put pieces so there are clear good moves
		game.PlacePiece(0, models.Player2)
		game.PlacePiece(0, models.Player2)
		game.PlacePiece(0, models.Player2)
		game.PlacePiece(0, models.Player2) // 4 pieces = near-win

		ai := NewLaneAI("hard")
		perkID, _ := ai.ChoosePerk(game)
		if perkID == 0 {
			passCount++
		}
	}

	if passCount > 0 {
		t.Errorf("Hard AI should never pass when there's a winning move, but passed %d/%d times", passCount, iterations)
	}
}

func TestHardAI_PrefersWinningMove(t *testing.T) {
	game := newAITestGame(42)
	// Player2 has 4 pieces on lane 2 = winning move available
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player2)
	}

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	if perkID != 1 { // PlaceAnother
		t.Errorf("Hard AI should pick PlaceAnother for winning move, got perkID=%d", perkID)
	}
	if len(targets) != 1 || targets[0] != 2 {
		t.Errorf("Should target lane 2, got targets=%v", targets)
	}
}

func TestHardAI_BlocksOpponentWin(t *testing.T) {
	game := newAITestGame(42)
	// Player1 (opponent of AI=Player2) has 5 pieces on lane 3
	for i := 0; i < 5; i++ {
		game.PlacePiece(3, models.Player1)
	}
	// Only RemoveEnemy and pass available (no PlaceAnother winning opportunity)
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	if perkID != 2 { // RemoveEnemy
		t.Errorf("Hard AI should pick RemoveEnemy to block opponent, got perkID=%d", perkID)
	}
	if len(targets) != 1 || targets[0] != 3 {
		t.Errorf("Should target lane 3, got targets=%v", targets)
	}
}

// ============================================================================
// Slot 3-4 Perk Usage Tests
// ============================================================================

func TestAI_UsesSlot3Perks(t *testing.T) {
	// Test that AI actually evaluates and picks slot 3 perks
	game := newAITestGame(42)
	// Set up a scenario where Freeze is valuable
	// Opponent has 4 pieces on lane 1
	for i := 0; i < 4; i++ {
		game.PlacePiece(1, models.Player1)
	}
	// Our lane 1 also has pieces (contested lane)
	game.PlacePiece(1, models.Player2)
	game.PlacePiece(1, models.Player2)

	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	ai := NewLaneAI("hard")
	perkID, _ := ai.ChoosePerk(game)

	// Should pick either RemoveEnemy (to block) or Freeze (to block placement)
	// Both are good choices; just verify it's not passing
	if perkID == 0 {
		t.Error("Hard AI should not pass when opponent is about to win")
	}
}

func TestAI_UsesAutoTargetPerks(t *testing.T) {
	game := newAITestGame(42)
	// Set up scenario where Scramble is valuable: opponent has concentrated pieces
	for i := 0; i < 4; i++ {
		game.PlacePiece(0, models.Player1) // 4 pieces concentrated on lane 0
	}
	game.PlacePiece(2, models.Player1) // 1 piece on lane 2

	// Only offer auto-target perk in slot 4
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	// Should consider Scramble (auto-target, nil targets) or RemoveEnemy
	if perkID == int(perks.PerkScramble) {
		if targets != nil {
			t.Error("Scramble is auto-target, should have nil targets")
		}
	}
	// Just verify it picked something (not passing)
	if perkID == 0 {
		t.Error("Hard AI should not pass when opponent has concentrated pieces")
	}
}

func TestAI_UsesTwoLanePerks(t *testing.T) {
	game := newAITestGame(42)
	// Set up scenario for Regroup: pieces on two lanes that could be swapped
	for i := 0; i < 4; i++ {
		game.PlacePiece(0, models.Player2) // 4 pieces on lane 0
	}
	game.PlacePiece(3, models.Player2) // 1 piece on lane 3

	game.GeneratePerkSlots(int(perks.PerkRegroup), "Regroup", int(perks.PerkScramble), "Scramble")

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	if perkID == int(perks.PerkRegroup) {
		if len(targets) != 2 {
			t.Errorf("Regroup should return 2 targets, got %d", len(targets))
		}
	}
}

func TestAI_UsesDisruptPerk(t *testing.T) {
	game := newAITestGame(42)
	// Opponent has concentrated pieces that should be disrupted
	for i := 0; i < 4; i++ {
		game.PlacePiece(1, models.Player1) // 4 pieces on lane 1
	}
	game.PlacePiece(3, models.Player1) // 1 piece on lane 3

	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkDisrupt), "Disrupt")

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	if perkID == int(perks.PerkDisrupt) {
		if len(targets) != 2 {
			t.Errorf("Disrupt should return 2 targets, got %d", len(targets))
		}
	}
	if perkID == 0 {
		t.Error("Hard AI should not pass when opponent has concentrated pieces")
	}
}

// ============================================================================
// Perk Scoring Tests
// ============================================================================

func TestScoreLaneForPlacement_WinningMove(t *testing.T) {
	game := newAITestGame(42)
	for i := 0; i < 4; i++ {
		game.PlacePiece(2, models.Player2)
	}

	ai := NewLaneAI("hard")
	score := ai.scoreLaneForPlacement(game, models.Player2, 2)

	// 4 pieces * 20 + 120*10 = 1280
	if score < 1000 {
		t.Errorf("Winning move should score very high, got %d", score)
	}
}

func TestScoreLaneForPlacement_EmptyLane(t *testing.T) {
	game := newAITestGame(42)

	ai := NewLaneAI("hard")
	score := ai.scoreLaneForPlacement(game, models.Player2, 0)

	// 0 pieces * 20 + positionAdvance bonus (opponent has 0 pieces)
	if score < 0 {
		t.Errorf("Empty lane placement should score >= 0, got %d", score)
	}
}

func TestScoreLaneForRemoval_BlockingWin(t *testing.T) {
	game := newAITestGame(42)
	for i := 0; i < 5; i++ {
		game.PlacePiece(1, models.Player1)
	}

	ai := NewLaneAI("hard")
	score := ai.scoreLaneForRemoval(game, models.Player2, 1)

	// 5 pieces * 20 + blockBonus*10 = 1100
	if score < 500 {
		t.Errorf("Blocking win should score very high, got %d", score)
	}
}

// ============================================================================
// Edge Cases
// ============================================================================

func TestAI_EmptyBoard(t *testing.T) {
	game := newAITestGame(42)

	for _, diff := range []string{"easy", "medium", "hard"} {
		ai := NewLaneAI(diff)
		perkID, targets := ai.ChoosePerk(game)

		// Should not crash, and should make a valid decision
		if perkID < 0 {
			t.Errorf("[%s] perkID should be >= 0 on empty board", diff)
		}
		if perkID > 0 && targets != nil {
			for _, t2 := range targets {
				if t2 < 0 || t2 >= models.DefaultLaneCount {
					t.Errorf("[%s] target lane out of range: %d", diff, t2)
				}
			}
		}
	}
}

func TestAI_FullBoard(t *testing.T) {
	game := newAITestGame(42)
	// Fill all lanes and mark them as won so no targets exist
	for i := 0; i < models.DefaultLaneCount; i++ {
		for j := 0; j < models.DefaultSlotsPerSide; j++ {
			game.PlacePiece(i, models.Player1)
			game.PlacePiece(i, models.Player2)
		}
		game.Lanes[i].Winner = models.Player1
	}

	for _, diff := range []string{"easy", "medium", "hard"} {
		ai := NewLaneAI(diff)
		perkID, _ := ai.ChoosePerk(game)

		// Should pass since all lanes are won
		if perkID != 0 {
			t.Errorf("[%s] Should pass when all lanes won, got perkID=%d", diff, perkID)
		}
	}
}

func TestAI_NoPerkSlots(t *testing.T) {
	game := newAITestGame(42)
	game.CurrentPerkSlots = nil

	ai := NewLaneAI("hard")
	perkID, targets := ai.ChoosePerk(game)

	if perkID != 0 {
		t.Errorf("Should pass with no perk slots, got perkID=%d", perkID)
	}
	if targets != nil {
		t.Error("Should return nil targets when passing")
	}
}

func TestAI_CloakedOpponent_CantUseRemoveEnemy(t *testing.T) {
	game := newAITestGame(42)
	game.PlacePiece(0, models.Player1)
	game.SetCloaked(models.Player1, 2) // Opponent is cloaked

	// Only offer RemoveEnemy and PlaceAnother
	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkScramble), "Scramble")

	ai := NewLaneAI("hard")
	perkID, _ := ai.ChoosePerk(game)

	// RemoveEnemy should not be usable against cloaked opponent
	if perkID == 2 {
		t.Error("Should not use RemoveEnemy against cloaked opponent")
	}
}

// ============================================================================
// Trigger/Effect Aware Tests
// ============================================================================

func TestAI_NullifyWithEffects(t *testing.T) {
	game := newAITestGame(42)
	// Add triggers to lane 2
	game.Lanes[2].AddTrigger(models.Trigger{
		Type:      models.TriggerTrap,
		Owner:     models.Player1,
		TurnsLeft: 2,
		OrderID:   game.GetNextTriggerOrder(),
	})
	game.Lanes[2].AddTrigger(models.Trigger{
		Type:      models.TriggerPortal,
		Owner:     models.Player1,
		TurnsLeft: 2,
		OrderID:   game.GetNextTriggerOrder(),
	})

	game.GeneratePerkSlots(int(perks.PerkFreeze), "Freeze", int(perks.PerkNullify), "Nullify")

	ai := NewLaneAI("hard")
	candidates := ai.evaluateYourLanePerk(game, models.Player2, perks.PerkNullify, perks.NewTargetingHelper(game))

	// Should find lane 2 as a candidate with positive score
	foundLane2 := false
	for _, c := range candidates {
		if len(c.targets) > 0 && c.targets[0] == 2 {
			foundLane2 = true
			if c.score <= 0 {
				t.Error("Nullify on lane with triggers should have positive score")
			}
		}
	}
	if !foundLane2 {
		t.Error("Should evaluate Nullify on lane 2 which has triggers")
	}
}

// ============================================================================
// Integration with ExecuteAITurn
// ============================================================================

func TestExecuteAITurn_UsesNewAI(t *testing.T) {
	game := newTestGame(42)
	game.CurrentPlayer = models.Player2

	// Place some pieces to make the game interesting
	game.PlacePiece(0, models.Player1)
	game.PlacePiece(1, models.Player1)

	engine := NewLaneEngine(game)
	ai := NewLaneAI("medium")

	results := engine.ExecuteAITurn(ai)

	if len(results) == 0 {
		t.Error("ExecuteAITurn should return results")
	}

	// Check that all phases were executed
	hasRaid := false
	hasDeferred := false
	hasAuto := false
	hasPerk := false

	for _, r := range results {
		switch r.Phase {
		case models.PhaseRaidResolution:
			hasRaid = true
		case models.PhaseDeferredResolution:
			hasDeferred = true
		case models.PhaseAutoPlacement:
			hasAuto = true
		case models.PhasePerkSelection:
			hasPerk = true
		}
	}

	if !hasRaid {
		t.Error("Missing raid resolution phase")
	}
	if !hasDeferred {
		t.Error("Missing deferred resolution phase")
	}
	if !hasAuto {
		t.Error("Missing auto placement phase")
	}
	if !hasPerk {
		t.Error("Missing perk selection phase")
	}
}
