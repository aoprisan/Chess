package game

import (
	"math/rand"

	"github.com/kiddiechess/server/internal/models"
	"github.com/kiddiechess/server/internal/perks"
)

// difficultyParams holds scoring weights for each difficulty level
type difficultyParams struct {
	passChance       int // percentage chance to pass (0-100)
	randomPerkChance int // percentage chance to pick a random perk
	winLaneBonus     int // bonus for near-win lanes
	blockBonus       int // bonus for blocking opponent near-wins
	positionAdvance  int // points per piece in a lane
	noiseMax         int // max random noise added to scores
}

var difficultySettings = map[string]difficultyParams{
	"easy": {
		passChance:       30,
		randomPerkChance: 25,
		winLaneBonus:     60,
		blockBonus:       30,
		positionAdvance:  10,
		noiseMax:         20,
	},
	"medium": {
		passChance:       0,
		randomPerkChance: 0,
		winLaneBonus:     100,
		blockBonus:       80,
		positionAdvance:  15,
		noiseMax:         10,
	},
	"hard": {
		passChance:       0,
		randomPerkChance: 0,
		winLaneBonus:     120,
		blockBonus:       100,
		positionAdvance:  20,
		noiseMax:         2,
	},
}

// perkCandidate holds a candidate perk action with its score
type perkCandidate struct {
	perkID  int
	targets []int
	score   int
}

// LaneAI handles AI decision making for lane games
type LaneAI struct {
	difficulty string
	params     difficultyParams
}

// NewLaneAI creates a new AI for lane games
func NewLaneAI(difficulty string) *LaneAI {
	params, ok := difficultySettings[difficulty]
	if !ok {
		params = difficultySettings["easy"]
	}
	return &LaneAI{
		difficulty: difficulty,
		params:     params,
	}
}

// ChoosePerk selects a perk and targets for the AI.
// Returns (perkID, targets) where targets may be nil (pass/auto), single lane, or two lanes.
func (ai *LaneAI) ChoosePerk(game *models.LaneGame) (int, []int) {
	// Random pass for easy difficulty
	if ai.params.passChance > 0 && rand.Intn(100) < ai.params.passChance {
		return 0, nil
	}

	// Random perk selection for easy difficulty
	if ai.params.randomPerkChance > 0 && rand.Intn(100) < ai.params.randomPerkChance {
		return ai.chooseRandomPerk(game)
	}

	return ai.chooseBestPerk(game)
}

// chooseBestPerk evaluates all 4 offered perk slots and picks the highest-scoring one
func (ai *LaneAI) chooseBestPerk(game *models.LaneGame) (int, []int) {
	player := game.CurrentPlayer
	helper := perks.NewTargetingHelper(game)

	var best *perkCandidate

	for _, slot := range game.CurrentPerkSlots {
		if slot.PerkID <= 0 {
			continue
		}

		perkID := perks.PerkID(slot.PerkID)

		// Check if the perk can be used at all
		if !helper.CanUsePerk(perkID, player) {
			continue
		}

		candidates := ai.evaluatePerk(game, player, perkID, helper)
		for _, c := range candidates {
			// Add noise
			if ai.params.noiseMax > 0 {
				c.score += rand.Intn(ai.params.noiseMax + 1)
			}
			if best == nil || c.score > best.score {
				cc := c // copy to avoid loop variable capture
				best = &cc
			}
		}
	}

	// Pass baseline is score 0; only pick a perk if it scores > 0
	if best == nil || best.score <= 0 {
		return 0, nil
	}

	return best.perkID, best.targets
}

