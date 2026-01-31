package models

import (
	"math/rand"
	"time"

	"github.com/google/uuid"
)

// PlayerSide represents which player (1 or 2)
type PlayerSide int

const (
	Player1 PlayerSide = 1
	Player2 PlayerSide = 2
)

func (p PlayerSide) String() string {
	if p == Player1 {
		return "player1"
	}
	return "player2"
}

func (p PlayerSide) Opponent() PlayerSide {
	if p == Player1 {
		return Player2
	}
	return Player1
}

// LaneTurnPhase represents the current phase within a turn
type LaneTurnPhase string

const (
	PhaseDeferredResolution LaneTurnPhase = "deferredResolution"
	PhaseAutoPlacement      LaneTurnPhase = "autoPlacement"
	PhasePerkSelection      LaneTurnPhase = "perkSelection"
)

// LaneGameStatus represents the game status
type LaneGameStatus string

const (
	LaneStatusSetup    LaneGameStatus = "setup"
	LaneStatusPlaying  LaneGameStatus = "playing"
	LaneStatusFinished LaneGameStatus = "finished"
)

// Default board configuration
const (
	DefaultLaneCount     = 5
	DefaultSlotsPerSide  = 5
	LanesToWin           = 3
)

// Lane represents a single lane on the combat field
type Lane struct {
	// Player1Slots: pieces on Player 1's side (indices 0-4, edge to center)
	// true = piece present, false = empty
	Player1Slots [DefaultSlotsPerSide]bool `json:"player1Slots"`

	// Player2Slots: pieces on Player 2's side (indices 0-4, edge to center)
	Player2Slots [DefaultSlotsPerSide]bool `json:"player2Slots"`

	// Winner of this lane (0 = not won yet, 1 = Player1, 2 = Player2)
	Winner PlayerSide `json:"winner,omitempty"`
}

// NewLane creates an empty lane
func NewLane() *Lane {
	return &Lane{}
}

// CountPieces returns the number of pieces for a player in this lane
func (l *Lane) CountPieces(side PlayerSide) int {
	count := 0
	slots := l.GetSlots(side)
	for _, filled := range slots {
		if filled {
			count++
		}
	}
	return count
}

// GetSlots returns the slots array for a given side
func (l *Lane) GetSlots(side PlayerSide) *[DefaultSlotsPerSide]bool {
	if side == Player1 {
		return &l.Player1Slots
	}
	return &l.Player2Slots
}

// IsSideFull checks if a player's side is completely filled
func (l *Lane) IsSideFull(side PlayerSide) bool {
	slots := l.GetSlots(side)
	for _, filled := range slots {
		if !filled {
			return false
		}
	}
	return true
}

// GetNextEmptySlot returns the next empty slot index (-1 if full)
func (l *Lane) GetNextEmptySlot(side PlayerSide) int {
	slots := l.GetSlots(side)
	for i, filled := range slots {
		if !filled {
			return i
		}
	}
	return -1
}

// IsWon checks if this lane has been won
func (l *Lane) IsWon() bool {
	return l.Winner != 0
}

// LanePlayer represents a player in a lane game
type LanePlayer struct {
	ID           string     `json:"id"`
	ConnectionID string     `json:"connectionId"`
	HeroType     HeroType   `json:"heroType"`
	Side         PlayerSide `json:"side"`
}

// PerkSlot represents a perk option offered to a player
type PerkSlot struct {
	SlotIndex int    `json:"slotIndex"` // 0-3
	PerkID    int    `json:"perkId"`    // Perk ID from rules (1, 2, etc.)
	PerkName  string `json:"perkName"`
}

// LaneGame represents a V2 lane-based game
type LaneGame struct {
	ID string `json:"id"`

	// Players
	Player1 *LanePlayer `json:"player1"`
	Player2 *LanePlayer `json:"player2"`

	// Board state - 5 lanes
	Lanes [DefaultLaneCount]*Lane `json:"lanes"`

	// Turn state
	CurrentPlayer PlayerSide    `json:"currentPlayer"`
	CurrentPhase  LaneTurnPhase `json:"currentPhase"`
	TurnNumber    int           `json:"turnNumber"`

	// Win tracking
	Player1LanesWon int `json:"player1LanesWon"`
	Player2LanesWon int `json:"player2LanesWon"`

	// Game status
	Status LaneGameStatus `json:"status"`
	Winner PlayerSide     `json:"winner,omitempty"`

	// Last auto-placed lane (for UI feedback)
	LastAutoPlacedLane int `json:"lastAutoPlacedLane"`

	// Current perk slots offered to player (during perk selection phase)
	CurrentPerkSlots []PerkSlot `json:"currentPerkSlots,omitempty"`

	// Timestamps
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	// AI settings
	IsAIGame     bool   `json:"isAiGame"`
	AIDifficulty string `json:"aiDifficulty,omitempty"`
}

