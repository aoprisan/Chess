import 'hero.dart';

/// Chess piece types
enum PieceType { king, queen, rook, bishop, knight, pawn }

/// Player colors
enum PlayerColor { white, black }

/// Represents a chess piece on the board
class ChessPiece {
  final PieceType type;
  final PlayerColor color;
  final int row;
  final int col;
  final bool hasMoved;

  const ChessPiece({
    required this.type,
    required this.color,
    required this.row,
    required this.col,
    this.hasMoved = false,
  });

  ChessPiece copyWith({int? row, int? col, bool? hasMoved}) {
    return ChessPiece(
      type: type,
      color: color,
      row: row ?? this.row,
      col: col ?? this.col,
      hasMoved: hasMoved ?? this.hasMoved,
    );
  }

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'color': color.name,
        'row': row,
        'col': col,
        'hasMoved': hasMoved,
      };

  factory ChessPiece.fromJson(Map<String, dynamic> json) => ChessPiece(
        type: PieceType.values.byName(json['type']),
        color: PlayerColor.values.byName(json['color']),
        row: json['row'],
        col: json['col'],
        hasMoved: json['hasMoved'] ?? false,
      );
}

/// Represents a move on the board
class Move {
  final int fromRow;
  final int fromCol;
  final int toRow;
  final int toCol;
  final ChessPiece? capturedPiece;
  final Perk? perkUsed;

  const Move({
    required this.fromRow,
    required this.fromCol,
    required this.toRow,
    required this.toCol,
    this.capturedPiece,
    this.perkUsed,
  });

  Map<String, dynamic> toJson() => {
        'fromRow': fromRow,
        'fromCol': fromCol,
        'toRow': toRow,
        'toCol': toCol,
        'perkUsed': perkUsed?.name,
      };

  factory Move.fromJson(Map<String, dynamic> json) => Move(
        fromRow: json['fromRow'],
        fromCol: json['fromCol'],
        toRow: json['toRow'],
        toCol: json['toCol'],
        perkUsed: json['perkUsed'] != null
            ? Perk.values.byName(json['perkUsed'])
            : null,
      );
}

/// Game status
enum GameStatus { waiting, playing, checkmate, stalemate, draw, resigned }

/// Full game state
class GameState {
  final String gameId;
  final List<ChessPiece> pieces;
  final PlayerColor currentTurn;
  final GameStatus status;
  final List<Move> moveHistory;
  final Hero? player1Hero;
  final Hero? player2Hero;
  final Map<Perk, int> player1PerksRemaining;
  final Map<Perk, int> player2PerksRemaining;
  final bool isCheck;
  final bool player1Frozen;
  final bool player2Frozen;

  const GameState({
    required this.gameId,
    required this.pieces,
    required this.currentTurn,
    required this.status,
    this.moveHistory = const [],
    this.player1Hero,
    this.player2Hero,
    this.player1PerksRemaining = const {},
    this.player2PerksRemaining = const {},
    this.isCheck = false,
    this.player1Frozen = false,
    this.player2Frozen = false,
  });

  /// Create initial board setup
  factory GameState.initial(String gameId) {
    final pieces = <ChessPiece>[];

    // Setup pawns
    for (int col = 0; col < 8; col++) {
      pieces.add(ChessPiece(
          type: PieceType.pawn, color: PlayerColor.white, row: 6, col: col));
      pieces.add(ChessPiece(
          type: PieceType.pawn, color: PlayerColor.black, row: 1, col: col));
    }

    // Setup back rows
    const backRowPieces = [
      PieceType.rook,
      PieceType.knight,
      PieceType.bishop,
      PieceType.queen,
      PieceType.king,
      PieceType.bishop,
      PieceType.knight,
      PieceType.rook,
    ];

    for (int col = 0; col < 8; col++) {
      pieces.add(ChessPiece(
          type: backRowPieces[col],
          color: PlayerColor.white,
          row: 7,
          col: col));
      pieces.add(ChessPiece(
          type: backRowPieces[col],
          color: PlayerColor.black,
          row: 0,
          col: col));
    }

    return GameState(
      gameId: gameId,
      pieces: pieces,
      currentTurn: PlayerColor.white,
      status: GameStatus.waiting,
    );
  }

  GameState copyWith({
    List<ChessPiece>? pieces,
    PlayerColor? currentTurn,
    GameStatus? status,
    List<Move>? moveHistory,
    Hero? player1Hero,
    Hero? player2Hero,
    Map<Perk, int>? player1PerksRemaining,
    Map<Perk, int>? player2PerksRemaining,
    bool? isCheck,
    bool? player1Frozen,
    bool? player2Frozen,
  }) {
    return GameState(
      gameId: gameId,
      pieces: pieces ?? this.pieces,
      currentTurn: currentTurn ?? this.currentTurn,
      status: status ?? this.status,
      moveHistory: moveHistory ?? this.moveHistory,
      player1Hero: player1Hero ?? this.player1Hero,
      player2Hero: player2Hero ?? this.player2Hero,
      player1PerksRemaining:
          player1PerksRemaining ?? this.player1PerksRemaining,
      player2PerksRemaining:
          player2PerksRemaining ?? this.player2PerksRemaining,
      isCheck: isCheck ?? this.isCheck,
      player1Frozen: player1Frozen ?? this.player1Frozen,
      player2Frozen: player2Frozen ?? this.player2Frozen,
    );
  }

  ChessPiece? getPieceAt(int row, int col) {
    try {
      return pieces.firstWhere((p) => p.row == row && p.col == col);
    } catch (_) {
      return null;
    }
  }
}
