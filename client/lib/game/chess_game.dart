import 'package:flame/game.dart';
import 'package:flame/events.dart';
import 'package:flame/components.dart';
import 'package:flutter/material.dart';
import '../services/game_service.dart';
import '../models/game_state.dart';

class ChessGame extends FlameGame with TapCallbacks {
  final GameService gameService;

  late double tileSize;
  late double boardOffset;

  // Colors
  static const lightSquare = Color(0xFFF0D9B5);
  static const darkSquare = Color(0xFFB58863);
  static const highlightColor = Color(0x8044FF44);
  static const selectedColor = Color(0x80FFFF44);
  static const lastMoveColor = Color(0x80FFA500);

  ChessGame({required this.gameService});

  @override
  Future<void> onLoad() async {
    await super.onLoad();
    _calculateSizes();
  }

  @override
  void onGameResize(Vector2 size) {
    super.onGameResize(size);
    _calculateSizes();
  }

  void _calculateSizes() {
    final minDimension = size.x < size.y ? size.x : size.y;
    tileSize = minDimension / 8;
    boardOffset = (size.x - minDimension) / 2;
  }

  @override
  void render(Canvas canvas) {
    super.render(canvas);
    _drawBoard(canvas);
    _drawHighlights(canvas);
    _drawPieces(canvas);
  }

  void _drawBoard(Canvas canvas) {
    for (int row = 0; row < 8; row++) {
      for (int col = 0; col < 8; col++) {
        final isLight = (row + col) % 2 == 0;
        final paint = Paint()..color = isLight ? lightSquare : darkSquare;

        canvas.drawRect(
          Rect.fromLTWH(
            boardOffset + col * tileSize,
            row * tileSize,
            tileSize,
            tileSize,
          ),
          paint,
        );
      }
    }

    // Draw border
    final borderPaint = Paint()
      ..color = const Color(0xFF5D4037)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;

    canvas.drawRect(
      Rect.fromLTWH(boardOffset, 0, tileSize * 8, tileSize * 8),
      borderPaint,
    );
  }

  void _drawHighlights(Canvas canvas) {
    // Highlight selected piece
    final selected = gameService.selectedPiece;
    if (selected != null) {
      final paint = Paint()..color = selectedColor;
      canvas.drawRect(
        Rect.fromLTWH(
          boardOffset + selected.col * tileSize,
          selected.row * tileSize,
          tileSize,
          tileSize,
        ),
        paint,
      );
    }

    // Highlight valid moves
    final validMoves = gameService.validMoves;
    final highlightPaint = Paint()..color = highlightColor;
    for (final move in validMoves) {
      canvas.drawRect(
        Rect.fromLTWH(
          boardOffset + move[1] * tileSize,
          move[0] * tileSize,
          tileSize,
          tileSize,
        ),
        highlightPaint,
      );
    }
  }

  void _drawPieces(Canvas canvas) {
    final gameState = gameService.gameState;
    if (gameState == null) return;

    for (final piece in gameState.pieces) {
      _drawPiece(canvas, piece);
    }
  }

  void _drawPiece(Canvas canvas, ChessPiece piece) {
    final x = boardOffset + piece.col * tileSize + tileSize / 2;
    final y = piece.row * tileSize + tileSize / 2;

    // Draw piece background circle
    final bgPaint = Paint()
      ..color = piece.color == PlayerColor.white
          ? const Color(0xFFFFFFFF)
          : const Color(0xFF333333);

    canvas.drawCircle(Offset(x, y), tileSize * 0.4, bgPaint);

    // Draw piece border
    final borderPaint = Paint()
      ..color = piece.color == PlayerColor.white
          ? const Color(0xFF333333)
          : const Color(0xFFFFFFFF)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    canvas.drawCircle(Offset(x, y), tileSize * 0.4, borderPaint);

    // Draw piece symbol
    final symbol = _getPieceSymbol(piece.type, piece.color);
    final textPainter = TextPainter(
      text: TextSpan(
        text: symbol,
        style: TextStyle(
          fontSize: tileSize * 0.5,
          color: piece.color == PlayerColor.white
              ? const Color(0xFF333333)
              : const Color(0xFFFFFFFF),
        ),
      ),
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();
    textPainter.paint(
      canvas,
      Offset(x - textPainter.width / 2, y - textPainter.height / 2),
    );
  }

  String _getPieceSymbol(PieceType type, PlayerColor color) {
    switch (type) {
      case PieceType.king:
        return color == PlayerColor.white ? '♔' : '♚';
      case PieceType.queen:
        return color == PlayerColor.white ? '♕' : '♛';
      case PieceType.rook:
        return color == PlayerColor.white ? '♖' : '♜';
      case PieceType.bishop:
        return color == PlayerColor.white ? '♗' : '♝';
      case PieceType.knight:
        return color == PlayerColor.white ? '♘' : '♞';
      case PieceType.pawn:
        return color == PlayerColor.white ? '♙' : '♟';
    }
  }

  @override
  void onTapDown(TapDownEvent event) {
    final tapPosition = event.localPosition;

    // Calculate board coordinates
    final col = ((tapPosition.x - boardOffset) / tileSize).floor();
    final row = (tapPosition.y / tileSize).floor();

    // Check bounds
    if (col < 0 || col > 7 || row < 0 || row > 7) return;

    // Handle tap
    if (gameService.selectedPiece != null) {
      // Check if tapped on a valid move
      if (gameService.isValidMove(row, col)) {
        // Make move - would send to server in real implementation
        _makeMove(row, col);
      } else {
        // Select new piece or deselect
        gameService.selectPiece(row, col);
      }
    } else {
      // Select piece
      gameService.selectPiece(row, col);
    }
  }

  void _makeMove(int toRow, int toCol) {
    final selected = gameService.selectedPiece;
    if (selected == null) return;

    final gameState = gameService.gameState;
    if (gameState == null) return;

    // Create new pieces list with the move applied
    final newPieces = <ChessPiece>[];
    for (final piece in gameState.pieces) {
      if (piece.row == selected.row && piece.col == selected.col) {
        // Move the selected piece
        newPieces.add(piece.copyWith(row: toRow, col: toCol, hasMoved: true));
      } else if (piece.row == toRow && piece.col == toCol) {
        // Skip captured piece
        continue;
      } else {
        newPieces.add(piece);
      }
    }

    // Create move record
    final move = Move(
      fromRow: selected.row,
      fromCol: selected.col,
      toRow: toRow,
      toCol: toCol,
    );

    // Update game state
    final newState = gameState.copyWith(
      pieces: newPieces,
      currentTurn: gameState.currentTurn == PlayerColor.white
          ? PlayerColor.black
          : PlayerColor.white,
      moveHistory: [...gameState.moveHistory, move],
    );

    gameService.updateGameState(newState);
  }
}