// NewLaneGame creates a new V2 lane game
func NewLaneGame() *LaneGame {
	game := &LaneGame{
		ID:            uuid.New().String(),
		CurrentPlayer: Player1,
		CurrentPhase:  PhaseAutoPlacement, // Skip deferred in Phase 1
		TurnNumber:    1,
		Status:        LaneStatusSetup,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	// Initialize empty lanes
	for i := 0; i < DefaultLaneCount; i++ {
		game.Lanes[i] = NewLane()
	}

	return game
}

// GetPlayer returns the player for a given side
func (g *LaneGame) GetPlayer(side PlayerSide) *LanePlayer {
	if side == Player1 {
		return g.Player1
	}
	return g.Player2
}

// GetPlayerByConnectionID returns the player matching a connection ID
func (g *LaneGame) GetPlayerByConnectionID(connID string) *LanePlayer {
	if g.Player1 != nil && g.Player1.ConnectionID == connID {
		return g.Player1
	}
	if g.Player2 != nil && g.Player2.ConnectionID == connID {
		return g.Player2
	}
	return nil
}

// GetLanesWon returns how many lanes a player has won
func (g *LaneGame) GetLanesWon(side PlayerSide) int {
	if side == Player1 {
		return g.Player1LanesWon
	}
	return g.Player2LanesWon
}

// GetAvailableLanes returns indices of lanes that are not won and have empty slots for the given side
func (g *LaneGame) GetAvailableLanes(side PlayerSide) []int {
	available := make([]int, 0, DefaultLaneCount)
	for i, lane := range g.Lanes {
		if !lane.IsWon() && !lane.IsSideFull(side) {
			available = append(available, i)
		}
	}
	return available
}

// GetNonEmptyLanes returns indices of lanes where the player has at least one piece
func (g *LaneGame) GetNonEmptyLanes(side PlayerSide) []int {
	nonEmpty := make([]int, 0, DefaultLaneCount)
	for i, lane := range g.Lanes {
		if !lane.IsWon() && lane.CountPieces(side) > 0 {
			nonEmpty = append(nonEmpty, i)
		}
	}
	return nonEmpty
}

// PlacePiece places a piece in the next available slot of a lane
// Returns true if placement was successful, false if lane is full or won
func (g *LaneGame) PlacePiece(laneIndex int, side PlayerSide) bool {
	if laneIndex < 0 || laneIndex >= DefaultLaneCount {
		return false
	}

	lane := g.Lanes[laneIndex]
	if lane.IsWon() {
		return false
	}

	slotIndex := lane.GetNextEmptySlot(side)
	if slotIndex == -1 {
		return false // Lane is full
	}

	// Place the piece
	slots := lane.GetSlots(side)
	slots[slotIndex] = true

	g.UpdatedAt = time.Now()
	return true
}

// RemovePiece removes the frontmost piece from a lane
// Returns true if removal was successful
func (g *LaneGame) RemovePiece(laneIndex int, side PlayerSide) bool {
	if laneIndex < 0 || laneIndex >= DefaultLaneCount {
		return false
	}

	lane := g.Lanes[laneIndex]
	if lane.IsWon() {
		return false
	}

	// Find the frontmost piece (highest index that is filled)
	slots := lane.GetSlots(side)
	for i := DefaultSlotsPerSide - 1; i >= 0; i-- {
		if slots[i] {
			slots[i] = false
			g.UpdatedAt = time.Now()
			return true
		}
	}

	return false // No pieces to remove
}

// CheckLaneWin checks if a lane has been won and updates state
// Returns the winner side if won, 0 otherwise
func (g *LaneGame) CheckLaneWin(laneIndex int) PlayerSide {
	if laneIndex < 0 || laneIndex >= DefaultLaneCount {
		return 0
	}

	lane := g.Lanes[laneIndex]
	if lane.IsWon() {
		return lane.Winner // Already won
	}

	// Check if either side has filled their slots
	if lane.IsSideFull(Player1) {
		lane.Winner = Player1
		g.Player1LanesWon++
		g.UpdatedAt = time.Now()
		return Player1
	}

	if lane.IsSideFull(Player2) {
		lane.Winner = Player2
		g.Player2LanesWon++
		g.UpdatedAt = time.Now()
		return Player2
	}

	return 0
}

// CheckGameWin checks if the game has been won
// Returns the winner side if won, 0 otherwise
func (g *LaneGame) CheckGameWin() PlayerSide {
	if g.Player1LanesWon >= LanesToWin {
		g.Winner = Player1
		g.Status = LaneStatusFinished
		g.UpdatedAt = time.Now()
		return Player1
	}

	if g.Player2LanesWon >= LanesToWin {
		g.Winner = Player2
		g.Status = LaneStatusFinished
		g.UpdatedAt = time.Now()
		return Player2
	}

	return 0
}

// AutoPlace places a piece on a random available lane
// Returns the lane index where piece was placed, or -1 if no lanes available
func (g *LaneGame) AutoPlace(side PlayerSide) int {
	available := g.GetAvailableLanes(side)
	if len(available) == 0 {
		return -1
	}

	// Pick a random available lane
	laneIndex := available[rand.Intn(len(available))]

	if g.PlacePiece(laneIndex, side) {
		g.LastAutoPlacedLane = laneIndex
		return laneIndex
	}

	return -1
}

// SwitchTurn switches to the opponent's turn
func (g *LaneGame) SwitchTurn() {
	g.CurrentPlayer = g.CurrentPlayer.Opponent()
	g.CurrentPhase = PhaseAutoPlacement // Skip deferred for now
	g.TurnNumber++
	g.UpdatedAt = time.Now()
}

// AdvancePhase moves to the next phase in the turn
func (g *LaneGame) AdvancePhase() {
	switch g.CurrentPhase {
	case PhaseDeferredResolution:
		g.CurrentPhase = PhaseAutoPlacement
	case PhaseAutoPlacement:
		g.CurrentPhase = PhasePerkSelection
	case PhasePerkSelection:
		// Turn ends, switch to opponent
		g.SwitchTurn()
	}
	g.UpdatedAt = time.Now()
}

// GeneratePerkSlots generates the 4 perk options for the current player
// For Phase 1, we only offer PlaceAnother and RemoveEnemy (slots 1-2)
func (g *LaneGame) GeneratePerkSlots() {
	g.CurrentPerkSlots = []PerkSlot{
		{SlotIndex: 0, PerkID: 1, PerkName: "PlaceAnother"},
		{SlotIndex: 1, PerkID: 2, PerkName: "RemoveEnemy"},
		// Slots 2-3 will be random perks in later phases
		{SlotIndex: 2, PerkID: 0, PerkName: "Pass"}, // Placeholder
		{SlotIndex: 3, PerkID: 0, PerkName: "Pass"}, // Placeholder
	}
}

// Clone creates a deep copy of the game state
func (g *LaneGame) Clone() *LaneGame {
	clone := &LaneGame{
		ID:                 g.ID,
		CurrentPlayer:      g.CurrentPlayer,
		CurrentPhase:       g.CurrentPhase,
		TurnNumber:         g.TurnNumber,
		Player1LanesWon:    g.Player1LanesWon,
		Player2LanesWon:    g.Player2LanesWon,
		Status:             g.Status,
		Winner:             g.Winner,
		LastAutoPlacedLane: g.LastAutoPlacedLane,
		CreatedAt:          g.CreatedAt,
		UpdatedAt:          g.UpdatedAt,
		IsAIGame:           g.IsAIGame,
		AIDifficulty:       g.AIDifficulty,
	}

	// Clone players
	if g.Player1 != nil {
		p1 := *g.Player1
		clone.Player1 = &p1
	}
	if g.Player2 != nil {
		p2 := *g.Player2
		clone.Player2 = &p2
	}

	// Clone lanes
	for i, lane := range g.Lanes {
		if lane != nil {
			clonedLane := *lane
			clone.Lanes[i] = &clonedLane
		}
	}

	// Clone perk slots
	if g.CurrentPerkSlots != nil {
		clone.CurrentPerkSlots = make([]PerkSlot, len(g.CurrentPerkSlots))
		copy(clone.CurrentPerkSlots, g.CurrentPerkSlots)
	}

	return clone
}
