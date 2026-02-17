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
	MsgJoinLaneGame      MessageType = "joinLaneGame"
	MsgLaneGameState     MessageType = "laneGameState"
	MsgAutoPlacement     MessageType = "autoPlacement"
	MsgSelectPerk        MessageType = "selectPerk"
	MsgPerkResult        MessageType = "perkResult"
	MsgTurnPhaseChanged  MessageType = "turnPhaseChanged"
	MsgLaneWon           MessageType = "laneWon"
	MsgGameWon           MessageType = "gameWon"
	MsgLaneMatchFound    MessageType = "laneMatchFound"
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

// Hub manages all active clients and games
type Hub struct {
	Clients     map[string]*Client
	LaneGames   map[string]*models.LaneGame // V2 lane games
	Register    chan *Client
	Unregister  chan *Client
	Broadcast   chan []byte
	DB          *database.DB
	mu          sync.RWMutex
}

// NewHub creates a new Hub
func NewHub(db *database.DB) *Hub {
	return &Hub{
		Clients:    make(map[string]*Client),
		LaneGames:  make(map[string]*models.LaneGame),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan []byte),
		DB:         db,
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
			h.mu.Lock()
			if _, ok := h.Clients[client.ID]; ok {
				delete(h.Clients, client.ID)
				close(client.Send)
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
	msg := WSMessage{
		Type: MsgConnect,
		Payload: map[string]interface{}{
			"clientId": client.ID,
			"playerId": claims.UserID,
			"username": claims.Username,
		},
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
		// For now, just create a single-player game
		// TODO: Implement matchmaking for V2
		c.sendError("Multiplayer V2 not yet implemented")
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

	// Send perk result
	c.sendPerkResult(laneGame, result)

	// Check if game ended
	if result.GameWinner != 0 {
		c.sendGameWon(laneGame, result.GameWinner)
		c.Hub.mu.Unlock()
		return
	}

	// Check if lane was won
	if result.LaneWinner != 0 {
		c.sendLaneWon(laneGame, result.LaneIndex, result.LaneWinner)
	}

	// Send updated game state
	c.sendLaneGameState(laneGame)
	c.Hub.mu.Unlock()

	// If AI game and now AI's turn, start AI turn
	if laneGame.IsAIGame && laneGame.CurrentPlayer == models.Player2 {
		go func() {
			// AI auto-placement
			c.Hub.mu.Lock()
			engine := game.NewLaneEngine(laneGame)
			autoResult := engine.ExecuteAutoPlacement()
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

			// AI perk selection
			c.executeAIPerkSelection(laneGame)
		}()
	} else if !laneGame.IsAIGame {
		// For multiplayer, execute next turn
		go c.executeLaneGameTurn(laneGame)
	} else {
		// Player's turn - execute auto-placement
		go c.executeLaneGameTurn(laneGame)
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
