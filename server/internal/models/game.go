package models

import (
	"time"

	"github.com/google/uuid"
)

// PieceType represents chess piece types
type PieceType string

const (
	King   PieceType = "king"
	Queen  PieceType = "queen"
	Rook   PieceType = "rook"
	Bishop PieceType = "bishop"
	Knight PieceType = "knight"
	Pawn   PieceType = "pawn"
)

// PlayerColor represents player colors
type PlayerColor string

const (
	White PlayerColor = "white"
	Black PlayerColor = "black"
)

// GameStatus represents the current game status
type GameStatus string

const (
	StatusWaiting   GameStatus = "waiting"
	StatusPlaying   GameStatus = "playing"
	StatusCheckmate GameStatus = "checkmate"
	StatusStalemate GameStatus = "stalemate"
	StatusDraw      GameStatus = "draw"
	StatusResigned  GameStatus = "resigned"
)

// Perk represents special abilities
type Perk string

const (
	PerkAnotherMove   Perk = "anotherMove"
	PerkRemoveEnemy   Perk = "removeEnemy"
	PerkPlaceAnother  Perk = "placeAnother"
	PerkScatterAround Perk = "scatterAround"
	PerkFreeze        Perk = "freeze"
	PerkCancelMove    Perk = "cancelMove"
)

// HeroType represents hero types
type HeroType string

const (
	HeroSloth   HeroType = "sloth"
	HeroPanda   HeroType = "panda"
	HeroUnicorn HeroType = "unicorn"
	HeroSnowman HeroType = "snowman"
	HeroGnom    HeroType = "gnom"
	HeroYeti    HeroType = "yeti"
)

// ChessPiece represents a piece on the board
type ChessPiece struct {
	Type     PieceType   `json:"type"`
	Color    PlayerColor `json:"color"`
	Row      int         `json:"row"`
	Col      int         `json:"col"`
	HasMoved bool        `json:"hasMoved"`
}

// Move represents a chess move
type Move struct {
	FromRow       int    `json:"fromRow"`
	FromCol       int    `json:"fromCol"`
	ToRow         int    `json:"toRow"`
	ToCol         int    `json:"toCol"`
	PerkUsed      Perk   `json:"perkUsed,omitempty"`
	CapturedPiece *ChessPiece `json:"capturedPiece,omitempty"`
}

// Player represents a game player
type Player struct {
	ID             string         `json:"id"`
	ConnectionID   string         `json:"connectionId"`
	HeroType       HeroType       `json:"heroType"`
	Color          PlayerColor    `json:"color"`
	PerksRemaining map[Perk]int   `json:"perksRemaining"`
	IsFrozen       bool           `json:"isFrozen"`
}

// Game represents a chess game
type Game struct {
	ID           string        `json:"id"`
	Player1      *Player       `json:"player1"`
	Player2      *Player       `json:"player2"`
	Pieces       []ChessPiece  `json:"pieces"`
	CurrentTurn  PlayerColor   `json:"currentTurn"`
	Status       GameStatus    `json:"status"`
	MoveHistory  []Move        `json:"moveHistory"`
	IsCheck      bool          `json:"isCheck"`
	Winner       PlayerColor   `json:"winner,omitempty"`
	CreatedAt    time.Time     `json:"createdAt"`
	UpdatedAt    time.Time     `json:"updatedAt"`
	IsAIGame     bool          `json:"isAiGame"`
	AIDifficulty string        `json:"aiDifficulty,omitempty"`
}

// NewGame creates a new game with initial board setup
func NewGame() *Game {
	gameID := uuid.New().String()
	pieces := setupInitialBoard()

	return &Game{
		ID:          gameID,
		Pieces:      pieces,
		CurrentTurn: White,
		Status:      StatusWaiting,
		MoveHistory: make([]Move, 0),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
}

// setupInitialBoard creates the initial chess board configuration
func setupInitialBoard() []ChessPiece {
	pieces := make([]ChessPiece, 0, 32)

	// Setup pawns
	for col := 0; col < 8; col++ {
		pieces = append(pieces, ChessPiece{Type: Pawn, Color: White, Row: 6, Col: col})
		pieces = append(pieces, ChessPiece{Type: Pawn, Color: Black, Row: 1, Col: col})
	}

	// Setup back rows
	backRowPieces := []PieceType{Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook}

	for col, pieceType := range backRowPieces {
		pieces = append(pieces, ChessPiece{Type: pieceType, Color: White, Row: 7, Col: col})
		pieces = append(pieces, ChessPiece{Type: pieceType, Color: Black, Row: 0, Col: col})
	}

	return pieces
}

// GetPieceAt returns the piece at a given position
func (g *Game) GetPieceAt(row, col int) *ChessPiece {
	for i := range g.Pieces {
		if g.Pieces[i].Row == row && g.Pieces[i].Col == col {
			return &g.Pieces[i]
		}
	}
	return nil
}

// GetHeroPerks returns the perks for a hero type
func GetHeroPerks(heroType HeroType) map[Perk]int {
	switch heroType {
	case HeroSloth:
		return map[Perk]int{PerkFreeze: 2, PerkCancelMove: 1}
	case HeroPanda:
		return map[Perk]int{PerkAnotherMove: 2, PerkRemoveEnemy: 1}
	case HeroUnicorn:
		return map[Perk]int{PerkScatterAround: 1, PerkPlaceAnother: 2}
	case HeroSnowman:
		return map[Perk]int{PerkFreeze: 2, PerkAnotherMove: 1}
	case HeroGnom:
		return map[Perk]int{PerkRemoveEnemy: 2, PerkCancelMove: 1}
	case HeroYeti:
		return map[Perk]int{PerkPlaceAnother: 2, PerkScatterAround: 1}
	default:
		return map[Perk]int{}
	}
}
