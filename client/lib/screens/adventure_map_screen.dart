import 'package:flutter/material.dart' hide Hero;

import '../models/adventure.dart';
import '../models/combat_state.dart';
import '../models/hero.dart';
import '../services/adventure_service.dart';
import '../widgets/adventure_node.dart';
import '../widgets/encounter_popup.dart';
import 'combat_screen.dart';

const _cream = Color(0xFFF5E6D3);
const _brown = Color(0xFF8D6E63);
const _cocoa = Color(0xFF5D4037);

/// The single-player adventure maze: a tall scrollable map across 3 biomes
/// with branching paths, dead-end treasures, obstacles, and rival heroes.
class AdventureMapScreen extends StatefulWidget {
  /// When set, starts a brand new journey with this hero (overwriting any
  /// saved one); otherwise the saved journey is resumed.
  final HeroType? newJourneyHero;

  const AdventureMapScreen({super.key, this.newJourneyHero});

  @override
  State<AdventureMapScreen> createState() => _AdventureMapScreenState();
}

class _AdventureMapScreenState extends State<AdventureMapScreen> {
  final AdventureService _service = AdventureService();
  final ScrollController _scrollController = ScrollController();
  bool _scrolledToStart = false;
  bool _eventInProgress = false;

  @override
  void initState() {
    super.initState();
    _service.addListener(_onServiceChanged);
    _service.load(newJourneyHero: widget.newJourneyHero);
  }

  @override
  void dispose() {
    _service.removeListener(_onServiceChanged);
    _scrollController.dispose();
    super.dispose();
  }

  void _onServiceChanged() {
    if (mounted) setState(() {});
  }

  double get _mapHeightFactor => 3.6; // map height = screen height * factor

  void _scrollToCurrentNode(double mapHeight, double viewportHeight) {
    if (!_scrollController.hasClients) return;
    final node = _service.currentNode;
    final target = (node.y * mapHeight - viewportHeight / 2)
        .clamp(0.0, _scrollController.position.maxScrollExtent);
    _scrollController.animateTo(
      target,
      duration: const Duration(milliseconds: 600),
      curve: Curves.easeInOut,
    );
  }

  Future<void> _onNodeTap(AdventureNode node) async {
    if (_eventInProgress) return;
    if (!_service.canTapNode(node)) {
      // Tapped an unreachable node — explain what is blocking
      if (!_service.progress.completed &&
          !_service.isNodeCleared(_service.currentNode)) {
        _showSnack(_blockedHint(_service.currentNode));
      } else if (!_service.isAdjacentToPlayer(node) &&
          node.id != _service.progress.currentNodeId) {
        _showSnack('You can only walk to a connected spot!');
      }
      return;
    }
    _eventInProgress = true;
    try {
      final standingHere = node.id == _service.progress.currentNodeId;
      if (!standingHere) {
        _service.moveToNode(node.id);
        await Future.delayed(const Duration(milliseconds: 700));
        if (!mounted) return;
      }
      // Walking across an already-cleared node (e.g. a defeated rival on the
      // main path) does not re-trigger its event; tap it again for a rematch.
      if (!_service.isNodeCleared(node) || standingHere) {
        await _triggerNodeEvent(node);
      }
    } finally {
      _eventInProgress = false;
    }
  }

  Future<void> _triggerNodeEvent(AdventureNode node) async {
    switch (node.type) {
      case AdventureNodeType.start:
      case AdventureNodeType.path:
        return;
      case AdventureNodeType.obstacle:
        if (_service.isNodeCleared(node)) return;
        final cleared =
            await showObstaclePopup(context, obstacle: node.obstacle!);
        if (cleared) _service.markObstacleCleared(node.id);
        return;
      case AdventureNodeType.treasure:
        if (_service.isNodeCleared(node)) return;
        final opened = await showTreasurePopup(context);
        if (opened) _service.openTreasure(node.id);
        return;
      case AdventureNodeType.rival:
        final rival = _service.rivalForNode(node);
        final fight = await showEncounterPopup(
          context,
          playerHero: _service.playerHero,
          rival: rival,
          isBoss: _service.isBossNode(node),
          difficulty: _service.difficultyForNode(node),
          previousStars: _service.starsForNode(node.id),
        );
        if (fight && mounted) await _launchFight(node, rival);
        return;
      case AdventureNodeType.finish:
        if (!_service.progress.completed) _service.completeJourney();
        return;
    }
  }

