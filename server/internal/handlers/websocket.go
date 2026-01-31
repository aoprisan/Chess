package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/kiddiechess/server/internal/matchmaking"
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
	MsgConnect             MessageType = "connect"
	MsgDisconnect          MessageType = "disconnect"
	MsgJoinGame            MessageType = "joinGame"
	MsgLeaveGame           MessageType = "leaveGame"
	MsgMakeMove            MessageType = "makeMove"
	MsgUsePerk             MessageType = "usePerk"
	MsgGameState           MessageType = "gameState"
	MsgError               MessageType = "error"
	MsgMatchFound          MessageType = "matchFound"
	MsgOpponentDisconnected MessageType = "opponentDisconnected"
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
	GameID   string
	mu       sync.Mutex
}

// Hub manages all active clients and games
type Hub struct {
	Clients     map[string]*Client
	Games       map[string]*models.Game
	Register    chan *Client
	Unregister  chan *Client
	Broadcast   chan []byte
	Matchmaker  *matchmaking.Matchmaker
	mu          sync.RWMutex
}

// NewHub creates a new Hub
func NewHub(mm *matchmaking.Matchmaker) *Hub {
	return &Hub{
		Clients:    make(map[string]*Client),
		Games:      make(map[string]*models.Game),
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		Broadcast:  make(chan []byte),
		Matchmaker: mm,
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

				// Notify opponent if in game
				if client.GameID != "" {
					h.handlePlayerDisconnect(client)
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

// handlePlayerDisconnect notifies opponent when a player disconnects
func (h *Hub) handlePlayerDisconnect(client *Client) {
	game, ok := h.Games[client.GameID]
	if !ok {
		return
	}

	// Find opponent
	var opponentID string
	if game.Player1 != nil && game.Player1.ConnectionID != client.ID && game.Player1.ConnectionID != "" {
		opponentID = game.Player1.ConnectionID
	} else if game.Player2 != nil && game.Player2.ConnectionID != client.ID && game.Player2.ConnectionID != "" {
		opponentID = game.Player2.ConnectionID
	}

	if opponentID != "" {
		if opponent, ok := h.Clients[opponentID]; ok {
			msg := WSMessage{
				Type: MsgOpponentDisconnected,
				Payload: map[string]interface{}{
					"gameId": client.GameID,
				},
			}
			data, _ := json.Marshal(msg)
			opponent.Send <- data
		}
	}
}

// ServeWS handles WebSocket upgrade requests
func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	client := &Client{
		ID:   uuid.New().String(),
		Hub:  hub,
		Conn: conn,
		Send: make(chan []byte, 256),
	}

	hub.Register <- client

	// Send connection confirmation
	msg := WSMessage{
		Type: MsgConnect,
		Payload: map[string]interface{}{
			"clientId": client.ID,
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
	case MsgJoinGame:
		c.handleJoinGame(msg.Payload)
	case MsgMakeMove:
		c.handleMakeMove(msg.Payload)
	case MsgUsePerk:
		c.handleUsePerk(msg.Payload)
	case MsgLeaveGame:
		c.handleLeaveGame(msg.Payload)
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// handleJoinGame processes game join requests
func (c *Client) handleJoinGame(payload map[string]interface{}) {
	playerID, _ := payload["playerId"].(string)
	heroType, _ := payload["heroType"].(string)
	vsAI, _ := payload["vsAI"].(bool)
	aiDifficulty, _ := payload["aiDifficulty"].(string)

	c.PlayerID = playerID

	if vsAI {
		// Create AI game immediately
		game := models.NewGame()
		game.IsAIGame = true
		game.AIDifficulty = aiDifficulty
		game.Status = models.StatusPlaying

		game.Player1 = &models.Player{
			ID:             playerID,
			ConnectionID:   c.ID,
			HeroType:       models.HeroType(heroType),
			Color:          models.White,
			PerksRemaining: models.GetHeroPerks(models.HeroType(heroType)),
		}

		c.Hub.mu.Lock()
		c.Hub.Games[game.ID] = game
		c.mu.Lock()
		c.GameID = game.ID
		c.mu.Unlock()
		c.Hub.mu.Unlock()

		// Send game state
		c.sendGameState(game)
	} else {
		// Add to matchmaking queue
		c.Hub.Matchmaker.AddPlayer(&matchmaking.QueuedPlayer{
			ID:           playerID,
			ConnectionID: c.ID,
			HeroType:     heroType,
			JoinedAt:     time.Now(),
		})

		// Check for match
		go c.checkForMatch()
	}
}

// checkForMatch looks for a match in the queue
func (c *Client) checkForMatch() {
	match := c.Hub.Matchmaker.FindMatch(c.PlayerID)
	if match == nil {
		return
	}

	// Create game
	game := models.NewGame()
	game.Status = models.StatusPlaying

	game.Player1 = &models.Player{
		ID:             match.Player1.ID,
		ConnectionID:   match.Player1.ConnectionID,
		HeroType:       models.HeroType(match.Player1.HeroType),
		Color:          models.White,
		PerksRemaining: models.GetHeroPerks(models.HeroType(match.Player1.HeroType)),
	}

	game.Player2 = &models.Player{
		ID:             match.Player2.ID,
		ConnectionID:   match.Player2.ConnectionID,
		HeroType:       models.HeroType(match.Player2.HeroType),
		Color:          models.Black,
		PerksRemaining: models.GetHeroPerks(models.HeroType(match.Player2.HeroType)),
	}

	c.Hub.mu.Lock()
	c.Hub.Games[game.ID] = game

	// Update client game IDs
	if client1, ok := c.Hub.Clients[match.Player1.ConnectionID]; ok {
		client1.mu.Lock()
		client1.GameID = game.ID
		client1.mu.Unlock()
	}
	if client2, ok := c.Hub.Clients[match.Player2.ConnectionID]; ok {
		client2.mu.Lock()
		client2.GameID = game.ID
		client2.mu.Unlock()
	}
	c.Hub.mu.Unlock()

	// Notify both players
	c.Hub.mu.RLock()
	if client1, ok := c.Hub.Clients[match.Player1.ConnectionID]; ok {
		client1.sendMatchFound(game, models.White)
	}
	if client2, ok := c.Hub.Clients[match.Player2.ConnectionID]; ok {
		client2.sendMatchFound(game, models.Black)
	}
	c.Hub.mu.RUnlock()
}

// sendMatchFound sends match found notification
func (c *Client) sendMatchFound(game *models.Game, color models.PlayerColor) {
	msg := WSMessage{
		Type: MsgMatchFound,
		Payload: map[string]interface{}{
			"gameId": game.ID,
			"color":  color,
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data

	c.sendGameState(game)
}

// sendGameState sends current game state to client
func (c *Client) sendGameState(game *models.Game) {
	msg := WSMessage{
		Type: MsgGameState,
		Payload: map[string]interface{}{
			"game": game,
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// handleMakeMove processes move requests
func (c *Client) handleMakeMove(payload map[string]interface{}) {
	gameID, _ := payload["gameId"].(string)
	fromRow := int(payload["fromRow"].(float64))
	fromCol := int(payload["fromCol"].(float64))
	toRow := int(payload["toRow"].(float64))
	toCol := int(payload["toCol"].(float64))

	c.Hub.mu.Lock()
	game, ok := c.Hub.Games[gameID]
	if !ok {
		c.Hub.mu.Unlock()
		c.sendError("Game not found")
		return
	}

	// Validate move (simplified - full validation would be more complex)
	piece := game.GetPieceAt(fromRow, fromCol)
	if piece == nil {
		c.Hub.mu.Unlock()
		c.sendError("No piece at source position")
		return
	}

	// Apply move
	capturedPiece := game.GetPieceAt(toRow, toCol)

	// Update pieces
	newPieces := make([]models.ChessPiece, 0, len(game.Pieces))
	for _, p := range game.Pieces {
		if p.Row == fromRow && p.Col == fromCol {
			// Move piece
			newPieces = append(newPieces, models.ChessPiece{
				Type:     p.Type,
				Color:    p.Color,
				Row:      toRow,
				Col:      toCol,
				HasMoved: true,
			})
		} else if p.Row == toRow && p.Col == toCol {
			// Skip captured piece
			continue
		} else {
			newPieces = append(newPieces, p)
		}
	}
	game.Pieces = newPieces

	// Record move
	move := models.Move{
		FromRow:       fromRow,
		FromCol:       fromCol,
		ToRow:         toRow,
		ToCol:         toCol,
		CapturedPiece: capturedPiece,
	}
	game.MoveHistory = append(game.MoveHistory, move)

	// Switch turns
	if game.CurrentTurn == models.White {
		game.CurrentTurn = models.Black
	} else {
		game.CurrentTurn = models.White
	}

	game.UpdatedAt = time.Now()
	c.Hub.mu.Unlock()

	// Broadcast updated state to both players
	c.broadcastGameState(game)
}

// handleUsePerk processes perk usage requests
func (c *Client) handleUsePerk(payload map[string]interface{}) {
	gameID, _ := payload["gameId"].(string)
	perk, _ := payload["perk"].(string)
	// perkData, _ := payload["data"].(map[string]interface{})

	c.Hub.mu.Lock()
	game, ok := c.Hub.Games[gameID]
	if !ok {
		c.Hub.mu.Unlock()
		c.sendError("Game not found")
		return
	}

	// Find player and validate perk usage
	var player *models.Player
	if game.Player1 != nil && game.Player1.ConnectionID == c.ID {
		player = game.Player1
	} else if game.Player2 != nil && game.Player2.ConnectionID == c.ID {
		player = game.Player2
	}

	if player == nil {
		c.Hub.mu.Unlock()
		c.sendError("Player not in game")
		return
	}

	perkEnum := models.Perk(perk)
	remaining, ok := player.PerksRemaining[perkEnum]
	if !ok || remaining <= 0 {
		c.Hub.mu.Unlock()
		c.sendError("Perk not available")
		return
	}

	// Use perk
	player.PerksRemaining[perkEnum]--

	// Apply perk effect (simplified)
	switch perkEnum {
	case models.PerkFreeze:
		if game.Player1 == player {
			game.Player2.IsFrozen = true
		} else {
			game.Player1.IsFrozen = true
		}
	case models.PerkAnotherMove:
		// Player gets another turn (don't switch)
	// Other perks would be implemented here
	}

	game.UpdatedAt = time.Now()
	c.Hub.mu.Unlock()

	c.broadcastGameState(game)
}

// handleLeaveGame processes leave game requests
func (c *Client) handleLeaveGame(payload map[string]interface{}) {
	c.mu.Lock()
	gameID := c.GameID
	c.GameID = ""
	c.mu.Unlock()

	if gameID != "" {
		c.Hub.mu.Lock()
		if game, ok := c.Hub.Games[gameID]; ok {
			game.Status = models.StatusResigned
		}
		c.Hub.mu.Unlock()
	}
}

// broadcastGameState sends game state to all players in the game
func (c *Client) broadcastGameState(game *models.Game) {
	c.Hub.mu.RLock()
	defer c.Hub.mu.RUnlock()

	if game.Player1 != nil {
		if client, ok := c.Hub.Clients[game.Player1.ConnectionID]; ok {
			client.sendGameState(game)
		}
	}

	if game.Player2 != nil {
		if client, ok := c.Hub.Clients[game.Player2.ConnectionID]; ok {
			client.sendGameState(game)
		}
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
