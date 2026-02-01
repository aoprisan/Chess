package main

import (
	"fmt"
	"time"

	"github.com/kiddiechess/server/internal/game"
	"github.com/kiddiechess/server/internal/models"
)

func main() {
	fmt.Println("╔════════════════════════════════════════════════════════════╗")
	fmt.Println("║           KIDDIE CHESS GAME SIMULATION                     ║")
	fmt.Println("╚════════════════════════════════════════════════════════════╝")
	fmt.Println()

	// Run simulations for different AI matchups
	runMatchup("Easy vs Easy", "easy", "easy", 50)
	runMatchup("Medium vs Medium", "medium", "medium", 50)
	runMatchup("Hard vs Hard", "hard", "hard", 50)
	runMatchup("Easy vs Hard", "easy", "hard", 50)
	runMatchup("Medium vs Hard", "medium", "hard", 50)
}

func runMatchup(name, ai1Difficulty, ai2Difficulty string, numGames int) {
	fmt.Printf("┌────────────────────────────────────────────────────────────┐\n")
	fmt.Printf("│ %s (%d games)\n", name, numGames)
	fmt.Printf("└────────────────────────────────────────────────────────────┘\n")

	start := time.Now()

	var p1Wins, p2Wins, draws int
	var totalTurns int
	var minTurns, maxTurns int = 9999, 0
	perkUsage := make(map[int]int)

	for seed := int64(0); seed < int64(numGames); seed++ {
		g := models.NewLaneGame()
		g.SetSeed(seed)
		g.Status = models.LaneStatusPlaying
		g.CurrentPhase = models.PhaseRaidResolution

		ai1 := game.NewLaneAI(ai1Difficulty)
		ai2 := game.NewLaneAI(ai2Difficulty)
		engine := game.NewLaneEngine(g)

		turns := 0
		maxTurnsLimit := 200
		var winner models.PlayerSide

		for turns = 0; turns < maxTurnsLimit && g.Status != models.LaneStatusFinished; turns++ {
			var ai *game.LaneAI
			if g.CurrentPlayer == models.Player1 {
				ai = ai1
			} else {
				ai = ai2
			}

			perkID, _ := ai.ChoosePerk(g)
			perkUsage[perkID]++

			results := engine.ExecuteAITurn(ai)
			for _, r := range results {
				if r.GameWinner != 0 {
					winner = r.GameWinner
					break
				}
			}
			if winner != 0 {
				break
			}
		}

		if winner == models.Player1 {
			p1Wins++
		} else if winner == models.Player2 {
			p2Wins++
		} else {
			draws++
		}

		totalTurns += turns
		if turns < minTurns {
			minTurns = turns
		}
		if turns > maxTurns {
			maxTurns = turns
		}
	}

	elapsed := time.Since(start)
	avgTurns := float64(totalTurns) / float64(numGames)

	fmt.Printf("  Results:\n")
	fmt.Printf("    Player 1 (%s) wins: %d (%.1f%%)\n", ai1Difficulty, p1Wins, float64(p1Wins)*100/float64(numGames))
	fmt.Printf("    Player 2 (%s) wins: %d (%.1f%%)\n", ai2Difficulty, p2Wins, float64(p2Wins)*100/float64(numGames))
	if draws > 0 {
		fmt.Printf("    Draws/Incomplete: %d (%.1f%%)\n", draws, float64(draws)*100/float64(numGames))
	}
	fmt.Printf("\n  Turn Statistics:\n")
	fmt.Printf("    Average turns: %.1f\n", avgTurns)
	fmt.Printf("    Min turns: %d\n", minTurns)
	fmt.Printf("    Max turns: %d\n", maxTurns)
	fmt.Printf("\n  Perk Usage:\n")
	fmt.Printf("    Pass (0): %d (%.1f%%)\n", perkUsage[0], float64(perkUsage[0])*100/float64(totalTurns))
	fmt.Printf("    PlaceAnother (1): %d (%.1f%%)\n", perkUsage[1], float64(perkUsage[1])*100/float64(totalTurns))
	fmt.Printf("    RemoveEnemy (2): %d (%.1f%%)\n", perkUsage[2], float64(perkUsage[2])*100/float64(totalTurns))
	fmt.Printf("\n  Elapsed time: %v\n", elapsed)
	fmt.Println()
}
