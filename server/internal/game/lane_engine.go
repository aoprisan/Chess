package game

import (
	"math/rand"

	"github.com/kiddiechess/server/internal/models"
	"github.com/kiddiechess/server/internal/perks"
)

// TestModePerks enables deterministic perk pairing for testing.
// Set to false for production random perk selection.
const TestModePerks = true

// TestPerkPairIndex is the fixed perk pair index used in test mode.
// Change this value and restart to test a different pair.
const TestPerkPairIndex = 1

// TurnResult contains the results of executing a turn phase
type TurnResult struct {
	Success        bool                 `json:"success"`
	Phase          models.LaneTurnPhase `json:"phase"`
	LaneIndex      int                  `json:"laneIndex,omitempty"`      // For auto-placement
	LaneWinner     models.PlayerSide    `json:"laneWinner,omitempty"`     // If a lane was won
	GameWinner     models.PlayerSide    `json:"gameWinner,omitempty"`     // If game is over
	PerkExecuted   int                  `json:"perkExecuted,omitempty"`   // Perk ID that was executed
	Error          string               `json:"error,omitempty"`

	// Raid resolution results
	RaidResults []perks.RaidResult `json:"raidResults,omitempty"`

	// Deferred resolution results
	DeferredResults []perks.DeferredResult `json:"deferredResults,omitempty"`

	// Trigger results (from auto-placement or perk execution)
	TriggerResults []perks.TriggerResult `json:"triggerResults,omitempty"`

	// Multiple placements/removals from effects
	Placements []int `json:"placements,omitempty"`
	Removals   []int `json:"removals,omitempty"`
}

// LaneEngine handles V2 lane game logic
type LaneEngine struct {
	game *models.LaneGame
}

// NewLaneEngine creates a new lane engine for a game
func NewLaneEngine(game *models.LaneGame) *LaneEngine {
	return &LaneEngine{
		game: game,
	}
}

// ExecuteRaidResolution processes pending raids at the start of turn
func (e *LaneEngine) ExecuteRaidResolution() *TurnResult {
	result := &TurnResult{
		Phase:   models.PhaseRaidResolution,
		Success: true,
	}

	if e.game.Status != models.LaneStatusPlaying {
		result.Error = "Game is not in progress"
		result.Success = false
		return result
	}

	if e.game.CurrentPhase != models.PhaseRaidResolution {
		result.Error = "Not in raid resolution phase"
		result.Success = false
		return result
	}

	currentPlayer := e.game.CurrentPlayer
	executor := perks.NewPerkExecutor(e.game)

	// Process all pending raids for current player
	raidResults := executor.ProcessPendingRaids(currentPlayer)
	result.RaidResults = raidResults

	// Collect all placements from raids
	for _, rr := range raidResults {
		if rr.Success {
			result.Placements = append(result.Placements, rr.Placements...)
			if rr.LaneWinner != 0 {
				result.LaneWinner = rr.LaneWinner
			}
			if rr.GameWinner != 0 {
				result.GameWinner = rr.GameWinner
				return result
			}
		}
	}

	// Advance to deferred resolution phase
	e.game.AdvancePhase()

	return result
}

// ExecuteDeferredResolution processes deferred effects at start of turn
func (e *LaneEngine) ExecuteDeferredResolution() *TurnResult {
	result := &TurnResult{
		Phase:   models.PhaseDeferredResolution,
		Success: true,
	}

	if e.game.Status != models.LaneStatusPlaying {
		result.Error = "Game is not in progress"
		result.Success = false
		return result
	}

	if e.game.CurrentPhase != models.PhaseDeferredResolution {
		result.Error = "Not in deferred resolution phase"
		result.Success = false
		return result
	}

	currentPlayer := e.game.CurrentPlayer
	executor := perks.NewPerkExecutor(e.game)

	// Process all deferred effects for current player
	deferredResults := executor.ProcessDeferredEffects(currentPlayer)
	result.DeferredResults = deferredResults

	// Collect results
	for _, dr := range deferredResults {
		if dr.Success {
			result.Placements = append(result.Placements, dr.Placements...)
			result.Removals = append(result.Removals, dr.Removals...)
			if dr.LaneWinner != 0 {
				result.LaneWinner = dr.LaneWinner
			}
			if dr.GameWinner != 0 {
				result.GameWinner = dr.GameWinner
				return result
			}
		}
	}

	// Advance to auto-placement phase
	e.game.AdvancePhase()

	return result
}

