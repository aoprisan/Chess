package database

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

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
			player1_id TEXT NOT NULL,
			player2_id TEXT NOT NULL,
			player1_hero TEXT NOT NULL,
			player2_hero TEXT NOT NULL,
			winner_id TEXT,
			status TEXT DEFAULT 'playing',
			player1_lanes_won INTEGER DEFAULT 0,
			player2_lanes_won INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			finished_at DATETIME,
			FOREIGN KEY (player1_id) REFERENCES users(id),
			FOREIGN KEY (player2_id) REFERENCES users(id)
		)`,
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
		SELECT id, username, email, password_hash, is_guest, device_id, created_at, updated_at,
		       games_played, games_won, games_lost, games_drawn, rating
		FROM users WHERE username = ?
	`
	user := &User{}
	var isGuest int
	err := db.QueryRow(query, username).Scan(
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

// UpdateUserDeviceID updates the device_id for an existing user
func (db *DB) UpdateUserDeviceID(userID, deviceID string) error {
	query := `UPDATE users SET device_id = ?, updated_at = ? WHERE id = ?`
	_, err := db.Exec(query, deviceID, time.Now(), userID)
	return err
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

// CreateGame records a new game
func (db *DB) CreateGame(gameID, player1ID, player2ID, player1Hero, player2Hero string) error {
	query := `INSERT INTO games (id, player1_id, player2_id, player1_hero, player2_hero, created_at) VALUES (?, ?, ?, ?, ?, ?)`
	_, err := db.Exec(query, gameID, player1ID, player2ID, player1Hero, player2Hero, time.Now())
	return err
}

// FinishGame records game result
func (db *DB) FinishGame(gameID, winnerID string, p1LanesWon, p2LanesWon int) error {
	query := `UPDATE games SET winner_id = ?, status = 'finished', player1_lanes_won = ?, player2_lanes_won = ?, finished_at = ? WHERE id = ?`
	_, err := db.Exec(query, winnerID, p1LanesWon, p2LanesWon, time.Now(), gameID)
	return err
}

// UpdateUserRating updates a user's ELO rating
func (db *DB) UpdateUserRating(userID string, newRating int) error {
	query := `UPDATE users SET rating = ?, updated_at = ? WHERE id = ?`
	_, err := db.Exec(query, newRating, time.Now(), userID)
	return err
}

// GetUserRating returns a user's current rating
func (db *DB) GetUserRating(userID string) (int, error) {
	var rating int
	err := db.QueryRow(`SELECT rating FROM users WHERE id = ?`, userID).Scan(&rating)
	if err == sql.ErrNoRows {
		return 1200, nil
	}
	return rating, err
}
