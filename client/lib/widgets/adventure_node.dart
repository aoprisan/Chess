import 'package:flutter/material.dart' hide Hero;

import '../models/adventure.dart';
import '../models/hero.dart';

/// Asset path for a generated adventure image. All adventure art lives in
/// assets/images/adventure/; until an image exists there the widgets below
/// fall back to placeholder visuals automatically.
String adventureAsset(String name) => 'assets/images/adventure/$name.png';

/// Renders an adventure asset if present, otherwise the given fallback.
class AdventureImage extends StatelessWidget {
  final String assetName;
  final Widget fallback;
  final double size;
  final BoxFit fit;

  const AdventureImage({
    super.key,
    required this.assetName,
    required this.fallback,
    required this.size,
    this.fit = BoxFit.contain,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Image.asset(
        adventureAsset(assetName),
        fit: fit,
        errorBuilder: (context, error, stackTrace) => fallback,
      ),
    );
  }
}

/// Emoji placeholders shown until the generated obstacle art is dropped in.
const Map<ObstacleType, String> obstacleEmoji = {
  ObstacleType.fallenLog: '🪵',
  ObstacleType.riverRaft: '🛶',
  ObstacleType.sleepingCub: '🐻',
  ObstacleType.tangledVines: '🌿',
  ObstacleType.ropeBridge: '🌉',
  ObstacleType.snowballBoulder: '⛄',
  ObstacleType.icePatch: '🧊',
};

const Map<ObstacleType, String> obstacleAssetName = {
  ObstacleType.fallenLog: 'obstacle_fallen_log',
  ObstacleType.riverRaft: 'obstacle_river_raft',
  ObstacleType.sleepingCub: 'obstacle_sleeping_cub',
  ObstacleType.tangledVines: 'obstacle_tangled_vines',
  ObstacleType.ropeBridge: 'obstacle_rope_bridge',
  ObstacleType.snowballBoulder: 'obstacle_snowball',
  ObstacleType.icePatch: 'obstacle_ice_patch',
};

/// Full-body map token for a hero; falls back to the existing portrait art.
class HeroToken extends StatelessWidget {
  final Hero hero;
  final double size;

  const HeroToken({super.key, required this.hero, required this.size});

  @override
  Widget build(BuildContext context) {
    return AdventureImage(
      assetName: 'token_${hero.type.name}',
      size: size,
      fallback: Image.asset(
        hero.imagePath,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => Center(
          child: Text(
            hero.name[0],
            style: TextStyle(
              fontSize: size * 0.5,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF5D4037),
            ),
          ),
        ),
      ),
    );
  }
}

/// Visual state of a node on the map
enum NodeVisualState { locked, next, current, cleared, visited }

/// One tappable node on the adventure map.
class AdventureNodeWidget extends StatefulWidget {
  final AdventureNode node;
  final NodeVisualState state;
  final Hero? rivalHero;
  final int stars;
  final double size;
  final VoidCallback? onTap;

  const AdventureNodeWidget({
    super.key,
    required this.node,
    required this.state,
    this.rivalHero,
    this.stars = 0,
    required this.size,
    this.onTap,
  });

  @override
  State<AdventureNodeWidget> createState() => _AdventureNodeWidgetState();
}