// chooseRandomPerk picks a random usable perk with a random valid target
func (ai *LaneAI) chooseRandomPerk(game *models.LaneGame) (int, []int) {
	player := game.CurrentPlayer
	helper := perks.NewTargetingHelper(game)

	// Collect usable perks
	type usable struct {
		perkID int
		targets []int
	}
	var options []usable

	for _, slot := range game.CurrentPerkSlots {
		if slot.PerkID <= 0 {
			continue
		}
		perkID := perks.PerkID(slot.PerkID)
		if !helper.CanUsePerk(perkID, player) {
			continue
		}

		def := perks.GetPerkDefinition(perkID)
		if def == nil {
			continue
		}

		switch def.Target {
		case perks.TargetAuto:
			options = append(options, usable{slot.PerkID, nil})
		case perks.TargetYourLane, perks.TargetEnemyLane, perks.TargetYourPiece:
			targets := helper.GetValidTargetsForPerk(perkID, player)
			if len(targets) > 0 {
				t := targets[rand.Intn(len(targets))]
				options = append(options, usable{slot.PerkID, []int{t}})
			}
		case perks.TargetTwoYourLanes:
			targets := ai.getYourPieceLanes(game, player)
			if len(targets) >= 2 {
				rand.Shuffle(len(targets), func(i, j int) { targets[i], targets[j] = targets[j], targets[i] })
				options = append(options, usable{slot.PerkID, []int{targets[0], targets[1]}})
			}
		case perks.TargetTwoEnemyLanes:
			opponent := player.Opponent()
			if !game.IsCloaked(opponent) {
				targets := game.GetNonEmptyLanes(opponent)
				if len(targets) >= 2 {
					rand.Shuffle(len(targets), func(i, j int) { targets[i], targets[j] = targets[j], targets[i] })
					options = append(options, usable{slot.PerkID, []int{targets[0], targets[1]}})
				}
			}
		}
	}

	if len(options) == 0 {
		return 0, nil
	}

	pick := options[rand.Intn(len(options))]
	return pick.perkID, pick.targets
}

// evaluatePerk returns scored candidates for a single perk
func (ai *LaneAI) evaluatePerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID, helper *perks.TargetingHelper) []perkCandidate {
	def := perks.GetPerkDefinition(perkID)
	if def == nil {
		return nil
	}

	switch def.Target {
	case perks.TargetAuto:
		return ai.evaluateAutoTargetPerk(game, player, perkID)
	case perks.TargetYourLane:
		return ai.evaluateYourLanePerk(game, player, perkID, helper)
	case perks.TargetEnemyLane:
		return ai.evaluateEnemyLanePerk(game, player, perkID, helper)
	case perks.TargetYourPiece:
		return ai.evaluateYourPiecePerk(game, player, perkID, helper)
	case perks.TargetTwoYourLanes:
		return ai.evaluateTwoYourLanesPerk(game, player, perkID)
	case perks.TargetTwoEnemyLanes:
		return ai.evaluateTwoEnemyLanesPerk(game, player, perkID)
	default:
		return nil
	}
}

// ---- Core lane scoring functions ----

// scoreLaneForPlacement scores how valuable it is to place a piece on a lane
func (ai *LaneAI) scoreLaneForPlacement(game *models.LaneGame, player models.PlayerSide, laneIdx int) int {
	lane := game.Lanes[laneIdx]
	if lane.IsWon() || lane.IsSideFull(player) {
		return -1000
	}

	pieces := lane.CountPieces(player)
	score := pieces * ai.params.positionAdvance

	// Near-win bonus: 4 pieces = about to win the lane
	if pieces == 4 {
		score += ai.params.winLaneBonus * 10 // Massive bonus for winning move
	} else if pieces == 3 {
		score += ai.params.winLaneBonus
	}

	// Small bonus for lanes where opponent has fewer pieces (easier to win)
	opponent := player.Opponent()
	oppPieces := lane.CountPieces(opponent)
	if oppPieces == 0 {
		score += ai.params.positionAdvance
	}

	return score
}

// scoreLaneForRemoval scores how valuable it is to remove an enemy piece from a lane
func (ai *LaneAI) scoreLaneForRemoval(game *models.LaneGame, player models.PlayerSide, laneIdx int) int {
	lane := game.Lanes[laneIdx]
	opponent := player.Opponent()
	if lane.IsWon() || lane.CountPieces(opponent) == 0 {
		return -1000
	}

	oppPieces := lane.CountPieces(opponent)
	score := oppPieces * ai.params.positionAdvance

	// Block opponent near-win
	if oppPieces >= 5 {
		score += ai.params.blockBonus * 10
	} else if oppPieces == 4 {
		score += ai.params.blockBonus * 5
	} else if oppPieces == 3 {
		score += ai.params.blockBonus
	}

	return score
}

// ---- Per-targeting-type evaluation ----

