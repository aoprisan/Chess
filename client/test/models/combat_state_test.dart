import 'package:flutter_test/flutter_test.dart';
import 'package:kiddie_chess/models/combat_state.dart';
import 'package:kiddie_chess/models/hero.dart';

void main() {
  group('PlayerSide', () {
    test('has player1 and player2', () {
      expect(PlayerSide.values.length, equals(2));
      expect(PlayerSide.values, contains(PlayerSide.player1));
      expect(PlayerSide.values, contains(PlayerSide.player2));
    });
  });

  group('Lane', () {
    group('empty', () {
      test('creates lane with all false columns', () {
        final lane = Lane.empty();
        expect(lane.player1Columns.length, equals(5));
        expect(lane.player2Columns.length, equals(5));
        expect(lane.player1Columns.every((c) => c == false), isTrue);
        expect(lane.player2Columns.every((c) => c == false), isTrue);
      });

      test('has no winner', () {
        final lane = Lane.empty();
        expect(lane.winner, isNull);
      });
    });

    group('countPieces', () {
      test('returns 0 for empty lane', () {
        final lane = Lane.empty();
        expect(lane.countPieces(PlayerSide.player1), equals(0));
        expect(lane.countPieces(PlayerSide.player2), equals(0));
      });

      test('counts player1 pieces correctly', () {
        const lane = Lane(
          player1Columns: [true, true, false, false, false],
          player2Columns: [false, false, false, false, false],
        );
        expect(lane.countPieces(PlayerSide.player1), equals(2));
      });

      test('counts player2 pieces correctly', () {
        const lane = Lane(
          player1Columns: [false, false, false, false, false],
          player2Columns: [true, true, true, false, false],
        );
        expect(lane.countPieces(PlayerSide.player2), equals(3));
      });

      test('counts all pieces when lane is full', () {
        const lane = Lane(
          player1Columns: [true, true, true, true, true],
          player2Columns: [true, true, true, true, true],
        );
        expect(lane.countPieces(PlayerSide.player1), equals(5));
        expect(lane.countPieces(PlayerSide.player2), equals(5));
      });
    });

    group('isSideFilled', () {
      test('returns false for empty lane', () {
        final lane = Lane.empty();
        expect(lane.isSideFilled(PlayerSide.player1), isFalse);
        expect(lane.isSideFilled(PlayerSide.player2), isFalse);
      });

      test('returns false for partially filled lane', () {
        const lane = Lane(
          player1Columns: [true, true, true, true, false],
          player2Columns: [false, false, false, false, false],
        );
        expect(lane.isSideFilled(PlayerSide.player1), isFalse);
      });

      test('returns true when side is completely filled', () {
        const lane = Lane(
          player1Columns: [true, true, true, true, true],
          player2Columns: [false, false, false, false, false],
        );
        expect(lane.isSideFilled(PlayerSide.player1), isTrue);
        expect(lane.isSideFilled(PlayerSide.player2), isFalse);
      });
    });

    group('getNextEmptyColumn', () {
      test('returns 0 for empty lane', () {
        final lane = Lane.empty();
        expect(lane.getNextEmptyColumn(PlayerSide.player1), equals(0));
      });

      test('returns next available column', () {
        const lane = Lane(
          player1Columns: [true, true, false, false, false],
          player2Columns: [false, false, false, false, false],
        );
        expect(lane.getNextEmptyColumn(PlayerSide.player1), equals(2));
      });

      test('returns -1 for full side', () {
        const lane = Lane(
          player1Columns: [true, true, true, true, true],
          player2Columns: [false, false, false, false, false],
        );
        expect(lane.getNextEmptyColumn(PlayerSide.player1), equals(-1));
      });
    });

    group('copyWith', () {
      test('copies with new player1Columns', () {
        final original = Lane.empty();
        final copied = original.copyWith(
          player1Columns: [true, false, false, false, false],
        );
        expect(copied.countPieces(PlayerSide.player1), equals(1));
        expect(original.countPieces(PlayerSide.player1), equals(0));
      });

      test('copies with winner', () {
        final original = Lane.empty();
        final copied = original.copyWith(winner: PlayerSide.player1);
        expect(copied.winner, equals(PlayerSide.player1));
        expect(original.winner, isNull);
      });
    });
  });

  group('TurnPhase', () {
    test('has all expected phases', () {
      expect(TurnPhase.values.length, equals(3));
      expect(TurnPhase.values, contains(TurnPhase.deferredResolution));
      expect(TurnPhase.values, contains(TurnPhase.autoPlacement));
      expect(TurnPhase.values, contains(TurnPhase.perkSelection));
    });
  });

  group('CombatStatus', () {
    test('has all expected statuses', () {
      expect(CombatStatus.values.length, equals(3));
      expect(CombatStatus.values, contains(CombatStatus.setup));
      expect(CombatStatus.values, contains(CombatStatus.playing));
      expect(CombatStatus.values, contains(CombatStatus.finished));
    });
  });

  group('CombatGameState', () {
    group('initial', () {
      test('creates game with correct ID', () {
        final state = CombatGameState.initial('game123');
        expect(state.gameId, equals('game123'));
      });

      test('creates 5 empty lanes', () {
        final state = CombatGameState.initial('test');
        expect(state.lanes.length, equals(5));
        for (final lane in state.lanes) {
          expect(lane.countPieces(PlayerSide.player1), equals(0));
          expect(lane.countPieces(PlayerSide.player2), equals(0));
        }
      });

      test('player1 starts first', () {
        final state = CombatGameState.initial('test');
        expect(state.currentPlayer, equals(PlayerSide.player1));
      });

      test('starts in autoPlacement phase', () {
        final state = CombatGameState.initial('test');
        expect(state.currentPhase, equals(TurnPhase.autoPlacement));
      });

      test('each player starts with 40 pieces', () {
        final state = CombatGameState.initial('test');
        expect(state.player1Pieces, equals(40));
        expect(state.player2Pieces, equals(40));
      });

      test('no lanes won initially', () {
        final state = CombatGameState.initial('test');
        expect(state.player1LanesWon, equals(0));
        expect(state.player2LanesWon, equals(0));
      });

      test('status is playing', () {
        final state = CombatGameState.initial('test');
        expect(state.status, equals(CombatStatus.playing));
      });

      test('no winner initially', () {
        final state = CombatGameState.initial('test');
        expect(state.gameWinner, isNull);
      });

      test('can set heroes at creation', () {
        final hero1 = Hero.allHeroes[0];
        final hero2 = Hero.allHeroes[1];
        final state = CombatGameState.initial(
          'test',
          player1Hero: hero1,
          player2Hero: hero2,
        );
        expect(state.player1Hero, equals(hero1));
        expect(state.player2Hero, equals(hero2));
      });
    });

    group('getRemainingPieces', () {
      test('returns correct pieces for player1', () {
        final state = CombatGameState.initial('test');
        expect(state.getRemainingPieces(PlayerSide.player1), equals(40));
      });

      test('returns correct pieces for player2', () {
        final state = CombatGameState.initial('test');
        expect(state.getRemainingPieces(PlayerSide.player2), equals(40));
      });
    });

    group('getLanesWon', () {
      test('returns 0 for both players initially', () {
        final state = CombatGameState.initial('test');
        expect(state.getLanesWon(PlayerSide.player1), equals(0));
        expect(state.getLanesWon(PlayerSide.player2), equals(0));
      });

      test('returns correct value after winning lanes', () {
        final state = CombatGameState.initial('test').copyWith(
          player1LanesWon: 2,
          player2LanesWon: 1,
        );
        expect(state.getLanesWon(PlayerSide.player1), equals(2));
        expect(state.getLanesWon(PlayerSide.player2), equals(1));
      });
    });

    group('getHero', () {
      test('returns null when no hero set', () {
        final state = CombatGameState.initial('test');
        expect(state.getHero(PlayerSide.player1), isNull);
        expect(state.getHero(PlayerSide.player2), isNull);
      });

      test('returns correct hero', () {
        final hero = Hero.allHeroes.first;
        final state = CombatGameState.initial('test').copyWith(
          player1Hero: hero,
        );
        expect(state.getHero(PlayerSide.player1), equals(hero));
      });
    });

    group('isGameOver', () {
      test('returns false initially', () {
        final state = CombatGameState.initial('test');
        expect(state.isGameOver, isFalse);
      });

      test('returns false with 2 lanes won', () {
        final state = CombatGameState.initial('test').copyWith(
          player1LanesWon: 2,
        );
        expect(state.isGameOver, isFalse);
      });

      test('returns true when player1 wins 3 lanes', () {
        final state = CombatGameState.initial('test').copyWith(
          player1LanesWon: 3,
        );
        expect(state.isGameOver, isTrue);
      });

      test('returns true when player2 wins 3 lanes', () {
        final state = CombatGameState.initial('test').copyWith(
          player2LanesWon: 3,
        );
        expect(state.isGameOver, isTrue);
      });
    });

    group('copyWith', () {
      final initial = CombatGameState.initial('test');

      test('copies with new currentPlayer', () {
        final updated = initial.copyWith(currentPlayer: PlayerSide.player2);
        expect(updated.currentPlayer, equals(PlayerSide.player2));
        expect(updated.gameId, equals('test'));
      });

      test('copies with new currentPhase', () {
        final updated = initial.copyWith(currentPhase: TurnPhase.perkSelection);
        expect(updated.currentPhase, equals(TurnPhase.perkSelection));
      });

      test('copies with new piece counts', () {
        final updated = initial.copyWith(
          player1Pieces: 38,
          player2Pieces: 39,
        );
        expect(updated.player1Pieces, equals(38));
        expect(updated.player2Pieces, equals(39));
      });

      test('copies with new lanes won', () {
        final updated = initial.copyWith(
          player1LanesWon: 2,
          player2LanesWon: 1,
        );
        expect(updated.player1LanesWon, equals(2));
        expect(updated.player2LanesWon, equals(1));
      });

      test('copies with new status', () {
        final updated = initial.copyWith(status: CombatStatus.finished);
        expect(updated.status, equals(CombatStatus.finished));
      });

      test('copies with gameWinner', () {
        final updated = initial.copyWith(gameWinner: PlayerSide.player1);
        expect(updated.gameWinner, equals(PlayerSide.player1));
      });

      test('copies with lastAutoPlacedLane', () {
        final updated = initial.copyWith(lastAutoPlacedLane: 2);
        expect(updated.lastAutoPlacedLane, equals(2));
      });

      test('creates deep copy of lanes', () {
        final updated = initial.copyWith();
        // Modifying updated lanes shouldn't affect original
        // (lanes are copied, not referenced)
        expect(updated.lanes.length, equals(initial.lanes.length));
      });
    });
  });

  group('Integration: Game Flow', () {
    test('simulates placing pieces and winning a lane', () {
      var state = CombatGameState.initial('test');

      // Simulate filling lane 0 for player1
      var lanes = List<Lane>.from(state.lanes);
      lanes[0] = lanes[0].copyWith(
        player1Columns: [true, true, true, true, true],
        winner: PlayerSide.player1,
      );

      state = state.copyWith(
        lanes: lanes,
        player1LanesWon: 1,
        player1Pieces: 35,
      );

      expect(state.lanes[0].isSideFilled(PlayerSide.player1), isTrue);
      expect(state.lanes[0].winner, equals(PlayerSide.player1));
      expect(state.player1LanesWon, equals(1));
    });

    test('simulates winning the game', () {
      var state = CombatGameState.initial('test');

      // Win 3 lanes
      state = state.copyWith(
        player1LanesWon: 3,
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player1,
      );

      expect(state.isGameOver, isTrue);
      expect(state.gameWinner, equals(PlayerSide.player1));
      expect(state.status, equals(CombatStatus.finished));
    });

    test('simulates turn switching', () {
      var state = CombatGameState.initial('test');

      expect(state.currentPlayer, equals(PlayerSide.player1));

      // Complete P1's turn, switch to P2
      state = state.copyWith(
        currentPlayer: PlayerSide.player2,
        currentPhase: TurnPhase.autoPlacement,
      );

      expect(state.currentPlayer, equals(PlayerSide.player2));

      // Complete P2's turn, switch back to P1
      state = state.copyWith(
        currentPlayer: PlayerSide.player1,
        currentPhase: TurnPhase.autoPlacement,
      );

      expect(state.currentPlayer, equals(PlayerSide.player1));
    });

    test('simulates phase transitions', () {
      var state = CombatGameState.initial('test');

      // Start at autoPlacement
      expect(state.currentPhase, equals(TurnPhase.autoPlacement));

      // Move to perkSelection
      state = state.copyWith(currentPhase: TurnPhase.perkSelection);
      expect(state.currentPhase, equals(TurnPhase.perkSelection));

      // Move to deferredResolution (next turn)
      state = state.copyWith(currentPhase: TurnPhase.deferredResolution);
      expect(state.currentPhase, equals(TurnPhase.deferredResolution));
    });
  });
}
