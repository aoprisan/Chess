import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/adventure.dart';
import '../models/hero.dart';

/// Owns the adventure maze definition and the player's journey progress.
///
/// The map is a graph: the player stands on one node and may step to any
/// connected node, with one rule — an uncleared event node (obstacle, rival,
/// treasure) blocks passage onward: from it you may only retreat to nodes you
/// have already visited until you clear it.
///
/// Progress is stored locally in SharedPreferences so a journey survives app
/// restarts. Fights are played through the existing CombatService (solo AI
/// mode); this service only records their outcomes.
class AdventureService extends ChangeNotifier {
  static const _prefsKey = 'adventure_progress_v2';
  static const _mapAsset = 'assets/maps/journey_1.json';

  /// Fixed rival order. The player's own hero is removed from this list,
  /// leaving exactly 5 rivals; map nodes pick rivals by index, and the last
  /// index is the final boss.
  static const _rivalOrder = [
    HeroType.gnom,
    HeroType.panda,
    HeroType.sloth,
    HeroType.unicorn,
    HeroType.snowman,
    HeroType.yeti,
  ];

  AdventureMapDef? _map;
  AdventureProgress? _progress;

  bool get isLoaded => _map != null && _progress != null;
  AdventureMapDef get map => _map!;
  AdventureProgress get progress => _progress!;

  Hero get playerHero =>
      Hero.allHeroes.firstWhere((h) => h.type == progress.heroType);

  List<Hero> get rivals => _rivalOrder
      .where((t) => t != progress.heroType)
      .map((t) => Hero.allHeroes.firstWhere((h) => h.type == t))
      .toList();

  static Future<bool> hasSavedJourney() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_prefsKey) != null;
  }

  static Future<void> clearSavedJourney() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_prefsKey);
  }

  /// Loads the map, then either starts a fresh journey with [newJourneyHero]
  /// or restores the saved one.
  Future<void> load({HeroType? newJourneyHero}) async {
    final raw = await rootBundle.loadString(_mapAsset);
    _map = AdventureMapDef.fromJson(jsonDecode(raw) as Map<String, dynamic>);

    if (newJourneyHero != null) {
      _progress = AdventureProgress.fresh(
          _map!.id, newJourneyHero, _map!.startNodeId);
      await _save();
    } else {
      final prefs = await SharedPreferences.getInstance();
      final stored = prefs.getString(_prefsKey);
      if (stored != null) {
        _progress = AdventureProgress.fromJson(
            jsonDecode(stored) as Map<String, dynamic>);
      } else {
        _progress = AdventureProgress.fresh(
            _map!.id, HeroType.panda, _map!.startNodeId);
        await _save();
      }
    }
    notifyListeners();
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_prefsKey, jsonEncode(progress.toJson()));
  }

  AdventureNode get currentNode => map.nodeById(progress.currentNodeId);

  bool isNodeCleared(AdventureNode node) {
    switch (node.type) {
      case AdventureNodeType.start:
      case AdventureNodeType.path:
        return true;
      case AdventureNodeType.finish:
        return progress.completed;
      case AdventureNodeType.obstacle:
      case AdventureNodeType.treasure:
        return progress.clearedNodes.contains(node.id);
      case AdventureNodeType.rival:
        return progress.rivalStars.containsKey(node.id);
    }
  }

  bool isNodeVisited(AdventureNode node) =>
      progress.visitedNodes.contains(node.id);

  bool isAdjacentToPlayer(AdventureNode node) =>
      map.neighborsOf(progress.currentNodeId).contains(node.id);

  /// Whether the player may step from the current node onto [node].
  /// Allowed for any connected node, except that an uncleared current node
  /// only lets you retreat to nodes you have already visited.
  bool canMoveTo(AdventureNode node) {
    if (!isAdjacentToPlayer(node)) return false;
    if (isNodeCleared(currentNode)) return true;
    return isNodeVisited(node);
  }

  /// Whether tapping [node] should do anything right now: step onto it,
  /// retry the event on the node the player is standing on, or replay an
  /// already-defeated rival underfoot.
  bool canTapNode(AdventureNode node) {
    if (node.id == progress.currentNodeId) {
      // Retry an uncleared event, or rematch a defeated rival
      return !isNodeCleared(node) || node.type == AdventureNodeType.rival;
    }
    return canMoveTo(node);
  }

  void moveToNode(String nodeId) {
    progress.currentNodeId = nodeId;
    progress.visitedNodes.add(nodeId);
    _save();
    notifyListeners();
  }

  void markObstacleCleared(String nodeId) {
    progress.clearedNodes.add(nodeId);
    _save();
    notifyListeners();
  }

  void openTreasure(String nodeId) {
    progress.clearedNodes.add(nodeId);
    _save();
    notifyListeners();
  }

  /// Records a fight outcome. [stars] is 0 for a loss (nothing recorded),
  /// 1..3 for a win; the best result per rival is kept.
  void recordFightResult(String nodeId, int stars) {
    if (stars <= 0) return;
    final existing = progress.rivalStars[nodeId] ?? 0;
    if (stars > existing) {
      progress.rivalStars[nodeId] = stars;
    }
    _save();
    notifyListeners();
  }

  void completeJourney() {
    progress.completed = true;
    _save();
    notifyListeners();
  }

  Hero rivalForNode(AdventureNode node) => rivals[node.rivalIndex!];

  bool isBossNode(AdventureNode node) =>
      node.rivalIndex != null && node.rivalIndex == rivals.length - 1;

  /// Difficulty by rival index: 0-1 easy, 2-3 medium, boss hard.
  String difficultyForNode(AdventureNode node) {
    final index = node.rivalIndex!;
    if (index <= 1) return 'easy';
    if (index <= 3) return 'medium';
    return 'hard';
  }

  int starsForNode(String nodeId) => progress.rivalStars[nodeId] ?? 0;

  /// Total stars: rival fight stars plus 2 per opened treasure chest.
  int get totalStars {
    final fightStars =
        progress.rivalStars.values.fold(0, (sum, s) => sum + s);
    final treasureStars = map.nodes
            .where((n) =>
                n.type == AdventureNodeType.treasure &&
                progress.clearedNodes.contains(n.id))
            .length *
        2;
    return fightStars + treasureStars;
  }

  /// Maximum stars achievable on this map (3 per rival + 2 per treasure).
  int get maxStars {
    final treasures =
        map.nodes.where((n) => n.type == AdventureNodeType.treasure).length;
    return map.rivalCount * 3 + treasures * 2;
  }
}
