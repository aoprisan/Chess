import 'package:flutter/material.dart' hide Hero;

import '../models/adventure.dart';
import '../models/hero.dart';
import 'adventure_node.dart';

const _cream = Color(0xFFF5E6D3);
const _brown = Color(0xFF8D6E63);
const _cocoa = Color(0xFF5D4037);

Widget _panel({required Widget child, double width = 300}) {
  return Dialog(
    backgroundColor: Colors.transparent,
    child: Container(
      width: width,
      padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
      decoration: BoxDecoration(
        color: _cream,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _brown, width: 3),
      ),
      child: child,
    ),
  );
}

Widget _dialogButton(String text, VoidCallback onTap, {bool primary = true}) {
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

/// Rival challenge popup. Resolves to true if the player chose to fight.
Future<bool> showEncounterPopup(
  BuildContext context, {
  required Hero playerHero,
  required Hero rival,
  required bool isBoss,
  required String difficulty,
  int previousStars = 0,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => _panel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            isBoss
                ? '${rival.name} guards the summit!'
                : '${rival.name} blocks your path!',
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: _cocoa,
            ),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              HeroToken(hero: playerHero, size: 80),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: AdventureImage(
                  assetName: 'ui_vs',
                  size: 44,
                  fallback: Center(
                    child: Text(
                      'VS',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: _cocoa,
                      ),
                    ),
                  ),
                ),
              ),
              HeroToken(hero: rival, size: 80),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            previousStars > 0
                ? 'Already defeated — fight again for more stars!'
                : 'Difficulty: ${difficulty[0].toUpperCase()}${difficulty.substring(1)}',
            style: const TextStyle(fontSize: 13, color: _brown),
          ),
          const SizedBox(height: 20),
          _dialogButton('Fight!', () => Navigator.pop(dialogContext, true)),
          const SizedBox(height: 10),
          _dialogButton('Not Yet', () => Navigator.pop(dialogContext, false),
              primary: false),
        ],
      ),
    ),
  );
  return result ?? false;
}

class _ObstacleInfo {
  final String title;
  final String instruction;
  final String clearedText;
  final int tapsRequired;

  const _ObstacleInfo(
      this.title, this.instruction, this.clearedText, this.tapsRequired);
}

const Map<ObstacleType, _ObstacleInfo> _obstacleInfo = {
  ObstacleType.fallenLog: _ObstacleInfo('A Fallen Log!',
      'Tap the log 3 times to push it aside!', 'You pushed it away!', 3),
  ObstacleType.riverRaft: _ObstacleInfo(
      'A River!', 'Tap the raft to float across!', 'Smooth sailing!', 1),
  ObstacleType.sleepingCub: _ObstacleInfo('A Sleeping Bear Cub!',
      'Tap gently to wake it up!', 'It yawned and wandered off!', 2),
  ObstacleType.tangledVines: _ObstacleInfo('Tangled Vines!',
      'Tap 3 times to brush them aside!', 'The path is clear!', 3),
  ObstacleType.ropeBridge: _ObstacleInfo(
      'A Wobbly Bridge!', 'Tap to cross carefully!', 'You made it across!', 1),
  ObstacleType.snowballBoulder: _ObstacleInfo('A Giant Snowball!',
      'Tap 3 times to roll it off the path!', 'It rolled away!', 3),
  ObstacleType.icePatch: _ObstacleInfo(
      'Slippery Ice!', 'Tap to slide across!', 'Wheee! You slid across!', 1),
};

/// One-tap (or few-tap) obstacle interaction. No fail state — resolves to
/// true when cleared, false only if dismissed.
Future<bool> showObstaclePopup(
  BuildContext context, {
  required ObstacleType obstacle,
}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => _ObstacleDialog(obstacle: obstacle),
  );
  return result ?? false;
}

class _ObstacleDialog extends StatefulWidget {
  final ObstacleType obstacle;

  const _ObstacleDialog({required this.obstacle});

  @override
  State<_ObstacleDialog> createState() => _ObstacleDialogState();
}

class _ObstacleDialogState extends State<_ObstacleDialog> {
  int _taps = 0;
  bool _cleared = false;

  _ObstacleInfo get _info => _obstacleInfo[widget.obstacle]!;

  void _onTapObstacle() {
    if (_cleared) return;
    setState(() => _taps++);
    if (_taps >= _info.tapsRequired) {
      setState(() => _cleared = true);
      Future.delayed(const Duration(milliseconds: 900), () {
        if (mounted) Navigator.pop(context, true);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final remaining = _info.tapsRequired - _taps;
    return _panel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            _info.title,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: _cocoa,
            ),
          ),
          const SizedBox(height: 16),
          GestureDetector(
            onTap: _onTapObstacle,
            child: AnimatedRotation(
              turns: _cleared ? 0 : _taps * 0.02,
              duration: const Duration(milliseconds: 150),
              child: AnimatedScale(
                scale: _cleared ? 0.6 : 1.0,
                duration: const Duration(milliseconds: 400),
                child: Opacity(
                  opacity: _cleared ? 0.4 : 1.0,
                  child: AdventureImage(
                    assetName: obstacleAssetName[widget.obstacle]!,
                    size: 130,
                    fallback: Center(
                      child: Text(
                        obstacleEmoji[widget.obstacle]!,
                        style: const TextStyle(fontSize: 80),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _cleared
                ? _info.clearedText
                : (_taps == 0
                    ? _info.instruction
                    : 'Keep going! $remaining more...'),
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              fontWeight: _cleared ? FontWeight.bold : FontWeight.normal,
              color: _cleared ? const Color(0xFF4CAF50) : _brown,
            ),
          ),
        ],
      ),
    );
  }
}

/// Treasure chest popup. Resolves to true once opened.
Future<bool> showTreasurePopup(BuildContext context) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (dialogContext) => const _TreasureDialog(),
  );
  return result ?? false;
}

class _TreasureDialog extends StatefulWidget {
  const _TreasureDialog();

  @override
  State<_TreasureDialog> createState() => _TreasureDialogState();
}

class _TreasureDialogState extends State<_TreasureDialog> {
  bool _opened = false;

  void _open() {
    if (_opened) return;
    setState(() => _opened = true);
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (mounted) Navigator.pop(context, true);
    });
  }

  @override
  Widget build(BuildContext context) {
    return _panel(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text(
            'A Treasure Chest!',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: _cocoa,
            ),
          ),
          const SizedBox(height: 16),
          GestureDetector(
            onTap: _open,
            child: AnimatedScale(
              scale: _opened ? 1.15 : 1.0,
              duration: const Duration(milliseconds: 300),
              child: AdventureImage(
                assetName: _opened ? 'prop_chest_open' : 'prop_chest_closed',
                size: 120,
                fallback: Center(
                  child: Text(
                    _opened ? '⭐' : '🎁',
                    style: const TextStyle(fontSize: 72),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            _opened ? '+2 Stars!' : 'Tap to open!',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: _opened ? const Color(0xFFFF9800) : _brown,
            ),
          ),
        ],
      ),
    );
  }
}
