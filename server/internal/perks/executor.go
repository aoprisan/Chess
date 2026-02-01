package perks

import (
	"math/rand"

	"github.com/kiddiechess/server/internal/models"
)

// PerkResult contains the result of executing a perk
type PerkResult struct {
	Success       bool               `json:"success"`
	Error         string             `json:"error,omitempty"`
	PerkID        PerkID             `json:"perkId"`
	AffectedLanes []int              `json:"affectedLanes,omitempty"`
	LaneWinner    models.PlayerSide  `json:"laneWinner,omitempty"`
	GameWinner    models.PlayerSide  `json:"gameWinner,omitempty"`
}

// PerkExecutor handles perk execution logic
type PerkExecutor struct {
	game *models.LaneGame
}

// NewPerkExecutor creates a new perk executor
func NewPerkExecutor(game *models.LaneGame) *PerkExecutor {
	return &PerkExecutor{game: game}
}

// Execute executes a perk with the given parameters
// Returns the result of the execution
func (e *PerkExecutor) Execute(perkID PerkID, player models.PlayerSide, targetLanes []int) *PerkResult {
	result := &PerkResult{PerkID: perkID}

	// Validate perk exists
	def := GetPerkDefinition(perkID)
	if def == nil {
		result.Error = "Unknown perk"
		return result
	}

	// Validate targeting
	if err := e.validateTargeting(def, player, targetLanes); err != "" {
		result.Error = err
		return result
	}

	// Execute based on perk ID
	switch perkID {
	case PerkPlaceAnother:
		return e.executePlaceAnother(player, targetLanes[0])
	case PerkRemoveEnemy:
		return e.executeRemoveEnemy(player, targetLanes[0])
	case PerkFreeze:
		return e.executeFreeze(player, targetLanes[0])
	case PerkSplit:
		return e.executeSplit(player, targetLanes[0])
	case PerkKamikaze:
		return e.executeKamikaze(player, targetLanes[0])
	case PerkSteal:
		return e.executeSteal(player)
	case PerkRegroup:
		return e.executeRegroup(player, targetLanes[0], targetLanes[1])
	case PerkDisrupt:
		return e.executeDisrupt(player, targetLanes[0], targetLanes[1])
	case PerkScatter:
		return e.executeScatter(player, targetLanes[0])
	case PerkDisperse:
		return e.executeDisperse(player, targetLanes[0])
	case PerkScramble:
		return e.executeScramble(player)
	default:
		result.Error = "Perk not yet implemented"
		return result
	}
}

// validateTargeting validates that the targeting is correct for the perk
func (e *PerkExecutor) validateTargeting(def *PerkDefinition, player models.PlayerSide, targetLanes []int) string {
	switch def.Target {
	case TargetYourLane:
		if len(targetLanes) != 1 {
			return "Must select exactly 1 lane"
		}
		return e.validateYourLane(player, targetLanes[0])
	case TargetEnemyLane:
		if len(targetLanes) != 1 {
			return "Must select exactly 1 lane"
		}
		return e.validateEnemyLane(player, targetLanes[0])
	case TargetYourPiece:
		if len(targetLanes) != 1 {
			return "Must select exactly 1 lane with your piece"
		}
		return e.validateYourPiece(player, targetLanes[0])
	case TargetTwoYourLanes:
		if len(targetLanes) != 2 {
			return "Must select exactly 2 lanes"
		}
		if err := e.validateYourLane(player, targetLanes[0]); err != "" {
			return err
		}
		return e.validateYourLane(player, targetLanes[1])
	case TargetTwoEnemyLanes:
		if len(targetLanes) != 2 {
			return "Must select exactly 2 lanes"
		}
		if err := e.validateEnemyLane(player, targetLanes[0]); err != "" {
			return err
		}
		return e.validateEnemyLane(player, targetLanes[1])
	case TargetAuto:
		// No validation needed
		return ""
	default:
		return "Unknown target type"
	}
}

func (e *PerkExecutor) validateYourLane(player models.PlayerSide, laneIndex int) string {
	if laneIndex < 0 || laneIndex >= models.DefaultLaneCount {
		return "Invalid lane index"
	}
	lane := e.game.Lanes[laneIndex]
	if lane.IsWon() {
		return "Cannot target won lane"
	}
	return ""
}

func (e *PerkExecutor) validateEnemyLane(player models.PlayerSide, laneIndex int) string {
	if laneIndex < 0 || laneIndex >= models.DefaultLaneCount {
		return "Invalid lane index"
	}
	lane := e.game.Lanes[laneIndex]
	if lane.IsWon() {
		return "Cannot target won lane"
	}
	return ""
}

