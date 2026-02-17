package game

import "math"

// CalculateELO computes new ELO ratings using K=32.
// score: 1.0 = player1 wins, 0.0 = player2 wins, 0.5 = draw.
// Returns (newRating1, newRating2). Ratings have a floor of 100.
func CalculateELO(rating1, rating2 int, score float64) (int, int) {
	const K = 32
	const floor = 100

	e1 := 1.0 / (1.0 + math.Pow(10, float64(rating2-rating1)/400.0))
	e2 := 1.0 - e1

	new1 := float64(rating1) + K*(score-e1)
	new2 := float64(rating2) + K*((1.0-score)-e2)

	r1 := int(math.Round(new1))
	r2 := int(math.Round(new2))

	if r1 < floor {
		r1 = floor
	}
	if r2 < floor {
		r2 = floor
	}

	return r1, r2
}
