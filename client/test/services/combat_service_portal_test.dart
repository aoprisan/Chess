import 'package:flutter_test/flutter_test.dart';
import 'package:kiddie_chess/models/combat_state.dart';
import 'package:kiddie_chess/services/combat_service.dart';

void main() {
  group('Portal trigger', () {
    late CombatService service;

    setUp(() {
      service = CombatService();
      service.initGame('test-portal');
    });

    test('portal trigger teleports opponent piece off the portal lane', () {
      // P1 sets portal on lane 2
      // First we need P1 as current player (initial state)
      expect(service.gameState!.currentPlayer, PlayerSide.player1);

      // Set portal trigger on lane 2 as P1
      final setResult = service.setPortalTrigger(2);
      expect(setResult, isTrue);
      expect(service.gameState!.lanes[2].triggers.length, 1);
      expect(service.gameState!.lanes[2].triggers.first.type, 'PORTAL');
      expect(service.gameState!.lanes[2].triggers.first.owner, 1); // P1

      // End P1's turn (trigger turnsLeft decrements from 2 to 1)
      service.endTurn();
      expect(service.gameState!.currentPlayer, PlayerSide.player2);

      // Portal trigger should still be alive (turnsLeft was 2, now 1)
      expect(service.gameState!.lanes[2].triggers.length, 1);
      expect(service.gameState!.lanes[2].triggers.first.turnsLeft, 1);

      // Count total P2 pieces on board before placement
      int p2PiecesBefore = 0;
      for (final lane in service.gameState!.lanes) {
        p2PiecesBefore += lane.countPieces(PlayerSide.player2);
      }
      expect(p2PiecesBefore, 0);

      // P2 places on lane 2 (the portal lane) - triggers should fire
      final placed = service.placeOnLane(2);
      expect(placed, isTrue);

      // After portal fires:
      // - The piece placed on lane 2 should have been removed
      // - The piece should have been teleported to another lane
      // - The portal trigger should be consumed (removed)
      expect(service.gameState!.lanes[2].triggers
          .where((t) => t.type == 'PORTAL')
          .isEmpty, isTrue,
          reason: 'Portal trigger should be consumed after firing');

      // P2 should have exactly 1 piece on the board (teleported somewhere)
      int p2PiecesAfter = 0;
      int p2PiecesOnLane2 = 0;
      final piecesPerLane = <int, int>{};
      for (int i = 0; i < 5; i++) {
        final count = service.gameState!.lanes[i].countPieces(PlayerSide.player2);
        piecesPerLane[i] = count;
        p2PiecesAfter += count;
        if (i == 2) p2PiecesOnLane2 = count;
      }

      expect(p2PiecesAfter, 1,
          reason: 'P2 should have exactly 1 piece on the board after portal teleport');

      // With 5 empty lanes and >=3 available, source exclusion removes lane 2
      // So piece should NOT be on lane 2
      expect(p2PiecesOnLane2, 0,
          reason: 'Portal should teleport piece away from the portal lane (source exclusion)');
    });

    test('placeOnLane fires triggers (PlaceAnother perk path)', () {
      // Set portal trigger on lane 0 as P1
      expect(service.gameState!.currentPlayer, PlayerSide.player1);
      service.setPortalTrigger(0);

      // Switch to P2
      service.endTurn();
      expect(service.gameState!.currentPlayer, PlayerSide.player2);

      // Portal should still be active (turnsLeft 2 -> 1)
      expect(service.gameState!.lanes[0].triggers.length, 1);

      // P2 places on lane 0 via placeOnLane (PlaceAnother perk path)
      final placed = service.placeOnLane(0);
      expect(placed, isTrue);

      // Portal trigger should be consumed
      expect(service.gameState!.lanes[0].triggers
          .where((t) => t.type == 'PORTAL')
          .isEmpty, isTrue,
          reason: 'Portal trigger should fire via placeOnLane');

      // Piece should have been teleported (1 piece total, not on lane 0 due to source exclusion)
      int p2Total = 0;
      for (int i = 0; i < 5; i++) {
        p2Total += service.gameState!.lanes[i].countPieces(PlayerSide.player2);
      }
      expect(p2Total, 1, reason: 'Teleported piece should exist on the board');
      expect(service.gameState!.lanes[0].countPieces(PlayerSide.player2), 0,
          reason: 'Piece should be teleported off portal lane');
    });

    test('portal trigger does not fire on same owner placement', () {
      // P1 sets portal on lane 3
      expect(service.gameState!.currentPlayer, PlayerSide.player1);
      service.setPortalTrigger(3);

      // P1 places on lane 3 (own trigger should NOT fire)
      final placed = service.placeOnLane(3);
      expect(placed, isTrue);

      // P1's piece should still be on lane 3 (trigger doesn't fire on own placement)
      expect(service.gameState!.lanes[3].countPieces(PlayerSide.player1), 1,
          reason: 'Own portal should not fire when owner places a piece');

      // Trigger should still be present (not consumed)
      expect(service.gameState!.lanes[3].triggers.length, 1,
          reason: 'Trigger should persist since it was not consumed');
    });
  });
}
