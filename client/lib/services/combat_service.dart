import 'dart:math';
import 'package:flutter/foundation.dart';
import '../models/combat_state.dart';
import '../models/hero.dart';

/// Service for managing combat game state
class CombatService extends ChangeNotifier {
  CombatGameState? _gameState;
  final Random _random = Random();

  // Getters
  CombatGameState? get gameState => _gameState;
  bool get isGameOver => _gameState?.isGameOver ?? false;

  /// Initialize a new combat game
  void initGame(String gameId, {Hero? player1Hero, Hero? player2Hero}) {
    _gameState = CombatGameState.initial(
      gameId,
      player1Hero: player1Hero,
      player2Hero: player2Hero,
    );
    notifyListeners();
  }

  /// Execute auto-placement for current player
  /// Returns the lane index where piece was placed, or -1 if no placement possible
  int autoPlace() {
    if (_gameState == null) return -1;
    if (_gameState!.status != CombatStatus.playing) return -1;

    final currentPlayer = _gameState!.currentPlayer;
    final remainingPieces = _gameState!.getRemainingPieces(currentPlayer);

    if (remainingPieces <= 0) {
      // No pieces left to place
      return -1;
    }

    // Find lanes that are not yet won and have space
    final availableLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      final lane = _gameState!.lanes[i];
      if (lane.winner == null && lane.getNextEmptyColumn(currentPlayer) != -1) {
        availableLanes.add(i);
      }
    }

    if (availableLanes.isEmpty) {
      // No available lanes
      return -1;
    }

    // Pick a random lane
    final laneIndex = availableLanes[_random.nextInt(availableLanes.length)];

    // Place the piece
    _placePiece(laneIndex, currentPlayer);

    return laneIndex;
  }

  /// Place a piece in the specified lane for the specified player
  void _placePiece(int laneIndex, PlayerSide player) {
    if (_gameState == null) return;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final lane = lanes[laneIndex];
    final columnIndex = lane.getNextEmptyColumn(player);

    if (columnIndex == -1) return; // Lane is full

    // Update the lane
    if (player == PlayerSide.player1) {
      final newColumns = List<bool>.from(lane.player1Columns);
      newColumns[columnIndex] = true;
      lanes[laneIndex] = lane.copyWith(player1Columns: newColumns);
    } else {
      final newColumns = List<bool>.from(lane.player2Columns);
      newColumns[columnIndex] = true;
      lanes[laneIndex] = lane.copyWith(player2Columns: newColumns);
    }

    // Update piece count
    final newP1Pieces = player == PlayerSide.player1
        ? _gameState!.player1Pieces - 1
        : _gameState!.player1Pieces;
    final newP2Pieces = player == PlayerSide.player2
        ? _gameState!.player2Pieces - 1
        : _gameState!.player2Pieces;

    _gameState = _gameState!.copyWith(
      lanes: lanes,
      player1Pieces: newP1Pieces,
      player2Pieces: newP2Pieces,
      currentPhase: TurnPhase.perkSelection,
      lastAutoPlacedLane: laneIndex,
    );

    // Check for lane win
    _checkLaneWin(laneIndex);

    notifyListeners();
  }

  /// Check if a lane has been won
  void _checkLaneWin(int laneIndex) {
    if (_gameState == null) return;

    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return; // Already won

    PlayerSide? winner;
    if (lane.isSideFilled(PlayerSide.player1)) {
      winner = PlayerSide.player1;
    } else if (lane.isSideFilled(PlayerSide.player2)) {
      winner = PlayerSide.player2;
    }

    if (winner != null) {
      final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
      lanes[laneIndex] = lane.copyWith(winner: winner);

      final newP1LanesWon = winner == PlayerSide.player1
          ? _gameState!.player1LanesWon + 1
          : _gameState!.player1LanesWon;
      final newP2LanesWon = winner == PlayerSide.player2
          ? _gameState!.player2LanesWon + 1
          : _gameState!.player2LanesWon;

      _gameState = _gameState!.copyWith(
        lanes: lanes,
        player1LanesWon: newP1LanesWon,
        player2LanesWon: newP2LanesWon,
      );

      // Check for game win
      _checkGameWin();
    }
  }

  /// Check if the game has been won
  void _checkGameWin() {
    if (_gameState == null) return;

    if (_gameState!.player1LanesWon >= 3) {
      _gameState = _gameState!.copyWith(
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player1,
      );
    } else if (_gameState!.player2LanesWon >= 3) {
      _gameState = _gameState!.copyWith(
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player2,
      );
    }

    notifyListeners();
  }

  /// End the current turn and switch to the other player
  void endTurn() {
    if (_gameState == null) return;
    if (_gameState!.status != CombatStatus.playing) return;

    final nextPlayer = _gameState!.currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    _gameState = _gameState!.copyWith(
      currentPlayer: nextPlayer,
      currentPhase: TurnPhase.autoPlacement,
      lastAutoPlacedLane: null,
    );

    notifyListeners();
  }

  /// Skip the perk selection and end turn
  void skipTurn() {
    endTurn();
  }

  /// Execute a full turn (auto-place + skip to next player)
  /// Returns the lane index where piece was placed
  int executeTurn() {
    final laneIndex = autoPlace();
    // Don't auto-end turn - let player decide via UI
    return laneIndex;
  }

  /// Reset the game
  void resetGame() {
    _gameState = null;
    notifyListeners();
  }

  /// Get display name for a player
  String getPlayerName(PlayerSide side) {
    final hero = _gameState?.getHero(side);
    return hero?.name ?? (side == PlayerSide.player1 ? 'Player 1' : 'Player 2');
  }

  /// Get the current player's name
  String get currentPlayerName {
    if (_gameState == null) return '';
    return getPlayerName(_gameState!.currentPlayer);
  }
}
