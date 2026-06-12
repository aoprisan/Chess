import 'package:flutter_test/flutter_test.dart';
import 'package:kiddie_chess/models/adventure.dart';
import 'package:kiddie_chess/models/hero.dart';
import 'package:kiddie_chess/services/adventure_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AdventureNode', () {
    test('parses a rival node with connections from JSON', () {
      final node = AdventureNode.fromJson({
        'id': 'mGate',
        'type': 'rival',
        'rivalIndex': 0,
        'x': 0.5,
        'y': 0.695,
        'biome': 'meadow',
        'connections': ['mB', 'fA'],
      });
      expect(node.type, AdventureNodeType.rival);
      expect(node.rivalIndex, 0);
      expect(node.biome, Biome.meadow);
      expect(node.connections, ['mB', 'fA']);
      expect(node.obstacle, isNull);
    });

    test('parses an obstacle node from JSON', () {
      final node = AdventureNode.fromJson({
        'id': 'mL1',
        'type': 'obstacle',
        'obstacle': 'fallenLog',
        'x': 0.24,
        'y': 0.875,
        'biome': 'meadow',
        'connections': ['mA', 'mL2'],
      });
      expect(node.type, AdventureNodeType.obstacle);
      expect(node.obstacle, ObstacleType.fallenLog);
    });
  });

  group('AdventureProgress', () {
    test('JSON roundtrip preserves all fields', () {
      final progress = AdventureProgress(
        mapId: 'journey_1',
        heroType: HeroType.panda,
        currentNodeId: 'fB',
        visitedNodes: {'start', 'mA', 'mL1', 'fB'},
        rivalStars: {'mGate': 3, 'mT1': 1},
        clearedNodes: {'mL1', 'mT2'},
        completed: false,
      );
      final restored = AdventureProgress.fromJson(progress.toJson());
      expect(restored.mapId, 'journey_1');
      expect(restored.heroType, HeroType.panda);
      expect(restored.currentNodeId, 'fB');
      expect(restored.visitedNodes, {'start', 'mA', 'mL1', 'fB'});
      expect(restored.rivalStars, {'mGate': 3, 'mT1': 1});
      expect(restored.clearedNodes, {'mL1', 'mT2'});
      expect(restored.completed, false);
    });
  });

  group('AdventureService maze', () {
    setUp(() {
      SharedPreferences.setMockInitialValues({});
    });

    Future<AdventureService> loadService(HeroType hero) async {
      final service = AdventureService();
      await service.load(newJourneyHero: hero);
      return service;
    }

    test('map is a consistent graph: every edge listed on both endpoints',
        () async {
      final service = await loadService(HeroType.panda);
      for (final node in service.map.nodes) {
        expect(node.connections, isNotEmpty,
            reason: '${node.id} has no connections');
        for (final other in node.connections) {
          expect(service.map.nodeById(other).connections, contains(node.id),
              reason: 'edge ${node.id}->$other is one-directional');
        }
      }
    });

    test('loads rivals for all 5 non-player heroes', () async {
      final service = await loadService(HeroType.panda);
      expect(service.map.rivalCount, 5);
      expect(service.rivals.length, 5);
      expect(service.rivals.any((h) => h.type == HeroType.panda), isFalse);
      expect(service.rivals.last.type, HeroType.yeti);
    });

    test('snowman becomes the boss when the player picks yeti', () async {
      final service = await loadService(HeroType.yeti);
      expect(service.rivals.last.type, HeroType.snowman);
      expect(service.rivals.any((h) => h.type == HeroType.yeti), isFalse);
    });

    test('starts on the start node with only its neighbor reachable',
        () async {
      final service = await loadService(HeroType.sloth);
      expect(service.currentNode.id, 'start');
      expect(service.canMoveTo(service.map.nodeById('mA')), isTrue);
      expect(service.canMoveTo(service.map.nodeById('mL1')), isFalse);
      expect(service.canMoveTo(service.map.nodeById('mB')), isFalse);
    });

    test('junctions offer a choice of routes', () async {
      final service = await loadService(HeroType.sloth);
      service.moveToNode('mA');
      expect(service.canMoveTo(service.map.nodeById('mL1')), isTrue);
      expect(service.canMoveTo(service.map.nodeById('mR1')), isTrue);
      expect(service.canMoveTo(service.map.nodeById('start')), isTrue);
    });

    test('an uncleared obstacle only allows retreating the way you came',
        () async {
      final service = await loadService(HeroType.sloth);
      service.moveToNode('mA');
      service.moveToNode('mL1'); // fallen log, uncleared
      expect(service.canMoveTo(service.map.nodeById('mL2')), isFalse);
      expect(service.canMoveTo(service.map.nodeById('mA')), isTrue);
      service.markObstacleCleared('mL1');
      expect(service.canMoveTo(service.map.nodeById('mL2')), isTrue);
    });

    test('walking is free across cleared and visited nodes', () async {
      final service = await loadService(HeroType.sloth);
      service.moveToNode('mA');
      service.moveToNode('mR1');
      service.moveToNode('mA'); // backtrack
      service.moveToNode('mL1');
      service.markObstacleCleared('mL1');
      service.moveToNode('mL2');
      expect(service.progress.visitedNodes,
          containsAll(['start', 'mA', 'mR1', 'mL1', 'mL2']));
    });

    test('optional rival guards the treasure dead end', () async {
      final service = await loadService(HeroType.sloth);
      // Walk the right meadow route to the optional rival (panda slot)
      service.moveToNode('mA');
      service.moveToNode('mR1');
      service.moveToNode('mR2');
      service.markObstacleCleared('mR2'); // raft
      service.moveToNode('mT1'); // optional rival, uncleared
      expect(service.canMoveTo(service.map.nodeById('mT2')), isFalse);
      service.recordFightResult('mT1', 2);
      expect(service.canMoveTo(service.map.nodeById('mT2')), isTrue);
    });

    test('full main-path run reaches the summit without optional fights',
        () async {
      final service = await loadService(HeroType.sloth);
      void clearObstacle(String id) => service.markObstacleCleared(id);
      void winFight(String id) => service.recordFightResult(id, 1);

      for (final step in [
        'mA', 'mL1', // log
      ]) {
        service.moveToNode(step);
      }
      clearObstacle('mL1');
      service.moveToNode('mL2');
      service.moveToNode('mB');
      service.moveToNode('mGate');
      winFight('mGate');
      service.moveToNode('fA');
      service.moveToNode('fL1');
      clearObstacle('fL1');
      service.moveToNode('fL2');
      clearObstacle('fL2');
      service.moveToNode('fB');
      service.moveToNode('fGate');
      winFight('fGate');
      service.moveToNode('pA');
      service.moveToNode('pL1');
      clearObstacle('pL1');
      service.moveToNode('pL2');
      service.moveToNode('pB');
      service.moveToNode('pBoss');
      winFight('pBoss');
      expect(service.canMoveTo(service.map.nodeById('finish')), isTrue);
      service.moveToNode('finish');
      service.completeJourney();

      expect(service.progress.completed, isTrue);
      // Optional rivals were never fought
      expect(service.starsForNode('mT1'), 0);
      expect(service.starsForNode('fT1'), 0);
    });

    test('records the best fight result and ignores losses', () async {
      final service = await loadService(HeroType.sloth);
      service.recordFightResult('mGate', 2);
      expect(service.starsForNode('mGate'), 2);
      service.recordFightResult('mGate', 1);
      expect(service.starsForNode('mGate'), 2);
      service.recordFightResult('mGate', 0);
      expect(service.starsForNode('mGate'), 2);
      service.recordFightResult('mGate', 3);
      expect(service.starsForNode('mGate'), 3);
    });

    test('totals stars from fights and treasures', () async {
      final service = await loadService(HeroType.sloth);
      service.recordFightResult('mGate', 3);
      service.openTreasure('mT2');
      expect(service.totalStars, 5);
      // 5 rivals * 3 stars + 5 treasures * 2 stars
      expect(service.maxStars, 25);
    });

    test('difficulty ramps with the rival index', () async {
      final service = await loadService(HeroType.sloth);
      AdventureNode rival(String id) => service.map.nodeById(id);
      expect(service.difficultyForNode(rival('mGate')), 'easy'); // index 0
      expect(service.difficultyForNode(rival('mT1')), 'easy'); // index 1
      expect(service.difficultyForNode(rival('fGate')), 'medium'); // index 2
      expect(service.difficultyForNode(rival('fT1')), 'medium'); // index 3
      expect(service.difficultyForNode(rival('pBoss')), 'hard'); // index 4
      expect(service.isBossNode(rival('pBoss')), isTrue);
      expect(service.isBossNode(rival('fGate')), isFalse);
    });

    test('progress persists and can be resumed', () async {
      final service = await loadService(HeroType.gnom);
      service.moveToNode('mA');
      service.moveToNode('mL1');
      service.markObstacleCleared('mL1');
      // wait for the async save inside the service to land
      await Future<void>.delayed(Duration.zero);

      expect(await AdventureService.hasSavedJourney(), isTrue);
      final resumed = AdventureService();
      await resumed.load();
      expect(resumed.progress.heroType, HeroType.gnom);
      expect(resumed.progress.currentNodeId, 'mL1');
      expect(resumed.progress.visitedNodes, contains('mA'));
      expect(resumed.progress.clearedNodes, contains('mL1'));

      await AdventureService.clearSavedJourney();
      expect(await AdventureService.hasSavedJourney(), isFalse);
    });
  });
}