  Future<void> _launchFight(AdventureNode node, Hero rival) async {
    int? resultStars;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => CombatScreen(
          player1Hero: _service.playerHero,
          player2Hero: rival,
          player2IsAI: true,
          player2AIDifficulty: _service.difficultyForNode(node),
          exitButtonLabel: 'Back to Map',
          onGameEnd: (finalState) {
            if (finalState.gameWinner == PlayerSide.player1) {
              // 3 stars for a shutout, 2 if the rival took 1 lane, else 1
              final rivalLanes = finalState.player2LanesWon;
              resultStars = rivalLanes == 0 ? 3 : (rivalLanes == 1 ? 2 : 1);
            } else {
              resultStars = 0;
            }
          },
        ),
      ),
    );
    if (!mounted) return;
    if (resultStars == null) return; // fight abandoned mid-game
    if (resultStars! > 0) {
      _service.recordFightResult(node.id, resultStars!);
      _showSnack(
          'You defeated ${rival.name}! ${'⭐' * resultStars!} The path is open!');
    } else {
      _showSnack('${rival.name} won this time — try again!');
    }
  }

  String _blockedHint(AdventureNode node) {
    switch (node.type) {
      case AdventureNodeType.rival:
        return 'Defeat ${_service.rivalForNode(node).name} to open the path!';
      case AdventureNodeType.obstacle:
        return 'Clear the obstacle to keep going!';
      case AdventureNodeType.treasure:
        return 'Open the treasure chest first!';
      default:
        return 'Tap a glowing node!';
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          message,
          style: const TextStyle(fontWeight: FontWeight.bold, color: _cocoa),
        ),
        backgroundColor: _cream,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Future<void> _confirmStartOver() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: _cream,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: _brown, width: 3),
        ),
        title: const Text('Start Over?',
            style: TextStyle(color: _cocoa, fontWeight: FontWeight.bold)),
        content: const Text(
          'This will erase your journey and let you pick a new hero.',
          style: TextStyle(color: _brown),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel', style: TextStyle(color: _brown)),
          ),
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Start Over',
                style:
                    TextStyle(color: _cocoa, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await AdventureService.clearSavedJourney();
      if (mounted) Navigator.pop(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_service.isLoaded) {
      return const Scaffold(
        backgroundColor: _cream,
        body: Center(child: CircularProgressIndicator(color: _cocoa)),
      );
    }

    return Scaffold(
      body: LayoutBuilder(
        builder: (context, constraints) {
          final mapWidth = constraints.maxWidth;
          final viewportHeight = constraints.maxHeight;
          final mapHeight = viewportHeight * _mapHeightFactor;
          final panelHeight = mapHeight / 3;
          final nodeSize = (mapWidth * 0.15).clamp(52.0, 100.0);

          if (!_scrolledToStart) {
            _scrolledToStart = true;
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (_scrollController.hasClients) {
                final node = _service.currentNode;
                final target = (node.y * mapHeight - viewportHeight / 2)
                    .clamp(0.0, _scrollController.position.maxScrollExtent);
                _scrollController.jumpTo(target);
              }
            });
          }

          return Stack(
            children: [
              SingleChildScrollView(
                controller: _scrollController,
                child: SizedBox(
                  width: mapWidth,
                  height: mapHeight,
                  child: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      // Biome backgrounds: peaks on top, meadow at the bottom
                      _BiomePanel(
                          biome: Biome.peaks,
                          top: 0,
                          width: mapWidth,
                          height: panelHeight),
                      _BiomePanel(
                          biome: Biome.forest,
                          top: panelHeight,
                          width: mapWidth,
                          height: panelHeight),
                      _BiomePanel(
                          biome: Biome.meadow,
                          top: panelHeight * 2,
                          width: mapWidth,
                          height: panelHeight),
                      // Dashed trails along every maze edge
                      Positioned.fill(
                        child: CustomPaint(
                          painter: _PathPainter(
                            map: _service.map,
                            mapWidth: mapWidth,
                            mapHeight: mapHeight,
                            visitedNodes: _service.progress.visitedNodes,
                          ),
                        ),
                      ),
                      // Nodes
                      for (final node in _service.map.nodes)
                        _positionedNode(node, mapWidth, mapHeight, nodeSize),
                      // Player avatar, slightly above the current node
                      AnimatedPositioned(
                        duration: const Duration(milliseconds: 650),
                        curve: Curves.easeInOut,
                        left: _service.currentNode.x * mapWidth -
                            nodeSize * 0.55,
                        top: _service.currentNode.y * mapHeight -
                            nodeSize * 1.25,
                        child: IgnorePointer(
                          child: HeroToken(
                            hero: _service.playerHero,
                            size: nodeSize * 1.1,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // Header overlay
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      _HeaderChip(
                        onTap: () => Navigator.pop(context),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.arrow_back, size: 20, color: _cocoa),
                            SizedBox(width: 4),
                            Text('Menu',
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: _cocoa)),
                          ],
                        ),
                      ),
                      const Spacer(),
                      _HeaderChip(
                        onTap: () => _scrollToCurrentNode(
                            mapHeight, viewportHeight),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.star,
                                size: 20, color: Color(0xFFFFC107)),
                            const SizedBox(width: 4),
                            Text(
                              '${_service.totalStars} / ${_service.maxStars}',
                              style: const TextStyle(
                                  fontWeight: FontWeight.bold, color: _cocoa),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      _HeaderChip(
                        onTap: _confirmStartOver,
                        child:
                            const Icon(Icons.refresh, size: 20, color: _cocoa),
                      ),
                    ],
                  ),
                ),
              ),
              // Victory overlay
              if (_service.progress.completed)
                _VictoryOverlay(
                  hero: _service.playerHero,
                  totalStars: _service.totalStars,
                  maxStars: _service.maxStars,
                  onPlayAgain: () async {
                    await AdventureService.clearSavedJourney();
                    if (context.mounted) Navigator.pop(context);
                  },
                  onBackToMenu: () => Navigator.pop(context),
                ),
            ],
          );
        },
      ),
    );
  }

  NodeVisualState _stateFor(AdventureNode node) {
    final isCurrent = node.id == _service.progress.currentNodeId;
    if (isCurrent) {
      // Pulse when the player still has something to do here
      return _service.isNodeCleared(node)
          ? NodeVisualState.visited
          : NodeVisualState.current;
    }
    if (_service.canMoveTo(node) && !_service.isNodeVisited(node)) {
      return NodeVisualState.next; // new reachable spot — pulse
    }
    if (_service.isNodeVisited(node)) {
      return _service.isNodeCleared(node)
          ? NodeVisualState.cleared
          : NodeVisualState.visited;
    }
    return NodeVisualState.locked;
  }

  Widget _positionedNode(
      AdventureNode node, double mapWidth, double mapHeight, double nodeSize) {
    final size =
        node.type == AdventureNodeType.rival ? nodeSize * 1.2 : nodeSize;

    return Positioned(
      left: node.x * mapWidth - size / 2,
      top: node.y * mapHeight - size / 2,
      child: AdventureNodeWidget(
        node: node,
        state: _stateFor(node),
        rivalHero: node.type == AdventureNodeType.rival
            ? _service.rivalForNode(node)
            : null,
        stars: _service.starsForNode(node.id),
        size: size,
        onTap: () => _onNodeTap(node),
      ),
    );
  }
}

