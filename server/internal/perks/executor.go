package perks

import (
	"github.com/kiddiechess/server/internal/models"
)

// PerkResult contains the result of executing a perk
type PerkResult struct {
	Success           bool                      `json:"success"`
	Error             string                    `json:"error,omitempty"`
	PerkID            PerkID                    `json:"perkId"`
	PerkName          string                    `json:"perkName,omitempty"`
	AffectedLanes     []int                     `json:"affectedLanes,omitempty"`
	Placements        []int                     `json:"placements,omitempty"`
	Removals          []int                     `json:"removals,omitempty"`
	Redirections      []models.RemovalResult    `json:"redirections,omitempty"`
	LaneWinner        models.PlayerSide         `json:"laneWinner,omitempty"`
	GameWinner        models.PlayerSide         `json:"gameWinner,omitempty"`
	GameWonMidPerk    bool                      `json:"gameWonMidPerk,omitempty"`
	TriggerResults    []TriggerResult           `json:"triggerResults,omitempty"`
	Details           map[string]interface{}    `json:"details,omitempty"`
}

// TriggerResult contains the result of a trigger firing
type TriggerResult struct {
	TriggerType    models.TriggerType `json:"triggerType"`
	SourceLane     int                `json:"sourceLane"`
	Owner          models.PlayerSide  `json:"owner"`
	Destination    int                `json:"destination,omitempty"`
	PiecesAdded    int                `json:"piecesAdded,omitempty"`
	PiecesRemoved  int                `json:"piecesRemoved,omitempty"`
	RaidPlaced     bool               `json:"raidPlaced,omitempty"`
	LaneWinner     models.PlayerSide  `json:"laneWinner,omitempty"`
	GameWinner     models.PlayerSide  `json:"gameWinner,omitempty"`
	ChainedResults []TriggerResult    `json:"chainedResults,omitempty"`
}

// DeferredResult contains the result of a deferred effect resolution
type DeferredResult struct {
	Type       models.DeferredType    `json:"type"`
	Lane       int                    `json:"lane"`
	Success    bool                   `json:"success"`
	Placements []int                  `json:"placements,omitempty"`
	Removals   []int                  `json:"removals,omitempty"`
	LaneWinner models.PlayerSide      `json:"laneWinner,omitempty"`
	GameWinner models.PlayerSide      `json:"gameWinner,omitempty"`
	Details    map[string]interface{} `json:"details,omitempty"`
}

// RaidResult contains the result of a raid resolution
type RaidResult struct {
	Lane         int               `json:"lane"`
	Source       string            `json:"source"`
	Outcome      string            `json:"outcome"` // "lost", "+2_recruits", "+1_recruit", "alone"
	Success      bool              `json:"success"`
	Placements   []int             `json:"placements,omitempty"`
	PiecesGained int               `json:"piecesGained,omitempty"`
	Roll         int               `json:"roll,omitempty"`
	LaneWinner   models.PlayerSide `json:"laneWinner,omitempty"`
	GameWinner   models.PlayerSide `json:"gameWinner,omitempty"`
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
func (e *PerkExecutor) Execute(perkID PerkID, player models.PlayerSide, targetLanes []int) *PerkResult {
	result := &PerkResult{PerkID: perkID, Details: make(map[string]interface{})}

	def := GetPerkDefinition(perkID)
	if def == nil {
		result.Error = "Unknown perk"
		return result
	}
	result.PerkName = def.Name

	// Execute based on perk ID
	switch perkID {
	// Commons (Slot 1-2)
	case PerkPlaceAnother:
		return e.executePlaceAnother(player, targetLanes)
	case PerkRemoveEnemy:
		return e.executeRemoveEnemy(player, targetLanes)

	// Immediate perks - Slot 3
	case PerkFreeze:
		return e.executeFreeze(player, targetLanes)
	case PerkRegroup:
		return e.executeRegroup(player, targetLanes)
	case PerkScatter:
		return e.executeScatter(player, targetLanes)

	// Trigger setup perks - Slot 3
	case PerkPortal:
		return e.executePortal(player, targetLanes)
	case PerkTrap:
		return e.executeTrap(player, targetLanes)
	case PerkMirror:
		return e.executeMirror(player, targetLanes)
	case PerkEcho:
		return e.executeEcho(player, targetLanes)
	case PerkShockwave:
		return e.executeShockwave(player, targetLanes)
	case PerkHydra:
		return e.executeHydra(player, targetLanes)
	case PerkBackfire:
		return e.executeBackfire(player, targetLanes)
	case PerkAbsorb:
		return e.executeAbsorb(player, targetLanes)
	case PerkRetaliate:
		return e.executeRetaliate(player, targetLanes)

	// Duration perks - Slot 3
	case PerkCloak:
		return e.executeCloak(player)
	case PerkSanctuary:
		return e.executeSanctuary(player, targetLanes)

	// Deferred perks - Slot 3
	case PerkSignal:
		return e.executeSignal(player, targetLanes)

	// Immediate perks - Slot 4
	case PerkScramble:
		return e.executeScramble(player)
	case PerkSplit:
		return e.executeSplit(player, targetLanes)
	case PerkKamikaze:
		return e.executeKamikaze(player, targetLanes)
	case PerkDisrupt:
		return e.executeDisrupt(player, targetLanes)
	case PerkDisperse:
		return e.executeDisperse(player, targetLanes)
	case PerkGambit:
		return e.executeGambit(player)
	case PerkSteal:
		return e.executeSteal(player)
	case PerkRush:
		return e.executeRush(player, targetLanes)
	case PerkNullify:
		return e.executeNullify(player, targetLanes)

	// Duration perks - Slot 4
	case PerkBlind:
		return e.executeBlind(player)
	case PerkCapture:
		return e.executeCapture(player, targetLanes)

	// Deferred perks - Slot 4
	case PerkEnlist:
		return e.executeEnlist(player, targetLanes)
	case PerkAmbush:
		return e.executeAmbush(player, targetLanes)
	case PerkReinforce:
		return e.executeReinforce(player, targetLanes)
	case PerkRaid:
		return e.executeRaid(player, targetLanes)

	default:
		result.Error = "Perk not yet implemented"
		return result
	}
}

// ============================================================================
// Commons (Slot 1-2)
// ============================================================================

func (e *PerkExecutor) executePlaceAnother(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkPlaceAnother, PerkName: "PlaceAnother", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}

	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	e.game.PlacePiece(laneIdx, player)
	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Placements = []int{laneIdx}

	// Fire placement triggers
	result.TriggerResults = e.FirePlacementTriggers(laneIdx, player, 0)

	// Check lane win
	e.checkLaneAndGameWin(laneIdx, result)

	return result
}

