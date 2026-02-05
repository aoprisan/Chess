import 'package:flutter/material.dart';
import '../models/combat_state.dart';

/// Returns the icon for a lane effect based on its type and category
IconData _effectIcon(LaneEffect effect) {
  switch (effect.effectType) {
    case 'trigger':
      if (effect.category == EffectCategory.offensive) {
        return Icons.warning_amber_rounded;
      }
      return Icons.shield_outlined;
    case 'deferred':
      return Icons.schedule;
    case 'duration':
      if (effect.effectName == 'SANCTUARY') return Icons.favorite_outline;
      if (effect.effectName == 'CAPTURE') return Icons.gps_fixed;
      return Icons.timer;
    case 'raid':
      return Icons.sports_kabaddi;
    default:
      return Icons.auto_awesome;
  }
}

/// Overlay widget showing active lane effects on a half-lane
class LaneEffectOverlay extends StatelessWidget {
  final List<LaneEffect> effects;
  final double laneHeight;
  final double halfWidth;
  final int laneIndex;
  final double top;
  final bool isLeftSide; // true = player1's half (left), false = player2's half (right)

  const LaneEffectOverlay({
    super.key,
    required this.effects,
    required this.laneHeight,
    required this.halfWidth,
    required this.laneIndex,
    required this.top,
    required this.isLeftSide,
  });

  @override
  Widget build(BuildContext context) {
    if (effects.isEmpty) return const SizedBox.shrink();

    // Determine color based on perk category of first effect
    final category = effects.first.category;
    final Color baseColor;
    switch (category) {
      case EffectCategory.defensive:
        baseColor = Colors.blue.shade400;
      case EffectCategory.offensive:
        baseColor = Colors.red.shade400;
      case EffectCategory.utility:
        baseColor = Colors.amber.shade400;
    }
    final overlayColor = baseColor.withValues(alpha: 0.15);
    final borderColor = baseColor;
    final textColor = baseColor;

    return Positioned(
      top: top,
      left: isLeftSide ? 0 : halfWidth,
      width: halfWidth,
      height: laneHeight,
      child: IgnorePointer(
        child: Container(
          decoration: BoxDecoration(
            color: overlayColor,
            border: Border.all(
              color: borderColor.withValues(alpha: 0.6),
              width: 1.5,
            ),
          ),
          child: Center(
            child: _buildEffectPills(textColor, borderColor),
          ),
        ),
      ),
    );
  }

  Widget _buildEffectPills(Color textColor, Color borderColor) {
    // Compact mode when >2 effects
    if (effects.length > 2) {
      return _buildCompactPill(textColor, borderColor);
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: effects.map((effect) {
        return _buildSinglePill(effect, textColor, borderColor);
      }).toList(),
    );
  }

  Widget _buildSinglePill(LaneEffect effect, Color textColor, Color borderColor) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 1),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: borderColor.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_effectIcon(effect), color: textColor, size: 10),
          const SizedBox(width: 3),
          Text(
            effect.effectName,
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.bold,
              color: textColor,
            ),
          ),
          if (effect.turnsLeft != null && effect.turnsLeft! > 0) ...[
            const SizedBox(width: 3),
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: borderColor.withValues(alpha: 0.4),
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(
                  '${effect.turnsLeft}',
                  style: TextStyle(
                    fontSize: 7,
                    fontWeight: FontWeight.bold,
                    color: textColor,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCompactPill(Color textColor, Color borderColor) {
    // Show count + first effect name
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: borderColor.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_effectIcon(effects.first), color: textColor, size: 10),
          const SizedBox(width: 3),
          Text(
            '${effects.length} effects',
            style: TextStyle(
              fontSize: 8,
              fontWeight: FontWeight.bold,
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}
