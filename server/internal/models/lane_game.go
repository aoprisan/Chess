package models

import (
	"math/rand"
	"time"

	"github.com/google/uuid"
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
	PhaseRaidResolution     LaneTurnPhase = "raidResolution"
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
	DefaultLaneCount    = 5
	DefaultSlotsPerSide = 5
	LanesToWin          = 3
)

// Game config constants (from Python sim)
const (
	FreezeDuration            = 1
	CloakDuration             = 2
	BlindDuration             = 2
	SanctuaryDuration         = 2
	CaptureDuration           = 2
	TriggerDuration           = 2
	MirrorDuration            = 1
	EchoDuration              = 1
	ShockwaveDuration         = 1
	RetaliateDuration         = 1
	HydraDuration             = 1
	BackfireDuration          = 1
	AbsorbDuration            = 1
	MirrorPieces              = 2
	EchoPieces                = 2
	ShockwaveRemoves          = 2
	HydraPieces               = 2
	BackfireRemoves           = 2
	SplitGain                 = 2
	KamikazeRemoves           = 2
	GambitEnemyGain           = 3
	GambitPlayerGain          = 2
	RushPiecesEach            = 2
	RushPlayerLoss            = 1
	SourceExclusionThreshold  = 3
	MaxTriggerChainDepth      = 10
)

// TriggerType represents types of triggers
type TriggerType string

const (
	TriggerPortal    TriggerType = "portal"
	TriggerTrap      TriggerType = "trap"
	TriggerMirror    TriggerType = "mirror"
	TriggerEcho      TriggerType = "echo"
	TriggerShockwave TriggerType = "shockwave"
	TriggerRetaliate TriggerType = "retaliate"
	TriggerHydra     TriggerType = "hydra"
	TriggerBackfire  TriggerType = "backfire"
	TriggerAbsorb    TriggerType = "absorb"
)

// DeferredType represents types of deferred effects
type DeferredType string

const (
	DeferredSignal    DeferredType = "signal"
	DeferredEnlist    DeferredType = "enlist"
	DeferredAmbush    DeferredType = "ambush"
	DeferredReinforce DeferredType = "reinforce"
)

// Trigger represents a trigger set on a lane
type Trigger struct {
	Type        TriggerType `json:"type"`
	Owner       PlayerSide  `json:"owner"`
	TurnsLeft   int         `json:"turnsLeft"`
	OrderID     int         `json:"orderId"` // FIFO ordering
}

// DeferredEffect represents a deferred effect on a lane
type DeferredEffect struct {
	Type       DeferredType `json:"type"`
	Owner      PlayerSide   `json:"owner"`
	TargetLane int          `json:"targetLane"`
}

// PendingRaid represents a raid in progress
type PendingRaid struct {
	Owner              PlayerSide `json:"owner"`
	Lane               int        `json:"lane"`
	TurnsUntilResolve  int        `json:"turnsUntilResolve"`
	Source             string     `json:"source"` // "RAID" or "RETALIATE"
}

// SanctuaryMarker represents an active sanctuary
type SanctuaryMarker struct {
	Lane      int `json:"lane"`
	TurnsLeft int `json:"turnsLeft"`
}

// CaptureMarker represents an active capture zone
type CaptureMarker struct {
	Lane      int `json:"lane"`
	TurnsLeft int `json:"turnsLeft"`
}

// RemovalResult captures what happened during a piece removal
type RemovalResult struct {
	Removed             bool   `json:"removed"`
	Redirected          bool   `json:"redirected"`
	RedirectType        string `json:"redirectType,omitempty"`        // "sanctuary" or "capture"
	Destination         int    `json:"destination,omitempty"`
	Converted           bool   `json:"converted,omitempty"`           // true if piece was converted (Capture)
}