func (e *PerkExecutor) executeRemoveEnemy(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkRemoveEnemy, PerkName: "RemoveEnemy", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]
	opponent := player.Opponent()

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}

	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.CountPieces(opponent) == 0 {
		result.Error = "No enemy pieces on this lane"
		return result
	}

	// Use RemovePieceWithRedirects to handle Sanctuary/Capture
	removalResult := e.game.RemovePieceWithRedirects(laneIdx, opponent, player)
	if !removalResult.Removed {
		result.Error = "Failed to remove piece"
		return result
	}

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Removals = []int{laneIdx}

	if removalResult.Redirected {
		result.Redirections = []models.RemovalResult{removalResult}
	}

	// Fire removal triggers
	result.TriggerResults = e.FireRemovalTriggers(laneIdx, player)

	return result
}

// ============================================================================
// Immediate Perks - Slot 3
// ============================================================================

func (e *PerkExecutor) executeFreeze(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkFreeze, PerkName: "Freeze", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]
	opponent := player.Opponent()

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}

	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.FreezeTurns > 0 {
		result.Error = "Lane already frozen"
		return result
	}

	lane.SetFreeze(opponent, models.FreezeDuration)
	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["frozenPlayer"] = opponent.String()
	result.Details["duration"] = models.FreezeDuration

	return result
}

func (e *PerkExecutor) executeRegroup(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkRegroup, PerkName: "Regroup", Details: make(map[string]interface{})}

	if len(targets) != 2 {
		result.Error = "Must select exactly 2 lanes"
		return result
	}
	lane1, lane2 := targets[0], targets[1]

	if lane1 == lane2 {
		result.Error = "Cannot swap lane with itself"
		return result
	}

	// Validate lanes
	for _, laneIdx := range targets {
		if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
			result.Error = "Invalid lane"
			return result
		}
		if e.game.Lanes[laneIdx].IsWon() {
			result.Error = "Cannot use won lane"
			return result
		}
	}

	count1 := e.game.Lanes[lane1].CountPieces(player)
	count2 := e.game.Lanes[lane2].CountPieces(player)

	if count1 == 0 && count2 == 0 {
		result.Error = "At least one lane must have pieces"
		return result
	}

	// Remove all from both lanes
	for i := 0; i < count1; i++ {
		e.game.RemovePiece(lane1, player)
	}
	for i := 0; i < count2; i++ {
		e.game.RemovePiece(lane2, player)
	}

	// Add swapped amounts
	for i := 0; i < count2 && !e.game.Lanes[lane1].IsSideFull(player); i++ {
		e.game.PlacePiece(lane1, player)
	}
	for i := 0; i < count1 && !e.game.Lanes[lane2].IsSideFull(player); i++ {
		e.game.PlacePiece(lane2, player)
	}

	result.Success = true
	result.AffectedLanes = []int{lane1, lane2}

	return result
}

func (e *PerkExecutor) executeScatter(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkScatter, PerkName: "Scatter", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	sourceLane := targets[0]

	if sourceLane < 0 || sourceLane >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	if e.game.Lanes[sourceLane].IsWon() {
		result.Error = "Lane already won"
		return result
	}

	count := e.game.Lanes[sourceLane].CountPieces(player)
	if count == 0 {
		result.Error = "No pieces on this lane"
		return result
	}

	// Remove all pieces (atomic removal)
	for i := 0; i < count; i++ {
		e.game.RemovePiece(sourceLane, player)
	}

	// Place on random lanes (iterative with win checks)
	placements := []int{}
	for i := 0; i < count; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		targetLane := e.getRandomLaneExcluding(player, sourceLane)
		if targetLane < 0 {
			break // No more valid destinations
		}

		e.game.PlacePiece(targetLane, player)
		placements = append(placements, targetLane)

		// Check wins
		if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
			e.game.CleanupWonLane(targetLane)
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
				result.GameWonMidPerk = true
				break
			}
		}
	}

	result.Success = true
	result.AffectedLanes = append([]int{sourceLane}, placements...)
	result.Placements = placements
	result.Details["piecesScattered"] = len(placements)

	return result
}

// ============================================================================
// Trigger Setup Perks - Slot 3
// ============================================================================

func (e *PerkExecutor) executePortal(player models.PlayerSide, targets []int) *PerkResult {
	return e.setupTrigger(player, targets, models.TriggerPortal, models.TriggerDuration, PerkPortal, "Portal")
}

func (e *PerkExecutor) executeTrap(player models.PlayerSide, targets []int) *PerkResult {
	return e.setupTrigger(player, targets, models.TriggerTrap, models.TriggerDuration, PerkTrap, "Trap")
}

func (e *PerkExecutor) executeMirror(player models.PlayerSide, targets []int) *PerkResult {
	return e.setupTrigger(player, targets, models.TriggerMirror, models.MirrorDuration, PerkMirror, "Mirror")
}

func (e *PerkExecutor) executeEcho(player models.PlayerSide, targets []int) *PerkResult {
	return e.setupTrigger(player, targets, models.TriggerEcho, models.EchoDuration, PerkEcho, "Echo")
}

func (e *PerkExecutor) executeShockwave(player models.PlayerSide, targets []int) *PerkResult {
	return e.setupTrigger(player, targets, models.TriggerShockwave, models.ShockwaveDuration, PerkShockwave, "Shockwave")
}

