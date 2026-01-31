import 'package:flutter/material.dart';
import 'package:flame/game.dart';
import 'package:provider/provider.dart';
import '../game/chess_game.dart';
import '../services/game_service.dart';
import '../models/game_state.dart';
import '../models/hero.dart';

class GameScreen extends StatefulWidget {
  final bool vsAI;
  final bool online;

  const GameScreen({
    super.key,
    this.vsAI = false,
    this.online = false,
  });

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late ChessGame _game;

  @override
  void initState() {
    super.initState();
    final gameService = context.read<GameService>();
    gameService.initializeGame(
      'game_${DateTime.now().millisecondsSinceEpoch}',
      PlayerColor.white,
    );
    _game = ChessGame(gameService: gameService);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFFFFF8E1), Color(0xFFFFE0B2)],
          ),
        ),
        child: SafeArea(
          child: Column(
            children: [
              // Top bar with opponent info
              _buildPlayerBar(isOpponent: true),
              // Game board
              Expanded(
                child: Center(
                  child: AspectRatio(
                    aspectRatio: 1,
                    child: Container(
                      margin: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(8),
                        boxShadow: const [
                          BoxShadow(
                            color: Colors.black26,
                            blurRadius: 10,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: GameWidget(game: _game),
                      ),
                    ),
                  ),
                ),
              ),
              // Perks bar
              _buildPerksBar(),
              // Bottom bar with player info
              _buildPlayerBar(isOpponent: false),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPlayerBar({required bool isOpponent}) {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        final hero = isOpponent ? null : gameService.selectedHero;
        final isMyTurn = !isOpponent &&
            gameService.gameState?.currentTurn == gameService.playerColor;

        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              // Avatar
              Container(
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: isOpponent ? const Color(0xFFEF5350) : const Color(0xFF4CAF50),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: isMyTurn ? Colors.amber : Colors.transparent,
                    width: 3,
                  ),
                ),
                child: Center(
                  child: Text(
                    hero?.name[0] ?? (isOpponent ? 'O' : 'P'),
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // Name and status
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      isOpponent
                          ? (widget.vsAI ? 'AI Opponent' : 'Opponent')
                          : (hero?.name ?? 'Player'),
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF5D4037),
                      ),
                    ),
                    if (isMyTurn)
                      const Text(
                        'Your turn',
                        style: TextStyle(
                          fontSize: 14,
                          color: Color(0xFF4CAF50),
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                  ],
                ),
              ),
              // Menu button (only on player bar)
              if (!isOpponent)
                IconButton(
                  onPressed: () => _showGameMenu(context),
                  icon: const Icon(Icons.menu, color: Color(0xFF5D4037)),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildPerksBar() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        final hero = gameService.selectedHero;
        if (hero == null) return const SizedBox.shrink();

        final perksRemaining = gameService.playerColor == PlayerColor.white
            ? gameService.gameState?.player1PerksRemaining ?? {}
            : gameService.gameState?.player2PerksRemaining ?? {};

        return Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: hero.perks.map((perk) {
              final count = perksRemaining[perk] ?? 0;
              final isAvailable = count > 0;

              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: _PerkButton(
                  perk: perk,
                  count: count,
                  isAvailable: isAvailable,
                  onTap: isAvailable
                      ? () => _usePerk(context, gameService, perk)
                      : null,
                ),
              );
            }).toList(),
          ),
        );
      },
    );
  }

  void _usePerk(BuildContext context, GameService gameService, Perk perk) {
    // Show dialog to confirm perk usage
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Use ${_perkName(perk)}?'),
        content: Text(_perkDescription(perk)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              gameService.usePerk(perk);
              Navigator.pop(context);
            },
            child: const Text('Use'),
          ),
        ],
      ),
    );
  }

  void _showGameMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (context) => Container(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.flag),
              title: const Text('Resign'),
              onTap: () {
                Navigator.pop(context);
                _confirmResign(context);
              },
            ),
            ListTile(
              leading: const Icon(Icons.handshake),
              title: const Text('Offer Draw'),
              onTap: () {
                Navigator.pop(context);
                // TODO: Implement draw offer
              },
            ),
            ListTile(
              leading: const Icon(Icons.home),
              title: const Text('Back to Menu'),
              onTap: () {
                Navigator.pop(context);
                _confirmExit(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _confirmResign(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Resign?'),
        content: const Text('Are you sure you want to resign this game?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context); // Return to menu
            },
            child: const Text('Resign'),
          ),
        ],
      ),
    );
  }

  void _confirmExit(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave Game?'),
        content: const Text('Your progress will be lost.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              context.read<GameService>().resetGame();
              Navigator.pop(context);
              Navigator.pop(context);
            },
            child: const Text('Leave'),
          ),
        ],
      ),
    );
  }

  String _perkName(Perk perk) {
    switch (perk) {
      case Perk.anotherMove: return 'Extra Move';
      case Perk.removeEnemy: return 'Remove Enemy';
      case Perk.placeAnother: return 'Place Piece';
      case Perk.scatterAround: return 'Scatter';
      case Perk.freeze: return 'Freeze';
      case Perk.cancelMove: return 'Undo';
    }
  }

  String _perkDescription(Perk perk) {
    switch (perk) {
      case Perk.anotherMove: return 'Take an extra turn after this one.';
      case Perk.removeEnemy: return 'Remove any enemy piece from the board.';
      case Perk.placeAnother: return 'Place a captured piece back on the board.';
      case Perk.scatterAround: return 'Randomly reposition enemy pieces.';
      case Perk.freeze: return 'Skip your opponent\'s next turn.';
      case Perk.cancelMove: return 'Undo your last move.';
    }
  }
}

class _PerkButton extends StatelessWidget {
  final Perk perk;
  final int count;
  final bool isAvailable;
  final VoidCallback? onTap;

  const _PerkButton({
    required this.perk,
    required this.count,
    required this.isAvailable,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 60,
        height: 60,
        decoration: BoxDecoration(
          color: isAvailable ? const Color(0xFF4CAF50) : Colors.grey,
          borderRadius: BorderRadius.circular(12),
          boxShadow: isAvailable
              ? [
                  BoxShadow(
                    color: Colors.green.withOpacity(0.4),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Stack(
          children: [
            Center(
              child: Icon(
                _perkIcon(perk),
                color: Colors.white,
                size: 28,
              ),
            ),
            Positioned(
              right: 4,
              bottom: 4,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: const BoxDecoration(
                  color: Colors.amber,
                  shape: BoxShape.circle,
                ),
                child: Text(
                  '$count',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _perkIcon(Perk perk) {
    switch (perk) {
      case Perk.anotherMove: return Icons.double_arrow;
      case Perk.removeEnemy: return Icons.remove_circle;
      case Perk.placeAnother: return Icons.add_circle;
      case Perk.scatterAround: return Icons.shuffle;
      case Perk.freeze: return Icons.ac_unit;
      case Perk.cancelMove: return Icons.undo;
    }
  }
}
