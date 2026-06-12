import 'hero.dart';

/// Types of nodes on the adventure map
enum AdventureNodeType { start, path, obstacle, rival, treasure, finish }

/// Obstacle flavors (each has its own art + interaction)
enum ObstacleType {
  fallenLog,
  riverRaft,
  sleepingCub,
  tangledVines,
  ropeBridge,
  snowballBoulder,
  icePatch,
}

/// Map biomes, bottom (meadow) to top (peaks)
enum Biome { meadow, forest, peaks }

/// A single node in the adventure maze
class AdventureNode {
  final String id;
  final AdventureNodeType type;

  /// Horizontal position as a fraction of map width (0..1)
  final double x;

  /// Vertical position as a fraction of total map height, measured from the
  /// top (0 = summit, 1 = journey start)
  final double y;

  final Biome biome;
  final ObstacleType? obstacle;

  /// For rival nodes: index into the journey's rival list (last index = boss)
  final int? rivalIndex;

  /// Ids of directly connected nodes (edges are undirected; both endpoints
  /// list each other)
  final List<String> connections;

  const AdventureNode({
    required this.id,
    required this.type,
    required this.x,
    required this.y,
    required this.biome,
    this.obstacle,
    this.rivalIndex,
    this.connections = const [],
  });

  factory AdventureNode.fromJson(Map<String, dynamic> json) {
    return AdventureNode(
      id: json['id'] as String,
      type: AdventureNodeType.values.byName(json['type'] as String),
      x: (json['x'] as num).toDouble(),
      y: (json['y'] as num).toDouble(),
      biome: Biome.values.byName(json['biome'] as String),
      obstacle: json['obstacle'] != null
          ? ObstacleType.values.byName(json['obstacle'] as String)
          : null,
      rivalIndex: json['rivalIndex'] as int?,
      connections: (json['connections'] as List? ?? []).cast<String>(),
    );
  }
}

/// A full adventure maze definition (loaded from a JSON asset)
class AdventureMapDef {
  final String id;

  /// Id of the node the player starts on
  final String startNodeId;

  final List<AdventureNode> nodes;
  final Map<String, AdventureNode> _byId;

  AdventureMapDef({
    required this.id,
    required this.startNodeId,
    required this.nodes,
  }) : _byId = {for (final n in nodes) n.id: n};

  factory AdventureMapDef.fromJson(Map<String, dynamic> json) {
    return AdventureMapDef(
      id: json['id'] as String,
      startNodeId: json['startNodeId'] as String,
      nodes: (json['nodes'] as List)
          .map((n) => AdventureNode.fromJson(n as Map<String, dynamic>))
          .toList(),
    );
  }

  AdventureNode nodeById(String id) => _byId[id]!;

  List<String> neighborsOf(String id) => nodeById(id).connections;

  /// All edges as deduplicated node-id pairs (a < b)
  List<(String, String)> get edges {
    final seen = <String>{};
    final result = <(String, String)>[];
    for (final node in nodes) {
      for (final other in node.connections) {
        final key =
            node.id.compareTo(other) < 0 ? '${node.id}|$other' : '$other|${node.id}';
        if (seen.add(key)) {
          result.add(node.id.compareTo(other) < 0
              ? (node.id, other)
              : (other, node.id));
        }
      }
    }
    return result;
  }

  int get rivalCount =>
      nodes.where((n) => n.type == AdventureNodeType.rival).length;
}

/// Player progress through a journey, persisted locally
class AdventureProgress {
  final String mapId;
  final HeroType heroType;

  /// Id of the node the player is currently standing on
  String currentNodeId;

  /// Every node the player has stepped on
  final Set<String> visitedNodes;

  /// Best star result per defeated rival node (1..3)
  final Map<String, int> rivalStars;

  /// Cleared obstacle and opened treasure node ids
  final Set<String> clearedNodes;

  bool completed;

  AdventureProgress({
    required this.mapId,
    required this.heroType,
    required this.currentNodeId,
    Set<String>? visitedNodes,
    Map<String, int>? rivalStars,
    Set<String>? clearedNodes,
    this.completed = false,
  })  : visitedNodes = visitedNodes ?? {currentNodeId},
        rivalStars = rivalStars ?? {},
        clearedNodes = clearedNodes ?? {};

  factory AdventureProgress.fresh(
      String mapId, HeroType heroType, String startNodeId) {
    return AdventureProgress(
      mapId: mapId,
      heroType: heroType,
      currentNodeId: startNodeId,
    );
  }

  factory AdventureProgress.fromJson(Map<String, dynamic> json) {
    return AdventureProgress(
      mapId: json['mapId'] as String,
      heroType: HeroType.values.byName(json['heroType'] as String),
      currentNodeId: json['currentNodeId'] as String,
      visitedNodes:
          (json['visitedNodes'] as List? ?? []).cast<String>().toSet(),
      rivalStars: (json['rivalStars'] as Map<String, dynamic>? ?? {})
          .map((k, v) => MapEntry(k, v as int)),
      clearedNodes:
          (json['clearedNodes'] as List? ?? []).cast<String>().toSet(),
      completed: json['completed'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'mapId': mapId,
      'heroType': heroType.name,
      'currentNodeId': currentNodeId,
      'visitedNodes': visitedNodes.toList(),
      'rivalStars': rivalStars,
      'clearedNodes': clearedNodes.toList(),
      'completed': completed,
    };
  }
}