func (e *PerkExecutor) executeHydra(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkHydra, PerkName: "Hydra", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	// Hydra must be set on lane where player has pieces
	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.CountPieces(player) == 0 {
		result.Error = "Must have pieces on this lane"
		return result
	}
	if lane.HasTriggerType(models.TriggerHydra) {
		result.Error = "Hydra already set on this lane"
		return result
	}

	orderID := e.game.GetNextTriggerOrder()
	lane.AddTrigger(models.Trigger{
		Type:      models.TriggerHydra,
		Owner:     player,
		TurnsLeft: models.HydraDuration,
		OrderID:   orderID,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = models.HydraDuration

	return result
}

func (e *PerkExecutor) executeBackfire(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkBackfire, PerkName: "Backfire", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.CountPieces(player) == 0 {
		result.Error = "Must have pieces on this lane"
		return result
	}
	if lane.HasTriggerType(models.TriggerBackfire) {
		result.Error = "Backfire already set on this lane"
		return result
	}

	orderID := e.game.GetNextTriggerOrder()
	lane.AddTrigger(models.Trigger{
		Type:      models.TriggerBackfire,
		Owner:     player,
		TurnsLeft: models.BackfireDuration,
		OrderID:   orderID,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = models.BackfireDuration

	return result
}

func (e *PerkExecutor) executeAbsorb(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkAbsorb, PerkName: "Absorb", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.CountPieces(player) == 0 {
		result.Error = "Must have pieces on this lane"
		return result
	}
	if lane.HasTriggerType(models.TriggerAbsorb) {
		result.Error = "Absorb already set on this lane"
		return result
	}

	orderID := e.game.GetNextTriggerOrder()
	lane.AddTrigger(models.Trigger{
		Type:      models.TriggerAbsorb,
		Owner:     player,
		TurnsLeft: models.AbsorbDuration,
		OrderID:   orderID,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = models.AbsorbDuration

	return result
}

func (e *PerkExecutor) executeRetaliate(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkRetaliate, PerkName: "Retaliate", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.CountPieces(player) == 0 {
		result.Error = "Must have pieces on this lane"
		return result
	}
	if lane.HasTriggerType(models.TriggerRetaliate) {
		result.Error = "Retaliate already set on this lane"
		return result
	}

	orderID := e.game.GetNextTriggerOrder()
	lane.AddTrigger(models.Trigger{
		Type:      models.TriggerRetaliate,
		Owner:     player,
		TurnsLeft: models.RetaliateDuration,
		OrderID:   orderID,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = models.RetaliateDuration

	return result
}

// setupTrigger is a helper for placement trigger setup
func (e *PerkExecutor) setupTrigger(player models.PlayerSide, targets []int, triggerType models.TriggerType, duration int, perkID PerkID, perkName string) *PerkResult {
	result := &PerkResult{PerkID: perkID, PerkName: perkName, Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.Winner == player {
		result.Error = "Cannot set trigger on lane you've won"
		return result
	}
	if lane.HasTriggerType(triggerType) {
		result.Error = "Trigger already exists on this lane"
		return result
	}

	orderID := e.game.GetNextTriggerOrder()
	lane.AddTrigger(models.Trigger{
		Type:      triggerType,
		Owner:     player,
		TurnsLeft: duration,
		OrderID:   orderID,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = duration

	return result
}

// ============================================================================
// Duration Perks
// ============================================================================

func (e *PerkExecutor) executeCloak(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkCloak, PerkName: "Cloak", Details: make(map[string]interface{})}

	if e.game.IsCloaked(player) {
		result.Error = "Already cloaked"
		return result
	}

	e.game.SetCloaked(player, models.CloakDuration)
	result.Success = true
	result.Details["duration"] = models.CloakDuration

	return result
}

func (e *PerkExecutor) executeBlind(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkBlind, PerkName: "Blind", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	if e.game.IsBlinded(opponent) {
		result.Error = "Opponent already blinded"
		return result
	}

	e.game.SetBlinded(opponent, models.BlindDuration)
	result.Success = true
	result.Details["duration"] = models.BlindDuration

	return result
}

func (e *PerkExecutor) executeSanctuary(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkSanctuary, PerkName: "Sanctuary", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	e.game.AddSanctuary(player, laneIdx, models.SanctuaryDuration)
	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = models.SanctuaryDuration

	return result
}

func (e *PerkExecutor) executeCapture(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkCapture, PerkName: "Capture", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	e.game.AddCapture(player, laneIdx, models.CaptureDuration)
	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["duration"] = models.CaptureDuration

	return result
}

// ============================================================================
// Immediate Perks - Slot 4
// ============================================================================

func (e *PerkExecutor) executeScramble(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkScramble, PerkName: "Scramble", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	// Count and remove all enemy pieces (atomic)
	totalPieces := 0
	for i := 0; i < models.DefaultLaneCount; i++ {
		lane := e.game.Lanes[i]
		if !lane.IsWon() {
			count := lane.CountPieces(opponent)
			totalPieces += count
			for j := 0; j < count; j++ {
				e.game.RemovePiece(i, opponent)
			}
		}
	}

	if totalPieces == 0 {
		result.Error = "No enemy pieces to scramble"
		return result
	}

	// Redistribute randomly (iterative with win checks)
	placements := []int{}
	for i := 0; i < totalPieces; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		available := e.game.GetAvailableLanesIgnoreFreeze(opponent)
		if len(available) == 0 {
			break
		}

		targetLane := available[e.game.Rand().Intn(len(available))]
		e.game.PlacePiece(targetLane, opponent)
		placements = append(placements, targetLane)

		if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
			e.game.CleanupWonLane(targetLane)
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
				result.GameWonMidPerk = true
				break
			}
		}
	}

	result.Success = true
	result.Placements = placements
	result.Details["piecesScrambled"] = totalPieces

	return result
}

func (e *PerkExecutor) executeSplit(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkSplit, PerkName: "Split", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	sourceLane := targets[0]

	if sourceLane < 0 || sourceLane >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	if e.game.Lanes[sourceLane].CountPieces(player) == 0 {
		result.Error = "No pieces on this lane"
		return result
	}

	// Remove sacrificed piece
	e.game.RemovePiece(sourceLane, player)

	// Place pieces on random lanes (iterative with win checks)
	placements := []int{}
	for i := 0; i < models.SplitGain; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		targetLane := e.getRandomLaneExcluding(player, sourceLane)
		if targetLane < 0 {
			break
		}

		e.game.PlacePiece(targetLane, player)
		placements = append(placements, targetLane)

		if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
			e.game.CleanupWonLane(targetLane)
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
				result.GameWonMidPerk = true
				break
			}
		}
	}

	result.Success = true
	result.AffectedLanes = append([]int{sourceLane}, placements...)
	result.Placements = placements
	result.Removals = []int{sourceLane}

	return result
}

func (e *PerkExecutor) executeKamikaze(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkKamikaze, PerkName: "Kamikaze", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	sourceLane := targets[0]

	if sourceLane < 0 || sourceLane >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	if e.game.Lanes[sourceLane].CountPieces(player) == 0 {
		result.Error = "No pieces on this lane"
		return result
	}

	// Sacrifice piece (no redirection for voluntary sacrifice)
	e.game.RemovePiece(sourceLane, player)

	// Remove enemy pieces using Sanctuary/Capture redirection
	removals := []int{}
	var redirections []models.RemovalResult
	for i := 0; i < models.KamikazeRemoves; i++ {
		enemyLanes := e.game.GetNonEmptyLanes(opponent)
		if len(enemyLanes) == 0 {
			break
		}

		laneIdx := enemyLanes[e.game.Rand().Intn(len(enemyLanes))]
		removalResult := e.game.RemovePieceWithRedirects(laneIdx, opponent, player)
		removals = append(removals, laneIdx)
		if removalResult.Redirected {
			redirections = append(redirections, removalResult)
		}
	}

	result.Success = true
	result.AffectedLanes = append([]int{sourceLane}, removals...)
	result.Removals = removals
	result.Redirections = redirections

	return result
}

func (e *PerkExecutor) executeDisrupt(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkDisrupt, PerkName: "Disrupt", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	if len(targets) != 2 {
		result.Error = "Must select exactly 2 lanes"
		return result
	}
	lane1, lane2 := targets[0], targets[1]

	if lane1 == lane2 {
		result.Error = "Cannot swap lane with itself"
		return result
	}

	for _, laneIdx := range targets {
		if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
			result.Error = "Invalid lane"
			return result
		}
		if e.game.Lanes[laneIdx].IsWon() {
			result.Error = "Cannot use won lane"
			return result
		}
		if e.game.Lanes[laneIdx].CountPieces(opponent) == 0 {
			result.Error = "No enemy pieces on lane"
			return result
		}
	}

	count1 := e.game.Lanes[lane1].CountPieces(opponent)
	count2 := e.game.Lanes[lane2].CountPieces(opponent)

	// Remove all from both lanes
	for i := 0; i < count1; i++ {
		e.game.RemovePiece(lane1, opponent)
	}
	for i := 0; i < count2; i++ {
		e.game.RemovePiece(lane2, opponent)
	}

	// Add swapped amounts
	for i := 0; i < count2 && !e.game.Lanes[lane1].IsSideFull(opponent); i++ {
		e.game.PlacePiece(lane1, opponent)
	}
	for i := 0; i < count1 && !e.game.Lanes[lane2].IsSideFull(opponent); i++ {
		e.game.PlacePiece(lane2, opponent)
	}

	result.Success = true
	result.AffectedLanes = []int{lane1, lane2}

	return result
}

func (e *PerkExecutor) executeDisperse(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkDisperse, PerkName: "Disperse", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	sourceLane := targets[0]

	if sourceLane < 0 || sourceLane >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	if e.game.Lanes[sourceLane].IsWon() {
		result.Error = "Lane already won"
		return result
	}

	count := e.game.Lanes[sourceLane].CountPieces(opponent)
	if count == 0 {
		result.Error = "No enemy pieces on this lane"
		return result
	}

	// Remove all pieces (atomic removal)
	for i := 0; i < count; i++ {
		e.game.RemovePiece(sourceLane, opponent)
	}

	// Place on random lanes (iterative with win checks)
	placements := []int{}
	for i := 0; i < count; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		targetLane := e.getRandomLaneExcludingForPlayer(opponent, sourceLane)
		if targetLane < 0 {
			break
		}

		e.game.PlacePiece(targetLane, opponent)
		placements = append(placements, targetLane)

		if winner := e.game.CheckLaneWin(targetLane); winner != 0 {
			e.game.CleanupWonLane(targetLane)
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
				result.GameWonMidPerk = true
				break
			}
		}
	}

	result.Success = true
	result.AffectedLanes = append([]int{sourceLane}, placements...)
	result.Placements = placements

	return result
}

func (e *PerkExecutor) executeGambit(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkGambit, PerkName: "Gambit", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	// Give enemy pieces (random lanes, can repeat)
	enemyPlacements := []int{}
	for i := 0; i < models.GambitEnemyGain; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		available := e.game.GetAvailableLanesIgnoreFreeze(opponent)
		if len(available) == 0 {
			break
		}

		laneIdx := available[e.game.Rand().Intn(len(available))]
		e.game.PlacePiece(laneIdx, opponent)
		enemyPlacements = append(enemyPlacements, laneIdx)

		if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
			e.game.CleanupWonLane(laneIdx)
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
				result.GameWonMidPerk = true
				break
			}
		}
	}

	// You get pieces on random lane
	playerPlacements := []int{}
	if !result.GameWonMidPerk {
		available := e.game.GetAvailableLanes(player)
		if len(available) > 0 {
			playerLane := available[e.game.Rand().Intn(len(available))]
			for i := 0; i < models.GambitPlayerGain; i++ {
				if e.game.Status == models.LaneStatusFinished {
					break
				}
				if e.game.Lanes[playerLane].IsSideFull(player) || e.game.Lanes[playerLane].IsWon() {
					break
				}

				e.game.PlacePiece(playerLane, player)
				playerPlacements = append(playerPlacements, playerLane)

				if winner := e.game.CheckLaneWin(playerLane); winner != 0 {
					e.game.CleanupWonLane(playerLane)
					result.LaneWinner = winner
					if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
						result.GameWinner = gameWinner
						result.GameWonMidPerk = true
						break
					}
				}
			}
		}
	}

	result.Success = true
	result.Details["enemyReceived"] = enemyPlacements
	result.Details["playerReceived"] = playerPlacements
	result.Placements = playerPlacements

	return result
}