func (e *PerkExecutor) validateYourPiece(player models.PlayerSide, laneIndex int) string {
	if laneIndex < 0 || laneIndex >= models.DefaultLaneCount {
		return "Invalid lane index"
	}
	lane := e.game.Lanes[laneIndex]
	if lane.IsWon() {
		return "Cannot target won lane"
	}
	if lane.CountPieces(player) == 0 {
		return "No pieces on this lane"
	}
	return ""
}

// ============================================================================
// Fixed Commons
// ============================================================================

// executePlaceAnother - Perk #1: Place 1 piece on chosen lane
func (e *PerkExecutor) executePlaceAnother(player models.PlayerSide, laneIndex int) *PerkResult {
	result := &PerkResult{PerkID: PerkPlaceAnother, AffectedLanes: []int{laneIndex}}

	lane := e.game.Lanes[laneIndex]
	if lane.IsSideFull(player) {
		result.Error = "Your side of this lane is full"
		return result
	}

	if !e.game.PlacePiece(laneIndex, player) {
		result.Error = "Failed to place piece"
		return result
	}

	result.Success = true

	// Check for lane win
	if winner := e.game.CheckLaneWin(laneIndex); winner != 0 {
		result.LaneWinner = winner
		if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
			result.GameWinner = gameWinner
		}
	}

	return result
}

// executeRemoveEnemy - Perk #2: Remove frontmost enemy piece from chosen lane
func (e *PerkExecutor) executeRemoveEnemy(player models.PlayerSide, laneIndex int) *PerkResult {
	result := &PerkResult{PerkID: PerkRemoveEnemy, AffectedLanes: []int{laneIndex}}

	opponent := player.Opponent()
	lane := e.game.Lanes[laneIndex]

	if lane.CountPieces(opponent) == 0 {
		result.Error = "No enemy pieces on this lane"
		return result
	}

	if !e.game.RemovePiece(laneIndex, opponent) {
		result.Error = "Failed to remove piece"
		return result
	}

	result.Success = true
	// RemoveEnemy doesn't cause lane wins
	return result
}

// ============================================================================
// Duration Perks
// ============================================================================

// executeFreeze - Perk #4: Block enemy placement for 1 turn
func (e *PerkExecutor) executeFreeze(player models.PlayerSide, laneIndex int) *PerkResult {
	result := &PerkResult{PerkID: PerkFreeze, AffectedLanes: []int{laneIndex}}

	// TODO: Add freeze marker to lane when marker system is implemented
	// For now, just mark as success
	result.Success = true
	result.Error = "Freeze not fully implemented yet"
	return result
}

// ============================================================================
// Conversion Perks
// ============================================================================

// executeSplit - Perk #31: Sacrifice 1 piece, gain 2 on random lanes
func (e *PerkExecutor) executeSplit(player models.PlayerSide, sourceLane int) *PerkResult {
	result := &PerkResult{PerkID: PerkSplit, AffectedLanes: []int{sourceLane}}

	// Remove piece from source lane
	if !e.game.RemovePiece(sourceLane, player) {
		result.Error = "Failed to remove piece"
		return result
	}

	// Place 2 pieces on random lanes (with source exclusion)
	for i := 0; i < 2; i++ {
		targetLane := e.getRandomLaneExcluding(player, sourceLane)
		if targetLane >= 0 {
			e.game.PlacePiece(targetLane, player)
			result.AffectedLanes = append(result.AffectedLanes, targetLane)

			// Check for lane win after each placement
			if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
				result.LaneWinner = winner
				if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
					result.GameWinner = gameWinner
					break // Game is over
				}
			}
		}
	}

	result.Success = true
	return result
}

// executeKamikaze - Perk #32: Sacrifice 1 piece, enemy loses 2
func (e *PerkExecutor) executeKamikaze(player models.PlayerSide, sourceLane int) *PerkResult {
	result := &PerkResult{PerkID: PerkKamikaze, AffectedLanes: []int{sourceLane}}
	opponent := player.Opponent()

	// Remove piece from source lane
	if !e.game.RemovePiece(sourceLane, player) {
		result.Error = "Failed to remove piece"
		return result
	}

	// Remove 2 enemy pieces from random non-empty lanes
	for i := 0; i < 2; i++ {
		nonEmptyLanes := e.game.GetNonEmptyLanes(opponent)
		if len(nonEmptyLanes) > 0 {
			targetLane := nonEmptyLanes[rand.Intn(len(nonEmptyLanes))]
			e.game.RemovePiece(targetLane, opponent)
			result.AffectedLanes = append(result.AffectedLanes, targetLane)
		}
	}

	result.Success = true
	return result
}