// ExecuteAutoPlacement performs the auto-placement phase
// Returns the result of the placement
func (e *LaneEngine) ExecuteAutoPlacement() *TurnResult {
	result := &TurnResult{
		Phase: models.PhaseAutoPlacement,
	}

	if e.game.Status != models.LaneStatusPlaying {
		result.Error = "Game is not in progress"
		return result
	}

	if e.game.CurrentPhase != models.PhaseAutoPlacement {
		result.Error = "Not in auto-placement phase"
		return result
	}

	// Get current player
	currentPlayer := e.game.CurrentPlayer

	// Place piece on random available lane
	laneIndex := e.game.AutoPlace(currentPlayer)
	if laneIndex == -1 {
		// No available lanes - this shouldn't happen in normal gameplay
		result.Error = "No available lanes for placement"
		return result
	}

	result.Success = true
	result.LaneIndex = laneIndex
	result.Placements = []int{laneIndex}

	// Check if lane was won
	laneWinner := e.game.CheckLaneWin(laneIndex)
	if laneWinner != 0 {
		result.LaneWinner = laneWinner

		// Check if game was won
		gameWinner := e.game.CheckGameWin()
		if gameWinner != 0 {
			result.GameWinner = gameWinner
			return result
		}
	}

	// Fire placement triggers (opponent's triggers react to our placement)
	executor := perks.NewPerkExecutor(e.game)
	triggerResults := executor.FirePlacementTriggers(laneIndex, currentPlayer, 0)
	result.TriggerResults = triggerResults

	// Check if any trigger resulted in game win
	for _, tr := range triggerResults {
		if tr.GameWinner != 0 {
			result.GameWinner = tr.GameWinner
			return result
		}
	}

	// Advance to perk selection phase
	e.game.AdvancePhase()

	// Generate perk options
	e.generatePerkSlotsWithSelection()

	return result
}

// generatePerkSlotsWithSelection picks perks for slots 3-4 and generates perk slots.
// In test mode, it cycles deterministically through perk pair indices.
// In production mode, it picks random perks from each pool.
func (e *LaneEngine) generatePerkSlotsWithSelection() {
	poolSize := len(perks.Slot3Pool)
	var slot3Idx, slot4Idx int

	if TestModePerks {
		idx := TestPerkPairIndex % poolSize
		slot3Idx = idx
		slot4Idx = idx
	} else {
		slot3Idx = rand.Intn(poolSize)
		slot4Idx = rand.Intn(len(perks.Slot4Pool))
	}

	slot3ID := int(perks.Slot3Pool[slot3Idx])
	slot3Name := perks.GetPerkName(perks.Slot3Pool[slot3Idx])
	slot4ID := int(perks.Slot4Pool[slot4Idx])
	slot4Name := perks.GetPerkName(perks.Slot4Pool[slot4Idx])

	e.game.GeneratePerkSlots(slot3ID, slot3Name, slot4ID, slot4Name)
}

