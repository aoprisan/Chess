import 'hero.dart';

/// Which player's side (Player 1 = left/green, Player 2 = right/purple)
enum PlayerSide { player1, player2 }

/// Represents a single lane on the combat field (5 columns per side)
class Lane {
  /// Pieces on Player 1's side of this lane (indices 0-4, left to right toward center)
  final List<bool> player1Columns;

  /// Pieces on Player 2's side of this lane (indices 0-4, right to left toward center)
  final List<bool> player2Columns;

  /// Which player has won this lane (null if not yet won)
  final PlayerSide? winner;

  const Lane({
    required this.player1Columns,
    required this.player2Columns,
    this.winner,
  });

  /// Create an empty lane
  factory Lane.empty() {
    return Lane(
      player1Columns: List.filled(5, false),
      player2Columns: List.filled(5, false),
    );
  }

  /// Count pieces for a player in this lane
  int countPieces(PlayerSide side) {
    final columns = side == PlayerSide.player1 ? player1Columns : player2Columns;
    return columns.where((filled) => filled).length;
  }

  /// Check if a side has filled their half of the lane
  bool isSideFilled(PlayerSide side) {
    final columns = side == PlayerSide.player1 ? player1Columns : player2Columns;
    return columns.every((filled) => filled);
  }

  /// Get the next empty column index for a side (-1 if full)
  int getNextEmptyColumn(PlayerSide side) {
    final columns = side == PlayerSide.player1 ? player1Columns : player2Columns;
    for (int i = 0; i < columns.length; i++) {
      if (!columns[i]) return i;
    }
    return -1;
  }

  Lane copyWith({
    List<bool>? player1Columns,
    List<bool>? player2Columns,
    PlayerSide? winner,
  }) {
    return Lane(
      player1Columns: player1Columns ?? List.from(this.player1Columns),
      player2Columns: player2Columns ?? List.from(this.player2Columns),
      winner: winner ?? this.winner,
    );
  }
}

/// Current phase of a turn
enum TurnPhase {
  deferredResolution, // Phase 1: Resolve pending effects
  autoPlacement,      // Phase 2: System places a piece
  perkSelection,      // Phase 3: Player chooses perk or passes
}

/// Game status
enum CombatStatus {
  setup,      // Selecting heroes
  playing,    // Game in progress
  finished,   // Game over
}

/// Full combat game state
class CombatGameState {
  final String gameId;

  /// The 5 lanes of the combat field
  final List<Lane> lanes;

  /// Current player's turn
  final PlayerSide currentPlayer;

  /// Current phase within the turn
  final TurnPhase currentPhase;

  /// Remaining pieces for each player (starts at 40)
  final int player1Pieces;
  final int player2Pieces;

  /// Lanes won by each player
  final int player1LanesWon;
  final int player2LanesWon;

  /// Game status
  final CombatStatus status;

  /// Winner of the game (null if not finished)
  final PlayerSide? gameWinner;

  /// Selected heroes
  final Hero? player1Hero;
  final Hero? player2Hero;

  /// Last lane that received auto-placement (for PlaceAnother perk targeting)
  final int? lastAutoPlacedLane;

  const CombatGameState({
    required this.gameId,
    required this.lanes,
    required this.currentPlayer,
    required this.currentPhase,
    required this.player1Pieces,
    required this.player2Pieces,
    required this.player1LanesWon,
    required this.player2LanesWon,
    required this.status,
    this.gameWinner,
    this.player1Hero,
    this.player2Hero,
    this.lastAutoPlacedLane,
  });

  /// Create initial game state
  factory CombatGameState.initial(String gameId, {Hero? player1Hero, Hero? player2Hero}) {
    return CombatGameState(
      gameId: gameId,
      lanes: List.generate(5, (_) => Lane.empty()),
      currentPlayer: PlayerSide.player1,
      currentPhase: TurnPhase.autoPlacement, // Skip deferred in Phase A
      player1Pieces: 40,
      player2Pieces: 40,
      player1LanesWon: 0,
      player2LanesWon: 0,
      status: CombatStatus.playing,
      player1Hero: player1Hero,
      player2Hero: player2Hero,
    );
  }

  /// Get remaining pieces for a player
  int getRemainingPieces(PlayerSide side) {
    return side == PlayerSide.player1 ? player1Pieces : player2Pieces;
  }

  /// Get lanes won by a player
  int getLanesWon(PlayerSide side) {
    return side == PlayerSide.player1 ? player1LanesWon : player2LanesWon;
  }

  /// Get hero for a player
  Hero? getHero(PlayerSide side) {
    return side == PlayerSide.player1 ? player1Hero : player2Hero;
  }

  /// Check if game is over (3 lanes won)
  bool get isGameOver => player1LanesWon >= 3 || player2LanesWon >= 3;

  CombatGameState copyWith({
    List<Lane>? lanes,
    PlayerSide? currentPlayer,
    TurnPhase? currentPhase,
    int? player1Pieces,
    int? player2Pieces,
    int? player1LanesWon,
    int? player2LanesWon,
    CombatStatus? status,
    PlayerSide? gameWinner,
    Hero? player1Hero,
    Hero? player2Hero,
    int? lastAutoPlacedLane,
  }) {
    return CombatGameState(
      gameId: gameId,
      lanes: lanes ?? this.lanes.map((l) => l.copyWith()).toList(),
      currentPlayer: currentPlayer ?? this.currentPlayer,
      currentPhase: currentPhase ?? this.currentPhase,
      player1Pieces: player1Pieces ?? this.player1Pieces,
      player2Pieces: player2Pieces ?? this.player2Pieces,
      player1LanesWon: player1LanesWon ?? this.player1LanesWon,
      player2LanesWon: player2LanesWon ?? this.player2LanesWon,
      status: status ?? this.status,
      gameWinner: gameWinner ?? this.gameWinner,
      player1Hero: player1Hero ?? this.player1Hero,
      player2Hero: player2Hero ?? this.player2Hero,
      lastAutoPlacedLane: lastAutoPlacedLane ?? this.lastAutoPlacedLane,
    );
  }
}