// ============================================================================
// Trade Perks
// ============================================================================

// executeSteal - Perk #38: Enemy loses 1, you gain 1
func (e *PerkExecutor) executeSteal(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkSteal}
	opponent := player.Opponent()

	// Remove 1 enemy piece from random non-empty lane
	nonEmptyLanes := e.game.GetNonEmptyLanes(opponent)
	if len(nonEmptyLanes) == 0 {
		result.Error = "No enemy pieces to steal"
		return result
	}

	removeLane := nonEmptyLanes[rand.Intn(len(nonEmptyLanes))]
	e.game.RemovePiece(removeLane, opponent)
	result.AffectedLanes = append(result.AffectedLanes, removeLane)

	// Add 1 piece to random available lane for player
	availableLanes := e.game.GetAvailableLanes(player)
	if len(availableLanes) > 0 {
		addLane := availableLanes[rand.Intn(len(availableLanes))]
		e.game.PlacePiece(addLane, player)
		result.AffectedLanes = append(result.AffectedLanes, addLane)

		// Check for lane win
		if winner := e.game.CheckLaneWin(addLane); winner != 0 {
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
			}
		}
	}

	result.Success = true
	return result
}

// ============================================================================
// Repositioning Perks
// ============================================================================

// executeRegroup - Perk #33: Swap YOUR pieces between 2 lanes (atomic)
func (e *PerkExecutor) executeRegroup(player models.PlayerSide, lane1, lane2 int) *PerkResult {
	result := &PerkResult{PerkID: PerkRegroup, AffectedLanes: []int{lane1, lane2}}

	// Count pieces in each lane
	count1 := e.game.Lanes[lane1].CountPieces(player)
	count2 := e.game.Lanes[lane2].CountPieces(player)

	// Remove all pieces from both lanes
	for i := 0; i < count1; i++ {
		e.game.RemovePiece(lane1, player)
	}
	for i := 0; i < count2; i++ {
		e.game.RemovePiece(lane2, player)
	}

	// Place pieces in swapped lanes
	for i := 0; i < count2; i++ {
		e.game.PlacePiece(lane1, player)
	}
	for i := 0; i < count1; i++ {
		e.game.PlacePiece(lane2, player)
	}

	result.Success = true

	// Check lane wins after atomic operation
	if winner := e.game.CheckLaneWin(lane1); winner != 0 {
		result.LaneWinner = winner
	}
	if winner := e.game.CheckLaneWin(lane2); winner != 0 {
		result.LaneWinner = winner
	}
	if result.LaneWinner != 0 {
		if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
			result.GameWinner = gameWinner
		}
	}

	return result
}

// executeDisrupt - Perk #34: Swap ENEMY pieces between 2 lanes (atomic)
func (e *PerkExecutor) executeDisrupt(player models.PlayerSide, lane1, lane2 int) *PerkResult {
	result := &PerkResult{PerkID: PerkDisrupt, AffectedLanes: []int{lane1, lane2}}
	opponent := player.Opponent()

	// Count pieces in each lane
	count1 := e.game.Lanes[lane1].CountPieces(opponent)
	count2 := e.game.Lanes[lane2].CountPieces(opponent)

	// Remove all pieces from both lanes
	for i := 0; i < count1; i++ {
		e.game.RemovePiece(lane1, opponent)
	}
	for i := 0; i < count2; i++ {
		e.game.RemovePiece(lane2, opponent)
	}

	// Place pieces in swapped lanes
	for i := 0; i < count2; i++ {
		e.game.PlacePiece(lane1, opponent)
	}
	for i := 0; i < count1; i++ {
		e.game.PlacePiece(lane2, opponent)
	}

	result.Success = true

	// Check lane wins after atomic operation
	if winner := e.game.CheckLaneWin(lane1); winner != 0 {
		result.LaneWinner = winner
	}
	if winner := e.game.CheckLaneWin(lane2); winner != 0 {
		result.LaneWinner = winner
	}
	if result.LaneWinner != 0 {
		if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
			result.GameWinner = gameWinner
		}
	}

	return result
}