// Lane represents a single lane on the combat field
type Lane struct {
	// Player1Slots: pieces on Player 1's side (indices 0-4, edge to center)
	// true = piece present, false = empty
	Player1Slots [DefaultSlotsPerSide]bool `json:"player1Slots"`

	// Player2Slots: pieces on Player 2's side (indices 0-4, edge to center)
	Player2Slots [DefaultSlotsPerSide]bool `json:"player2Slots"`

	// Winner of this lane (0 = not won yet, 1 = Player1, 2 = Player2)
	Winner PlayerSide `json:"winner,omitempty"`

	// Freeze effect
	FreezePlayer PlayerSide `json:"freezePlayer,omitempty"` // Which player is frozen from this lane
	FreezeTurns  int        `json:"freezeTurns,omitempty"`  // Turns remaining

	// Triggers set on this lane (FIFO list)
	Triggers []Trigger `json:"triggers,omitempty"`

	// Deferred effects pending on this lane
	Deferred []DeferredEffect `json:"deferred,omitempty"`
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

// IsFrozenFor checks if the lane is frozen for a player
func (l *Lane) IsFrozenFor(side PlayerSide) bool {
	return l.FreezePlayer == side && l.FreezeTurns > 0
}

// SetFreeze freezes the lane for a player
func (l *Lane) SetFreeze(side PlayerSide, turns int) {
	l.FreezePlayer = side
	l.FreezeTurns = turns
}

// DecrementFreeze decrements freeze counter
func (l *Lane) DecrementFreeze() {
	if l.FreezeTurns > 0 {
		l.FreezeTurns--
		if l.FreezeTurns == 0 {
			l.FreezePlayer = 0
		}
	}
}

// AddTrigger adds a trigger to this lane
func (l *Lane) AddTrigger(t Trigger) {
	l.Triggers = append(l.Triggers, t)
}

// HasTriggerType checks if any trigger of given type exists
func (l *Lane) HasTriggerType(ttype TriggerType) bool {
	for _, t := range l.Triggers {
		if t.Type == ttype {
			return true
		}
	}
	return false
}

// GetPlacementTriggers returns placement triggers in FIFO order for opponent of placing player
func (l *Lane) GetPlacementTriggers(forOpponentOf PlayerSide) []Trigger {
	placementTypes := map[TriggerType]bool{
		TriggerPortal:    true,
		TriggerTrap:      true,
		TriggerMirror:    true,
		TriggerEcho:      true,
		TriggerShockwave: true,
		TriggerRetaliate: true,
	}

	var result []Trigger
	for _, t := range l.Triggers {
		if placementTypes[t.Type] && t.Owner != forOpponentOf {
			result = append(result, t)
		}
	}
	return result
}

// GetRemovalTriggers returns removal triggers in FIFO order for opponent of removing player
func (l *Lane) GetRemovalTriggers(forOpponentOf PlayerSide) []Trigger {
	removalTypes := map[TriggerType]bool{
		TriggerHydra:    true,
		TriggerBackfire: true,
		TriggerAbsorb:   true,
	}

	var result []Trigger
	for _, t := range l.Triggers {
		if removalTypes[t.Type] && t.Owner != forOpponentOf {
			result = append(result, t)
		}
	}
	return result
}

// RemoveTriggerByOrderID removes a trigger by its order ID
func (l *Lane) RemoveTriggerByOrderID(orderID int) bool {
	for i, t := range l.Triggers {
		if t.OrderID == orderID {
			l.Triggers = append(l.Triggers[:i], l.Triggers[i+1:]...)
			return true
		}
	}
	return false
}

// DecrementTriggers decrements trigger timers and removes expired ones
func (l *Lane) DecrementTriggers() {
	var remaining []Trigger
	for _, t := range l.Triggers {
		t.TurnsLeft--
		if t.TurnsLeft > 0 {
			remaining = append(remaining, t)
		}
	}
	l.Triggers = remaining
}

// ClearTriggers removes all triggers from this lane
func (l *Lane) ClearTriggers() {
	l.Triggers = nil
}

// AddDeferred adds a deferred effect to this lane
func (l *Lane) AddDeferred(d DeferredEffect) {
	l.Deferred = append(l.Deferred, d)
}

// PopDeferredFor gets and removes all deferred effects for a player
func (l *Lane) PopDeferredFor(player PlayerSide) []DeferredEffect {
	var owned []DeferredEffect
	var remaining []DeferredEffect
	for _, d := range l.Deferred {
		if d.Owner == player {
			owned = append(owned, d)
		} else {
			remaining = append(remaining, d)
		}
	}
	l.Deferred = remaining
	return owned
}

// ClearDeferred removes all deferred effects from this lane
func (l *Lane) ClearDeferred() {
	l.Deferred = nil
}

// ClearAllEffects clears all triggers, deferred, and freeze (for lane win cleanup)
func (l *Lane) ClearAllEffects() {
	l.Triggers = nil
	l.Deferred = nil
	l.FreezePlayer = 0
	l.FreezeTurns = 0
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
	Username     string     `json:"username,omitempty"`
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

	// Global duration effects
	Player1Cloaked int `json:"player1Cloaked,omitempty"` // Turns remaining for P1's field being hidden
	Player2Cloaked int `json:"player2Cloaked,omitempty"` // Turns remaining for P2's field being hidden
	Player1Blinded int `json:"player1Blinded,omitempty"` // Turns remaining for P1 being blind
	Player2Blinded int `json:"player2Blinded,omitempty"` // Turns remaining for P2 being blind

	// Sanctuary: All YOUR lost pieces redirect here - supports multiple markers
	Player1Sanctuaries []SanctuaryMarker `json:"player1Sanctuaries,omitempty"`
	Player2Sanctuaries []SanctuaryMarker `json:"player2Sanctuaries,omitempty"`

	// Capture: All ENEMY pieces you remove redirect here - supports multiple markers
	Player1Captures []CaptureMarker `json:"player1Captures,omitempty"`
	Player2Captures []CaptureMarker `json:"player2Captures,omitempty"`

	// Pending raids - list of raids in progress
	PendingRaids []PendingRaid `json:"pendingRaids,omitempty"`

	// Global trigger order counter for FIFO ordering
	TriggerOrderCounter int `json:"triggerOrderCounter,omitempty"`

	// Timestamps
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	// AI settings
	IsAIGame     bool   `json:"isAiGame"`
	AIDifficulty string `json:"aiDifficulty,omitempty"`

	// Disconnect tracking (for multiplayer reconnection)
	DisconnectedPlayerID string    `json:"disconnectedPlayerId,omitempty"`
	DisconnectTime       time.Time `json:"disconnectTime,omitempty"`

	// RNG for deterministic games
	rng *rand.Rand
}

// NewLaneGame creates a new V2 lane game
func NewLaneGame() *LaneGame {
	game := &LaneGame{
		ID:            uuid.New().String(),
		CurrentPlayer: Player1,
		CurrentPhase:  PhaseRaidResolution, // Full turn cycle
		TurnNumber:    1,
		Status:        LaneStatusSetup,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
		rng:           rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	// Initialize empty lanes
	for i := 0; i < DefaultLaneCount; i++ {
		game.Lanes[i] = NewLane()
	}

	return game
}

// SetSeed sets the RNG seed for deterministic games
func (g *LaneGame) SetSeed(seed int64) {
	g.rng = rand.New(rand.NewSource(seed))
}

// Rand returns the game's RNG
func (g *LaneGame) Rand() *rand.Rand {
	if g.rng == nil {
		g.rng = rand.New(rand.NewSource(time.Now().UnixNano()))
	}
	return g.rng
}

// GetNextTriggerOrder returns the next trigger order ID
func (g *LaneGame) GetNextTriggerOrder() int {
	order := g.TriggerOrderCounter
	g.TriggerOrderCounter++
	return order
}

// IsCloaked checks if a player's field is cloaked
func (g *LaneGame) IsCloaked(side PlayerSide) bool {
	if side == Player1 {
		return g.Player1Cloaked > 0
	}
	return g.Player2Cloaked > 0
}

// IsBlinded checks if a player is blinded
func (g *LaneGame) IsBlinded(side PlayerSide) bool {
	if side == Player1 {
		return g.Player1Blinded > 0
	}
	return g.Player2Blinded > 0
}

// SetCloaked sets the cloak duration for a player
func (g *LaneGame) SetCloaked(side PlayerSide, turns int) {
	if side == Player1 {
		g.Player1Cloaked = turns
	} else {
		g.Player2Cloaked = turns
	}
}

// SetBlinded sets the blind duration for a player
func (g *LaneGame) SetBlinded(side PlayerSide, turns int) {
	if side == Player1 {
		g.Player1Blinded = turns
	} else {
		g.Player2Blinded = turns
	}
}

// AddSanctuary adds a sanctuary marker for a player
func (g *LaneGame) AddSanctuary(side PlayerSide, lane int, turns int) {
	marker := SanctuaryMarker{Lane: lane, TurnsLeft: turns}
	if side == Player1 {
		g.Player1Sanctuaries = append(g.Player1Sanctuaries, marker)
	} else {
		g.Player2Sanctuaries = append(g.Player2Sanctuaries, marker)
	}
}

// AddCapture adds a capture marker for a player
func (g *LaneGame) AddCapture(side PlayerSide, lane int, turns int) {
	marker := CaptureMarker{Lane: lane, TurnsLeft: turns}
	if side == Player1 {
		g.Player1Captures = append(g.Player1Captures, marker)
	} else {
		g.Player2Captures = append(g.Player2Captures, marker)
	}
}

// GetSanctuaryLane returns a valid sanctuary lane for a player (random if multiple)
func (g *LaneGame) GetSanctuaryLane(side PlayerSide) int {
	var sanctuaries []SanctuaryMarker
	if side == Player1 {
		sanctuaries = g.Player1Sanctuaries
	} else {
		sanctuaries = g.Player2Sanctuaries
	}

	// Filter to valid sanctuaries (non-won, non-full lanes)
	var valid []int
	for _, s := range sanctuaries {
		if s.TurnsLeft > 0 && !g.Lanes[s.Lane].IsWon() && !g.Lanes[s.Lane].IsSideFull(side) {
			valid = append(valid, s.Lane)
		}
	}

	if len(valid) == 0 {
		return -1
	}
	return valid[g.Rand().Intn(len(valid))]
}

// GetCaptureLane returns a valid capture lane for a player (random if multiple)
func (g *LaneGame) GetCaptureLane(side PlayerSide) int {
	var captures []CaptureMarker
	if side == Player1 {
		captures = g.Player1Captures
	} else {
		captures = g.Player2Captures
	}

	// Filter to valid captures (non-won, non-full lanes)
	var valid []int
	for _, c := range captures {
		if c.TurnsLeft > 0 && !g.Lanes[c.Lane].IsWon() && !g.Lanes[c.Lane].IsSideFull(side) {
			valid = append(valid, c.Lane)
		}
	}

	if len(valid) == 0 {
		return -1
	}
	return valid[g.Rand().Intn(len(valid))]
}

// RemovePieceWithRedirects removes a piece with Sanctuary/Capture redirection logic
func (g *LaneGame) RemovePieceWithRedirects(laneIdx int, pieceOwner PlayerSide, remover PlayerSide) RemovalResult {
	lane := g.Lanes[laneIdx]

	// Check if there's a piece to remove
	if lane.CountPieces(pieceOwner) <= 0 {
		return RemovalResult{Removed: false}
	}

	// Check Capture first (if remover is opponent and has active Capture)
	if remover != 0 && remover != pieceOwner {
		captureLane := g.GetCaptureLane(remover)
		if captureLane >= 0 && !g.Lanes[captureLane].IsWon() {
			// Remove piece from source lane
			g.RemovePiece(laneIdx, pieceOwner)
			// Add as remover's piece on capture lane
			g.PlacePiece(captureLane, remover)
			return RemovalResult{
				Removed:      true,
				Redirected:   true,
				RedirectType: "capture",
				Destination:  captureLane,
				Converted:    true,
			}
		}
	}

	// Check Sanctuary (if piece owner has active Sanctuary)
	sanctuaryLane := g.GetSanctuaryLane(pieceOwner)
	if sanctuaryLane >= 0 && !g.Lanes[sanctuaryLane].IsWon() {
		// Remove piece from source lane
		g.RemovePiece(laneIdx, pieceOwner)
		// Add piece to sanctuary lane (still owned by original owner)
		g.PlacePiece(sanctuaryLane, pieceOwner)
		return RemovalResult{
			Removed:      true,
			Redirected:   true,
			RedirectType: "sanctuary",
			Destination:  sanctuaryLane,
			Converted:    false,
		}
	}

	// Normal removal - no redirection
	g.RemovePiece(laneIdx, pieceOwner)
	return RemovalResult{Removed: true, Redirected: false}
}

// CleanupWonLane cleans up all effects on a lane when it is won
func (g *LaneGame) CleanupWonLane(laneIdx int) {
	lane := g.Lanes[laneIdx]
	lane.ClearAllEffects()

	// Remove any sanctuaries/captures pointing to this lane
	var p1Sanct []SanctuaryMarker
	for _, s := range g.Player1Sanctuaries {
		if s.Lane != laneIdx {
			p1Sanct = append(p1Sanct, s)
		}
	}
	g.Player1Sanctuaries = p1Sanct

	var p2Sanct []SanctuaryMarker
	for _, s := range g.Player2Sanctuaries {
		if s.Lane != laneIdx {
			p2Sanct = append(p2Sanct, s)
		}
	}
	g.Player2Sanctuaries = p2Sanct

	var p1Capt []CaptureMarker
	for _, c := range g.Player1Captures {
		if c.Lane != laneIdx {
			p1Capt = append(p1Capt, c)
		}
	}
	g.Player1Captures = p1Capt

	var p2Capt []CaptureMarker
	for _, c := range g.Player2Captures {
		if c.Lane != laneIdx {
			p2Capt = append(p2Capt, c)
		}
	}
	g.Player2Captures = p2Capt

	// Remove pending raids on this lane
	var remaining []PendingRaid
	for _, r := range g.PendingRaids {
		if r.Lane != laneIdx {
			remaining = append(remaining, r)
		}
	}
	g.PendingRaids = remaining
}

// GetPlayer returns the player for a given side
func (g *LaneGame) GetPlayer(side PlayerSide) *LanePlayer {
	if side == Player1 {
		return g.Player1
	}
	return g.Player2
}

// GetPlayerByID returns the player matching a player ID
func (g *LaneGame) GetPlayerByID(playerID string) *LanePlayer {
	if g.Player1 != nil && g.Player1.ID == playerID {
		return g.Player1
	}
	if g.Player2 != nil && g.Player2.ID == playerID {
		return g.Player2
	}
	return nil
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

// GetAvailableLanes returns indices of lanes that are not won, not frozen, and have empty slots for the given side
func (g *LaneGame) GetAvailableLanes(side PlayerSide) []int {
	available := make([]int, 0, DefaultLaneCount)
	for i, lane := range g.Lanes {
		if !lane.IsWon() && !lane.IsSideFull(side) && !lane.IsFrozenFor(side) {
			available = append(available, i)
		}
	}
	return available
}

// GetAvailableLanesIgnoreFreeze returns indices of lanes that are not won and have empty slots (ignoring freeze)
func (g *LaneGame) GetAvailableLanesIgnoreFreeze(side PlayerSide) []int {
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
	return g.CheckLaneWinWithPlayer(laneIndex, g.CurrentPlayer)
}

// CheckLaneWinWithPlayer checks if a lane has been won with tie-breaking.
// When both sides are full simultaneously, currentPlayer wins.
func (g *LaneGame) CheckLaneWinWithPlayer(laneIndex int, currentPlayer PlayerSide) PlayerSide {
	if laneIndex < 0 || laneIndex >= DefaultLaneCount {
		return 0
	}

	lane := g.Lanes[laneIndex]
	if lane.IsWon() {
		return lane.Winner // Already won
	}

	p1Full := lane.IsSideFull(Player1)
	p2Full := lane.IsSideFull(Player2)

	// If both sides are full, current player wins (tie-breaking)
	if p1Full && p2Full {
		lane.Winner = currentPlayer
		if currentPlayer == Player1 {
			g.Player1LanesWon++
		} else {
			g.Player2LanesWon++
		}
		g.UpdatedAt = time.Now()
		return currentPlayer
	}

	if p1Full {
		lane.Winner = Player1
		g.Player1LanesWon++
		g.UpdatedAt = time.Now()
		return Player1
	}

	if p2Full {
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
	laneIndex := available[g.Rand().Intn(len(available))]

	if g.PlacePiece(laneIndex, side) {
		g.LastAutoPlacedLane = laneIndex
		return laneIndex
	}

	return -1
}

// SwitchTurn switches to the opponent's turn and decrements all duration effects
func (g *LaneGame) SwitchTurn() {
	g.CurrentPlayer = g.CurrentPlayer.Opponent()
	g.CurrentPhase = PhaseRaidResolution // Full turn cycle
	g.TurnNumber++
	g.UpdatedAt = time.Now()

	// Decrement duration effects on lanes
	for _, lane := range g.Lanes {
		lane.DecrementFreeze()
		lane.DecrementTriggers()
	}

	// Decrement global duration effects
	if g.Player1Cloaked > 0 {
		g.Player1Cloaked--
	}
	if g.Player2Cloaked > 0 {
		g.Player2Cloaked--
	}
	if g.Player1Blinded > 0 {
		g.Player1Blinded--
	}
	if g.Player2Blinded > 0 {
		g.Player2Blinded--
	}

	// Decrement sanctuary timers and remove expired ones
	var p1Sanct []SanctuaryMarker
	for _, s := range g.Player1Sanctuaries {
		s.TurnsLeft--
		if s.TurnsLeft > 0 {
			p1Sanct = append(p1Sanct, s)
		}
	}
	g.Player1Sanctuaries = p1Sanct

	var p2Sanct []SanctuaryMarker
	for _, s := range g.Player2Sanctuaries {
		s.TurnsLeft--
		if s.TurnsLeft > 0 {
			p2Sanct = append(p2Sanct, s)
		}
	}
	g.Player2Sanctuaries = p2Sanct

	// Decrement capture timers and remove expired ones
	var p1Capt []CaptureMarker
	for _, c := range g.Player1Captures {
		c.TurnsLeft--
		if c.TurnsLeft > 0 {
			p1Capt = append(p1Capt, c)
		}
	}
	g.Player1Captures = p1Capt

	var p2Capt []CaptureMarker
	for _, c := range g.Player2Captures {
		c.TurnsLeft--
		if c.TurnsLeft > 0 {
			p2Capt = append(p2Capt, c)
		}
	}
	g.Player2Captures = p2Capt

	// Decrement raid timers (raids resolve when turns_until_resolve reaches 0)
	for i := range g.PendingRaids {
		g.PendingRaids[i].TurnsUntilResolve--
	}
}

// AdvancePhase moves to the next phase in the turn
func (g *LaneGame) AdvancePhase() {
	switch g.CurrentPhase {
	case PhaseRaidResolution:
		g.CurrentPhase = PhaseDeferredResolution
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
// Slots 0-1 are always PlaceAnother and RemoveEnemy
// Slots 2-3 are set from the provided perk IDs and names
func (g *LaneGame) GeneratePerkSlots(slot3PerkID int, slot3Name string, slot4PerkID int, slot4Name string) {
	g.CurrentPerkSlots = []PerkSlot{
		{SlotIndex: 0, PerkID: 1, PerkName: "PlaceAnother"},
		{SlotIndex: 1, PerkID: 2, PerkName: "RemoveEnemy"},
		{SlotIndex: 2, PerkID: slot3PerkID, PerkName: slot3Name},
		{SlotIndex: 3, PerkID: slot4PerkID, PerkName: slot4Name},
	}
}

// Clone creates a deep copy of the game state
func (g *LaneGame) Clone() *LaneGame {
	clone := &LaneGame{
		ID:                  g.ID,
		CurrentPlayer:       g.CurrentPlayer,
		CurrentPhase:        g.CurrentPhase,
		TurnNumber:          g.TurnNumber,
		Player1LanesWon:     g.Player1LanesWon,
		Player2LanesWon:     g.Player2LanesWon,
		Status:              g.Status,
		Winner:              g.Winner,
		LastAutoPlacedLane:  g.LastAutoPlacedLane,
		Player1Cloaked:      g.Player1Cloaked,
		Player2Cloaked:      g.Player2Cloaked,
		Player1Blinded:      g.Player1Blinded,
		Player2Blinded:      g.Player2Blinded,
		TriggerOrderCounter: g.TriggerOrderCounter,
		CreatedAt:           g.CreatedAt,
		UpdatedAt:           g.UpdatedAt,
		IsAIGame:            g.IsAIGame,
		AIDifficulty:        g.AIDifficulty,
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

	// Clone lanes (deep copy including triggers and deferred)
	for i, lane := range g.Lanes {
		if lane != nil {
			clonedLane := &Lane{
				Player1Slots: lane.Player1Slots,
				Player2Slots: lane.Player2Slots,
				Winner:       lane.Winner,
				FreezePlayer: lane.FreezePlayer,
				FreezeTurns:  lane.FreezeTurns,
			}
			// Clone triggers
			if lane.Triggers != nil {
				clonedLane.Triggers = make([]Trigger, len(lane.Triggers))
				copy(clonedLane.Triggers, lane.Triggers)
			}
			// Clone deferred
			if lane.Deferred != nil {
				clonedLane.Deferred = make([]DeferredEffect, len(lane.Deferred))
				copy(clonedLane.Deferred, lane.Deferred)
			}
			clone.Lanes[i] = clonedLane
		}
	}

	// Clone perk slots
	if g.CurrentPerkSlots != nil {
		clone.CurrentPerkSlots = make([]PerkSlot, len(g.CurrentPerkSlots))
		copy(clone.CurrentPerkSlots, g.CurrentPerkSlots)
	}

	// Clone sanctuaries
	if g.Player1Sanctuaries != nil {
		clone.Player1Sanctuaries = make([]SanctuaryMarker, len(g.Player1Sanctuaries))
		copy(clone.Player1Sanctuaries, g.Player1Sanctuaries)
	}
	if g.Player2Sanctuaries != nil {
		clone.Player2Sanctuaries = make([]SanctuaryMarker, len(g.Player2Sanctuaries))
		copy(clone.Player2Sanctuaries, g.Player2Sanctuaries)
	}

	// Clone captures
	if g.Player1Captures != nil {
		clone.Player1Captures = make([]CaptureMarker, len(g.Player1Captures))
		copy(clone.Player1Captures, g.Player1Captures)
	}
	if g.Player2Captures != nil {
		clone.Player2Captures = make([]CaptureMarker, len(g.Player2Captures))
		copy(clone.Player2Captures, g.Player2Captures)
	}

	// Clone pending raids
	if g.PendingRaids != nil {
		clone.PendingRaids = make([]PendingRaid, len(g.PendingRaids))
		copy(clone.PendingRaids, g.PendingRaids)
	}

	return clone
}
