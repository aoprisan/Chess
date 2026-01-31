package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"

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

	// Initialize matchmaking service
	mm := matchmaking.NewMatchmaker()
	go mm.Run()

	// Initialize WebSocket hub with database
	hub := handlers.NewHub(mm, db)
	go hub.Run()

	// WebSocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handlers.ServeWS(hub, w, r)
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
