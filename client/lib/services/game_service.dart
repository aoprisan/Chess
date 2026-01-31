import 'package:flutter/foundation.dart';
import '../models/game_state.dart';
import '../models/hero.dart';

/// Difficulty levels for AI opponent
enum AIDifficulty { easy, medium, hard }

/// Game service for managing local game state
class GameService extends ChangeNotifier {
  GameState? _gameState;
  Hero? _selectedHero;
  bool _isAIMode = false;
  AIDifficulty _aiDifficulty = AIDifficulty.medium;
  PlayerColor? _playerColor;
  ChessPiece? _selectedPiece;
  List<List<int>> _validMoves = [];

  // Getters
  GameState? get gameState => _gameState;
  Hero? get selectedHero => _selectedHero;
  bool get isAIMode => _isAIMode;
  AIDifficulty get aiDifficulty => _aiDifficulty;
  PlayerColor? get playerColor => _playerColor;
  ChessPiece? get selectedPiece => _selectedPiece;
  List<List<int>> get validMoves => _validMoves;

  /// Select a hero for the game
  void selectHero(Hero hero) {
    _selectedHero = hero;
    notifyListeners();
  }

  /// Set AI mode
  void setAIMode(bool enabled) {
    _isAIMode = enabled;
    notifyListeners();
  }

  /// Set AI difficulty
  void setAIDifficulty(AIDifficulty difficulty) {
    _aiDifficulty = difficulty;
    notifyListeners();
  }

  /// Initialize a new game
  void initializeGame(String gameId, PlayerColor color) {
    _gameState = GameState.initial(gameId);
    _playerColor = color;
    _selectedPiece = null;
    _validMoves = [];

    if (_selectedHero != null) {
      final perks = Map<Perk, int>.from(_selectedHero!.perkCounts);
      _gameState = _gameState!.copyWith(
        player1Hero: color == PlayerColor.white ? _selectedHero : null,
        player2Hero: color == PlayerColor.black ? _selectedHero : null,
        player1PerksRemaining: color == PlayerColor.white ? perks : {},
        player2PerksRemaining: color == PlayerColor.black ? perks : {},
        status: GameStatus.playing,
      );
    }

    notifyListeners();
  }

  /// Update game state from server
  void updateGameState(GameState newState) {
    _gameState = newState;
    _selectedPiece = null;
    _validMoves = [];
    notifyListeners();
  }

  /// Select a piece to move
  void selectPiece(int row, int col) {
    if (_gameState == null) return;
    if (_gameState!.currentTurn != _playerColor) return;

    final piece = _gameState!.getPieceAt(row, col);
    if (piece == null || piece.color != _playerColor) {
      _selectedPiece = null;
      _validMoves = [];
      notifyListeners();
      return;
    }

    _selectedPiece = piece;
    _validMoves = _calculateValidMoves(piece);
    notifyListeners();
  }

  /// Calculate valid moves for a piece
  List<List<int>> _calculateValidMoves(ChessPiece piece) {
    final moves = <List<int>>[];

    // Basic move calculation (simplified - full chess rules would be more complex)
    switch (piece.type) {
      case PieceType.pawn:
        _addPawnMoves(piece, moves);
        break;
      case PieceType.rook:
        _addLinearMoves(piece, moves, horizontal: true, vertical: true);
        break;
      case PieceType.knight:
        _addKnightMoves(piece, moves);
        break;
      case PieceType.bishop:
        _addLinearMoves(piece, moves, diagonal: true);
        break;
      case PieceType.queen:
        _addLinearMoves(piece, moves,
            horizontal: true, vertical: true, diagonal: true);
        break;
      case PieceType.king:
        _addKingMoves(piece, moves);
        break;
    }

    return moves;
  }

  void _addPawnMoves(ChessPiece pawn, List<List<int>> moves) {
    final direction = pawn.color == PlayerColor.white ? -1 : 1;
    final startRow = pawn.color == PlayerColor.white ? 6 : 1;

    // Forward move
    final newRow = pawn.row + direction;
    if (_isValidSquare(newRow, pawn.col) &&
        _gameState!.getPieceAt(newRow, pawn.col) == null) {
      moves.add([newRow, pawn.col]);

      // Double move from starting position
      if (pawn.row == startRow) {
        final doubleRow = pawn.row + (direction * 2);
        if (_gameState!.getPieceAt(doubleRow, pawn.col) == null) {
          moves.add([doubleRow, pawn.col]);
        }
      }
    }

    // Captures
    for (final colOffset in [-1, 1]) {
      final captureCol = pawn.col + colOffset;
      if (_isValidSquare(newRow, captureCol)) {
        final target = _gameState!.getPieceAt(newRow, captureCol);
        if (target != null && target.color != pawn.color) {
          moves.add([newRow, captureCol]);
        }
      }
    }
  }

  void _addLinearMoves(
    ChessPiece piece,
    List<List<int>> moves, {
    bool horizontal = false,
    bool vertical = false,
    bool diagonal = false,
  }) {
    final directions = <List<int>>[];
    if (horizontal) {
      directions.addAll([
        [0, 1],
        [0, -1]
      ]);
    }
    if (vertical) {
      directions.addAll([
        [1, 0],
        [-1, 0]
      ]);
    }
    if (diagonal) {
      directions.addAll([
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1]
      ]);
    }

    for (final dir in directions) {
      var row = piece.row + dir[0];
      var col = piece.col + dir[1];

      while (_isValidSquare(row, col)) {
        final target = _gameState!.getPieceAt(row, col);
        if (target == null) {
          moves.add([row, col]);
        } else {
          if (target.color != piece.color) {
            moves.add([row, col]);
          }
          break;
        }
        row += dir[0];
        col += dir[1];
      }
    }
  }

  void _addKnightMoves(ChessPiece knight, List<List<int>> moves) {
    final offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];

    for (final offset in offsets) {
      final row = knight.row + offset[0];
      final col = knight.col + offset[1];

      if (_isValidSquare(row, col)) {
        final target = _gameState!.getPieceAt(row, col);
        if (target == null || target.color != knight.color) {
          moves.add([row, col]);
        }
      }
    }
  }

  void _addKingMoves(ChessPiece king, List<List<int>> moves) {
    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        if (dr == 0 && dc == 0) continue;

        final row = king.row + dr;
        final col = king.col + dc;

        if (_isValidSquare(row, col)) {
          final target = _gameState!.getPieceAt(row, col);
          if (target == null || target.color != king.color) {
            moves.add([row, col]);
          }
        }
      }
    }
  }

  bool _isValidSquare(int row, int col) {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
  }

  /// Check if a move is valid
  bool isValidMove(int toRow, int toCol) {
    return _validMoves.any((m) => m[0] == toRow && m[1] == toCol);
  }

  /// Clear selection
  void clearSelection() {
    _selectedPiece = null;
    _validMoves = [];
    notifyListeners();
  }

  /// Use a perk
  bool usePerk(Perk perk) {
    if (_gameState == null || _playerColor == null) return false;

    final perksRemaining = _playerColor == PlayerColor.white
        ? _gameState!.player1PerksRemaining
        : _gameState!.player2PerksRemaining;

    final count = perksRemaining[perk] ?? 0;
    if (count <= 0) return false;

    // Perk usage would be handled by server in real implementation
    return true;
  }

  /// Reset game state
  void resetGame() {
    _gameState = null;
    _selectedPiece = null;
    _validMoves = [];
    _playerColor = null;
    notifyListeners();
  }
}
