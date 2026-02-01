import 'package:flutter_test/flutter_test.dart';
import 'package:kiddie_chess/models/game_state.dart';
import 'package:kiddie_chess/models/hero.dart';

void main() {
  group('PieceType', () {
    test('has all standard chess pieces', () {
      expect(PieceType.values.length, equals(6));
      expect(PieceType.values, contains(PieceType.king));
      expect(PieceType.values, contains(PieceType.queen));
      expect(PieceType.values, contains(PieceType.rook));
      expect(PieceType.values, contains(PieceType.bishop));
      expect(PieceType.values, contains(PieceType.knight));
      expect(PieceType.values, contains(PieceType.pawn));
    });
  });

  group('PlayerColor', () {
    test('has white and black', () {
      expect(PlayerColor.values.length, equals(2));
      expect(PlayerColor.values, contains(PlayerColor.white));
      expect(PlayerColor.values, contains(PlayerColor.black));
    });
  });

  group('ChessPiece', () {
    test('creates piece with required properties', () {
      const piece = ChessPiece(
        type: PieceType.king,
        color: PlayerColor.white,
        row: 7,
        col: 4,
      );

      expect(piece.type, equals(PieceType.king));
      expect(piece.color, equals(PlayerColor.white));
      expect(piece.row, equals(7));
      expect(piece.col, equals(4));
      expect(piece.hasMoved, isFalse);
    });

    test('creates piece with hasMoved', () {
      const piece = ChessPiece(
        type: PieceType.pawn,
        color: PlayerColor.black,
        row: 3,
        col: 2,
        hasMoved: true,
      );

      expect(piece.hasMoved, isTrue);
    });

    group('copyWith', () {
      const original = ChessPiece(
        type: PieceType.knight,
        color: PlayerColor.white,
        row: 0,
        col: 1,
      );

      test('copies with new row', () {
        final moved = original.copyWith(row: 2);
        expect(moved.row, equals(2));
        expect(moved.col, equals(1));
        expect(moved.type, equals(PieceType.knight));
        expect(moved.color, equals(PlayerColor.white));
      });

      test('copies with new col', () {
        final moved = original.copyWith(col: 3);
        expect(moved.col, equals(3));
        expect(moved.row, equals(0));
      });

      test('copies with hasMoved', () {
        final moved = original.copyWith(hasMoved: true);
        expect(moved.hasMoved, isTrue);
      });

      test('copies with multiple changes', () {
        final moved = original.copyWith(row: 5, col: 6, hasMoved: true);
        expect(moved.row, equals(5));
        expect(moved.col, equals(6));
        expect(moved.hasMoved, isTrue);
      });
    });

    group('toJson', () {
      test('serializes piece correctly', () {
        const piece = ChessPiece(
          type: PieceType.queen,
          color: PlayerColor.black,
          row: 0,
          col: 3,
          hasMoved: true,
        );

        final json = piece.toJson();

        expect(json['type'], equals('queen'));
        expect(json['color'], equals('black'));
        expect(json['row'], equals(0));
        expect(json['col'], equals(3));
        expect(json['hasMoved'], isTrue);
      });
    });

    group('fromJson', () {
      test('deserializes piece correctly', () {
        final json = {
          'type': 'rook',
          'color': 'white',
          'row': 7,
          'col': 0,
          'hasMoved': false,
        };

        final piece = ChessPiece.fromJson(json);

        expect(piece.type, equals(PieceType.rook));
        expect(piece.color, equals(PlayerColor.white));
        expect(piece.row, equals(7));
        expect(piece.col, equals(0));
        expect(piece.hasMoved, isFalse);
      });

      test('handles missing hasMoved', () {
        final json = {
          'type': 'bishop',
          'color': 'black',
          'row': 0,
          'col': 2,
        };

        final piece = ChessPiece.fromJson(json);
        expect(piece.hasMoved, isFalse);
      });
    });

    test('roundtrip serialization', () {
      const original = ChessPiece(
        type: PieceType.pawn,
        color: PlayerColor.white,
        row: 4,
        col: 3,
        hasMoved: true,
      );

      final json = original.toJson();
      final restored = ChessPiece.fromJson(json);

      expect(restored.type, equals(original.type));
      expect(restored.color, equals(original.color));
      expect(restored.row, equals(original.row));
      expect(restored.col, equals(original.col));
      expect(restored.hasMoved, equals(original.hasMoved));
    });
  });

  group('Move', () {
    test('creates move with required properties', () {
      const move = Move(
        fromRow: 6,
        fromCol: 4,
        toRow: 4,
        toCol: 4,
      );

      expect(move.fromRow, equals(6));
      expect(move.fromCol, equals(4));
      expect(move.toRow, equals(4));
      expect(move.toCol, equals(4));
      expect(move.capturedPiece, isNull);
      expect(move.perkUsed, isNull);
    });

    test('creates move with captured piece', () {
      const capturedPiece = ChessPiece(
        type: PieceType.pawn,
        color: PlayerColor.black,
        row: 4,
        col: 3,
      );

      const move = Move(
        fromRow: 5,
        fromCol: 2,
        toRow: 4,
        toCol: 3,
        capturedPiece: capturedPiece,
      );

      expect(move.capturedPiece, isNotNull);
      expect(move.capturedPiece!.type, equals(PieceType.pawn));
    });

    test('creates move with perk', () {
      const move = Move(
        fromRow: 0,
        fromCol: 0,
        toRow: 0,
        toCol: 0,
        perkUsed: Perk.freeze,
      );

      expect(move.perkUsed, equals(Perk.freeze));
    });

    group('toJson', () {
      test('serializes move correctly', () {
        const move = Move(
          fromRow: 6,
          fromCol: 3,
          toRow: 5,
          toCol: 3,
        );

        final json = move.toJson();

        expect(json['fromRow'], equals(6));
        expect(json['fromCol'], equals(3));
        expect(json['toRow'], equals(5));
        expect(json['toCol'], equals(3));
        expect(json['perkUsed'], isNull);
      });

      test('serializes perk correctly', () {
        const move = Move(
          fromRow: 0,
          fromCol: 0,
          toRow: 0,
          toCol: 0,
          perkUsed: Perk.anotherMove,
        );

        final json = move.toJson();
        expect(json['perkUsed'], equals('anotherMove'));
      });
    });

    group('fromJson', () {
      test('deserializes move correctly', () {
        final json = {
          'fromRow': 1,
          'fromCol': 4,
          'toRow': 3,
          'toCol': 4,
        };

        final move = Move.fromJson(json);

        expect(move.fromRow, equals(1));
        expect(move.fromCol, equals(4));
        expect(move.toRow, equals(3));
        expect(move.toCol, equals(4));
        expect(move.perkUsed, isNull);
      });

      test('deserializes perk correctly', () {
        final json = {
          'fromRow': 0,
          'fromCol': 0,
          'toRow': 0,
          'toCol': 0,
          'perkUsed': 'freeze',
        };

        final move = Move.fromJson(json);
        expect(move.perkUsed, equals(Perk.freeze));
      });
    });
  });

  group('GameStatus', () {
    test('has all expected statuses', () {
      expect(GameStatus.values, contains(GameStatus.waiting));
      expect(GameStatus.values, contains(GameStatus.playing));
      expect(GameStatus.values, contains(GameStatus.checkmate));
      expect(GameStatus.values, contains(GameStatus.stalemate));
      expect(GameStatus.values, contains(GameStatus.draw));
      expect(GameStatus.values, contains(GameStatus.resigned));
    });
  });

  group('GameState', () {
    group('initial', () {
      test('creates game with correct ID', () {
        final state = GameState.initial('game123');
        expect(state.gameId, equals('game123'));
      });

      test('creates 32 pieces', () {
        final state = GameState.initial('test');
        expect(state.pieces.length, equals(32));
      });

      test('creates 16 pieces per color', () {
        final state = GameState.initial('test');
        final whitePieces =
            state.pieces.where((p) => p.color == PlayerColor.white);
        final blackPieces =
            state.pieces.where((p) => p.color == PlayerColor.black);

        expect(whitePieces.length, equals(16));
        expect(blackPieces.length, equals(16));
      });

      test('creates 8 pawns per color', () {
        final state = GameState.initial('test');
        final whitePawns = state.pieces
            .where((p) => p.color == PlayerColor.white && p.type == PieceType.pawn);
        final blackPawns = state.pieces
            .where((p) => p.color == PlayerColor.black && p.type == PieceType.pawn);

        expect(whitePawns.length, equals(8));
        expect(blackPawns.length, equals(8));
      });

      test('white pawns are on row 6', () {
        final state = GameState.initial('test');
        final whitePawns = state.pieces
            .where((p) => p.color == PlayerColor.white && p.type == PieceType.pawn);

        for (final pawn in whitePawns) {
          expect(pawn.row, equals(6));
        }
      });

      test('black pawns are on row 1', () {
        final state = GameState.initial('test');
        final blackPawns = state.pieces
            .where((p) => p.color == PlayerColor.black && p.type == PieceType.pawn);

        for (final pawn in blackPawns) {
          expect(pawn.row, equals(1));
        }
      });

      test('has one king per color', () {
        final state = GameState.initial('test');
        final whiteKings = state.pieces
            .where((p) => p.color == PlayerColor.white && p.type == PieceType.king);
        final blackKings = state.pieces
            .where((p) => p.color == PlayerColor.black && p.type == PieceType.king);

        expect(whiteKings.length, equals(1));
        expect(blackKings.length, equals(1));
      });

      test('white king starts at row 7, col 4', () {
        final state = GameState.initial('test');
        final whiteKing = state.pieces.firstWhere(
            (p) => p.color == PlayerColor.white && p.type == PieceType.king);

        expect(whiteKing.row, equals(7));
        expect(whiteKing.col, equals(4));
      });

      test('black king starts at row 0, col 4', () {
        final state = GameState.initial('test');
        final blackKing = state.pieces.firstWhere(
            (p) => p.color == PlayerColor.black && p.type == PieceType.king);

        expect(blackKing.row, equals(0));
        expect(blackKing.col, equals(4));
      });

      test('has two rooks per color', () {
        final state = GameState.initial('test');
        final whiteRooks = state.pieces
            .where((p) => p.color == PlayerColor.white && p.type == PieceType.rook);
        final blackRooks = state.pieces
            .where((p) => p.color == PlayerColor.black && p.type == PieceType.rook);

        expect(whiteRooks.length, equals(2));
        expect(blackRooks.length, equals(2));
      });

      test('white starts first', () {
        final state = GameState.initial('test');
        expect(state.currentTurn, equals(PlayerColor.white));
      });

      test('status is waiting', () {
        final state = GameState.initial('test');
        expect(state.status, equals(GameStatus.waiting));
      });

      test('move history is empty', () {
        final state = GameState.initial('test');
        expect(state.moveHistory, isEmpty);
      });

      test('no heroes assigned', () {
        final state = GameState.initial('test');
        expect(state.player1Hero, isNull);
        expect(state.player2Hero, isNull);
      });

      test('no check initially', () {
        final state = GameState.initial('test');
        expect(state.isCheck, isFalse);
      });

      test('no players frozen initially', () {
        final state = GameState.initial('test');
        expect(state.player1Frozen, isFalse);
        expect(state.player2Frozen, isFalse);
      });
    });

    group('copyWith', () {
      final initial = GameState.initial('test');

      test('copies with new current turn', () {
        final updated = initial.copyWith(currentTurn: PlayerColor.black);
        expect(updated.currentTurn, equals(PlayerColor.black));
        expect(updated.gameId, equals('test'));
      });

      test('copies with new status', () {
        final updated = initial.copyWith(status: GameStatus.playing);
        expect(updated.status, equals(GameStatus.playing));
      });

      test('copies with new pieces', () {
        final newPieces = [
          const ChessPiece(
            type: PieceType.king,
            color: PlayerColor.white,
            row: 7,
            col: 4,
          ),
        ];
        final updated = initial.copyWith(pieces: newPieces);
        expect(updated.pieces.length, equals(1));
      });

      test('copies with isCheck', () {
        final updated = initial.copyWith(isCheck: true);
        expect(updated.isCheck, isTrue);
      });

      test('copies with frozen states', () {
        final updated = initial.copyWith(player1Frozen: true, player2Frozen: false);
        expect(updated.player1Frozen, isTrue);
        expect(updated.player2Frozen, isFalse);
      });

      test('copies with heroes', () {
        final hero = Hero.allHeroes.first;
        final updated = initial.copyWith(player1Hero: hero);
        expect(updated.player1Hero, equals(hero));
      });

      test('copies with perks remaining', () {
        final perks = {Perk.freeze: 2, Perk.anotherMove: 1};
        final updated = initial.copyWith(player1PerksRemaining: perks);
        expect(updated.player1PerksRemaining[Perk.freeze], equals(2));
      });

      test('copies with move history', () {
        const move = Move(fromRow: 6, fromCol: 4, toRow: 4, toCol: 4);
        final updated = initial.copyWith(moveHistory: [move]);
        expect(updated.moveHistory.length, equals(1));
      });

      test('does not modify original', () {
        initial.copyWith(currentTurn: PlayerColor.black);
        expect(initial.currentTurn, equals(PlayerColor.white));
      });
    });

    group('getPieceAt', () {
      test('returns piece at position', () {
        final state = GameState.initial('test');
        final piece = state.getPieceAt(7, 4); // White king

        expect(piece, isNotNull);
        expect(piece!.type, equals(PieceType.king));
        expect(piece.color, equals(PlayerColor.white));
      });

      test('returns null for empty position', () {
        final state = GameState.initial('test');
        final piece = state.getPieceAt(4, 4); // Center of board

        expect(piece, isNull);
      });

      test('finds all pawns correctly', () {
        final state = GameState.initial('test');

        for (int col = 0; col < 8; col++) {
          final whitePawn = state.getPieceAt(6, col);
          final blackPawn = state.getPieceAt(1, col);

          expect(whitePawn, isNotNull);
          expect(whitePawn!.type, equals(PieceType.pawn));
          expect(whitePawn.color, equals(PlayerColor.white));

          expect(blackPawn, isNotNull);
          expect(blackPawn!.type, equals(PieceType.pawn));
          expect(blackPawn.color, equals(PlayerColor.black));
        }
      });
    });
  });
}
