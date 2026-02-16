package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/kiddiechess/server/internal/auth"
	"github.com/kiddiechess/server/internal/database"
	"github.com/kiddiechess/server/internal/handlers"
	"github.com/kiddiechess/server/internal/matchmaking"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Database path (default to ./data/kiddiechess.db)
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/kiddiechess.db"
	}

	// Ensure data directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatal("Failed to create data directory: ", err)
	}

	// Initialize database
	db, err := database.New(dbPath)
	if err != nil {
		log.Fatal("Failed to initialize database: ", err)
	}
	defer db.Close()
	log.Println("Database initialized at", dbPath)

	// Initialize auth service
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "kiddiechess-dev-secret-change-in-production"
		log.Println("WARNING: Using default JWT_SECRET. Set JWT_SECRET env var in production!")
	}
	authSvc := auth.NewAuthService(jwtSecret)

	// Initialize matchmaking service
	mm := matchmaking.NewMatchmaker()
	go mm.Run()

	// Initialize WebSocket hub with database
	hub := handlers.NewHub(mm, db)
	go hub.Run()

	// WebSocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handlers.ServeWS(hub, authSvc, w, r)
	})

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// REST API endpoints
	http.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		handleUsers(db, w, r)
	})

	http.HandleFunc("/api/auth/guest", func(w http.ResponseWriter, r *http.Request) {
		handleAuthGuest(db, authSvc, w, r)
	})

	http.HandleFunc("/api/auth/login", func(w http.ResponseWriter, r *http.Request) {
		handleAuthLogin(db, authSvc, w, r)
	})

	http.HandleFunc("/api/auth/upgrade", func(w http.ResponseWriter, r *http.Request) {
		handleAuthUpgrade(db, authSvc, w, r)
	})

	http.HandleFunc("/api/leaderboard", func(w http.ResponseWriter, r *http.Request) {
		handleLeaderboard(db, w, r)
	})

	// Serve Flutter web build
	webDir := os.Getenv("WEB_DIR")
	if webDir == "" {
		webDir = "../client/build/web"
	}
	if _, err := os.Stat(webDir); err == nil {
		fs := http.FileServer(http.Dir(webDir))
		http.Handle("/", fs)
		log.Println("Serving frontend from", webDir)
	} else {
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]string{
				"status":    "ok",
				"message":   "Kiddie Chess API",
				"endpoints": "/health, /api/users, /api/leaderboard, /ws",
			})
		})
		log.Println("Frontend not found at", webDir, "- serving API only")
	}

	// CORS middleware for development
	handler := corsMiddleware(http.DefaultServeMux)

	log.Printf("Kiddie Chess server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func handleUsers(db *database.DB, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "POST":
		// Create user
		var req struct {
			ID       string `json:"id"`
			Username string `json:"username"`
			Email    string `json:"email,omitempty"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
			return
		}

		user := &database.User{
			ID:       req.ID,
			Username: req.Username,
		}
		if req.Email != "" {
			user.Email = &req.Email
		}

		if err := db.CreateUser(user); err != nil {
			http.Error(w, `{"error": "failed to create user"}`, http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(map[string]string{"id": user.ID, "username": user.Username})

	case "GET":
		// Get user by ID or username
		id := r.URL.Query().Get("id")
		username := r.URL.Query().Get("username")

		var user *database.User
		var err error

		if id != "" {
			user, err = db.GetUser(id)
		} else if username != "" {
			user, err = db.GetUserByUsername(username)
		} else {
			http.Error(w, `{"error": "id or username required"}`, http.StatusBadRequest)
			return
		}

		if err != nil {
			http.Error(w, `{"error": "database error"}`, http.StatusInternalServerError)
			return
		}
		if user == nil {
			http.Error(w, `{"error": "user not found"}`, http.StatusNotFound)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":          user.ID,
			"username":    user.Username,
			"gamesPlayed": user.GamesPlayed,
			"gamesWon":    user.GamesWon,
			"gamesLost":   user.GamesLost,
			"gamesDrawn":  user.GamesDrawn,
			"rating":      user.Rating,
		})

	default:
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func handleLeaderboard(db *database.DB, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != "GET" {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	users, err := db.GetLeaderboard(50)
	if err != nil {
		http.Error(w, `{"error": "database error"}`, http.StatusInternalServerError)
		return
	}

	results := make([]map[string]interface{}, len(users))
	for i, user := range users {
		results[i] = map[string]interface{}{
			"rank":        i + 1,
			"id":          user.ID,
			"username":    user.Username,
			"gamesPlayed": user.GamesPlayed,
			"gamesWon":    user.GamesWon,
			"rating":      user.Rating,
		}
	}

	json.NewEncoder(w).Encode(results)
}

// handleAuthGuest handles guest registration / returning guest login
func handleAuthGuest(db *database.DB, authSvc *auth.AuthService, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		DeviceID    string `json:"deviceId"`
		DisplayName string `json:"displayName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.DeviceID == "" || req.DisplayName == "" {
		http.Error(w, `{"error": "deviceId and displayName are required"}`, http.StatusBadRequest)
		return
	}

	log.Printf("[auth/guest] deviceId=%s name=%q", req.DeviceID, req.DisplayName)

	// Check if a user already exists with this deviceId
	user, err := db.GetUserByDeviceID(req.DeviceID)
	if err != nil {
		log.Printf("[auth/guest] error looking up deviceId: %v", err)
		http.Error(w, `{"error": "database error"}`, http.StatusInternalServerError)
		return
	}

	log.Printf("[auth/guest] deviceId lookup: found=%v", user != nil)

	if user == nil {
		// No user with this deviceId — check if the username is already taken
		existing, err := db.GetUserByUsername(req.DisplayName)
		if err != nil {
			log.Printf("[auth/guest] error looking up username: %v", err)
			http.Error(w, `{"error": "database error"}`, http.StatusInternalServerError)
			return
		}

		log.Printf("[auth/guest] username lookup: found=%v isGuest=%v", existing != nil, existing != nil && existing.IsGuest)

		if existing != nil && existing.IsGuest {
			// Reclaim the existing guest account with the new device
			if err := db.UpdateUserDeviceID(existing.ID, req.DeviceID); err != nil {
				log.Printf("[auth/guest] error updating deviceId: %v", err)
				http.Error(w, `{"error": "failed to update user"}`, http.StatusInternalServerError)
				return
			}
			user = existing
		} else if existing != nil {
			// Username belongs to a full (upgraded) account
			http.Error(w, `{"error": "username already taken"}`, http.StatusConflict)
			return
		} else {
			// Create new guest user
			user = &database.User{
				ID:       uuid.New().String(),
				Username: req.DisplayName,
				IsGuest:  true,
				DeviceID: &req.DeviceID,
			}
			if err := db.CreateUser(user); err != nil {
				log.Printf("[auth/guest] error creating user: %v", err)
				http.Error(w, `{"error": "failed to create user"}`, http.StatusInternalServerError)
				return
			}
		}
	}

	token, err := authSvc.GenerateToken(user.ID, user.Username, user.IsGuest)
	if err != nil {
		log.Printf("[auth/guest] error generating token: %v", err)
		http.Error(w, `{"error": "failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"userId":   user.ID,
		"username": user.Username,
		"token":    token,
		"isGuest":  user.IsGuest,
	})
}

// handleAuthLogin handles email/password login
func handleAuthLogin(db *database.DB, authSvc *auth.AuthService, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error": "email and password are required"}`, http.StatusBadRequest)
		return
	}

	user, err := db.GetUserByEmail(req.Email)
	if err != nil {
		http.Error(w, `{"error": "database error"}`, http.StatusInternalServerError)
		return
	}
	if user == nil || user.PasswordHash == nil || !auth.CheckPassword(req.Password, *user.PasswordHash) {
		http.Error(w, `{"error": "invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	token, err := authSvc.GenerateToken(user.ID, user.Username, user.IsGuest)
	if err != nil {
		http.Error(w, `{"error": "failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"userId":   user.ID,
		"username": user.Username,
		"token":    token,
		"isGuest":  user.IsGuest,
	})
}

// handleAuthUpgrade upgrades a guest account to a full account with email/password
func handleAuthUpgrade(db *database.DB, authSvc *auth.AuthService, w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != "POST" {
		http.Error(w, `{"error": "method not allowed"}`, http.StatusMethodNotAllowed)
		return
	}

	// Validate JWT from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		http.Error(w, `{"error": "authorization required"}`, http.StatusUnauthorized)
		return
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims, err := authSvc.ValidateToken(tokenStr)
	if err != nil {
		http.Error(w, `{"error": "invalid token"}`, http.StatusUnauthorized)
		return
	}
	if !claims.IsGuest {
		http.Error(w, `{"error": "account is already upgraded"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error": "invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.Email == "" || req.Password == "" {
		http.Error(w, `{"error": "email and password are required"}`, http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error": "internal error"}`, http.StatusInternalServerError)
		return
	}

	if err := db.UpgradeGuestAccount(claims.UserID, req.Email, hash); err != nil {
		http.Error(w, `{"error": "failed to upgrade account"}`, http.StatusInternalServerError)
		return
	}

	// Issue new token with isGuest=false
	newToken, err := authSvc.GenerateToken(claims.UserID, claims.Username, false)
	if err != nil {
		http.Error(w, `{"error": "failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"userId":   claims.UserID,
		"username": claims.Username,
		"token":    newToken,
		"isGuest":  false,
	})
}
