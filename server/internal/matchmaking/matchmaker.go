package matchmaking

import (
	"sync"
	"time"
)

// QueuedPlayer represents a player waiting for a match
type QueuedPlayer struct {
	ID           string
	ConnectionID string
	HeroType     string
	GameType     GameType // "chess" or "laneGame"
	JoinedAt     time.Time
}

// Match represents a matched pair of players
type Match struct {
	Player1 *QueuedPlayer
	Player2 *QueuedPlayer
}

// Matchmaker handles player matchmaking
type Matchmaker struct {
	queue    []*QueuedPlayer
	matches  chan *Match
	mu       sync.Mutex
	stopChan chan struct{}
}

// NewMatchmaker creates a new matchmaker
func NewMatchmaker() *Matchmaker {
	return &Matchmaker{
		queue:    make([]*QueuedPlayer, 0),
		matches:  make(chan *Match, 100),
		stopChan: make(chan struct{}),
	}
}

// Run starts the matchmaking loop
func (m *Matchmaker) Run() {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			m.processQueue()
		case <-m.stopChan:
			return
		}
	}
}

// Stop stops the matchmaker
func (m *Matchmaker) Stop() {
	close(m.stopChan)
}

// AddPlayer adds a player to the matchmaking queue
func (m *Matchmaker) AddPlayer(player *QueuedPlayer) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if player is already in queue
	for _, p := range m.queue {
		if p.ID == player.ID {
			return
		}
	}

	m.queue = append(m.queue, player)
}

// RemovePlayer removes a player from the queue
func (m *Matchmaker) RemovePlayer(playerID string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	for i, p := range m.queue {
		if p.ID == playerID {
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			return
		}
	}
}

// FindMatch looks for a match for the given player (matches by game type)
func (m *Matchmaker) FindMatch(playerID string) *Match {
	m.mu.Lock()
	defer m.mu.Unlock()

	if len(m.queue) < 2 {
		return nil
	}

	// Find the player in queue
	var playerIdx = -1
	for i, p := range m.queue {
		if p.ID == playerID {
			playerIdx = i
			break
		}
	}

	if playerIdx == -1 {
		return nil
	}

	player := m.queue[playerIdx]

	// Find an opponent of the same game type
	var opponentIdx = -1
	for i, p := range m.queue {
		if p.ID != playerID && p.GameType == player.GameType {
			opponentIdx = i
			break
		}
	}

	if opponentIdx == -1 {
		return nil
	}

	opponent := m.queue[opponentIdx]

	// Remove both from queue
	// Remove higher index first to avoid index shifting issues
	if playerIdx > opponentIdx {
		m.queue = append(m.queue[:playerIdx], m.queue[playerIdx+1:]...)
		m.queue = append(m.queue[:opponentIdx], m.queue[opponentIdx+1:]...)
	} else {
		m.queue = append(m.queue[:opponentIdx], m.queue[opponentIdx+1:]...)
		m.queue = append(m.queue[:playerIdx], m.queue[playerIdx+1:]...)
	}

	return &Match{
		Player1: player,
		Player2: opponent,
	}
}

// processQueue processes the matchmaking queue
func (m *Matchmaker) processQueue() {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Remove stale players (waiting > 5 minutes)
	now := time.Now()
	activeQueue := make([]*QueuedPlayer, 0)
	for _, p := range m.queue {
		if now.Sub(p.JoinedAt) < 5*time.Minute {
			activeQueue = append(activeQueue, p)
		}
	}
	m.queue = activeQueue

	// Group players by game type for matching
	byType := make(map[GameType][]*QueuedPlayer)
	for _, p := range m.queue {
		byType[p.GameType] = append(byType[p.GameType], p)
	}

	matched := make(map[string]bool) // track matched player IDs

	for _, players := range byType {
		for len(players) >= 2 {
			player1 := players[0]
			player2 := players[1]
			players = players[2:]

			match := &Match{
				Player1: player1,
				Player2: player2,
			}

			select {
			case m.matches <- match:
				matched[player1.ID] = true
				matched[player2.ID] = true
			default:
				return
			}
		}
	}

	// Remove matched players from queue
	if len(matched) > 0 {
		remaining := make([]*QueuedPlayer, 0)
		for _, p := range m.queue {
			if !matched[p.ID] {
				remaining = append(remaining, p)
			}
		}
		m.queue = remaining
	}
}

// GetQueueLength returns the current queue length
func (m *Matchmaker) GetQueueLength() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.queue)
}