/// One biome's background: generated art if present, gradient placeholder
/// otherwise.
class _BiomePanel extends StatelessWidget {
  final Biome biome;
  final double top;
  final double width;
  final double height;

  const _BiomePanel({
    required this.biome,
    required this.top,
    required this.width,
    required this.height,
  });

  static const _fallbackColors = {
    Biome.meadow: [Color(0xFFD7E8B0), Color(0xFFA8C97F)],
    Biome.forest: [Color(0xFFA8C97F), Color(0xFF6B9362)],
    Biome.peaks: [Color(0xFFE8F1F5), Color(0xFFB8D4E3)],
  };

  static const _labels = {
    Biome.meadow: '🌼 Sunny Meadow',
    Biome.forest: '🌲 Whispering Forest',
    Biome.peaks: '🏔️ Frosty Peaks',
  };

  @override
  Widget build(BuildContext context) {
    return Positioned(
      top: top,
      left: 0,
      width: width,
      height: height,
      child: Image.asset(
        adventureAsset('bg_${biome.name}'),
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: _fallbackColors[biome]!,
            ),
          ),
          child: Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.only(top: 16),
              child: Text(
                _labels[biome]!,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: _cocoa.withValues(alpha: 0.4),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hand-drawn style dashed trails along every edge of the maze. Edges whose
/// both endpoints have been visited are drawn darker.
class _PathPainter extends CustomPainter {
  final AdventureMapDef map;
  final double mapWidth;
  final double mapHeight;
  final Set<String> visitedNodes;

  _PathPainter({
    required this.map,
    required this.mapWidth,
    required this.mapHeight,
    required this.visitedNodes,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final visitedPaint = Paint()
      ..color = _cocoa.withValues(alpha: 0.7)
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final upcomingPaint = Paint()
      ..color = _cocoa.withValues(alpha: 0.3)
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;

    for (final (aId, bId) in map.edges) {
      final a = map.nodeById(aId);
      final b = map.nodeById(bId);
      final from = Offset(a.x * mapWidth, a.y * mapHeight);
      final to = Offset(b.x * mapWidth, b.y * mapHeight);
      final walked =
          visitedNodes.contains(aId) && visitedNodes.contains(bId);
      _drawDashedLine(canvas, from, to, walked ? visitedPaint : upcomingPaint);
    }
  }

  void _drawDashedLine(Canvas canvas, Offset from, Offset to, Paint paint) {
    const dashLength = 10.0;
    const gapLength = 12.0;
    final distance = (to - from).distance;
    if (distance == 0) return;
    final direction = (to - from) / distance;
    var covered = 0.0;
    while (covered < distance) {
      final end = (covered + dashLength).clamp(0.0, distance);
      canvas.drawLine(
          from + direction * covered, from + direction * end, paint);
      covered += dashLength + gapLength;
    }
  }

  @override
  bool shouldRepaint(_PathPainter oldDelegate) =>
      oldDelegate.visitedNodes.length != visitedNodes.length ||
      oldDelegate.mapWidth != mapWidth ||
      oldDelegate.mapHeight != mapHeight;
}

class _HeaderChip extends StatelessWidget {
  final Widget child;
  final VoidCallback onTap;

  const _HeaderChip({required this.child, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: _cream.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: _brown, width: 2),
        ),
        child: child,
      ),
    );
  }
}

class _VictoryOverlay extends StatelessWidget {
  final Hero hero;
  final int totalStars;
  final int maxStars;
  final VoidCallback onPlayAgain;
  final VoidCallback onBackToMenu;