// evaluateAutoTargetPerk scores auto-target perks (Cloak, Blind, Scramble, Gambit, Steal)
func (ai *LaneAI) evaluateAutoTargetPerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID) []perkCandidate {
	opponent := player.Opponent()
	score := 0

	switch perkID {
	case perks.PerkCloak:
		// More valuable when we have pieces to hide
		totalPieces := ai.countTotalPieces(game, player)
		score = totalPieces * 5
		// Extra value if opponent has removal-based perks active
		if totalPieces > 10 {
			score += 20
		}

	case perks.PerkBlind:
		// More valuable when opponent has many pieces (they can't see their own)
		oppPieces := ai.countTotalPieces(game, opponent)
		score = oppPieces * 5
		if oppPieces > 10 {
			score += 20
		}

	case perks.PerkScramble:
		// Value based on disrupting opponent concentrations
		oppPieces := ai.countTotalPieces(game, opponent)
		if oppPieces == 0 {
			return nil
		}
		// More valuable when opponent has concentrated pieces
		maxConcentration := 0
		for i := 0; i < models.DefaultLaneCount; i++ {
			if !game.Lanes[i].IsWon() {
				c := game.Lanes[i].CountPieces(opponent)
				if c > maxConcentration {
					maxConcentration = c
				}
			}
		}
		score = maxConcentration * ai.params.blockBonus / 4
		if maxConcentration >= 4 {
			score += ai.params.blockBonus
		}

	case perks.PerkGambit:
		// Risky: enemy gets 3, you get 2 concentrated
		// More valuable when behind or when we can concentrate on a near-win lane
		ourPieces := ai.countTotalPieces(game, player)
		oppPieces := ai.countTotalPieces(game, opponent)
		// Slight value when behind (net -1 but concentrated)
		if ourPieces <= oppPieces {
			score = ai.params.positionAdvance * 2
		} else {
			score = ai.params.positionAdvance // Less appealing when ahead
		}
		// Check if we have a near-win lane that could benefit from concentrated placement
		for i := 0; i < models.DefaultLaneCount; i++ {
			if !game.Lanes[i].IsWon() && game.Lanes[i].CountPieces(player) >= 3 && !game.Lanes[i].IsSideFull(player) {
				score += ai.params.winLaneBonus / 2
				break
			}
		}

	case perks.PerkSteal:
		// Remove 1 from enemy, gain 1 for us: net +2 swing
		oppPieces := ai.countTotalPieces(game, opponent)
		if oppPieces == 0 {
			return nil
		}
		score = ai.params.positionAdvance * 3
		// Extra value if opponent has concentrated pieces
		for i := 0; i < models.DefaultLaneCount; i++ {
			if !game.Lanes[i].IsWon() && game.Lanes[i].CountPieces(opponent) >= 4 {
				score += ai.params.blockBonus / 2
				break
			}
		}
	}

	if score <= 0 {
		return nil
	}

	return []perkCandidate{{perkID: int(perkID), targets: nil, score: score}}
}

