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
	MsgConnect              MessageType = "connect"
	MsgDisconnect           MessageType = "disconnect"
	MsgJoinGame             MessageType = "joinGame"
	MsgLeaveGame            MessageType = "leaveGame"
	MsgMakeMove             MessageType = "makeMove"
	MsgUsePerk              MessageType = "usePerk"
	MsgGameState            MessageType = "gameState"
	MsgError                MessageType = "error"
	MsgMatchFound           MessageType = "matchFound"
	MsgOpponentDisconnected MessageType = "opponentDisconnected"

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

	// Multiplayer Room Message Types
	MsgCreateRoom          MessageType = "createRoom"
	MsgJoinRoom            MessageType = "joinRoom"
	MsgRoomCreated         MessageType = "roomCreated"
	MsgRoomJoined          MessageType = "roomJoined"
	MsgCancelMatchmaking   MessageType = "cancelMatchmaking"
	MsgMatchmakingCanceled MessageType = "matchmakingCanceled"
	MsgFindMatch           MessageType = "findMatch"
	MsgMatchmakingStarted  MessageType = "matchmakingStarted"
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
	Games       map[string]*models.Game
	LaneGames   map[string]*models.LaneGame // V2 lane games
	Register    chan *Client
	Unregister  chan *Client
	Broadcast   chan []byte
	Matchmaker  *matchmaking.Matchmaker
	RoomManager *matchmaking.RoomManager
	DB          *database.DB
	mu          sync.RWMutex
}

