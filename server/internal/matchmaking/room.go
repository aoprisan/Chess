package matchmaking

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"sync"
	"time"
)

// RoomStatus represents the current state of a room
type RoomStatus string

const (
	RoomStatusWaiting  RoomStatus = "waiting"
	RoomStatusPlaying  RoomStatus = "playing"
	RoomStatusFinished RoomStatus = "finished"
)

// GameType represents the type of game
type GameType string

const (
	GameTypeChess    GameType = "chess"
	GameTypeLaneGame GameType = "laneGame"
)

// Room represents a private game room that players can join via code
type Room struct {
	Code         string     `json:"code"`
	GameType     GameType   `json:"gameType"`
	Status       RoomStatus `json:"status"`
	CreatorID    string     `json:"creatorId"`
	CreatorConnID string    `json:"creatorConnId"`
	CreatorHero  string     `json:"creatorHero"`
	JoinerID     string     `json:"joinerId,omitempty"`
	JoinerConnID string     `json:"joinerConnId,omitempty"`
	JoinerHero   string     `json:"joinerHero,omitempty"`
	GameID       string     `json:"gameId,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
}

// RoomManager manages private game rooms
type RoomManager struct {
	rooms map[string]*Room // code -> room
	mu    sync.Mutex
}

// NewRoomManager creates a new RoomManager
func NewRoomManager() *RoomManager {
	rm := &RoomManager{
		rooms: make(map[string]*Room),
	}
	go rm.cleanupLoop()
	return rm
}

// CreateRoom creates a new room with a unique code
func (rm *RoomManager) CreateRoom(gameType GameType, creatorID, creatorConnID, heroType string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	code := rm.generateCode()
	room := &Room{
		Code:          code,
		GameType:      gameType,
		Status:        RoomStatusWaiting,
		CreatorID:     creatorID,
		CreatorConnID: creatorConnID,
		CreatorHero:   heroType,
		CreatedAt:     time.Now(),
	}
	rm.rooms[code] = room
	return room
}

// JoinRoom joins an existing room by code
func (rm *RoomManager) JoinRoom(code, joinerID, joinerConnID, heroType string) (*Room, error) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	room, ok := rm.rooms[code]
	if !ok {
		return nil, fmt.Errorf("room not found")
	}
	if room.Status != RoomStatusWaiting {
		return nil, fmt.Errorf("room is not available")
	}
	if room.CreatorID == joinerID {
		return nil, fmt.Errorf("cannot join your own room")
	}

	room.JoinerID = joinerID
	room.JoinerConnID = joinerConnID
	room.JoinerHero = heroType
	room.Status = RoomStatusPlaying
	return room, nil
}

// GetRoom returns a room by code
func (rm *RoomManager) GetRoom(code string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	return rm.rooms[code]
}

// SetGameID associates a game ID with a room
func (rm *RoomManager) SetGameID(code, gameID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	if room, ok := rm.rooms[code]; ok {
		room.GameID = gameID
	}
}

// RemoveRoom removes a room
func (rm *RoomManager) RemoveRoom(code string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()
	delete(rm.rooms, code)
}

// CancelRoom cancels a room if the given connection owns it
func (rm *RoomManager) CancelRoom(connID string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	for code, room := range rm.rooms {
		if room.CreatorConnID == connID && room.Status == RoomStatusWaiting {
			delete(rm.rooms, code)
			return room
		}
	}
	return nil
}

// GetRoomByConnection returns the room associated with a connection
func (rm *RoomManager) GetRoomByConnection(connID string) *Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	for _, room := range rm.rooms {
		if room.CreatorConnID == connID || room.JoinerConnID == connID {
			return room
		}
	}
	return nil
}

// generateCode generates a unique 6-character alphanumeric room code
func (rm *RoomManager) generateCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed ambiguous chars (I,O,0,1)
	for {
		code := make([]byte, 6)
		for i := range code {
			n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
			code[i] = charset[n.Int64()]
		}
		codeStr := string(code)
		if _, exists := rm.rooms[codeStr]; !exists {
			return codeStr
		}
	}
}

// cleanupLoop periodically removes stale rooms
func (rm *RoomManager) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		rm.mu.Lock()
		now := time.Now()
		for code, room := range rm.rooms {
			// Remove waiting rooms older than 10 minutes
			if room.Status == RoomStatusWaiting && now.Sub(room.CreatedAt) > 10*time.Minute {
				delete(rm.rooms, code)
			}
			// Remove finished rooms older than 5 minutes
			if room.Status == RoomStatusFinished && now.Sub(room.CreatedAt) > 5*time.Minute {
				delete(rm.rooms, code)
			}
		}
		rm.mu.Unlock()
	}
}