func (e *PerkExecutor) executeSteal(player models.PlayerSide) *PerkResult {
	result := &PerkResult{PerkID: PerkSteal, PerkName: "Steal", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	// Find enemy pieces
	enemyLanes := e.game.GetNonEmptyLanes(opponent)
	if len(enemyLanes) == 0 {
		result.Error = "No enemy pieces to steal"
		return result
	}

	// Remove enemy piece with redirection
	stealLane := enemyLanes[e.game.Rand().Intn(len(enemyLanes))]
	removalResult := e.game.RemovePieceWithRedirects(stealLane, opponent, player)

	// Place piece for player
	available := e.game.GetAvailableLanes(player)
	var placeLane int = -1
	if len(available) > 0 {
		placeLane = available[e.game.Rand().Intn(len(available))]
		e.game.PlacePiece(placeLane, player)

		if winner := e.game.CheckLaneWin(placeLane); winner != 0 {
			e.game.CleanupWonLane(placeLane)
			result.LaneWinner = winner
			if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
				result.GameWinner = gameWinner
			}
		}
	}

	result.Success = true
	result.Removals = []int{stealLane}
	if placeLane >= 0 {
		result.Placements = []int{placeLane}
	}
	if removalResult.Redirected {
		result.Redirections = []models.RemovalResult{removalResult}
	}

	return result
}