// ExecutePerkSelection handles perk selection (or pass)
// perkID: 0 = pass, others are perk IDs from the perks package
// targetLane: which lane to target (-1 for no target)
// targetLane2: second lane for two-lane perks like Regroup/Disrupt
func (e *LaneEngine) ExecutePerkSelection(perkID int, targetLane int, targetLanes ...int) *TurnResult {
	result := &TurnResult{
		Phase: models.PhasePerkSelection,
	}

	if e.game.Status != models.LaneStatusPlaying {
		result.Error = "Game is not in progress"
		return result
	}

	if e.game.CurrentPhase != models.PhasePerkSelection {
		result.Error = "Not in perk selection phase"
		return result
	}

	currentPlayer := e.game.CurrentPlayer

	// Handle pass
	if perkID == 0 {
		result.Success = true
		result.PerkExecuted = 0
		e.game.AdvancePhase() // This will switch turns
		return result
	}

	// Build target lanes array
	targets := []int{}
	if targetLane >= 0 {
		targets = append(targets, targetLane)
	}
	targets = append(targets, targetLanes...)

	// Use the perk executor
	executor := perks.NewPerkExecutor(e.game)
	perkResult := executor.Execute(perks.PerkID(perkID), currentPlayer, targets)

	// Convert perk result to turn result
	result.Success = perkResult.Success
	result.Error = perkResult.Error
	result.PerkExecuted = perkID
	if len(perkResult.AffectedLanes) > 0 {
		result.LaneIndex = perkResult.AffectedLanes[0]
	}
	result.LaneWinner = perkResult.LaneWinner
	result.GameWinner = perkResult.GameWinner

	if result.Success && result.GameWinner == 0 {
		// Advance phase (switch turns)
		e.game.AdvancePhase()
	}

	return result
}

// LaneAI handles AI decision making for lane games
type LaneAI struct {
	difficulty string
}

// NewLaneAI creates a new AI for lane games
func NewLaneAI(difficulty string) *LaneAI {
	return &LaneAI{
		difficulty: difficulty,
	}
}

// ChoosePerk selects a perk and target for the AI
// Returns perkID and targetLane
func (ai *LaneAI) ChoosePerk(game *models.LaneGame) (int, int) {
	player := game.CurrentPlayer
	opponent := player.Opponent()

	switch ai.difficulty {
	case "easy":
		return ai.chooseEasy(game, player)
	case "medium":
		return ai.chooseMedium(game, player, opponent)
	case "hard":
		return ai.chooseHard(game, player, opponent)
	default:
		return ai.chooseEasy(game, player)
	}
}

// chooseEasy makes random decisions
func (ai *LaneAI) chooseEasy(game *models.LaneGame, player models.PlayerSide) (int, int) {
	// 50% chance to pass
	if rand.Intn(2) == 0 {
		return 0, -1 // Pass
	}

	// 50% PlaceAnother, 50% RemoveEnemy
	if rand.Intn(2) == 0 {
		available := game.GetAvailableLanes(player)
		if len(available) > 0 {
			return 1, available[rand.Intn(len(available))]
		}
	}

	// Try RemoveEnemy
	opponent := player.Opponent()
	nonEmpty := game.GetNonEmptyLanes(opponent)
	if len(nonEmpty) > 0 {
		return 2, nonEmpty[rand.Intn(len(nonEmpty))]
	}

	// Fallback to pass
	return 0, -1
}

// chooseMedium prefers strategic moves
func (ai *LaneAI) chooseMedium(game *models.LaneGame, player, opponent models.PlayerSide) (int, int) {
	// Try to complete a lane that's close to winning
	for i, lane := range game.Lanes {
		if lane.IsWon() {
			continue
		}
		pieceCount := lane.CountPieces(player)
		// If we have 4 pieces, try to place the 5th
		if pieceCount == 4 && !lane.IsSideFull(player) {
			return 1, i // PlaceAnother
		}
	}

	// Try to disrupt opponent's near-win lanes
	for i, lane := range game.Lanes {
		if lane.IsWon() {
			continue
		}
		opponentCount := lane.CountPieces(opponent)
		// If opponent has 4+ pieces, try to remove
		if opponentCount >= 4 {
			return 2, i // RemoveEnemy
		}
	}

	// Default to placing in lane with most pieces
	bestLane := -1
	bestCount := -1
	for i, lane := range game.Lanes {
		if lane.IsWon() || lane.IsSideFull(player) {
			continue
		}
		count := lane.CountPieces(player)
		if count > bestCount {
			bestCount = count
			bestLane = i
		}
	}

	if bestLane != -1 {
		return 1, bestLane
	}

	return 0, -1 // Pass
}

