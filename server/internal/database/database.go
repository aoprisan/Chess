package database

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/kiddiechess/server/internal/models"
	_ "modernc.org/sqlite"
)

// DB wraps the SQL database connection
type DB struct {
	*sql.DB
}

// New creates a new database connection and runs migrations
func New(dbPath string) (*DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign keys
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	// Enable WAL mode for better concurrent performance
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}

	wrapper := &DB{db}
	if err := wrapper.migrate(); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return wrapper, nil
}

// migrate runs database migrations
func (db *DB) migrate() error {
	migrations := []string{
		// Users table
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			email TEXT UNIQUE,
			password_hash TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			games_played INTEGER DEFAULT 0,
			games_won INTEGER DEFAULT 0,
			games_lost INTEGER DEFAULT 0,
			games_drawn INTEGER DEFAULT 0,
			rating INTEGER DEFAULT 1200
		)`,

		// Games table
		`CREATE TABLE IF NOT EXISTS games (
			id TEXT PRIMARY KEY,
			player1_id TEXT,
			player2_id TEXT,
			player1_hero TEXT,
			player2_hero TEXT,
			status TEXT NOT NULL DEFAULT 'waiting',
			winner_id TEXT,
			current_turn TEXT DEFAULT 'white',
			board_state TEXT,
			move_history TEXT,
			is_ai_game INTEGER DEFAULT 0,
			ai_difficulty TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			ended_at DATETIME,
			FOREIGN KEY (player1_id) REFERENCES users(id),
			FOREIGN KEY (player2_id) REFERENCES users(id),
			FOREIGN KEY (winner_id) REFERENCES users(id)
		)`,

		// Game moves table (for detailed move history)
		`CREATE TABLE IF NOT EXISTS game_moves (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			game_id TEXT NOT NULL,
			move_number INTEGER NOT NULL,
			player_id TEXT,
			from_row INTEGER NOT NULL,
			from_col INTEGER NOT NULL,
			to_row INTEGER NOT NULL,
			to_col INTEGER NOT NULL,
			piece_type TEXT NOT NULL,
			captured_piece TEXT,
			perk_used TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (game_id) REFERENCES games(id),
			FOREIGN KEY (player_id) REFERENCES users(id)
		)`,

		// Indexes
		`CREATE INDEX IF NOT EXISTS idx_games_player1 ON games(player1_id)`,
		`CREATE INDEX IF NOT EXISTS idx_games_player2 ON games(player2_id)`,
		`CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)`,
		`CREATE INDEX IF NOT EXISTS idx_game_moves_game ON game_moves(game_id)`,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %w\nSQL: %s", err, migration)
		}
	}

	// Safe column additions (swallow "duplicate column" errors for idempotency)
	alterMigrations := []string{
		`ALTER TABLE users ADD COLUMN is_guest INTEGER DEFAULT 1`,
		`ALTER TABLE users ADD COLUMN device_id TEXT`,
	}
	for _, m := range alterMigrations {
		if _, err := db.Exec(m); err != nil {
			if !strings.Contains(err.Error(), "duplicate column") {
				return fmt.Errorf("alter migration failed: %w\nSQL: %s", err, m)
			}
		}
	}

	// Index on device_id
	if _, err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_users_device_id ON users(device_id)`); err != nil {
		return fmt.Errorf("index migration failed: %w", err)
	}

	log.Println("Database migrations completed successfully")
	return nil
}

// User represents a user in the database
type User struct {
	ID           string
	Username     string
	Email        *string
	PasswordHash *string
	IsGuest      bool
	DeviceID     *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	GamesPlayed  int
	GamesWon     int
	GamesLost    int
	GamesDrawn   int
	Rating       int
}