// evaluateYourLanePerk scores perks that target one of your own lanes
func (ai *LaneAI) evaluateYourLanePerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID, helper *perks.TargetingHelper) []perkCandidate {
	targets := helper.GetValidTargetsForPerk(perkID, player)
	if len(targets) == 0 {
		return nil
	}

	var candidates []perkCandidate
	opponent := player.Opponent()

	for _, laneIdx := range targets {
		lane := game.Lanes[laneIdx]
		score := 0

		switch perkID {
		case perks.PerkPlaceAnother:
			score = ai.scoreLaneForPlacement(game, player, laneIdx)
			score += 5 // Small base bonus for common perk

		case perks.PerkFreeze:
			// Value based on opponent's presence in the lane
			oppPieces := lane.CountPieces(opponent)
			if oppPieces >= 4 {
				score = ai.params.blockBonus * 2
			} else if oppPieces >= 2 {
				score = ai.params.blockBonus / 2
			} else {
				score = ai.params.positionAdvance
			}

		case perks.PerkHydra:
			// Triggers when enemy removes our piece here: value based on our investment
			ourPieces := lane.CountPieces(player)
			score = ourPieces * ai.params.positionAdvance
			if ourPieces >= 3 {
				score += ai.params.blockBonus / 2 // Protecting a valuable lane
			}

		case perks.PerkBackfire:
			// Triggers when enemy removes our piece here: punishes removals
			ourPieces := lane.CountPieces(player)
			score = ourPieces * ai.params.positionAdvance
			// More valuable on lanes the opponent is likely to target
			oppPieces := lane.CountPieces(opponent)
			if oppPieces > 0 {
				score += ai.params.positionAdvance * 2 // They're competing on this lane
			}

		case perks.PerkAbsorb:
			// Piece reappears elsewhere when removed: value based on investment
			ourPieces := lane.CountPieces(player)
			score = ourPieces * ai.params.positionAdvance
			if ourPieces >= 3 {
				score += ai.params.blockBonus / 3
			}

		case perks.PerkScatter:
			// Move all our pieces from 1 lane to random lanes
			ourPieces := lane.CountPieces(player)
			if ourPieces <= 1 {
				continue // Not useful with 0-1 pieces
			}
			// Useful to redistribute from a lane we're losing
			oppPieces := lane.CountPieces(opponent)
			if oppPieces >= ourPieces {
				score = ourPieces * ai.params.positionAdvance
			} else {
				score = ai.params.positionAdvance // Less useful if we're winning this lane
			}

		case perks.PerkSignal:
			// Place piece now, pull piece from most populated lane next turn
			score = ai.scoreLaneForPlacement(game, player, laneIdx)
			score += ai.params.positionAdvance // Deferred bonus

		case perks.PerkSanctuary:
			// Removed pieces redirect here for 2 turns
			// More valuable when we have many pieces that could be removed
			totalPieces := ai.countTotalPieces(game, player)
			score = totalPieces * 2
			if !lane.IsSideFull(player) {
				score += ai.params.positionAdvance
			}

		case perks.PerkRetaliate:
			// When enemy places here, spawn raid piece on their side
			oppPieces := lane.CountPieces(opponent)
			score = ai.params.positionAdvance * 2
			if oppPieces > 0 {
				score += ai.params.positionAdvance * 2 // Opponent is active on this lane
			}
			// More valuable on contested lanes
			ourPieces := lane.CountPieces(player)
			if ourPieces > 0 && oppPieces > 0 {
				score += ai.params.positionAdvance
			}

		case perks.PerkCapture:
			// Enemy pieces we remove become ours on this lane
			// More valuable when we're actively removing pieces
			score = ai.params.positionAdvance * 3
			if !lane.IsSideFull(player) {
				score += ai.params.positionAdvance * 2
			}

		case perks.PerkNullify:
			// Cancel all triggers on lane — value based on number of active effects
			triggerCount := len(lane.Triggers)
			deferredCount := len(lane.Deferred)
			effectCount := triggerCount + deferredCount
			if lane.FreezePlayer != 0 && lane.FreezeTurns > 0 {
				effectCount++
			}
			if effectCount == 0 {
				continue // No effects to cancel
			}
			score = effectCount * ai.params.positionAdvance * 2

		case perks.PerkRush:
			// Both get 2 pieces on lane, we lose 1 elsewhere
			// Good for near-win lanes
			ourPieces := lane.CountPieces(player)
			if ourPieces >= 3 {
				score = ai.params.winLaneBonus
			} else {
				score = ourPieces * ai.params.positionAdvance
			}
			// Penalty: we lose a piece elsewhere
			score -= ai.params.positionAdvance

		case perks.PerkEnlist:
			// Place piece, next turn capture enemy piece and move both
			score = ai.scoreLaneForPlacement(game, player, laneIdx)
			score += ai.params.positionAdvance * 2 // Deferred capture bonus

		case perks.PerkAmbush:
			// Place piece, next turn remove enemy from lane or adjacent
			score = ai.scoreLaneForPlacement(game, player, laneIdx)
			// Extra value if nearby lanes have enemy pieces
			for adj := laneIdx - 1; adj <= laneIdx+1; adj++ {
				if adj >= 0 && adj < models.DefaultLaneCount && !game.Lanes[adj].IsWon() {
					if game.Lanes[adj].CountPieces(opponent) > 0 {
						score += ai.params.positionAdvance
					}
				}
			}

		case perks.PerkReinforce:
			// Place piece, next turn get bonus piece on same lane
			score = ai.scoreLaneForPlacement(game, player, laneIdx)
			score += ai.params.positionAdvance * 2 // Double-placement value
		}

		if score > 0 {
			candidates = append(candidates, perkCandidate{
				perkID:  int(perkID),
				targets: []int{laneIdx},
				score:   score,
			})
		}
	}

	return candidates
}

