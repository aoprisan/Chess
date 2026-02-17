package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kiddiechess/server/internal/auth"
	"github.com/kiddiechess/server/internal/database"
	"github.com/kiddiechess/server/internal/game"
	"github.com/kiddiechess/server/internal/models"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

// MessageType represents WebSocket message types
type MessageType string

const (
	MsgConnect    MessageType = "connect"
	MsgDisconnect MessageType = "disconnect"
	MsgError      MessageType = "error"

	// V2 Lane Game Message Types
	MsgJoinLaneGame          MessageType = "joinLaneGame"
	MsgLaneGameState         MessageType = "laneGameState"
	MsgAutoPlacement         MessageType = "autoPlacement"
	MsgSelectPerk            MessageType = "selectPerk"
	MsgPerkResult            MessageType = "perkResult"
	MsgTurnPhaseChanged      MessageType = "turnPhaseChanged"
	MsgLaneWon               MessageType = "laneWon"
	MsgGameWon               MessageType = "gameWon"
	MsgLaneMatchFound        MessageType = "laneMatchFound"
	MsgQueueStatus           MessageType = "queueStatus"
	MsgOpponentDisconnected  MessageType = "opponentDisconnected"
	MsgGameResult            MessageType = "gameResult"
	MsgTurnTimer             MessageType = "turnTimer"
	MsgReconnect             MessageType = "reconnect"
)

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type    MessageType            `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}

// Client represents a connected WebSocket client
type Client struct {
	ID       string
	Hub      *Hub
	Conn     *websocket.Conn
	Send     chan []byte
	PlayerID string
	Username string
	GameID   string
	mu       sync.Mutex
}

// QueueEntry represents a player waiting for a match
type QueueEntry struct {
	Client   *Client
	PlayerID string
	Username string
	HeroType string
	Rating   int
	QueuedAt time.Time
}

// Hub manages all active clients and games
type Hub struct {
	Clients          map[string]*Client
	LaneGames        map[string]*models.LaneGame // V2 lane games
	Register         chan *Client
	Unregister       chan *Client
	Broadcast        chan []byte
	DB               *database.DB
	mu               sync.RWMutex
	MatchQueue       []*QueueEntry
	mqMu             sync.Mutex
	TurnTimers       map[string]*time.Timer // gameID -> turn timer
	DisconnectTimers map[string]*time.Timer // gameID -> disconnect timer
}

// NewHub creates a new Hub
func NewHub(db *database.DB) *Hub {
	return &Hub{
		Clients:          make(map[string]*Client),
		LaneGames:        make(map[string]*models.LaneGame),
		Register:         make(chan *Client),
		Unregister:       make(chan *Client),
		Broadcast:        make(chan []byte),
		DB:               db,
		TurnTimers:       make(map[string]*time.Timer),
		DisconnectTimers: make(map[string]*time.Timer),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.Clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("Client connected: %s", client.ID)

		case client := <-h.Unregister:
			h.removeFromQueue(client.ID)
			h.mu.Lock()
			if _, ok := h.Clients[client.ID]; ok {
				delete(h.Clients, client.ID)
				close(client.Send)
			}
			// Check if client was in an active game
			if client.GameID != "" {
				if laneGame, ok := h.LaneGames[client.GameID]; ok {
					if !laneGame.IsAIGame && laneGame.Status == models.LaneStatusPlaying {
						go h.handlePlayerDisconnect(laneGame, client)
					}
				}
			}
			h.mu.Unlock()
			log.Printf("Client disconnected: %s", client.ID)

		case message := <-h.Broadcast:
			h.mu.RLock()
			for _, client := range h.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.Clients, client.ID)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// ServeWS handles WebSocket upgrade requests with JWT authentication.
func ServeWS(hub *Hub, authSvc *auth.AuthService, w http.ResponseWriter, r *http.Request) {
	// Extract and validate JWT from query param
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		http.Error(w, "token query parameter required", http.StatusUnauthorized)
		return
	}
	claims, err := authSvc.ValidateToken(tokenStr)
	if err != nil {
		http.Error(w, "invalid or expired token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{
		ID:       uuid.New().String(),
		Hub:      hub,
		Conn:     conn,
		Send:     make(chan []byte, 256),
		PlayerID: claims.UserID,
		Username: claims.Username,
	}

	hub.Register <- client

	// Send connection confirmation with authenticated identity
	connectPayload := map[string]interface{}{
		"clientId": client.ID,
		"playerId": claims.UserID,
		"username": claims.Username,
	}

	// Check if this player has an active game with disconnected status
	hub.mu.RLock()
	for _, laneGame := range hub.LaneGames {
		if laneGame.Status == models.LaneStatusPlaying && laneGame.DisconnectedPlayerID == claims.UserID {
			connectPayload["activeGameId"] = laneGame.ID
			break
		}
	}
	hub.mu.RUnlock()

	msg := WSMessage{
		Type:    MsgConnect,
		Payload: connectPayload,
	}
	data, _ := json.Marshal(msg)
	client.Send <- data

	go client.writePump()
	go client.readPump()
}

// readPump handles incoming messages from the client
func (c *Client) readPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512 * 1024)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		var msg WSMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("JSON unmarshal error: %v", err)
			continue
		}

		c.handleMessage(msg)
	}
}

// writePump sends messages to the client
func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage processes incoming WebSocket messages
func (c *Client) handleMessage(msg WSMessage) {
	switch msg.Type {
	// V2 Lane Game handlers
	case MsgJoinLaneGame:
		c.handleJoinLaneGame(msg.Payload)
	case MsgSelectPerk:
		c.handleSelectPerk(msg.Payload)
	case MsgReconnect:
		c.Hub.handleReconnect(c, msg.Payload)
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// sendError sends an error message to the client
func (c *Client) sendError(message string) {
	msg := WSMessage{
		Type: MsgError,
		Payload: map[string]interface{}{
			"message": message,
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// ============================================================================
// V2 Lane Game Handlers
// ============================================================================

// handleJoinLaneGame processes V2 lane game join requests
func (c *Client) handleJoinLaneGame(payload map[string]interface{}) {
	heroType, _ := payload["heroType"].(string)
	vsAI, _ := payload["vsAI"].(bool)
	aiDifficulty, _ := payload["aiDifficulty"].(string)

	if vsAI {
		// Create AI game immediately
		laneGame := models.NewLaneGame()
		laneGame.IsAIGame = true
		laneGame.AIDifficulty = aiDifficulty
		laneGame.Status = models.LaneStatusPlaying

		laneGame.Player1 = &models.LanePlayer{
			ID:           c.PlayerID,
			ConnectionID: c.ID,
			HeroType:     models.HeroType(heroType),
			Side:         models.Player1,
		}

		// AI is Player 2
		laneGame.Player2 = &models.LanePlayer{
			ID:           "ai",
			ConnectionID: "",
			HeroType:     models.HeroYeti, // Default AI hero
			Side:         models.Player2,
		}

		c.Hub.mu.Lock()
		c.Hub.LaneGames[laneGame.ID] = laneGame
		c.mu.Lock()
		c.GameID = laneGame.ID
		c.mu.Unlock()
		c.Hub.mu.Unlock()

		// Send match found message
		c.sendLaneMatchFound(laneGame, models.Player1)

		// Start the game - execute first turn auto-placement
		go c.executeLaneGameTurn(laneGame)
	} else {
		// Online multiplayer matchmaking
		rating := 1200 // default
		if c.PlayerID != "" {
			user, err := c.Hub.DB.GetUser(c.PlayerID)
			if err == nil && user != nil {
				rating = user.Rating
			}
		}

		entry := &QueueEntry{
			Client:   c,
			PlayerID: c.PlayerID,
			Username: c.Username,
			HeroType: heroType,
			Rating:   rating,
			QueuedAt: time.Now(),
		}

		c.Hub.mqMu.Lock()
		c.Hub.MatchQueue = append(c.Hub.MatchQueue, entry)
		c.Hub.mqMu.Unlock()

		// Notify client they're queued
		queueMsg := WSMessage{
			Type: MsgQueueStatus,
			Payload: map[string]interface{}{
				"status": "queued",
			},
		}
		data, _ := json.Marshal(queueMsg)
		c.Send <- data

		c.Hub.tryMatchPlayers()
	}
}

// executeLaneGameTurn executes the current player's turn
func (c *Client) executeLaneGameTurn(laneGame *models.LaneGame) {
	c.Hub.mu.Lock()
	defer c.Hub.mu.Unlock()

	if laneGame.Status != models.LaneStatusPlaying {
		return
	}

	engine := game.NewLaneEngine(laneGame)

	// Execute auto-placement phase
	autoResult := engine.ExecuteAutoPlacement()

	// Send auto-placement notification
	c.sendAutoPlacement(laneGame, autoResult)

	// Check if game ended
	if autoResult.GameWinner != 0 {
		c.sendGameWon(laneGame, autoResult.GameWinner)
		return
	}

	// Check if lane was won
	if autoResult.LaneWinner != 0 {
		c.sendLaneWon(laneGame, autoResult.LaneIndex, autoResult.LaneWinner)
	}

	// Send updated game state with perk options
	c.sendLaneGameState(laneGame)

	// If it's AI's turn in perk selection, let AI choose
	if laneGame.IsAIGame && laneGame.CurrentPlayer == models.Player2 {
		go c.executeAIPerkSelection(laneGame)
	}
}

// executeAIPerkSelection handles AI perk selection
func (c *Client) executeAIPerkSelection(laneGame *models.LaneGame) {
	// Small delay to make it feel more natural
	time.Sleep(500 * time.Millisecond)

	c.Hub.mu.Lock()
	defer c.Hub.mu.Unlock()

	if laneGame.Status != models.LaneStatusPlaying {
		return
	}

	ai := game.NewLaneAI(laneGame.AIDifficulty)
	engine := game.NewLaneEngine(laneGame)

	perkID, targets := ai.ChoosePerk(laneGame)
	var result *game.TurnResult
	if len(targets) == 0 {
		result = engine.ExecutePerkSelection(perkID, -1)
	} else if len(targets) == 1 {
		result = engine.ExecutePerkSelection(perkID, targets[0])
	} else {
		result = engine.ExecutePerkSelection(perkID, targets[0], targets[1:]...)
	}

	// Send perk result
	c.sendPerkResult(laneGame, result)

	// Check if game ended
	if result.GameWinner != 0 {
		c.sendGameWon(laneGame, result.GameWinner)
		return
	}

	// Check if lane was won
	if result.LaneWinner != 0 {
		c.sendLaneWon(laneGame, result.LaneIndex, result.LaneWinner)
	}

	// Send updated game state
	c.sendLaneGameState(laneGame)

	// Continue with next turn (now Player 1's turn)
	if laneGame.CurrentPlayer == models.Player1 {
		go c.executeLaneGameTurn(laneGame)
	}
}

// handleSelectPerk handles player perk selection
func (c *Client) handleSelectPerk(payload map[string]interface{}) {
	gameID, _ := payload["gameId"].(string)
	perkID := int(payload["perkId"].(float64))
	targetLane := -1
	if tl, ok := payload["targetLane"].(float64); ok {
		targetLane = int(tl)
	}

	c.Hub.mu.Lock()
	laneGame, ok := c.Hub.LaneGames[gameID]
	if !ok {
		c.Hub.mu.Unlock()
		c.sendError("Lane game not found")
		return
	}

	// Validate it's the player's turn
	player := laneGame.GetPlayerByConnectionID(c.ID)
	if player == nil {
		c.Hub.mu.Unlock()
		c.sendError("Player not in game")
		return
	}

	if player.Side != laneGame.CurrentPlayer {
		c.Hub.mu.Unlock()
		c.sendError("Not your turn")
		return
	}

	if laneGame.CurrentPhase != models.PhasePerkSelection {
		c.Hub.mu.Unlock()
		c.sendError("Not in perk selection phase")
		return
	}

	// Execute perk selection
	engine := game.NewLaneEngine(laneGame)
	result := engine.ExecutePerkSelection(perkID, targetLane)

	if !result.Success {
		c.Hub.mu.Unlock()
		c.sendError(result.Error)
		return
	}

	if laneGame.IsAIGame {
		// AI game: use client-scoped sends
		c.sendPerkResult(laneGame, result)

		if result.GameWinner != 0 {
			c.sendGameWon(laneGame, result.GameWinner)
			c.Hub.mu.Unlock()
			return
		}

		if result.LaneWinner != 0 {
			c.sendLaneWon(laneGame, result.LaneIndex, result.LaneWinner)
		}

		c.sendLaneGameState(laneGame)
		c.Hub.mu.Unlock()

		// If now AI's turn, start AI turn
		if laneGame.CurrentPlayer == models.Player2 {
			go func() {
				c.Hub.mu.Lock()
				eng := game.NewLaneEngine(laneGame)
				autoResult := eng.ExecuteAutoPlacement()
				c.sendAutoPlacement(laneGame, autoResult)

				if autoResult.GameWinner != 0 {
					c.sendGameWon(laneGame, autoResult.GameWinner)
					c.Hub.mu.Unlock()
					return
				}

				if autoResult.LaneWinner != 0 {
					c.sendLaneWon(laneGame, autoResult.LaneIndex, autoResult.LaneWinner)
				}

				c.sendLaneGameState(laneGame)
				c.Hub.mu.Unlock()

				c.executeAIPerkSelection(laneGame)
			}()
		} else {
			go c.executeLaneGameTurn(laneGame)
		}
	} else {
		// Multiplayer game: use Hub broadcasts
		c.Hub.cancelTurnTimer(laneGame.ID)
		c.Hub.mu.Unlock()

		c.Hub.broadcastPerkResult(laneGame, result)

		if result.GameWinner != 0 {
			c.Hub.broadcastGameWon(laneGame, result.GameWinner)
			return
		}

		if result.LaneWinner != 0 {
			c.Hub.broadcastLaneWon(laneGame, result.LaneIndex, result.LaneWinner)
		}

		// Execute next turn for opponent
		go c.Hub.executeMultiplayerTurn(laneGame)
	}
}

// sendLaneMatchFound sends lane game match found notification
func (c *Client) sendLaneMatchFound(laneGame *models.LaneGame, side models.PlayerSide) {
	msg := WSMessage{
		Type: MsgLaneMatchFound,
		Payload: map[string]interface{}{
			"gameId": laneGame.ID,
			"side":   side.String(),
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// sendLaneGameState sends current lane game state to client
func (c *Client) sendLaneGameState(laneGame *models.LaneGame) {
	msg := WSMessage{
		Type: MsgLaneGameState,
		Payload: map[string]interface{}{
			"game": laneGame,
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// sendAutoPlacement sends auto-placement notification
func (c *Client) sendAutoPlacement(laneGame *models.LaneGame, result *game.TurnResult) {
	msg := WSMessage{
		Type: MsgAutoPlacement,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"player":    laneGame.CurrentPlayer.String(),
			"laneIndex": result.LaneIndex,
			"success":   result.Success,
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// sendPerkResult sends perk execution result
func (c *Client) sendPerkResult(laneGame *models.LaneGame, result *game.TurnResult) {
	msg := WSMessage{
		Type: MsgPerkResult,
		Payload: map[string]interface{}{
			"gameId":       laneGame.ID,
			"perkId":       result.PerkExecuted,
			"laneIndex":    result.LaneIndex,
			"success":      result.Success,
			"error":        result.Error,
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// sendLaneWon sends lane won notification
func (c *Client) sendLaneWon(laneGame *models.LaneGame, laneIndex int, winner models.PlayerSide) {
	msg := WSMessage{
		Type: MsgLaneWon,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"laneIndex": laneIndex,
			"winner":    winner.String(),
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// sendGameWon sends game won notification
func (c *Client) sendGameWon(laneGame *models.LaneGame, winner models.PlayerSide) {
	msg := WSMessage{
		Type: MsgGameWon,
		Payload: map[string]interface{}{
			"gameId": laneGame.ID,
			"winner": winner.String(),
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// broadcastLaneGameState sends lane game state to all players in the game
func (c *Client) broadcastLaneGameState(laneGame *models.LaneGame) {
	c.Hub.mu.RLock()
	defer c.Hub.mu.RUnlock()

	if laneGame.Player1 != nil && laneGame.Player1.ConnectionID != "" {
		if client, ok := c.Hub.Clients[laneGame.Player1.ConnectionID]; ok {
			client.sendLaneGameState(laneGame)
		}
	}

	if laneGame.Player2 != nil && laneGame.Player2.ConnectionID != "" {
		if client, ok := c.Hub.Clients[laneGame.Player2.ConnectionID]; ok {
			client.sendLaneGameState(laneGame)
		}
	}
}

// ============================================================================
// Matchmaking & Multiplayer Methods (Hub-scoped)
// ============================================================================

// removeFromQueue removes a client from the matchmaking queue
func (h *Hub) removeFromQueue(clientID string) {
	h.mqMu.Lock()
	defer h.mqMu.Unlock()

	for i, entry := range h.MatchQueue {
		if entry.Client.ID == clientID {
			h.MatchQueue = append(h.MatchQueue[:i], h.MatchQueue[i+1:]...)
			log.Printf("Removed client %s from matchmaking queue", clientID)
			return
		}
	}
}

// tryMatchPlayers attempts to pair queued players
func (h *Hub) tryMatchPlayers() {
	h.mqMu.Lock()
	defer h.mqMu.Unlock()

	for len(h.MatchQueue) >= 2 {
		entry1 := h.MatchQueue[0]
		entry2 := h.MatchQueue[1]
		h.MatchQueue = h.MatchQueue[2:]

		log.Printf("Matching players: %s vs %s", entry1.Username, entry2.Username)
		go h.createMultiplayerGame(entry1, entry2)
	}
}

// createMultiplayerGame creates a game for two matched players
func (h *Hub) createMultiplayerGame(entry1, entry2 *QueueEntry) {
	h.mu.Lock()

	laneGame := models.NewLaneGame()
	laneGame.IsAIGame = false
	laneGame.Status = models.LaneStatusPlaying

	laneGame.Player1 = &models.LanePlayer{
		ID:           entry1.PlayerID,
		ConnectionID: entry1.Client.ID,
		HeroType:     models.HeroType(entry1.HeroType),
		Side:         models.Player1,
		Username:     entry1.Username,
	}

	laneGame.Player2 = &models.LanePlayer{
		ID:           entry2.PlayerID,
		ConnectionID: entry2.Client.ID,
		HeroType:     models.HeroType(entry2.HeroType),
		Side:         models.Player2,
		Username:     entry2.Username,
	}

	h.LaneGames[laneGame.ID] = laneGame

	entry1.Client.mu.Lock()
	entry1.Client.GameID = laneGame.ID
	entry1.Client.mu.Unlock()

	entry2.Client.mu.Lock()
	entry2.Client.GameID = laneGame.ID
	entry2.Client.mu.Unlock()

	// Record game in DB
	if h.DB != nil {
		_ = h.DB.CreateGame(laneGame.ID, entry1.PlayerID, entry2.PlayerID,
			string(laneGame.Player1.HeroType), string(laneGame.Player2.HeroType))
	}

	// Send match found to both players
	p1Msg := WSMessage{
		Type: MsgLaneMatchFound,
		Payload: map[string]interface{}{
			"gameId":           laneGame.ID,
			"side":             "player1",
			"opponentUsername": entry2.Username,
			"opponentHero":    string(laneGame.Player2.HeroType),
		},
	}
	p1Data, _ := json.Marshal(p1Msg)
	entry1.Client.Send <- p1Data

	p2Msg := WSMessage{
		Type: MsgLaneMatchFound,
		Payload: map[string]interface{}{
			"gameId":           laneGame.ID,
			"side":             "player2",
			"opponentUsername": entry1.Username,
			"opponentHero":    string(laneGame.Player1.HeroType),
		},
	}
	p2Data, _ := json.Marshal(p2Msg)
	entry2.Client.Send <- p2Data

	h.mu.Unlock()

	// Start first turn
	h.executeMultiplayerTurn(laneGame)
}

// broadcastToGame sends a message to both players in a game
func (h *Hub) broadcastToGame(laneGame *models.LaneGame, msg WSMessage) {
	data, _ := json.Marshal(msg)

	h.mu.RLock()
	defer h.mu.RUnlock()

	if laneGame.Player1 != nil && laneGame.Player1.ConnectionID != "" {
		if client, ok := h.Clients[laneGame.Player1.ConnectionID]; ok {
			select {
			case client.Send <- data:
			default:
			}
		}
	}

	if laneGame.Player2 != nil && laneGame.Player2.ConnectionID != "" {
		if client, ok := h.Clients[laneGame.Player2.ConnectionID]; ok {
			select {
			case client.Send <- data:
			default:
			}
		}
	}
}

// broadcastGameState sends game state to both players
func (h *Hub) broadcastGameState(laneGame *models.LaneGame) {
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgLaneGameState,
		Payload: map[string]interface{}{
			"game": laneGame,
		},
	})
}

// broadcastAutoPlacement sends auto-placement result to both players
func (h *Hub) broadcastAutoPlacement(laneGame *models.LaneGame, result *game.TurnResult) {
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgAutoPlacement,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"player":    laneGame.CurrentPlayer.String(),
			"laneIndex": result.LaneIndex,
			"success":   result.Success,
		},
	})
}

// broadcastPerkResult sends perk result to both players
func (h *Hub) broadcastPerkResult(laneGame *models.LaneGame, result *game.TurnResult) {
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgPerkResult,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"perkId":    result.PerkExecuted,
			"laneIndex": result.LaneIndex,
			"success":   result.Success,
			"error":     result.Error,
		},
	})
}

// broadcastLaneWon sends lane won notification to both players
func (h *Hub) broadcastLaneWon(laneGame *models.LaneGame, laneIndex int, winner models.PlayerSide) {
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgLaneWon,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"laneIndex": laneIndex,
			"winner":    winner.String(),
		},
	})
}

// broadcastGameWon sends game won notification to both players
func (h *Hub) broadcastGameWon(laneGame *models.LaneGame, winner models.PlayerSide) {
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgGameWon,
		Payload: map[string]interface{}{
			"gameId": laneGame.ID,
			"winner": winner.String(),
		},
	})
	go h.finalizeGame(laneGame, winner)
}

// executeMultiplayerTurn runs a full turn for multiplayer games (raid -> deferred -> auto-place -> perk selection)
func (h *Hub) executeMultiplayerTurn(laneGame *models.LaneGame) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if laneGame.Status != models.LaneStatusPlaying {
		return
	}

	engine := game.NewLaneEngine(laneGame)

	// Phase 1: Raid resolution
	if laneGame.CurrentPhase == models.PhaseRaidResolution {
		raidResult := engine.ExecuteRaidResolution()
		if raidResult.GameWinner != 0 {
			h.mu.Unlock()
			h.broadcastGameWon(laneGame, raidResult.GameWinner)
			h.mu.Lock()
			return
		}
	}

	// Phase 2: Deferred resolution
	if laneGame.CurrentPhase == models.PhaseDeferredResolution {
		deferredResult := engine.ExecuteDeferredResolution()
		if deferredResult.GameWinner != 0 {
			h.mu.Unlock()
			h.broadcastGameWon(laneGame, deferredResult.GameWinner)
			h.mu.Lock()
			return
		}
	}

	// Phase 3: Auto-placement
	if laneGame.CurrentPhase == models.PhaseAutoPlacement {
		autoResult := engine.ExecuteAutoPlacement()

		h.mu.Unlock()
		h.broadcastAutoPlacement(laneGame, autoResult)
		h.mu.Lock()

		if autoResult.GameWinner != 0 {
			h.mu.Unlock()
			h.broadcastGameWon(laneGame, autoResult.GameWinner)
			h.mu.Lock()
			return
		}

		if autoResult.LaneWinner != 0 {
			h.mu.Unlock()
			h.broadcastLaneWon(laneGame, autoResult.LaneIndex, autoResult.LaneWinner)
			h.mu.Lock()
		}
	}

	// Phase 4: Perk selection — send state and wait for player input
	h.mu.Unlock()
	h.broadcastGameState(laneGame)
	h.startTurnTimer(laneGame)
	h.mu.Lock()
}

// ============================================================================
// Turn Timer Methods
// ============================================================================

// startTurnTimer starts a 60-second turn timer for multiplayer games
func (h *Hub) startTurnTimer(laneGame *models.LaneGame) {
	if laneGame.IsAIGame {
		return
	}

	h.mu.Lock()
	// Cancel existing timer if any
	if timer, ok := h.TurnTimers[laneGame.ID]; ok {
		timer.Stop()
	}

	deadline := time.Now().Add(60 * time.Second)
	gameID := laneGame.ID

	h.TurnTimers[gameID] = time.AfterFunc(60*time.Second, func() {
		h.handleTurnTimeout(gameID)
	})
	h.mu.Unlock()

	// Notify both players of the deadline
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgTurnTimer,
		Payload: map[string]interface{}{
			"gameId":   laneGame.ID,
			"deadline": deadline.UnixMilli(),
			"player":   laneGame.CurrentPlayer.String(),
		},
	})
}

// cancelTurnTimer cancels the turn timer for a game
func (h *Hub) cancelTurnTimer(gameID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if timer, ok := h.TurnTimers[gameID]; ok {
		timer.Stop()
		delete(h.TurnTimers, gameID)
	}
}

// handleTurnTimeout auto-passes when a player runs out of time
func (h *Hub) handleTurnTimeout(gameID string) {
	h.mu.Lock()
	delete(h.TurnTimers, gameID)

	laneGame, ok := h.LaneGames[gameID]
	if !ok || laneGame.Status != models.LaneStatusPlaying {
		h.mu.Unlock()
		return
	}

	if laneGame.CurrentPhase != models.PhasePerkSelection {
		h.mu.Unlock()
		return
	}

	log.Printf("Turn timeout for game %s, auto-passing for %s", gameID, laneGame.CurrentPlayer.String())

	// Execute pass (perk 0)
	engine := game.NewLaneEngine(laneGame)
	result := engine.ExecutePerkSelection(0, -1)

	h.mu.Unlock()
	h.broadcastPerkResult(laneGame, result)

	// Start next turn
	h.executeMultiplayerTurn(laneGame)
}

// ============================================================================
// Disconnect & Reconnect Methods
// ============================================================================

// handlePlayerDisconnect handles when a player disconnects from an active game
func (h *Hub) handlePlayerDisconnect(laneGame *models.LaneGame, client *Client) {
	h.mu.Lock()

	// Determine which player disconnected
	var disconnectedPlayer *models.LanePlayer
	if laneGame.Player1 != nil && laneGame.Player1.ConnectionID == client.ID {
		disconnectedPlayer = laneGame.Player1
	} else if laneGame.Player2 != nil && laneGame.Player2.ConnectionID == client.ID {
		disconnectedPlayer = laneGame.Player2
	}

	if disconnectedPlayer == nil {
		h.mu.Unlock()
		return
	}

	log.Printf("Player %s disconnected from game %s", disconnectedPlayer.Username, laneGame.ID)

	// Mark as disconnected
	laneGame.DisconnectedPlayerID = disconnectedPlayer.ID
	laneGame.DisconnectTime = time.Now()
	disconnectedPlayer.ConnectionID = ""

	// Cancel turn timer
	if timer, ok := h.TurnTimers[laneGame.ID]; ok {
		timer.Stop()
		delete(h.TurnTimers, laneGame.ID)
	}

	gameID := laneGame.ID
	disconnectedSide := disconnectedPlayer.Side

	// Start 30-second reconnect timer
	h.DisconnectTimers[gameID] = time.AfterFunc(30*time.Second, func() {
		h.handleDisconnectTimeout(gameID, disconnectedSide)
	})

	h.mu.Unlock()

	// Notify opponent
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgOpponentDisconnected,
		Payload: map[string]interface{}{
			"gameId":  laneGame.ID,
			"player":  disconnectedSide.String(),
			"timeout": 30,
		},
	})
}

// handleDisconnectTimeout awards win to remaining player when reconnect window expires
func (h *Hub) handleDisconnectTimeout(gameID string, disconnectedSide models.PlayerSide) {
	h.mu.Lock()
	delete(h.DisconnectTimers, gameID)

	laneGame, ok := h.LaneGames[gameID]
	if !ok || laneGame.Status != models.LaneStatusPlaying {
		h.mu.Unlock()
		return
	}

	// Only forfeit if still disconnected
	if laneGame.DisconnectedPlayerID == "" {
		h.mu.Unlock()
		return
	}

	log.Printf("Disconnect timeout for game %s, awarding win to opponent", gameID)

	winner := disconnectedSide.Opponent()
	laneGame.Winner = winner
	laneGame.Status = models.LaneStatusFinished

	h.mu.Unlock()
	h.broadcastGameWon(laneGame, winner)
}

// handleReconnect handles a player reconnecting to an active game
func (h *Hub) handleReconnect(client *Client, payload map[string]interface{}) {
	gameID, _ := payload["gameId"].(string)
	if gameID == "" {
		client.sendError("Missing gameId")
		return
	}

	h.mu.Lock()
	laneGame, ok := h.LaneGames[gameID]
	if !ok {
		h.mu.Unlock()
		client.sendError("Game not found")
		return
	}

	if laneGame.Status != models.LaneStatusPlaying {
		h.mu.Unlock()
		client.sendError("Game is not in progress")
		return
	}

	// Verify this player belongs to the game
	var reconnectedPlayer *models.LanePlayer
	if laneGame.Player1 != nil && laneGame.Player1.ID == client.PlayerID {
		reconnectedPlayer = laneGame.Player1
	} else if laneGame.Player2 != nil && laneGame.Player2.ID == client.PlayerID {
		reconnectedPlayer = laneGame.Player2
	}

	if reconnectedPlayer == nil {
		h.mu.Unlock()
		client.sendError("Player not in this game")
		return
	}

	log.Printf("Player %s reconnecting to game %s", client.Username, gameID)

	// Update connection
	reconnectedPlayer.ConnectionID = client.ID
	client.mu.Lock()
	client.GameID = gameID
	client.mu.Unlock()

	// Clear disconnect state
	laneGame.DisconnectedPlayerID = ""
	laneGame.DisconnectTime = time.Time{}

	// Cancel disconnect timer
	if timer, ok := h.DisconnectTimers[gameID]; ok {
		timer.Stop()
		delete(h.DisconnectTimers, gameID)
	}

	h.mu.Unlock()

	// Send full game state to reconnected player
	msg := WSMessage{
		Type: MsgReconnect,
		Payload: map[string]interface{}{
			"gameId": laneGame.ID,
			"side":   reconnectedPlayer.Side.String(),
			"game":   laneGame,
		},
	}
	data, _ := json.Marshal(msg)
	client.Send <- data

	// Notify opponent that player reconnected
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgQueueStatus,
		Payload: map[string]interface{}{
			"status":  "reconnected",
			"player":  reconnectedPlayer.Side.String(),
			"gameId":  laneGame.ID,
		},
	})

	// Restart turn timer if it's the reconnected player's turn
	if laneGame.CurrentPlayer == reconnectedPlayer.Side && laneGame.CurrentPhase == models.PhasePerkSelection {
		h.startTurnTimer(laneGame)
	}
}

// finalizeGame records game results, calculates ELO, and cleans up
func (h *Hub) finalizeGame(laneGame *models.LaneGame, winner models.PlayerSide) {
	if h.DB == nil {
		return
	}

	var winnerID string
	var loserID string
	var winnerRating, loserRating int

	if winner == models.Player1 {
		winnerID = laneGame.Player1.ID
		loserID = laneGame.Player2.ID
	} else {
		winnerID = laneGame.Player2.ID
		loserID = laneGame.Player1.ID
	}

	// Get current ratings
	winnerUser, err := h.DB.GetUser(winnerID)
	if err == nil && winnerUser != nil {
		winnerRating = winnerUser.Rating
	}
	loserUser, err := h.DB.GetUser(loserID)
	if err == nil && loserUser != nil {
		loserRating = loserUser.Rating
	}

	// Calculate new ELO
	newWinnerRating, newLoserRating := game.CalculateELO(winnerRating, loserRating, 1.0)

	// Update DB
	_ = h.DB.FinishGame(laneGame.ID, winnerID, laneGame.Player1LanesWon, laneGame.Player2LanesWon)
	_ = h.DB.UpdateUserRating(winnerID, newWinnerRating)
	_ = h.DB.UpdateUserRating(loserID, newLoserRating)
	_ = h.DB.UpdateUserStats(winnerID, true, false, false)
	_ = h.DB.UpdateUserStats(loserID, false, true, false)

	// Broadcast game result with rating changes
	h.broadcastToGame(laneGame, WSMessage{
		Type: MsgGameResult,
		Payload: map[string]interface{}{
			"gameId": laneGame.ID,
			"winner": winner.String(),
			"player1RatingChange": func() int {
				if winner == models.Player1 {
					return newWinnerRating - winnerRating
				}
				return newLoserRating - loserRating
			}(),
			"player2RatingChange": func() int {
				if winner == models.Player2 {
					return newWinnerRating - winnerRating
				}
				return newLoserRating - loserRating
			}(),
			"player1NewRating": func() int {
				if winner == models.Player1 {
					return newWinnerRating
				}
				return newLoserRating
			}(),
			"player2NewRating": func() int {
				if winner == models.Player2 {
					return newWinnerRating
				}
				return newLoserRating
			}(),
		},
	})

	// Clean up game after 5 minutes
	time.AfterFunc(5*time.Minute, func() {
		h.mu.Lock()
		delete(h.LaneGames, laneGame.ID)
		h.mu.Unlock()
	})
}