func (e *PerkExecutor) executeRush(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkRush, PerkName: "Rush", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	if e.game.Lanes[laneIdx].IsWon() {
		result.Error = "Lane already won"
		return result
	}

	lane := e.game.Lanes[laneIdx]
	laneWonDuringPlacement := false

	// Add pieces to player (up to limit)
	playerAdded := 0
	for i := 0; i < models.RushPiecesEach; i++ {
		if lane.IsWon() {
			laneWonDuringPlacement = true
			break
		}
		if !lane.IsSideFull(player) {
			e.game.PlacePiece(laneIdx, player)
			playerAdded++
			if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
				e.game.CleanupWonLane(laneIdx)
				laneWonDuringPlacement = true
				result.LaneWinner = winner
			}
		}
	}

	// Add pieces to opponent
	opponentAdded := 0
	for i := 0; i < models.RushPiecesEach; i++ {
		if lane.IsWon() {
			laneWonDuringPlacement = true
			break
		}
		if !lane.IsSideFull(opponent) {
			e.game.PlacePiece(laneIdx, opponent)
			opponentAdded++
			if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
				e.game.CleanupWonLane(laneIdx)
				laneWonDuringPlacement = true
				result.LaneWinner = winner
			}
		}
	}

	// If lane was won, cancel the loss
	playerRemoved := 0
	if !laneWonDuringPlacement {
		// Remove from player (prefer other lane)
		otherLanes := []int{}
		for i, l := range e.game.Lanes {
			if i != laneIdx && !l.IsWon() && l.CountPieces(player) > 0 {
				otherLanes = append(otherLanes, i)
			}
		}

		for i := 0; i < models.RushPlayerLoss; i++ {
			if len(otherLanes) > 0 {
				removeLane := otherLanes[e.game.Rand().Intn(len(otherLanes))]
				e.game.RemovePiece(removeLane, player)
				playerRemoved++
			} else if lane.CountPieces(player) > 0 {
				e.game.RemovePiece(laneIdx, player)
				playerRemoved++
			}
		}
	}

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["playerGained"] = playerAdded
	result.Details["opponentGained"] = opponentAdded
	result.Details["playerLost"] = playerRemoved
	result.Details["lossCancelledByLaneWin"] = laneWonDuringPlacement

	if result.LaneWinner != 0 {
		if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
			result.GameWinner = gameWinner
		}
	}

	return result
}

func (e *PerkExecutor) executeNullify(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkNullify, PerkName: "Nullify", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	if e.game.Lanes[laneIdx].IsWon() {
		result.Error = "Lane already won"
		return result
	}

	lane := e.game.Lanes[laneIdx]

	// Count and clear triggers
	triggersCleared := len(lane.Triggers)
	lane.ClearTriggers()

	// Clear deferred effects
	deferredCleared := len(lane.Deferred)
	lane.ClearDeferred()

	// Cancel pending raids on this lane
	raidsCleared := 0
	var remaining []models.PendingRaid
	for _, raid := range e.game.PendingRaids {
		if raid.Lane == laneIdx {
			raidsCleared++
		} else {
			remaining = append(remaining, raid)
		}
	}
	e.game.PendingRaids = remaining

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["triggersCleared"] = triggersCleared
	result.Details["deferredCleared"] = deferredCleared
	result.Details["raidsCleared"] = raidsCleared

	return result
}

// ============================================================================
// Deferred Perks
// ============================================================================