// NewHub creates a new Hub
func NewHub(mm *matchmaking.Matchmaker, rm *matchmaking.RoomManager, db *database.DB) *Hub {
	return &Hub{
		Clients:     make(map[string]*Client),
		Games:       make(map[string]*models.Game),
		LaneGames:   make(map[string]*models.LaneGame),
		Register:    make(chan *Client),
		Unregister:  make(chan *Client),
		Broadcast:   make(chan []byte),
		Matchmaker:  mm,
		RoomManager: rm,
		DB:          db,
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

				// Cancel any pending room
				h.RoomManager.CancelRoom(client.ID)

				// Remove from matchmaking queue
				h.Matchmaker.RemovePlayer(client.PlayerID)

				// Notify opponent if in game
				if client.GameID != "" {
					h.handlePlayerDisconnect(client)
					h.handleLanePlayerDisconnect(client)
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

// handleLanePlayerDisconnect notifies opponent when a player disconnects from a lane game
func (h *Hub) handleLanePlayerDisconnect(client *Client) {
	laneGame, ok := h.LaneGames[client.GameID]
	if !ok {
		return
	}

	// Find opponent
	var opponentConnID string
	if laneGame.Player1 != nil && laneGame.Player1.ConnectionID != client.ID && laneGame.Player1.ConnectionID != "" {
		opponentConnID = laneGame.Player1.ConnectionID
	} else if laneGame.Player2 != nil && laneGame.Player2.ConnectionID != client.ID && laneGame.Player2.ConnectionID != "" {
		opponentConnID = laneGame.Player2.ConnectionID
	}

	if opponentConnID != "" {
		if opponent, ok := h.Clients[opponentConnID]; ok {
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
	case MsgJoinGame:
		c.handleJoinGame(msg.Payload)
	case MsgMakeMove:
		c.handleMakeMove(msg.Payload)
	case MsgUsePerk:
		c.handleUsePerk(msg.Payload)
	case MsgLeaveGame:
		c.handleLeaveGame(msg.Payload)
	// V2 Lane Game handlers
	case MsgJoinLaneGame:
		c.handleJoinLaneGame(msg.Payload)
	case MsgSelectPerk:
		c.handleSelectPerk(msg.Payload)
	// Multiplayer room handlers
	case MsgCreateRoom:
		c.handleCreateRoom(msg.Payload)
	case MsgJoinRoom:
		c.handleJoinRoom(msg.Payload)
	case MsgCancelMatchmaking:
		c.handleCancelMatchmaking(msg.Payload)
	case MsgFindMatch:
		c.handleFindMatch(msg.Payload)
	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// handleJoinGame processes game join requests
func (c *Client) handleJoinGame(payload map[string]interface{}) {
	heroType, _ := payload["heroType"].(string)
	vsAI, _ := payload["vsAI"].(bool)
	aiDifficulty, _ := payload["aiDifficulty"].(string)

	if vsAI {
		// Create AI game immediately
		game := models.NewGame()
		game.IsAIGame = true
		game.AIDifficulty = aiDifficulty
		game.Status = models.StatusPlaying

		game.Player1 = &models.Player{
			ID:             c.PlayerID,
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
			ID:           c.PlayerID,
			ConnectionID: c.ID,
			HeroType:     heroType,
			GameType:     matchmaking.GameTypeChess,
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
		// Add to lane game matchmaking queue
		c.Hub.Matchmaker.AddPlayer(&matchmaking.QueuedPlayer{
			ID:           c.PlayerID,
			ConnectionID: c.ID,
			HeroType:     heroType,
			GameType:     matchmaking.GameTypeLaneGame,
			JoinedAt:     time.Now(),
		})

		log.Printf("Player %s added to lane game matchmaking queue", c.PlayerID)

		// Check for match
		go c.checkForLaneMatch()
	}
}

// executeLaneGameTurn executes the current player's turn
func (c *Client) executeLaneGameTurn(laneGame *models.LaneGame) {
	c.Hub.mu.Lock()

	if laneGame.Status != models.LaneStatusPlaying {
		c.Hub.mu.Unlock()
		return
	}

	engine := game.NewLaneEngine(laneGame)

	// Execute auto-placement phase
	autoResult := engine.ExecuteAutoPlacement()

	// Broadcast auto-placement notification to all players
	c.broadcastAutoPlacementLocked(laneGame, autoResult)

	// Check if game ended
	if autoResult.GameWinner != 0 {
		c.broadcastGameWonLocked(laneGame, autoResult.GameWinner)
		c.Hub.mu.Unlock()
		return
	}

	// Check if lane was won
	if autoResult.LaneWinner != 0 {
		c.broadcastLaneWonLocked(laneGame, autoResult.LaneIndex, autoResult.LaneWinner)
	}

	// Broadcast updated game state with perk options to all players
	c.broadcastLaneGameStateLocked(laneGame)
	c.Hub.mu.Unlock()

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

	if laneGame.Status != models.LaneStatusPlaying {
		c.Hub.mu.Unlock()
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

	// Broadcast perk result to all players
	c.broadcastPerkResultLocked(laneGame, result)

	// Check if game ended
	if result.GameWinner != 0 {
		c.broadcastGameWonLocked(laneGame, result.GameWinner)
		c.Hub.mu.Unlock()
		return
	}

	// Check if lane was won
	if result.LaneWinner != 0 {
		c.broadcastLaneWonLocked(laneGame, result.LaneIndex, result.LaneWinner)
	}

	// Broadcast updated game state
	c.broadcastLaneGameStateLocked(laneGame)
	c.Hub.mu.Unlock()

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

	// Broadcast perk result to all players
	c.broadcastPerkResultLocked(laneGame, result)

	// Check if game ended
	if result.GameWinner != 0 {
		c.broadcastGameWonLocked(laneGame, result.GameWinner)
		c.Hub.mu.Unlock()
		return
	}

	// Check if lane was won
	if result.LaneWinner != 0 {
		c.broadcastLaneWonLocked(laneGame, result.LaneIndex, result.LaneWinner)
	}

	// Broadcast updated game state to all players
	c.broadcastLaneGameStateLocked(laneGame)
	c.Hub.mu.Unlock()

	// If AI game and now AI's turn, start AI turn
	if laneGame.IsAIGame && laneGame.CurrentPlayer == models.Player2 {
		go func() {
			// AI auto-placement
			c.Hub.mu.Lock()
			engine := game.NewLaneEngine(laneGame)
			autoResult := engine.ExecuteAutoPlacement()
			c.broadcastAutoPlacementLocked(laneGame, autoResult)

			if autoResult.GameWinner != 0 {
				c.broadcastGameWonLocked(laneGame, autoResult.GameWinner)
				c.Hub.mu.Unlock()
				return
			}

			if autoResult.LaneWinner != 0 {
				c.broadcastLaneWonLocked(laneGame, autoResult.LaneIndex, autoResult.LaneWinner)
			}

			c.broadcastLaneGameStateLocked(laneGame)
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

// broadcastLaneGameStateLocked sends lane game state to all players (caller holds Hub.mu lock)
func (c *Client) broadcastLaneGameStateLocked(laneGame *models.LaneGame) {
	msg := WSMessage{
		Type: MsgLaneGameState,
		Payload: map[string]interface{}{
			"game": laneGame,
		},
	}
	c.broadcastToLaneGameLocked(laneGame, msg)
}

// broadcastAutoPlacementLocked sends auto-placement notification to all players (caller holds Hub.mu lock)
func (c *Client) broadcastAutoPlacementLocked(laneGame *models.LaneGame, result *game.TurnResult) {
	msg := WSMessage{
		Type: MsgAutoPlacement,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"player":    laneGame.CurrentPlayer.String(),
			"laneIndex": result.LaneIndex,
			"success":   result.Success,
		},
	}
	c.broadcastToLaneGameLocked(laneGame, msg)
}

// broadcastPerkResultLocked sends perk result to all players (caller holds Hub.mu lock)
func (c *Client) broadcastPerkResultLocked(laneGame *models.LaneGame, result *game.TurnResult) {
	msg := WSMessage{
		Type: MsgPerkResult,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"perkId":    result.PerkExecuted,
			"laneIndex": result.LaneIndex,
			"success":   result.Success,
			"error":     result.Error,
		},
	}
	c.broadcastToLaneGameLocked(laneGame, msg)
}

// broadcastLaneWonLocked sends lane won notification to all players (caller holds Hub.mu lock)
func (c *Client) broadcastLaneWonLocked(laneGame *models.LaneGame, laneIndex int, winner models.PlayerSide) {
	msg := WSMessage{
		Type: MsgLaneWon,
		Payload: map[string]interface{}{
			"gameId":    laneGame.ID,
			"laneIndex": laneIndex,
			"winner":    winner.String(),
		},
	}
	c.broadcastToLaneGameLocked(laneGame, msg)
}

// broadcastGameWonLocked sends game won notification to all players (caller holds Hub.mu lock)
func (c *Client) broadcastGameWonLocked(laneGame *models.LaneGame, winner models.PlayerSide) {
	msg := WSMessage{
		Type: MsgGameWon,
		Payload: map[string]interface{}{
			"gameId": laneGame.ID,
			"winner": winner.String(),
		},
	}
	c.broadcastToLaneGameLocked(laneGame, msg)
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

// broadcastToLaneGame sends a message to all human players in a lane game
// Must be called WITHOUT holding Hub.mu lock
func (c *Client) broadcastToLaneGame(laneGame *models.LaneGame, msg WSMessage) {
	data, _ := json.Marshal(msg)

	c.Hub.mu.RLock()
	defer c.Hub.mu.RUnlock()

	if laneGame.Player1 != nil && laneGame.Player1.ConnectionID != "" {
		if client, ok := c.Hub.Clients[laneGame.Player1.ConnectionID]; ok {
			client.Send <- data
		}
	}

	if laneGame.Player2 != nil && laneGame.Player2.ConnectionID != "" {
		if client, ok := c.Hub.Clients[laneGame.Player2.ConnectionID]; ok {
			client.Send <- data
		}
	}
}

// broadcastToLaneGameLocked sends a message to all human players in a lane game
// Must be called while already holding Hub.mu lock
func (c *Client) broadcastToLaneGameLocked(laneGame *models.LaneGame, msg WSMessage) {
	data, _ := json.Marshal(msg)

	if laneGame.Player1 != nil && laneGame.Player1.ConnectionID != "" {
		if client, ok := c.Hub.Clients[laneGame.Player1.ConnectionID]; ok {
			client.Send <- data
		}
	}

	if laneGame.Player2 != nil && laneGame.Player2.ConnectionID != "" {
		if client, ok := c.Hub.Clients[laneGame.Player2.ConnectionID]; ok {
			client.Send <- data
		}
	}
}

// ============================================================================
// Multiplayer Room & Matchmaking Handlers
// ============================================================================

// handleCreateRoom creates a private room for a friend to join
func (c *Client) handleCreateRoom(payload map[string]interface{}) {
	heroType, _ := payload["heroType"].(string)
	gameTypeStr, _ := payload["gameType"].(string)

	gameType := matchmaking.GameTypeLaneGame
	if gameTypeStr == "chess" {
		gameType = matchmaking.GameTypeChess
	}

	room := c.Hub.RoomManager.CreateRoom(gameType, c.PlayerID, c.ID, heroType)

	log.Printf("Room created: %s by player %s (type: %s)", room.Code, c.PlayerID, gameType)

	msg := WSMessage{
		Type: MsgRoomCreated,
		Payload: map[string]interface{}{
			"roomCode": room.Code,
			"gameType": string(gameType),
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data
}

// handleJoinRoom joins an existing room by code
func (c *Client) handleJoinRoom(payload map[string]interface{}) {
	roomCode, _ := payload["roomCode"].(string)
	heroType, _ := payload["heroType"].(string)

	room, err := c.Hub.RoomManager.JoinRoom(roomCode, c.PlayerID, c.ID, heroType)
	if err != nil {
		c.sendError(err.Error())
		return
	}

	log.Printf("Room %s joined by player %s", roomCode, c.PlayerID)

	if room.GameType == matchmaking.GameTypeLaneGame {
		c.startLaneGameFromRoom(room)
	} else {
		c.startChessGameFromRoom(room)
	}
}

// handleCancelMatchmaking cancels matchmaking or room waiting
func (c *Client) handleCancelMatchmaking(payload map[string]interface{}) {
	// Remove from matchmaking queue
	c.Hub.Matchmaker.RemovePlayer(c.PlayerID)

	// Cancel any room the player created
	c.Hub.RoomManager.CancelRoom(c.ID)

	msg := WSMessage{
		Type: MsgMatchmakingCanceled,
		Payload: map[string]interface{}{
			"message": "Matchmaking canceled",
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data

	log.Printf("Player %s canceled matchmaking", c.PlayerID)
}

// handleFindMatch starts random matchmaking for a game type
func (c *Client) handleFindMatch(payload map[string]interface{}) {
	heroType, _ := payload["heroType"].(string)
	gameTypeStr, _ := payload["gameType"].(string)

	gameType := matchmaking.GameTypeLaneGame
	if gameTypeStr == "chess" {
		gameType = matchmaking.GameTypeChess
	}

	c.Hub.Matchmaker.AddPlayer(&matchmaking.QueuedPlayer{
		ID:           c.PlayerID,
		ConnectionID: c.ID,
		HeroType:     heroType,
		GameType:     gameType,
		JoinedAt:     time.Now(),
	})

	// Send confirmation
	msg := WSMessage{
		Type: MsgMatchmakingStarted,
		Payload: map[string]interface{}{
			"gameType":    string(gameType),
			"queueLength": c.Hub.Matchmaker.GetQueueLength(),
		},
	}
	data, _ := json.Marshal(msg)
	c.Send <- data

	log.Printf("Player %s started matchmaking for %s", c.PlayerID, gameType)

	// Check for match based on game type
	if gameType == matchmaking.GameTypeLaneGame {
		go c.checkForLaneMatch()
	} else {
		go c.checkForMatch()
	}
}

// checkForLaneMatch looks for a lane game match in the queue
func (c *Client) checkForLaneMatch() {
	match := c.Hub.Matchmaker.FindMatch(c.PlayerID)
	if match == nil {
		return
	}

	c.startLaneGameWithPlayers(
		match.Player1.ID, match.Player1.ConnectionID, match.Player1.HeroType,
		match.Player2.ID, match.Player2.ConnectionID, match.Player2.HeroType,
	)
}

// startLaneGameFromRoom creates a lane game from a matched room
func (c *Client) startLaneGameFromRoom(room *matchmaking.Room) {
	c.startLaneGameWithPlayers(
		room.CreatorID, room.CreatorConnID, room.CreatorHero,
		room.JoinerID, room.JoinerConnID, room.JoinerHero,
	)
}

// startLaneGameWithPlayers creates and starts a multiplayer lane game
func (c *Client) startLaneGameWithPlayers(p1ID, p1ConnID, p1Hero, p2ID, p2ConnID, p2Hero string) {
	laneGame := models.NewLaneGame()
	laneGame.IsAIGame = false
	laneGame.Status = models.LaneStatusPlaying

	laneGame.Player1 = &models.LanePlayer{
		ID:           p1ID,
		ConnectionID: p1ConnID,
		HeroType:     models.HeroType(p1Hero),
		Side:         models.Player1,
	}

	laneGame.Player2 = &models.LanePlayer{
		ID:           p2ID,
		ConnectionID: p2ConnID,
		HeroType:     models.HeroType(p2Hero),
		Side:         models.Player2,
	}

	c.Hub.mu.Lock()
	c.Hub.LaneGames[laneGame.ID] = laneGame

	// Update both client game IDs
	if client1, ok := c.Hub.Clients[p1ConnID]; ok {
		client1.mu.Lock()
		client1.GameID = laneGame.ID
		client1.mu.Unlock()
	}
	if client2, ok := c.Hub.Clients[p2ConnID]; ok {
		client2.mu.Lock()
		client2.GameID = laneGame.ID
		client2.mu.Unlock()
	}
	c.Hub.mu.Unlock()

	log.Printf("Multiplayer lane game created: %s (P1: %s, P2: %s)", laneGame.ID, p1ID, p2ID)

	// Notify both players
	c.Hub.mu.RLock()
	if client1, ok := c.Hub.Clients[p1ConnID]; ok {
		client1.sendLaneMatchFound(laneGame, models.Player1)
	}
	if client2, ok := c.Hub.Clients[p2ConnID]; ok {
		client2.sendLaneMatchFound(laneGame, models.Player2)
	}
	c.Hub.mu.RUnlock()

	// Start the game - execute first turn auto-placement
	go c.executeLaneGameTurn(laneGame)
}

// startChessGameFromRoom creates a chess game from a matched room
func (c *Client) startChessGameFromRoom(room *matchmaking.Room) {
	game := models.NewGame()
	game.Status = models.StatusPlaying

	game.Player1 = &models.Player{
		ID:             room.CreatorID,
		ConnectionID:   room.CreatorConnID,
		HeroType:       models.HeroType(room.CreatorHero),
		Color:          models.White,
		PerksRemaining: models.GetHeroPerks(models.HeroType(room.CreatorHero)),
	}

	game.Player2 = &models.Player{
		ID:             room.JoinerID,
		ConnectionID:   room.JoinerConnID,
		HeroType:       models.HeroType(room.JoinerHero),
		Color:          models.Black,
		PerksRemaining: models.GetHeroPerks(models.HeroType(room.JoinerHero)),
	}

	c.Hub.mu.Lock()
	c.Hub.Games[game.ID] = game

	if client1, ok := c.Hub.Clients[room.CreatorConnID]; ok {
		client1.mu.Lock()
		client1.GameID = game.ID
		client1.mu.Unlock()
	}
	if client2, ok := c.Hub.Clients[room.JoinerConnID]; ok {
		client2.mu.Lock()
		client2.GameID = game.ID
		client2.mu.Unlock()
	}
	c.Hub.mu.Unlock()

	// Notify both players
	c.Hub.mu.RLock()
	if client1, ok := c.Hub.Clients[room.CreatorConnID]; ok {
		client1.sendMatchFound(game, models.White)
	}
	if client2, ok := c.Hub.Clients[room.JoinerConnID]; ok {
		client2.sendMatchFound(game, models.Black)
	}
	c.Hub.mu.RUnlock()
}
