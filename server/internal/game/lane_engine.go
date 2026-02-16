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
const TestPerkPairIndex = 2

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

	// Fire placement triggers BEFORE checking lane win
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

	// Check if lane was won (after triggers)
	laneWinner := e.game.CheckLaneWin(laneIndex)
	if laneWinner != 0 {
		result.LaneWinner = laneWinner
		e.game.CleanupWonLane(laneIndex) // Fix 1.3: cleanup after auto-placement lane win

		// Check if game was won
		gameWinner := e.game.CheckGameWin()
		if gameWinner != 0 {
			result.GameWinner = gameWinner
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
	perkID, targets := ai.ChoosePerk(e.game)
	var perkResult *TurnResult
	if len(targets) == 0 {
		perkResult = e.ExecutePerkSelection(perkID, -1)
	} else if len(targets) == 1 {
		perkResult = e.ExecutePerkSelection(perkID, targets[0])
	} else {
		perkResult = e.ExecutePerkSelection(perkID, targets[0], targets[1:]...)
	}
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