class _AdventureNodeWidgetState extends State<AdventureNodeWidget>
    with TickerProviderStateMixin {
  AnimationController? _pulseController;

  // Pulse both the next reachable node and an uncleared node the player is
  // standing on (e.g. a rival they declined to fight), so there is always a
  // visible cue for what to tap.
  bool get _shouldPulse =>
      widget.state == NodeVisualState.next ||
      widget.state == NodeVisualState.current;

  @override
  void initState() {
    super.initState();
    _syncPulse();
  }

  @override
  void didUpdateWidget(AdventureNodeWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncPulse();
  }

  void _syncPulse() {
    if (_shouldPulse && _pulseController == null) {
      _pulseController = AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 900),
      )..repeat(reverse: true);
    } else if (!_shouldPulse && _pulseController != null) {
      _pulseController!.dispose();
      _pulseController = null;
    }
  }

  @override
  void dispose() {
    _pulseController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLocked = widget.state == NodeVisualState.locked;

    Widget content = _buildNodeContent();
    if (isLocked) {
      content = Opacity(
        opacity: 0.45,
        child: ColorFiltered(
          colorFilter: const ColorFilter.matrix(<double>[
            0.4, 0.4, 0.4, 0, 30, // desaturated, slightly lifted
            0.4, 0.4, 0.4, 0, 30,
            0.4, 0.4, 0.4, 0, 30,
            0, 0, 0, 1, 0,
          ]),
          child: content,
        ),
      );
    }

    return GestureDetector(
      onTap: widget.onTap,
      child: SizedBox(
        width: widget.size,
        height: widget.size * 1.25,
        child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            if (_pulseController != null)
              AnimatedBuilder(
                animation: _pulseController!,
                builder: (context, _) {
                  final t = _pulseController!.value;
                  return Container(
                    width: widget.size * (0.95 + 0.25 * t),
                    height: widget.size * (0.95 + 0.25 * t),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: const Color(0xFFFFC107)
                            .withValues(alpha: 0.9 - 0.5 * t),
                        width: 3,
                      ),
                    ),
                  );
                },
              ),
            content,
            // Star badge for defeated rivals
            if (widget.node.type == AdventureNodeType.rival &&
                widget.stars > 0)
              Positioned(
                bottom: 0,
                child: _StarRow(stars: widget.stars, size: widget.size * 0.2),
              ),
            // Lock badge on locked event nodes
            if (isLocked && widget.node.type != AdventureNodeType.path)
              Positioned(
                top: 0,
                right: 0,
                child: Icon(
                  Icons.lock,
                  size: widget.size * 0.3,
                  color: const Color(0xFF5D4037).withValues(alpha: 0.8),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildNodeContent() {
    final size = widget.size;
    switch (widget.node.type) {
      case AdventureNodeType.start:
        return AdventureImage(
          assetName: 'prop_flag',
          size: size,
          fallback: _emojiDot('🚩', size),
        );
      case AdventureNodeType.finish:
        return AdventureImage(
          assetName: 'prop_banner',
          size: size,
          fallback: _emojiDot('🏁', size),
        );
      case AdventureNodeType.path:
        return Container(
          width: size * 0.4,
          height: size * 0.4,
          decoration: BoxDecoration(
            color: const Color(0xFF8D6E63),
            shape: BoxShape.circle,
            border: Border.all(color: const Color(0xFF5D4037), width: 2),
          ),
        );
      case AdventureNodeType.obstacle:
        final cleared = widget.state == NodeVisualState.cleared;
        return Opacity(
          opacity: cleared ? 0.5 : 1.0,
          child: AdventureImage(
            assetName: obstacleAssetName[widget.node.obstacle]!,
            size: size,
            fallback: _emojiDot(obstacleEmoji[widget.node.obstacle]!, size),
          ),
        );
      case AdventureNodeType.treasure:
        final opened = widget.state == NodeVisualState.cleared;
        return AdventureImage(
          assetName: opened ? 'prop_chest_open' : 'prop_chest_closed',
          size: size,
          fallback: _emojiDot(opened ? '⭐' : '🎁', size),
        );
      case AdventureNodeType.rival:
        return HeroToken(hero: widget.rivalHero!, size: size);
    }
  }

  Widget _emojiDot(String emoji, double size) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: const Color(0xFFF5E6D3),
        shape: BoxShape.circle,
        border: Border.all(color: const Color(0xFF8D6E63), width: 2.5),
      ),
      child: Center(
        child: Text(emoji, style: TextStyle(fontSize: size * 0.5)),
      ),
    );
  }
}

class _StarRow extends StatelessWidget {
  final int stars;
  final double size;

  const _StarRow({required this.stars, required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: size * 0.2),
      decoration: BoxDecoration(
        color: const Color(0xFFF5E6D3),
        borderRadius: BorderRadius.circular(size),
        border: Border.all(color: const Color(0xFF8D6E63), width: 1.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: List.generate(3, (i) {
          return Icon(
            Icons.star,
            size: size,
            color: i < stars
                ? const Color(0xFFFFC107)
                : const Color(0xFF8D6E63).withValues(alpha: 0.3),
          );
        }),
      ),
    );
  }
}
