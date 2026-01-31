package game

import (
	"math/rand"
	"time"

	"github.com/kiddiechess/server/internal/models"
)

// AIEngine handles AI move generation
type AIEngine struct {
	difficulty string
}

// NewAIEngine creates a new AI engine
func NewAIEngine(difficulty string) *AIEngine {
	return &AIEngine{
		difficulty: difficulty,
	}
}

// GetMove generates an AI move for the given game state
func (e *AIEngine) GetMove(game *models.Game) *models.Move {
	// Get all valid moves for AI (black pieces)
	validMoves := e.getAllValidMoves(game, models.Black)

	if len(validMoves) == 0 {
		return nil
	}

	switch e.difficulty {
	case "easy":
		return e.getRandomMove(validMoves)
	case "medium":
		return e.getMediumMove(game, validMoves)
	case "hard":
		return e.getHardMove(game, validMoves)
	default:
		return e.getRandomMove(validMoves)
	}
}

// getRandomMove returns a random valid move
func (e *AIEngine) getRandomMove(moves []*models.Move) *models.Move {
	rand.Seed(time.Now().UnixNano())
	return moves[rand.Intn(len(moves))]
}

// getMediumMove prefers captures and central control
func (e *AIEngine) getMediumMove(game *models.Game, moves []*models.Move) *models.Move {
	// Prefer captures
	for _, move := range moves {
		if game.GetPieceAt(move.ToRow, move.ToCol) != nil {
			return move
		}
	}

	// Prefer center control
	centerMoves := make([]*models.Move, 0)
	for _, move := range moves {
		if move.ToRow >= 2 && move.ToRow <= 5 && move.ToCol >= 2 && move.ToCol <= 5 {
			centerMoves = append(centerMoves, move)
		}
	}

	if len(centerMoves) > 0 {
		return e.getRandomMove(centerMoves)
	}

	return e.getRandomMove(moves)
}

// getHardMove uses basic evaluation (could be enhanced with minimax)
func (e *AIEngine) getHardMove(game *models.Game, moves []*models.Move) *models.Move {
	bestMove := moves[0]
	bestScore := -10000

	for _, move := range moves {
		score := e.evaluateMove(game, move)
		if score > bestScore {
			bestScore = score
			bestMove = move
		}
	}

	return bestMove
}

// evaluateMove gives a score to a move
func (e *AIEngine) evaluateMove(game *models.Game, move *models.Move) int {
	score := 0

	// Capture value
	target := game.GetPieceAt(move.ToRow, move.ToCol)
	if target != nil {
		score += getPieceValue(target.Type)
	}

	// Center control bonus
	if move.ToRow >= 2 && move.ToRow <= 5 && move.ToCol >= 2 && move.ToCol <= 5 {
		score += 10
	}

	// Piece development (moving from back row)
	piece := game.GetPieceAt(move.FromRow, move.FromCol)
	if piece != nil && move.FromRow == 0 && piece.Type != models.Pawn {
		score += 5
	}

	return score
}

// getPieceValue returns the material value of a piece
func getPieceValue(pieceType models.PieceType) int {
	switch pieceType {
	case models.Pawn:
		return 100
	case models.Knight:
		return 320
	case models.Bishop:
		return 330
	case models.Rook:
		return 500
	case models.Queen:
		return 900
	case models.King:
		return 20000
	default:
		return 0
	}
}

// getAllValidMoves returns all valid moves for a color
func (e *AIEngine) getAllValidMoves(game *models.Game, color models.PlayerColor) []*models.Move {
	moves := make([]*models.Move, 0)

	for _, piece := range game.Pieces {
		if piece.Color != color {
			continue
		}

		pieceMoves := e.getValidMovesForPiece(game, &piece)
		moves = append(moves, pieceMoves...)
	}

	return moves
}

// getValidMovesForPiece returns valid moves for a specific piece
func (e *AIEngine) getValidMovesForPiece(game *models.Game, piece *models.ChessPiece) []*models.Move {
	moves := make([]*models.Move, 0)

	switch piece.Type {
	case models.Pawn:
		moves = e.getPawnMoves(game, piece)
	case models.Rook:
		moves = e.getLinearMoves(game, piece, true, true, false)
	case models.Knight:
		moves = e.getKnightMoves(game, piece)
	case models.Bishop:
		moves = e.getLinearMoves(game, piece, false, false, true)
	case models.Queen:
		moves = e.getLinearMoves(game, piece, true, true, true)
	case models.King:
		moves = e.getKingMoves(game, piece)
	}

	return moves
}