func (e *PerkExecutor) executeSignal(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkSignal, PerkName: "Signal", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	// Immediate: +1 piece
	e.game.PlacePiece(laneIdx, player)

	// Add deferred effect
	lane.AddDeferred(models.DeferredEffect{
		Type:       models.DeferredSignal,
		Owner:      player,
		TargetLane: laneIdx,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Placements = []int{laneIdx}
	result.Details["deferredPullFromMostPopulated"] = true

	// Check lane win
	e.checkLaneAndGameWin(laneIdx, result)

	return result
}

func (e *PerkExecutor) executeEnlist(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkEnlist, PerkName: "Enlist", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	// Immediate: +1 piece
	e.game.PlacePiece(laneIdx, player)

	// Add deferred effect
	lane.AddDeferred(models.DeferredEffect{
		Type:       models.DeferredEnlist,
		Owner:      player,
		TargetLane: laneIdx,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Placements = []int{laneIdx}
	result.Details["deferredCaptureAndMove"] = true

	// Check lane win
	e.checkLaneAndGameWin(laneIdx, result)

	return result
}

func (e *PerkExecutor) executeAmbush(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkAmbush, PerkName: "Ambush", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	// Immediate: +1 piece
	e.game.PlacePiece(laneIdx, player)

	// Add deferred effect
	lane.AddDeferred(models.DeferredEffect{
		Type:       models.DeferredAmbush,
		Owner:      player,
		TargetLane: laneIdx,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Placements = []int{laneIdx}
	result.Details["deferredRemoveFromLaneOrAdjacent"] = true

	// Check lane win
	e.checkLaneAndGameWin(laneIdx, result)

	return result
}

func (e *PerkExecutor) executeReinforce(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkReinforce, PerkName: "Reinforce", Details: make(map[string]interface{})}

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(player) {
		result.Error = "Lane is full"
		return result
	}

	// Immediate: +1 piece
	e.game.PlacePiece(laneIdx, player)

	// Add deferred effect
	lane.AddDeferred(models.DeferredEffect{
		Type:       models.DeferredReinforce,
		Owner:      player,
		TargetLane: laneIdx,
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Placements = []int{laneIdx}
	result.Details["deferredNextTurn"] = true

	// Check lane win
	e.checkLaneAndGameWin(laneIdx, result)

	return result
}

func (e *PerkExecutor) executeRaid(player models.PlayerSide, targets []int) *PerkResult {
	result := &PerkResult{PerkID: PerkRaid, PerkName: "Raid", Details: make(map[string]interface{})}
	opponent := player.Opponent()

	if len(targets) != 1 {
		result.Error = "Must select exactly 1 lane"
		return result
	}
	laneIdx := targets[0]

	if laneIdx < 0 || laneIdx >= models.DefaultLaneCount {
		result.Error = "Invalid lane"
		return result
	}
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		result.Error = "Lane already won"
		return result
	}
	if lane.IsSideFull(opponent) {
		result.Error = "Enemy side is full"
		return result
	}

	// Place raid marker on enemy's side (counts as enemy piece for space)
	e.game.PlacePiece(laneIdx, opponent)

	// Track pending raid
	e.game.PendingRaids = append(e.game.PendingRaids, models.PendingRaid{
		Owner:             player,
		Lane:              laneIdx,
		TurnsUntilResolve: 2,
		Source:            "RAID",
	})

	result.Success = true
	result.AffectedLanes = []int{laneIdx}
	result.Details["raidPlaced"] = true
	result.Details["resolvesInTurns"] = 2

	return result
}

// ============================================================================
// Trigger Firing
// ============================================================================

// FirePlacementTriggers fires all placement triggers on a lane
func (e *PerkExecutor) FirePlacementTriggers(laneIdx int, placingPlayer models.PlayerSide, chainDepth int) []TriggerResult {
	if chainDepth >= models.MaxTriggerChainDepth {
		return []TriggerResult{{TriggerType: "max_depth", SourceLane: laneIdx}}
	}

	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		return nil
	}

	triggers := lane.GetPlacementTriggers(placingPlayer)
	var results []TriggerResult

	for _, t := range triggers {
		if e.game.Lanes[laneIdx].IsWon() {
			break
		}

		result := e.fireSingleTrigger(laneIdx, t.Type, t.Owner, placingPlayer, chainDepth)
		if result != nil {
			results = append(results, *result)
			lane.RemoveTriggerByOrderID(t.OrderID)
		}

		if e.game.Status == models.LaneStatusFinished {
			break
		}
	}

	return results
}

// FireRemovalTriggers fires all removal triggers on a lane
func (e *PerkExecutor) FireRemovalTriggers(laneIdx int, removingPlayer models.PlayerSide) []TriggerResult {
	lane := e.game.Lanes[laneIdx]
	if lane.IsWon() {
		return nil
	}

	triggers := lane.GetRemovalTriggers(removingPlayer)
	var results []TriggerResult

	for _, t := range triggers {
		if e.game.Lanes[laneIdx].IsWon() {
			break
		}

		result := e.fireSingleTrigger(laneIdx, t.Type, t.Owner, removingPlayer, 0)
		if result != nil {
			results = append(results, *result)
			lane.RemoveTriggerByOrderID(t.OrderID)
		}

		if e.game.Status == models.LaneStatusFinished {
			break
		}
	}

	return results
}

func (e *PerkExecutor) fireSingleTrigger(laneIdx int, triggerType models.TriggerType, owner, opponent models.PlayerSide, chainDepth int) *TriggerResult {
	result := &TriggerResult{
		TriggerType: triggerType,
		SourceLane:  laneIdx,
		Owner:       owner,
	}

	switch triggerType {
	case models.TriggerPortal:
		e.handlePortalTrigger(laneIdx, opponent, chainDepth, result)
	case models.TriggerTrap:
		e.handleTrapTrigger(laneIdx, opponent, result)
	case models.TriggerMirror:
		e.handleMirrorTrigger(laneIdx, owner, result)
	case models.TriggerEcho:
		e.handleEchoTrigger(laneIdx, owner, result)
	case models.TriggerShockwave:
		e.handleShockwaveTrigger(laneIdx, opponent, owner, result)
	case models.TriggerHydra:
		e.handleHydraTrigger(laneIdx, owner, result)
	case models.TriggerBackfire:
		e.handleBackfireTrigger(laneIdx, opponent, owner, result)
	case models.TriggerAbsorb:
		e.handleAbsorbTrigger(laneIdx, owner, result)
	case models.TriggerRetaliate:
		e.handleRetaliateTrigger(laneIdx, owner, opponent, result)
	default:
		return nil
	}

	return result
}

func (e *PerkExecutor) handlePortalTrigger(laneIdx int, placingPlayer models.PlayerSide, chainDepth int, result *TriggerResult) {
	// Remove the piece that was just placed
	e.game.RemovePiece(laneIdx, placingPlayer)

	// Find destination with source exclusion
	available := e.game.GetAvailableLanesIgnoreFreeze(placingPlayer)
	if len(available) >= models.SourceExclusionThreshold {
		filtered := []int{}
		for _, l := range available {
			if l != laneIdx {
				filtered = append(filtered, l)
			}
		}
		if len(filtered) > 0 {
			available = filtered
		}
	}

	if len(available) > 0 {
		dest := available[e.game.Rand().Intn(len(available))]
		e.game.PlacePiece(dest, placingPlayer)
		result.Destination = dest

		// Check lane win
		if winner := e.game.CheckLaneWin(dest); winner != 0 {
			e.game.CleanupWonLane(dest)
		}

		// Trigger chaining
		if !e.game.Lanes[dest].IsWon() {
			chainedResults := e.FirePlacementTriggers(dest, placingPlayer, chainDepth+1)
			result.ChainedResults = chainedResults
		}
	} else {
		result.Destination = -1 // Piece lost
	}
}

func (e *PerkExecutor) handleTrapTrigger(laneIdx int, placingPlayer models.PlayerSide, result *TriggerResult) {
	// Remove piece using Sanctuary (no Capture since Trap doesn't have a "remover")
	removalResult := e.game.RemovePieceWithRedirects(laneIdx, placingPlayer, 0)
	result.PiecesRemoved = 1
	if removalResult.Redirected {
		result.Destination = removalResult.Destination
	}
}

func (e *PerkExecutor) handleMirrorTrigger(laneIdx int, owner models.PlayerSide, result *TriggerResult) {
	piecesAdded := 0
	for i := 0; i < models.MirrorPieces; i++ {
		if !e.game.Lanes[laneIdx].IsSideFull(owner) {
			e.game.PlacePiece(laneIdx, owner)
			piecesAdded++
		}
	}
	result.PiecesAdded = piecesAdded
}

func (e *PerkExecutor) handleEchoTrigger(laneIdx int, owner models.PlayerSide, result *TriggerResult) {
	piecesAdded := 0
	for i := 0; i < models.EchoPieces; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		available := e.game.GetAvailableLanesIgnoreFreeze(owner)
		if len(available) >= models.SourceExclusionThreshold {
			filtered := []int{}
			for _, l := range available {
				if l != laneIdx {
					filtered = append(filtered, l)
				}
			}
			if len(filtered) > 0 {
				available = filtered
			}
		}

		if len(available) > 0 {
			dest := available[e.game.Rand().Intn(len(available))]
			e.game.PlacePiece(dest, owner)
			piecesAdded++

			if winner := e.game.CheckLaneWin(dest); winner != 0 {
				e.game.CleanupWonLane(dest)
				if e.game.CheckGameWin() != 0 {
					break
				}
			}
		}
	}
	result.PiecesAdded = piecesAdded
}

func (e *PerkExecutor) handleShockwaveTrigger(laneIdx int, placingPlayer, triggerOwner models.PlayerSide, result *TriggerResult) {
	removedCount := 0
	for i := 0; i < models.ShockwaveRemoves; i++ {
		// Find lanes with placing player's pieces (excluding trigger lane)
		var otherLanes []int
		for j := 0; j < models.DefaultLaneCount; j++ {
			if j != laneIdx && !e.game.Lanes[j].IsWon() && e.game.Lanes[j].CountPieces(placingPlayer) > 0 {
				otherLanes = append(otherLanes, j)
			}
		}

		if len(otherLanes) > 0 {
			removeLane := otherLanes[e.game.Rand().Intn(len(otherLanes))]
			e.game.RemovePieceWithRedirects(removeLane, placingPlayer, triggerOwner)
			removedCount++
		}
	}
	result.PiecesRemoved = removedCount
}

func (e *PerkExecutor) handleHydraTrigger(laneIdx int, owner models.PlayerSide, result *TriggerResult) {
	piecesAdded := 0
	for i := 0; i < models.HydraPieces; i++ {
		if e.game.Status == models.LaneStatusFinished {
			break
		}

		available := e.game.GetAvailableLanesIgnoreFreeze(owner)
		if len(available) >= models.SourceExclusionThreshold {
			filtered := []int{}
			for _, l := range available {
				if l != laneIdx {
					filtered = append(filtered, l)
				}
			}
			if len(filtered) > 0 {
				available = filtered
			}
		}

		if len(available) > 0 {
			dest := available[e.game.Rand().Intn(len(available))]
			e.game.PlacePiece(dest, owner)
			piecesAdded++

			if winner := e.game.CheckLaneWin(dest); winner != 0 {
				e.game.CleanupWonLane(dest)
				if e.game.CheckGameWin() != 0 {
					break
				}
			}
		}
	}
	result.PiecesAdded = piecesAdded
}

func (e *PerkExecutor) handleBackfireTrigger(laneIdx int, removingPlayer, triggerOwner models.PlayerSide, result *TriggerResult) {
	removedCount := 0
	for i := 0; i < models.BackfireRemoves; i++ {
		lanesWithPieces := e.game.GetNonEmptyLanes(removingPlayer)
		if len(lanesWithPieces) > 0 {
			removeLane := lanesWithPieces[e.game.Rand().Intn(len(lanesWithPieces))]
			e.game.RemovePieceWithRedirects(removeLane, removingPlayer, triggerOwner)
			removedCount++
		}
	}
	result.PiecesRemoved = removedCount
}

func (e *PerkExecutor) handleAbsorbTrigger(laneIdx int, owner models.PlayerSide, result *TriggerResult) {
	available := e.game.GetAvailableLanesIgnoreFreeze(owner)
	if len(available) >= models.SourceExclusionThreshold {
		filtered := []int{}
		for _, l := range available {
			if l != laneIdx {
				filtered = append(filtered, l)
			}
		}
		if len(filtered) > 0 {
			available = filtered
		}
	}

	if len(available) > 0 {
		dest := available[e.game.Rand().Intn(len(available))]
		e.game.PlacePiece(dest, owner)
		result.Destination = dest
		result.PiecesAdded = 1

		if winner := e.game.CheckLaneWin(dest); winner != 0 {
			e.game.CleanupWonLane(dest)
		}
	}
}

func (e *PerkExecutor) handleRetaliateTrigger(laneIdx int, owner, opponent models.PlayerSide, result *TriggerResult) {
	lane := e.game.Lanes[laneIdx]
	if lane.IsSideFull(opponent) {
		result.RaidPlaced = false
		return
	}

	// Place raid piece on opponent's side
	e.game.PlacePiece(laneIdx, opponent)

	// Track the raid
	e.game.PendingRaids = append(e.game.PendingRaids, models.PendingRaid{
		Owner:             owner,
		Lane:              laneIdx,
		TurnsUntilResolve: 2,
		Source:            "RETALIATE",
	})

	result.RaidPlaced = true

	if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
		e.game.CleanupWonLane(laneIdx)
	}
}

// ============================================================================
// Deferred and Raid Processing
// ============================================================================

// ProcessPendingRaids processes raids ready to resolve for the current player
func (e *PerkExecutor) ProcessPendingRaids(player models.PlayerSide) []RaidResult {
	var results []RaidResult
	opponent := player.Opponent()

	// Find raids ready to resolve
	var readyRaids []models.PendingRaid
	var remaining []models.PendingRaid
	for _, r := range e.game.PendingRaids {
		if r.Owner == player && r.TurnsUntilResolve <= 0 {
			readyRaids = append(readyRaids, r)
		} else {
			remaining = append(remaining, r)
		}
	}
	e.game.PendingRaids = remaining

	for _, raid := range readyRaids {
		laneIdx := raid.Lane
		lane := e.game.Lanes[laneIdx]
		result := RaidResult{Lane: laneIdx, Source: raid.Source, Success: true}

		if lane.IsWon() {
			result.Outcome = "lane_already_won"
			result.Success = false
			results = append(results, result)
			continue
		}

		// Roll probability
		roll := e.game.Rand().Intn(100)
		result.Roll = roll

		if roll < 10 {
			// 10% lost
			if lane.CountPieces(opponent) > 0 {
				e.game.RemovePiece(laneIdx, opponent)
			}
			result.Outcome = "lost"
			result.PiecesGained = 0
		} else if roll < 25 {
			// 15% +2 recruits
			if lane.CountPieces(opponent) > 0 {
				e.game.RemovePiece(laneIdx, opponent)
			}
			piecesAdded := 0
			for i := 0; i < 3; i++ {
				if !lane.IsSideFull(player) {
					e.game.PlacePiece(laneIdx, player)
					result.Placements = append(result.Placements, laneIdx)
					piecesAdded++
					if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
						result.LaneWinner = winner
						e.game.CleanupWonLane(laneIdx)
						if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
							result.GameWinner = gameWinner
							results = append(results, result)
							return results
						}
						break
					}
				}
			}
			result.Outcome = "+2_recruits"
			result.PiecesGained = piecesAdded
		} else if roll < 55 {
			// 30% +1 recruit
			if lane.CountPieces(opponent) > 0 {
				e.game.RemovePiece(laneIdx, opponent)
			}
			piecesAdded := 0
			for i := 0; i < 2; i++ {
				if !lane.IsSideFull(player) {
					e.game.PlacePiece(laneIdx, player)
					result.Placements = append(result.Placements, laneIdx)
					piecesAdded++
					if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
						result.LaneWinner = winner
						e.game.CleanupWonLane(laneIdx)
						if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
							result.GameWinner = gameWinner
							results = append(results, result)
							return results
						}
						break
					}
				}
			}
			result.Outcome = "+1_recruit"
			result.PiecesGained = piecesAdded
		} else {
			// 45% alone
			if lane.CountPieces(opponent) > 0 {
				e.game.RemovePiece(laneIdx, opponent)
			}
			if !lane.IsSideFull(player) {
				e.game.PlacePiece(laneIdx, player)
				result.Placements = append(result.Placements, laneIdx)
				result.PiecesGained = 1
				if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
					result.LaneWinner = winner
					e.game.CleanupWonLane(laneIdx)
					if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
						result.GameWinner = gameWinner
						results = append(results, result)
						return results
					}
				}
			}
			result.Outcome = "alone"
		}

		results = append(results, result)
	}

	return results
}