// evaluateEnemyLanePerk scores perks that target an enemy lane
func (ai *LaneAI) evaluateEnemyLanePerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID, helper *perks.TargetingHelper) []perkCandidate {
	targets := helper.GetValidTargetsForPerk(perkID, player)
	if len(targets) == 0 {
		return nil
	}

	var candidates []perkCandidate
	opponent := player.Opponent()

	for _, laneIdx := range targets {
		lane := game.Lanes[laneIdx]
		score := 0

		switch perkID {
		case perks.PerkRemoveEnemy:
			score = ai.scoreLaneForRemoval(game, player, laneIdx)
			score += 5 // Small base bonus

		case perks.PerkPortal:
			// Enemy pieces placed here teleport away: value based on enemy activity
			oppPieces := lane.CountPieces(opponent)
			score = ai.params.positionAdvance * 2
			if oppPieces >= 3 {
				score += ai.params.blockBonus / 2 // They're invested here
			}

		case perks.PerkTrap:
			// Enemy pieces placed here vanish
			oppPieces := lane.CountPieces(opponent)
			score = ai.params.positionAdvance * 3
			if oppPieces >= 2 {
				score += ai.params.blockBonus / 2 // They'll likely place more
			}

		case perks.PerkMirror:
			// Enemy places here, we get 2 pieces on same lane
			score = ai.params.positionAdvance * 3
			// Better on lanes where we also have pieces
			ourPieces := lane.CountPieces(player)
			if ourPieces >= 2 {
				score += ai.params.winLaneBonus / 3
			}

		case perks.PerkEcho:
			// Enemy places here, we get 2 pieces on random lanes
			score = ai.params.positionAdvance * 3

		case perks.PerkShockwave:
			// Enemy places here, they lose 2 pieces from other lanes
			totalOppPieces := ai.countTotalPieces(game, opponent)
			score = ai.params.positionAdvance * 2
			if totalOppPieces > 5 {
				score += ai.params.blockBonus / 2
			}

		case perks.PerkDisperse:
			// Move all enemy pieces from 1 lane to random lanes
			oppPieces := lane.CountPieces(opponent)
			if oppPieces <= 1 {
				continue
			}
			score = oppPieces * ai.params.positionAdvance
			if oppPieces >= 4 {
				score += ai.params.blockBonus // Breaking a concentration
			}

		case perks.PerkRaid:
			// Place piece on enemy's side, roll for recruits next turn
			score = ai.params.positionAdvance * 3
			// Better on lanes where enemy has fewer pieces (easier to establish)
			oppPieces := lane.CountPieces(opponent)
			if oppPieces <= 2 {
				score += ai.params.positionAdvance
			}
		}

		if score > 0 {
			candidates = append(candidates, perkCandidate{
				perkID:  int(perkID),
				targets: []int{laneIdx},
				score:   score,
			})
		}
	}

	return candidates
}

// evaluateYourPiecePerk scores perks that target one of your own pieces (sacrifice)
func (ai *LaneAI) evaluateYourPiecePerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID, helper *perks.TargetingHelper) []perkCandidate {
	targets := helper.GetValidTargetsForPerk(perkID, player)
	if len(targets) == 0 {
		return nil
	}

	var candidates []perkCandidate
	opponent := player.Opponent()

	for _, laneIdx := range targets {
		lane := game.Lanes[laneIdx]
		score := 0

		switch perkID {
		case perks.PerkSplit:
			// Sacrifice 1, gain 2 on random lanes (net +1)
			ourPieces := lane.CountPieces(player)
			score = ai.params.positionAdvance * 2
			// Prefer sacrificing from lanes with many pieces (less loss)
			if ourPieces >= 3 {
				score += ai.params.positionAdvance
			}
			// Less valuable if this is a near-win lane
			if ourPieces >= 4 {
				score -= ai.params.winLaneBonus / 2
			}

		case perks.PerkKamikaze:
			// Sacrifice 1, enemy loses 2 (net: we -1, they -2)
			ourPieces := lane.CountPieces(player)
			oppTotal := ai.countTotalPieces(game, opponent)
			score = ai.params.positionAdvance * 2
			if oppTotal > 5 {
				score += ai.params.blockBonus / 2
			}
			// Prefer sacrificing from lanes with many pieces
			if ourPieces >= 3 {
				score += ai.params.positionAdvance
			}
			// Don't sacrifice from near-win lanes
			if ourPieces >= 4 {
				score -= ai.params.winLaneBonus / 2
			}
		}

		if score > 0 {
			candidates = append(candidates, perkCandidate{
				perkID:  int(perkID),
				targets: []int{laneIdx},
				score:   score,
			})
		}
	}

	return candidates
}