// getPawnMoves returns valid pawn moves
func (e *AIEngine) getPawnMoves(game *models.Game, pawn *models.ChessPiece) []*models.Move {
	moves := make([]*models.Move, 0)
	direction := 1
	startRow := 1
	if pawn.Color == models.White {
		direction = -1
		startRow = 6
	}

	// Forward move
	newRow := pawn.Row + direction
	if e.isValidSquare(newRow, pawn.Col) && game.GetPieceAt(newRow, pawn.Col) == nil {
		moves = append(moves, &models.Move{
			FromRow: pawn.Row, FromCol: pawn.Col,
			ToRow: newRow, ToCol: pawn.Col,
		})

		// Double move from start
		if pawn.Row == startRow {
			doubleRow := pawn.Row + (direction * 2)
			if game.GetPieceAt(doubleRow, pawn.Col) == nil {
				moves = append(moves, &models.Move{
					FromRow: pawn.Row, FromCol: pawn.Col,
					ToRow: doubleRow, ToCol: pawn.Col,
				})
			}
		}
	}

	// Captures
	for _, colOffset := range []int{-1, 1} {
		captureCol := pawn.Col + colOffset
		if e.isValidSquare(newRow, captureCol) {
			target := game.GetPieceAt(newRow, captureCol)
			if target != nil && target.Color != pawn.Color {
				moves = append(moves, &models.Move{
					FromRow: pawn.Row, FromCol: pawn.Col,
					ToRow: newRow, ToCol: captureCol,
				})
			}
		}
	}

	return moves
}

// getLinearMoves returns moves for rook/bishop/queen
func (e *AIEngine) getLinearMoves(game *models.Game, piece *models.ChessPiece, horizontal, vertical, diagonal bool) []*models.Move {
	moves := make([]*models.Move, 0)
	directions := make([][2]int, 0)

	if horizontal {
		directions = append(directions, [2]int{0, 1}, [2]int{0, -1})
	}
	if vertical {
		directions = append(directions, [2]int{1, 0}, [2]int{-1, 0})
	}
	if diagonal {
		directions = append(directions, [2]int{1, 1}, [2]int{1, -1}, [2]int{-1, 1}, [2]int{-1, -1})
	}

	for _, dir := range directions {
		row := piece.Row + dir[0]
		col := piece.Col + dir[1]

		for e.isValidSquare(row, col) {
			target := game.GetPieceAt(row, col)
			if target == nil {
				moves = append(moves, &models.Move{
					FromRow: piece.Row, FromCol: piece.Col,
					ToRow: row, ToCol: col,
				})
			} else {
				if target.Color != piece.Color {
					moves = append(moves, &models.Move{
						FromRow: piece.Row, FromCol: piece.Col,
						ToRow: row, ToCol: col,
					})
				}
				break
			}
			row += dir[0]
			col += dir[1]
		}
	}

	return moves
}

// getKnightMoves returns valid knight moves
func (e *AIEngine) getKnightMoves(game *models.Game, knight *models.ChessPiece) []*models.Move {
	moves := make([]*models.Move, 0)
	offsets := [][2]int{
		{-2, -1}, {-2, 1}, {-1, -2}, {-1, 2},
		{1, -2}, {1, 2}, {2, -1}, {2, 1},
	}

	for _, offset := range offsets {
		row := knight.Row + offset[0]
		col := knight.Col + offset[1]

		if e.isValidSquare(row, col) {
			target := game.GetPieceAt(row, col)
			if target == nil || target.Color != knight.Color {
				moves = append(moves, &models.Move{
					FromRow: knight.Row, FromCol: knight.Col,
					ToRow: row, ToCol: col,
				})
			}
		}
	}

	return moves
}

// getKingMoves returns valid king moves
func (e *AIEngine) getKingMoves(game *models.Game, king *models.ChessPiece) []*models.Move {
	moves := make([]*models.Move, 0)

	for dr := -1; dr <= 1; dr++ {
		for dc := -1; dc <= 1; dc++ {
			if dr == 0 && dc == 0 {
				continue
			}

			row := king.Row + dr
			col := king.Col + dc

			if e.isValidSquare(row, col) {
				target := game.GetPieceAt(row, col)
				if target == nil || target.Color != king.Color {
					moves = append(moves, &models.Move{
						FromRow: king.Row, FromCol: king.Col,
						ToRow: row, ToCol: col,
					})
				}
			}
		}
	}

	return moves
}

// isValidSquare checks if a square is on the board
func (e *AIEngine) isValidSquare(row, col int) bool {
	return row >= 0 && row < 8 && col >= 0 && col < 8
}