// ProcessDeferredEffects processes all deferred effects for the current player
func (e *PerkExecutor) ProcessDeferredEffects(player models.PlayerSide) []DeferredResult {
	var results []DeferredResult
	opponent := player.Opponent()

	for laneIdx, lane := range e.game.Lanes {
		if lane.IsWon() {
			continue
		}

		effects := lane.PopDeferredFor(player)
		for _, effect := range effects {
			result := DeferredResult{
				Type:    effect.Type,
				Lane:    laneIdx,
				Details: make(map[string]interface{}),
			}

			switch effect.Type {
			case models.DeferredSignal:
				// Pull from most populated lane
				var sourceLanes []struct {
					idx   int
					count int
				}
				for i, l := range e.game.Lanes {
					if i != laneIdx && !l.IsWon() && l.CountPieces(player) > 0 {
						sourceLanes = append(sourceLanes, struct {
							idx   int
							count int
						}{i, l.CountPieces(player)})
					}
				}
				if len(sourceLanes) > 0 && !lane.IsSideFull(player) {
					// Sort by count descending
					for i := 0; i < len(sourceLanes)-1; i++ {
						for j := i + 1; j < len(sourceLanes); j++ {
							if sourceLanes[j].count > sourceLanes[i].count {
								sourceLanes[i], sourceLanes[j] = sourceLanes[j], sourceLanes[i]
							}
						}
					}
					source := sourceLanes[0].idx
					e.game.RemovePiece(source, player)
					result.Removals = append(result.Removals, source)
					e.game.PlacePiece(laneIdx, player)
					result.Placements = append(result.Placements, laneIdx)
					result.Success = true
					result.Details["pulledFrom"] = source

					// Check for lane/game win
					if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
						result.LaneWinner = winner
						e.game.CleanupWonLane(laneIdx)
						if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
							result.GameWinner = gameWinner
							results = append(results, result)
							return results
						}
					}
				} else {
					result.Success = false
					result.Details["reason"] = "No valid source"
				}

			case models.DeferredEnlist:
				// Move piece + capture enemy to least populated
				if lane.CountPieces(player) <= 0 {
					result.Success = false
					result.Details["reason"] = "No player piece"
					break
				}
				e.game.RemovePiece(laneIdx, player)
				result.Removals = append(result.Removals, laneIdx)

				enemyCaptured := false
				if lane.CountPieces(opponent) > 0 {
					e.game.RemovePiece(laneIdx, opponent)
					enemyCaptured = true
				}

				// Find least populated lane
				var destLanes []struct {
					idx   int
					count int
				}
				for i, l := range e.game.Lanes {
					if !l.IsWon() && !l.IsSideFull(player) && i != laneIdx {
						destLanes = append(destLanes, struct {
							idx   int
							count int
						}{i, l.CountPieces(player)})
					}
				}
				if len(destLanes) == 0 && !lane.IsSideFull(player) && !lane.IsWon() {
					destLanes = append(destLanes, struct {
						idx   int
						count int
					}{laneIdx, lane.CountPieces(player)})
				}

				if len(destLanes) > 0 {
					// Sort by count ascending
					for i := 0; i < len(destLanes)-1; i++ {
						for j := i + 1; j < len(destLanes); j++ {
							if destLanes[j].count < destLanes[i].count {
								destLanes[i], destLanes[j] = destLanes[j], destLanes[i]
							}
						}
					}
					dest := destLanes[0].idx
					piecesToAdd := 1
					if enemyCaptured {
						piecesToAdd = 2
					}
					for i := 0; i < piecesToAdd && !e.game.Lanes[dest].IsSideFull(player); i++ {
						e.game.PlacePiece(dest, player)
						result.Placements = append(result.Placements, dest)
					}
					result.Success = true
					result.Details["destination"] = dest
					result.Details["enemyCaptured"] = enemyCaptured

					// Check for lane/game win
					if winner := e.game.CheckLaneWin(dest); winner != 0 {
						result.LaneWinner = winner
						e.game.CleanupWonLane(dest)
						if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
							result.GameWinner = gameWinner
							results = append(results, result)
							return results
						}
					}
				} else {
					result.Success = true
					result.Details["note"] = "No valid destination"
				}

			case models.DeferredAmbush:
				// Remove from lane or adjacent
				targetLane := effect.TargetLane
				adjacent := []int{targetLane}
				if targetLane > 0 {
					adjacent = append(adjacent, targetLane-1)
				}
				if targetLane < models.DefaultLaneCount-1 {
					adjacent = append(adjacent, targetLane+1)
				}

				var validTargets []int
				for _, l := range adjacent {
					if !e.game.Lanes[l].IsWon() && e.game.Lanes[l].CountPieces(opponent) > 0 {
						validTargets = append(validTargets, l)
					}
				}

				if len(validTargets) > 0 {
					removeFrom := validTargets[e.game.Rand().Intn(len(validTargets))]
					e.game.RemovePiece(removeFrom, opponent)
					result.Removals = append(result.Removals, removeFrom)
					result.Success = true
					result.Details["removedFrom"] = removeFrom
				} else {
					result.Success = false
					result.Details["reason"] = "No valid targets"
				}

			case models.DeferredReinforce:
				// Add 1 piece
				if !lane.IsSideFull(player) {
					e.game.PlacePiece(laneIdx, player)
					result.Placements = append(result.Placements, laneIdx)
					result.Success = true

					// Check for lane/game win
					if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
						result.LaneWinner = winner
						e.game.CleanupWonLane(laneIdx)
						if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
							result.GameWinner = gameWinner
							results = append(results, result)
							return results
						}
					}
				} else {
					result.Success = false
					result.Details["reason"] = "Lane is full"
				}
			}

			results = append(results, result)
		}
	}

	return results
}