// chooseHard uses evaluation
func (ai *LaneAI) chooseHard(game *models.LaneGame, player, opponent models.PlayerSide) (int, int) {
	bestPerk := 0
	bestTarget := -1
	bestScore := -1000

	// Evaluate passing
	passScore := 0

	// Evaluate PlaceAnother on each lane
	for i, lane := range game.Lanes {
		if lane.IsWon() || lane.IsSideFull(player) {
			continue
		}

		score := ai.evaluatePlacement(game, player, i)
		if score > bestScore {
			bestScore = score
			bestPerk = 1
			bestTarget = i
		}
	}

	// Evaluate RemoveEnemy on each lane
	for i, lane := range game.Lanes {
		if lane.IsWon() || lane.CountPieces(opponent) == 0 {
			continue
		}

		score := ai.evaluateRemoval(game, opponent, i)
		if score > bestScore {
			bestScore = score
			bestPerk = 2
			bestTarget = i
		}
	}

	// If best action is worse than passing, pass
	if bestScore < passScore {
		return 0, -1
	}

	return bestPerk, bestTarget
}

// evaluatePlacement scores a placement action
func (ai *LaneAI) evaluatePlacement(game *models.LaneGame, player models.PlayerSide, laneIndex int) int {
	lane := game.Lanes[laneIndex]
	currentPieces := lane.CountPieces(player)

	// Winning move is very valuable
	if currentPieces == 4 {
		return 1000
	}

	// More pieces = higher priority (concentrate)
	return currentPieces * 10
}

// evaluateRemoval scores a removal action
func (ai *LaneAI) evaluateRemoval(game *models.LaneGame, opponent models.PlayerSide, laneIndex int) int {
	lane := game.Lanes[laneIndex]
	opponentPieces := lane.CountPieces(opponent)

	// Blocking opponent's win is very valuable
	if opponentPieces == 5 {
		return 900
	}

	// More opponent pieces = higher priority to disrupt
	return opponentPieces * 8
}

// ExecuteAITurn runs a full turn for the AI
func (e *LaneEngine) ExecuteAITurn(ai *LaneAI) []*TurnResult {
	results := make([]*TurnResult, 0, 4)

	// Phase 1: Raid resolution
	raidResult := e.ExecuteRaidResolution()
	results = append(results, raidResult)

	if raidResult.GameWinner != 0 {
		return results // Game over
	}

	// Phase 2: Deferred resolution
	deferredResult := e.ExecuteDeferredResolution()
	results = append(results, deferredResult)

	if deferredResult.GameWinner != 0 {
		return results // Game over
	}

	// Phase 3: Auto-placement
	autoResult := e.ExecuteAutoPlacement()
	results = append(results, autoResult)

	if autoResult.GameWinner != 0 {
		return results // Game over
	}

	// Phase 4: Perk selection
	perkID, targetLane := ai.ChoosePerk(e.game)
	perkResult := e.ExecutePerkSelection(perkID, targetLane)
	results = append(results, perkResult)

	return results
}

// ExecuteFullTurn runs a complete turn with all phases for a player
// This is useful for testing and human players
func (e *LaneEngine) ExecuteFullTurn(perkID int, targetLane int, targetLanes ...int) []*TurnResult {
	results := make([]*TurnResult, 0, 4)

	// Phase 1: Raid resolution
	if e.game.CurrentPhase == models.PhaseRaidResolution {
		raidResult := e.ExecuteRaidResolution()
		results = append(results, raidResult)

		if raidResult.GameWinner != 0 {
			return results
		}
	}

	// Phase 2: Deferred resolution
	if e.game.CurrentPhase == models.PhaseDeferredResolution {
		deferredResult := e.ExecuteDeferredResolution()
		results = append(results, deferredResult)

		if deferredResult.GameWinner != 0 {
			return results
		}
	}

	// Phase 3: Auto-placement
	if e.game.CurrentPhase == models.PhaseAutoPlacement {
		autoResult := e.ExecuteAutoPlacement()
		results = append(results, autoResult)

		if autoResult.GameWinner != 0 {
			return results
		}
	}

	// Phase 4: Perk selection
	if e.game.CurrentPhase == models.PhasePerkSelection {
		perkResult := e.ExecutePerkSelection(perkID, targetLane, targetLanes...)
		results = append(results, perkResult)
	}

	return results
}