  const _VictoryOverlay({
    required this.hero,
    required this.totalStars,
    required this.maxStars,
    required this.onPlayAgain,
    required this.onBackToMenu,
  });

  @override
  Widget build(BuildContext context) {
    return Positioned.fill(
      child: Container(
        color: Colors.black.withValues(alpha: 0.6),
        child: Center(
          child: Container(
            width: 320,
            padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
            decoration: BoxDecoration(
              color: _cream,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _brown, width: 3),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('🎉', style: TextStyle(fontSize: 40)),
                const Text(
                  'Journey Complete!',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                    color: _cocoa,
                  ),
                ),
                const SizedBox(height: 16),
                HeroToken(hero: hero, size: 110),
                const SizedBox(height: 8),
                Text(
                  '${hero.name} reached the summit!',
                  style: const TextStyle(fontSize: 15, color: _brown),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.star, color: Color(0xFFFFC107), size: 28),
                    const SizedBox(width: 6),
                    Text(
                      '$totalStars / $maxStars stars',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: _cocoa,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _OverlayButton(text: 'New Journey', onTap: onPlayAgain),
                const SizedBox(height: 10),
                _OverlayButton(
                    text: 'Back to Menu', onTap: onBackToMenu, primary: false),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OverlayButton extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  final bool primary;

  const _OverlayButton(
      {required this.text, required this.onTap, this.primary = true});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 200,
        height: 46,
        decoration: BoxDecoration(
          image: DecorationImage(
            image: AssetImage(primary
                ? 'assets/images/ui/yellow-btn-bg.png'
                : 'assets/images/ui/grey-btn-bg.png'),
            fit: BoxFit.fill,
          ),
        ),
        child: Center(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: _cocoa,
            ),
          ),
        ),
      ),
    );
  }
}
