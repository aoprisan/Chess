package perks

import (
	"github.com/kiddiechess/server/internal/models"
)

// TargetingHelper provides helper functions for perk targeting validation
type TargetingHelper struct {
	game *models.LaneGame
}

// NewTargetingHelper creates a new targeting helper
func NewTargetingHelper(game *models.LaneGame) *TargetingHelper {
	return &TargetingHelper{game: game}
}

// GetValidTargetsForPerk returns all valid target lanes for a perk
func (t *TargetingHelper) GetValidTargetsForPerk(perkID PerkID, player models.PlayerSide) []int {
	def := GetPerkDefinition(perkID)
	if def == nil {
		return nil
	}

	switch def.Target {
	case TargetYourLane:
		return t.getYourLaneTargets(player, perkID)
	case TargetEnemyLane:
		return t.getEnemyLaneTargets(player, perkID)
	case TargetYourPiece:
		return t.getYourPieceTargets(player)
	case TargetAuto:
		return nil // No targeting needed
	default:
		return nil
	}
}

// getYourLaneTargets returns lanes where the player can target their own side
func (t *TargetingHelper) getYourLaneTargets(player models.PlayerSide, perkID PerkID) []int {
	targets := make([]int, 0, models.DefaultLaneCount)

	for i := 0; i < models.DefaultLaneCount; i++ {
		lane := t.game.Lanes[i]
		if lane.IsWon() {
			continue
		}

		// For PlaceAnother, lane must not be full
		if perkID == PerkPlaceAnother {
			if lane.IsSideFull(player) {
				continue
			}
		}

		targets = append(targets, i)
	}

	return targets
}

// getEnemyLaneTargets returns lanes where the player can target the enemy side
func (t *TargetingHelper) getEnemyLaneTargets(player models.PlayerSide, perkID PerkID) []int {
	targets := make([]int, 0, models.DefaultLaneCount)
	opponent := player.Opponent()

	for i := 0; i < models.DefaultLaneCount; i++ {
		lane := t.game.Lanes[i]
		if lane.IsWon() {
			continue
		}

		// For RemoveEnemy, enemy must have pieces
		if perkID == PerkRemoveEnemy {
			if lane.CountPieces(opponent) == 0 {
				continue
			}
		}

		// For Disperse, enemy must have pieces
		if perkID == PerkDisperse {
			if lane.CountPieces(opponent) == 0 {
				continue
			}
		}

		targets = append(targets, i)
	}

	return targets
}

// getYourPieceTargets returns lanes where the player has pieces they can sacrifice
func (t *TargetingHelper) getYourPieceTargets(player models.PlayerSide) []int {
	targets := make([]int, 0, models.DefaultLaneCount)

	for i := 0; i < models.DefaultLaneCount; i++ {
		lane := t.game.Lanes[i]
		if lane.IsWon() {
			continue
		}

		if lane.CountPieces(player) > 0 {
			targets = append(targets, i)
		}
	}

	return targets
}

// CanUsePerk checks if a perk can be used at all (has valid targets)
func (t *TargetingHelper) CanUsePerk(perkID PerkID, player models.PlayerSide) bool {
	def := GetPerkDefinition(perkID)
	if def == nil {
		return false
	}

	switch def.Target {
	case TargetAuto:
		// Auto-target perks can always be used (if they have valid targets internally)
		return t.canUseAutoTargetPerk(perkID, player)
	case TargetYourLane, TargetEnemyLane, TargetYourPiece:
		targets := t.GetValidTargetsForPerk(perkID, player)
		return len(targets) > 0
	case TargetTwoYourLanes:
		// Need at least 2 lanes with pieces
		return len(t.getYourPieceTargets(player)) >= 2
	case TargetTwoEnemyLanes:
		// Need at least 2 lanes with enemy pieces
		opponent := player.Opponent()
		count := 0
		for i := 0; i < models.DefaultLaneCount; i++ {
			lane := t.game.Lanes[i]
			if !lane.IsWon() && lane.CountPieces(opponent) > 0 {
				count++
			}
		}
		return count >= 2
	default:
		return false
	}
}

// canUseAutoTargetPerk checks if an auto-target perk has valid internal targets
func (t *TargetingHelper) canUseAutoTargetPerk(perkID PerkID, player models.PlayerSide) bool {
	opponent := player.Opponent()

	switch perkID {
	case PerkSteal:
		// Need enemy pieces to steal
		return len(t.game.GetNonEmptyLanes(opponent)) > 0
	case PerkScramble:
		// Need enemy pieces to scramble
		return len(t.game.GetNonEmptyLanes(opponent)) > 0
	case PerkCloak, PerkBlind:
		// Can always be used
		return true
	case PerkGambit:
		// Can always be used (might not be wise, but allowed)
		return true
	default:
		return true
	}
}

// RequiresLaneSelection returns true if the perk requires the player to select a lane
func RequiresLaneSelection(perkID PerkID) bool {
	def := GetPerkDefinition(perkID)
	if def == nil {
		return false
	}

	switch def.Target {
	case TargetAuto:
		return false
	default:
		return true
	}
}

// RequiresMultipleLaneSelection returns true if the perk requires selecting 2 lanes
func RequiresMultipleLaneSelection(perkID PerkID) bool {
	def := GetPerkDefinition(perkID)
	if def == nil {
		return false
	}

	return def.Target == TargetTwoYourLanes || def.Target == TargetTwoEnemyLanes
}