// CreateUser creates a new user
func (db *DB) CreateUser(user *User) error {
	query := `
		INSERT INTO users (id, username, email, password_hash, is_guest, device_id, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	now := time.Now()
	isGuest := 0
	if user.IsGuest {
		isGuest = 1
	}
	_, err := db.Exec(query, user.ID, user.Username, user.Email, user.PasswordHash, isGuest, user.DeviceID, now, now)
	return err
}

// GetUser retrieves a user by ID
func (db *DB) GetUser(id string) (*User, error) {
	query := `
		SELECT id, username, email, password_hash, created_at, updated_at,
		       games_played, games_won, games_lost, games_drawn, rating
		FROM users WHERE id = ?
	`
	user := &User{}
	err := db.QueryRow(query, id).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.CreatedAt, &user.UpdatedAt, &user.GamesPlayed,
		&user.GamesWon, &user.GamesLost, &user.GamesDrawn, &user.Rating,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return user, err
}

// GetUserByUsername retrieves a user by username
func (db *DB) GetUserByUsername(username string) (*User, error) {
	query := `
		SELECT id, username, email, password_hash, created_at, updated_at,
		       games_played, games_won, games_lost, games_drawn, rating
		FROM users WHERE username = ?
	`
	user := &User{}
	err := db.QueryRow(query, username).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.CreatedAt, &user.UpdatedAt, &user.GamesPlayed,
		&user.GamesWon, &user.GamesLost, &user.GamesDrawn, &user.Rating,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return user, err
}

// GetUserByDeviceID retrieves a user by device ID
func (db *DB) GetUserByDeviceID(deviceID string) (*User, error) {
	query := `
		SELECT id, username, email, password_hash, is_guest, device_id, created_at, updated_at,
		       games_played, games_won, games_lost, games_drawn, rating
		FROM users WHERE device_id = ?
	`
	user := &User{}
	var isGuest int
	err := db.QueryRow(query, deviceID).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&isGuest, &user.DeviceID,
		&user.CreatedAt, &user.UpdatedAt, &user.GamesPlayed,
		&user.GamesWon, &user.GamesLost, &user.GamesDrawn, &user.Rating,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	user.IsGuest = isGuest == 1
	return user, err
}

// GetUserByEmail retrieves a user by email
func (db *DB) GetUserByEmail(email string) (*User, error) {
	query := `
		SELECT id, username, email, password_hash, is_guest, device_id, created_at, updated_at,
		       games_played, games_won, games_lost, games_drawn, rating
		FROM users WHERE email = ?
	`
	user := &User{}
	var isGuest int
	err := db.QueryRow(query, email).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&isGuest, &user.DeviceID,
		&user.CreatedAt, &user.UpdatedAt, &user.GamesPlayed,
		&user.GamesWon, &user.GamesLost, &user.GamesDrawn, &user.Rating,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	user.IsGuest = isGuest == 1
	return user, err
}

// UpgradeGuestAccount sets email, password_hash, and is_guest=0 for a guest user
func (db *DB) UpgradeGuestAccount(userID, email, passwordHash string) error {
	query := `UPDATE users SET email = ?, password_hash = ?, is_guest = 0, updated_at = ? WHERE id = ?`
	_, err := db.Exec(query, email, passwordHash, time.Now(), userID)
	return err
}

// UpdateUserStats updates user game statistics
func (db *DB) UpdateUserStats(userID string, won, lost, drawn bool) error {
	var query string
	if won {
		query = `UPDATE users SET games_played = games_played + 1, games_won = games_won + 1, updated_at = ? WHERE id = ?`
	} else if lost {
		query = `UPDATE users SET games_played = games_played + 1, games_lost = games_lost + 1, updated_at = ? WHERE id = ?`
	} else if drawn {
		query = `UPDATE users SET games_played = games_played + 1, games_drawn = games_drawn + 1, updated_at = ? WHERE id = ?`
	} else {
		query = `UPDATE users SET games_played = games_played + 1, updated_at = ? WHERE id = ?`
	}
	_, err := db.Exec(query, time.Now(), userID)
	return err
}

// GameRecord represents a game in the database
type GameRecord struct {
	ID           string
	Player1ID    *string
	Player2ID    *string
	Player1Hero  *string
	Player2Hero  *string
	Status       string
	WinnerID     *string
	CurrentTurn  string
	BoardState   string
	MoveHistory  string
	IsAIGame     bool
	AIDifficulty *string
	CreatedAt    time.Time
	UpdatedAt    time.Time
	EndedAt      *time.Time
}

// CreateGame creates a new game record
func (db *DB) CreateGame(game *models.Game) error {
	boardState, _ := json.Marshal(game.Pieces)
	moveHistory, _ := json.Marshal(game.MoveHistory)

	var player1ID, player2ID, player1Hero, player2Hero *string
	if game.Player1 != nil {
		player1ID = &game.Player1.ID
		hero := string(game.Player1.HeroType)
		player1Hero = &hero
	}
	if game.Player2 != nil {
		player2ID = &game.Player2.ID
		hero := string(game.Player2.HeroType)
		player2Hero = &hero
	}

	var aiDifficulty *string
	if game.AIDifficulty != "" {
		aiDifficulty = &game.AIDifficulty
	}

	query := `
		INSERT INTO games (id, player1_id, player2_id, player1_hero, player2_hero,
		                   status, current_turn, board_state, move_history,
		                   is_ai_game, ai_difficulty, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := db.Exec(query,
		game.ID, player1ID, player2ID, player1Hero, player2Hero,
		string(game.Status), string(game.CurrentTurn),
		string(boardState), string(moveHistory),
		game.IsAIGame, aiDifficulty,
		game.CreatedAt, game.UpdatedAt,
	)
	return err
}

// UpdateGame updates an existing game
func (db *DB) UpdateGame(game *models.Game) error {
	boardState, _ := json.Marshal(game.Pieces)
	moveHistory, _ := json.Marshal(game.MoveHistory)

	var winnerID *string
	if game.Winner != "" {
		// Determine winner ID based on color
		if game.Winner == models.White && game.Player1 != nil {
			winnerID = &game.Player1.ID
		} else if game.Winner == models.Black && game.Player2 != nil {
			winnerID = &game.Player2.ID
		}
	}

	query := `
		UPDATE games SET
			status = ?, current_turn = ?, board_state = ?,
			move_history = ?, winner_id = ?, updated_at = ?
		WHERE id = ?
	`
	_, err := db.Exec(query,
		string(game.Status), string(game.CurrentTurn),
		string(boardState), string(moveHistory),
		winnerID, time.Now(), game.ID,
	)
	return err
}

// GetGame retrieves a game by ID
func (db *DB) GetGame(id string) (*GameRecord, error) {
	query := `
		SELECT id, player1_id, player2_id, player1_hero, player2_hero,
		       status, winner_id, current_turn, board_state, move_history,
		       is_ai_game, ai_difficulty, created_at, updated_at, ended_at
		FROM games WHERE id = ?
	`
	game := &GameRecord{}
	err := db.QueryRow(query, id).Scan(
		&game.ID, &game.Player1ID, &game.Player2ID,
		&game.Player1Hero, &game.Player2Hero,
		&game.Status, &game.WinnerID, &game.CurrentTurn,
		&game.BoardState, &game.MoveHistory,
		&game.IsAIGame, &game.AIDifficulty,
		&game.CreatedAt, &game.UpdatedAt, &game.EndedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return game, err
}

// GetUserGames retrieves all games for a user
func (db *DB) GetUserGames(userID string, limit int) ([]*GameRecord, error) {
	query := `
		SELECT id, player1_id, player2_id, player1_hero, player2_hero,
		       status, winner_id, current_turn, board_state, move_history,
		       is_ai_game, ai_difficulty, created_at, updated_at, ended_at
		FROM games
		WHERE player1_id = ? OR player2_id = ?
		ORDER BY created_at DESC
		LIMIT ?
	`
	rows, err := db.Query(query, userID, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var games []*GameRecord
	for rows.Next() {
		game := &GameRecord{}
		err := rows.Scan(
			&game.ID, &game.Player1ID, &game.Player2ID,
			&game.Player1Hero, &game.Player2Hero,
			&game.Status, &game.WinnerID, &game.CurrentTurn,
			&game.BoardState, &game.MoveHistory,
			&game.IsAIGame, &game.AIDifficulty,
			&game.CreatedAt, &game.UpdatedAt, &game.EndedAt,
		)
		if err != nil {
			return nil, err
		}
		games = append(games, game)
	}
	return games, nil
}

// SaveMove saves a move to the game_moves table
func (db *DB) SaveMove(gameID string, moveNumber int, playerID string, move *models.Move, pieceType string) error {
	var capturedPiece, perkUsed *string
	if move.CapturedPiece != nil {
		cp := string(move.CapturedPiece.Type)
		capturedPiece = &cp
	}
	if move.PerkUsed != "" {
		pu := string(move.PerkUsed)
		perkUsed = &pu
	}

	query := `
		INSERT INTO game_moves (game_id, move_number, player_id, from_row, from_col,
		                        to_row, to_col, piece_type, captured_piece, perk_used)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := db.Exec(query,
		gameID, moveNumber, playerID,
		move.FromRow, move.FromCol, move.ToRow, move.ToCol,
		pieceType, capturedPiece, perkUsed,
	)
	return err
}

// GetLeaderboard returns top players by rating
func (db *DB) GetLeaderboard(limit int) ([]*User, error) {
	query := `
		SELECT id, username, email, password_hash, created_at, updated_at,
		       games_played, games_won, games_lost, games_drawn, rating
		FROM users
		WHERE games_played > 0
		ORDER BY rating DESC
		LIMIT ?
	`
	rows, err := db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		user := &User{}
		err := rows.Scan(
			&user.ID, &user.Username, &user.Email, &user.PasswordHash,
			&user.CreatedAt, &user.UpdatedAt, &user.GamesPlayed,
			&user.GamesWon, &user.GamesLost, &user.GamesDrawn, &user.Rating,
		)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}