// evaluateTwoYourLanesPerk scores perks that target two of your own lanes (Regroup)
func (ai *LaneAI) evaluateTwoYourLanesPerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID) []perkCandidate {
	lanes := ai.getYourPieceLanes(game, player)
	if len(lanes) < 2 {
		return nil
	}

	var candidates []perkCandidate

	// Evaluate all pairs
	for i := 0; i < len(lanes); i++ {
		for j := i + 1; j < len(lanes); j++ {
			l1, l2 := lanes[i], lanes[j]
			score := 0

			switch perkID {
			case perks.PerkRegroup:
				// Swap pieces between two lanes
				// Valuable when one lane is near-win and the other has pieces it could use
				pieces1 := game.Lanes[l1].CountPieces(player)
				pieces2 := game.Lanes[l2].CountPieces(player)

				// Score the swap: would either lane get closer to winning?
				// If lane1 has 4 pieces after swap (getting pieces2), that's great
				if pieces2 >= 4 && pieces1 < pieces2 {
					score = ai.params.winLaneBonus
				} else if pieces1 >= 4 && pieces2 < pieces1 {
					score = ai.params.winLaneBonus
				} else {
					// General value of redistribution
					diff := pieces1 - pieces2
					if diff < 0 {
						diff = -diff
					}
					score = diff * ai.params.positionAdvance
				}
			}

			if score > 0 {
				candidates = append(candidates, perkCandidate{
					perkID:  int(perkID),
					targets: []int{l1, l2},
					score:   score,
				})
			}
		}
	}

	return candidates
}

// evaluateTwoEnemyLanesPerk scores perks that target two enemy lanes (Disrupt)
func (ai *LaneAI) evaluateTwoEnemyLanesPerk(game *models.LaneGame, player models.PlayerSide, perkID perks.PerkID) []perkCandidate {
	opponent := player.Opponent()
	if game.IsCloaked(opponent) {
		return nil
	}

	lanes := game.GetNonEmptyLanes(opponent)
	if len(lanes) < 2 {
		return nil
	}

	var candidates []perkCandidate

	// Evaluate top pairs (limit combinatorial explosion)
	maxPairs := 10
	pairsEvaluated := 0
	for i := 0; i < len(lanes) && pairsEvaluated < maxPairs; i++ {
		for j := i + 1; j < len(lanes) && pairsEvaluated < maxPairs; j++ {
			l1, l2 := lanes[i], lanes[j]
			score := 0

			switch perkID {
			case perks.PerkDisrupt:
				// Swap enemy pieces between two lanes
				pieces1 := game.Lanes[l1].CountPieces(opponent)
				pieces2 := game.Lanes[l2].CountPieces(opponent)

				// Disruptive value: break opponent concentrations
				if pieces1 >= 4 || pieces2 >= 4 {
					score = ai.params.blockBonus * 2 // Breaking a near-win
				} else {
					diff := pieces1 - pieces2
					if diff < 0 {
						diff = -diff
					}
					score = diff * ai.params.positionAdvance
				}
			}

			if score > 0 {
				candidates = append(candidates, perkCandidate{
					perkID:  int(perkID),
					targets: []int{l1, l2},
					score:   score,
				})
			}
			pairsEvaluated++
		}
	}

	return candidates
}

// ---- Helper functions ----

// countTotalPieces counts all pieces for a player across all non-won lanes
func (ai *LaneAI) countTotalPieces(game *models.LaneGame, side models.PlayerSide) int {
	total := 0
	for i := 0; i < models.DefaultLaneCount; i++ {
		if !game.Lanes[i].IsWon() {
			total += game.Lanes[i].CountPieces(side)
		}
	}
	return total
}

// getYourPieceLanes returns lanes where the player has at least one piece (non-won)
func (ai *LaneAI) getYourPieceLanes(game *models.LaneGame, player models.PlayerSide) []int {
	var lanes []int
	for i := 0; i < models.DefaultLaneCount; i++ {
		if !game.Lanes[i].IsWon() && game.Lanes[i].CountPieces(player) > 0 {
			lanes = append(lanes, i)
		}
	}
	return lanes
}