// executeScatter - Perk #35: Move YOUR pieces from 1 lane to random lanes
func (e *PerkExecutor) executeScatter(player models.PlayerSide, sourceLane int) *PerkResult {
	result := &PerkResult{PerkID: PerkScatter, AffectedLanes: []int{sourceLane}}

	count := e.game.Lanes[sourceLane].CountPieces(player)
	if count == 0 {
		result.Error = "No pieces on this lane"
		return result
	}

	// Remove all pieces from source lane
	for i := 0; i < count; i++ {
		e.game.RemovePiece(sourceLane, player)
	}

	// Place pieces on random lanes (with source exclusion)
	for i := 0; i < count; i++ {
		targetLane := e.getRandomLaneExcluding(player, sourceLane)
		if targetLane >= 0 {
			e.game.PlacePiece(targetLane, player)
			result.AffectedLanes = append(result.AffectedLanes, targetLane)

			// Check for lane win after each placement
			if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
				result.LaneWinner = winner
				if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
					result.GameWinner = gameWinner
					break
				}
			}
		}
		// If no valid destination, piece is lost
	}

	result.Success = true
	return result
}

// executeDisperse - Perk #36: Move ENEMY pieces from 1 lane to random lanes
func (e *PerkExecutor) executeDisperse(player models.PlayerSide, sourceLane int) *PerkResult {
	result := &PerkResult{PerkID: PerkDisperse, AffectedLanes: []int{sourceLane}}
	opponent := player.Opponent()

	count := e.game.Lanes[sourceLane].CountPieces(opponent)
	if count == 0 {
		result.Error = "No enemy pieces on this lane"
		return result
	}

	// Remove all pieces from source lane
	for i := 0; i < count; i++ {
		e.game.RemovePiece(sourceLane, opponent)
	}

	// Place pieces on random lanes (with source exclusion)
	for i := 0; i < count; i++ {
		targetLane := e.getRandomLaneExcluding(opponent, sourceLane)
		if targetLane >= 0 {
			e.game.PlacePiece(targetLane, opponent)
			result.AffectedLanes = append(result.AffectedLanes, targetLane)

			// Check for lane win after each placement
			if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
				result.LaneWinner = winner
				if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
					result.GameWinner = gameWinner
					break
				}
			}
		}
		// If no valid destination, piece is lost
	}

	result.Success = true
	return result
}

// executeScramble - Perk #13: Redistribute ALL enemy pieces randomly
func (e *PerkExecutor) executeScramble(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkScramble}
	opponent := player.Opponent()

	// Count all enemy pieces
	totalPieces := 0
	for _, lane := range e.game.Lanes {
		if !lane.IsWon() {
			totalPieces += lane.CountPieces(opponent)
		}
	}

	if totalPieces == 0 {
		result.Error = "No enemy pieces to scramble"
		return result
	}

	// Remove all enemy pieces
	for i := 0; i < models.DefaultLaneCount; i++ {
		lane := e.game.Lanes[i]
		if !lane.IsWon() {
			count := lane.CountPieces(opponent)
			for j := 0; j < count; j++ {
				e.game.RemovePiece(i, opponent)
			}
		}
	}

	// Redistribute to random lanes (no source exclusion for scramble)
	for i := 0; i < totalPieces; i++ {
		availableLanes := e.game.GetAvailableLanes(opponent)
		if len(availableLanes) == 0 {
			break // Pieces are lost if no lanes available
		}

		targetLane := availableLanes[rand.Intn(len(availableLanes))]
		e.game.PlacePiece(targetLane, opponent)
		result.AffectedLanes = append(result.AffectedLanes, targetLane)

		// Check for lane win after each placement
		if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
				break
			}
		}
	}

	result.Success = true
	return result
}

// ============================================================================
// Helper Functions
// ============================================================================

// getRandomLaneExcluding returns a random available lane, excluding source lane if possible
// Implements the source exclusion rule from the game rules
func (e *PerkExecutor) getRandomLaneExcluding(player models.PlayerSide, sourceLane int) int {
	availableLanes := e.game.GetAvailableLanes(player)
	if len(availableLanes) == 0 {
		return -1 // No lanes available
	}

	// Source exclusion: if 3+ lanes available, exclude source
	if len(availableLanes) >= 3 {
		filtered := make([]int, 0, len(availableLanes)-1)
		for _, lane := range availableLanes {
			if lane != sourceLane {
				filtered = append(filtered, lane)
			}
		}
		if len(filtered) > 0 {
			return filtered[rand.Intn(len(filtered))]
		}
	}

	// 2 or fewer lanes: include source
	return availableLanes[rand.Intn(len(availableLanes))]
}