// ============================================================================
// Helper Functions
// ============================================================================

func (e *PerkExecutor) getRandomLaneExcluding(player models.PlayerSide, sourceLane int) int {
	available := e.game.GetAvailableLanes(player)
	if len(available) == 0 {
		return -1
	}

	if len(available) >= models.SourceExclusionThreshold {
		filtered := []int{}
		for _, lane := range available {
			if lane != sourceLane {
				filtered = append(filtered, lane)
			}
		}
		if len(filtered) > 0 {
			return filtered[e.game.Rand().Intn(len(filtered))]
		}
	}

	return available[e.game.Rand().Intn(len(available))]
}

func (e *PerkExecutor) getRandomLaneExcludingForPlayer(player models.PlayerSide, sourceLane int) int {
	available := e.game.GetAvailableLanesIgnoreFreeze(player)
	if len(available) == 0 {
		return -1
	}

	if len(available) >= models.SourceExclusionThreshold {
		filtered := []int{}
		for _, lane := range available {
			if lane != sourceLane {
				filtered = append(filtered, lane)
			}
		}
		if len(filtered) > 0 {
			return filtered[e.game.Rand().Intn(len(filtered))]
		}
	}

	return available[e.game.Rand().Intn(len(available))]
}

func (e *PerkExecutor) checkLaneAndGameWin(laneIdx int, result *PerkResult) {
	if winner := e.game.CheckLaneWin(laneIdx); winner != 0 {
		e.game.CleanupWonLane(laneIdx)
		result.LaneWinner = winner
		if gameWinner := e.game.CheckGameWin(); gameWinner != 0 {
			result.GameWinner = gameWinner
		}
	}
}
