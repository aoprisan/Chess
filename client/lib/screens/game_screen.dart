import 'package:flutter/material.dart';
import 'package:flame/game.dart';
import 'package:provider/provider.dart';
import '../game/chess_game.dart';
import '../services/game_service.dart';
import '../models/game_state.dart';
import '../models/hero.dart' as hero_model;
import '../models/hero.dart' show Perk;

class GameScreen extends StatefulWidget {
  final bool vsAI;
  final bool online;
  final hero_model.Hero? player2Hero;

  const GameScreen({
    super.key,
    this.vsAI = false,
    this.online = false,
    this.player2Hero,
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
      body: Stack(
        children: [
          // Background
          Positioned.fill(
            child: Image.asset(
              'assets/images/ui/game-field-bg.png',
              fit: BoxFit.cover,
            ),
          ),
          // Main content
          SafeArea(
            child: Column(
              children: [
                // Top section - Player panels and turn indicator
                _buildTopSection(),
                // Middle section - Perk slots and game board
                Expanded(
                  child: _buildMiddleSection(),
                ),
                // Bottom section - Skip Turn button
                _buildBottomSection(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTopSection() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        final player1Hero = gameService.selectedHero;
        final player2Hero = widget.player2Hero;
        final isPlayer1Turn = gameService.gameState?.currentTurn == PlayerColor.white;

        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Player 1 panel (left)
              Expanded(
                child: _PlayerPanel(
                  hero: player1Hero,
                  playerNumber: 1,
                  isCurrentTurn: isPlayer1Turn,
                  score: 0,
                  label: player1Hero?.name ?? 'Player 1',
                ),
              ),
              // Turn indicator (center)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: _TurnIndicator(
                  currentPlayerName: isPlayer1Turn
                      ? (player1Hero?.name ?? 'Player 1')
                      : (player2Hero?.name ?? (widget.vsAI ? 'AI' : 'Player 2')),
                  isPlayer1Turn: isPlayer1Turn,
                ),
              ),
              // Player 2 panel (right)
              Expanded(
                child: _PlayerPanel(
                  hero: player2Hero,
                  playerNumber: 2,
                  isCurrentTurn: !isPlayer1Turn,
                  score: 0,
                  label: player2Hero?.name ?? (widget.vsAI ? 'AI Opponent' : 'Player 2'),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMiddleSection() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        final player1Hero = gameService.selectedHero;
        final player2Hero = widget.player2Hero;

        final player1PerksRemaining = gameService.gameState?.player1PerksRemaining ?? {};
        final player2PerksRemaining = gameService.gameState?.player2PerksRemaining ?? {};

        return Row(
          children: [
            // Player 1 perk slots (left side)
            _PerkSlotsColumn(
              hero: player1Hero,
              playerNumber: 1,
              perksRemaining: player1PerksRemaining,
              onPerkTap: (perk) => _usePerk(context, gameService, perk),
            ),
            // Game board (center)
            Expanded(
              child: Center(
                child: AspectRatio(
                  aspectRatio: 1,
                  child: _StyledGameBoard(game: _game),
                ),
              ),
            ),
            // Player 2 perk slots (right side)
            _PerkSlotsColumn(
              hero: player2Hero,
              playerNumber: 2,
              perksRemaining: player2PerksRemaining,
              onPerkTap: null, // Player 2 perks not controllable by current player
            ),
          ],
        );
      },
    );
  }

  Widget _buildBottomSection() {
    return Consumer<GameService>(
      builder: (context, gameService, child) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Skip Turn button
              GestureDetector(
                onTap: () => _skipTurn(gameService),
                child: Container(
                  width: 140,
                  height: 50,
                  decoration: BoxDecoration(
                    image: const DecorationImage(
                      image: AssetImage('assets/images/ui/red-btn-bg.png'),
                      fit: BoxFit.fill,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: const Center(
                    child: Text(
                      'Skip Turn',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                        shadows: [
                          Shadow(
                            color: Colors.black26,
                            blurRadius: 2,
                            offset: Offset(1, 1),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              // Menu button
              GestureDetector(
                onTap: () => _showGameMenu(context),
                child: Container(
                  width: 50,
                  height: 50,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.9),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade300),
                  ),
                  child: const Icon(
                    Icons.menu,
                    color: Color(0xFF5D4037),
                    size: 28,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _skipTurn(GameService gameService) {
    final gameState = gameService.gameState;
    if (gameState == null) return;

    // Switch turns without making a move
    final newState = gameState.copyWith(
      currentTurn: gameState.currentTurn == PlayerColor.white
          ? PlayerColor.black
          : PlayerColor.white,
    );
    gameService.updateGameState(newState);
  }

  void _usePerk(BuildContext context, GameService gameService, Perk perk) {
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
              Navigator.pop(context);
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

// Player panel widget for top corners
class _PlayerPanel extends StatelessWidget {
  final hero_model.Hero? hero;
  final int playerNumber;
  final bool isCurrentTurn;
  final int score;
  final String label;

  const _PlayerPanel({
    required this.hero,
    required this.playerNumber,
    required this.isCurrentTurn,
    required this.score,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    final isPlayer1 = playerNumber == 1;
    final titleBg = isPlayer1
        ? 'assets/images/ui/player-1-title-bg.png'
        : 'assets/images/ui/player-2-title-bg.png';
    final scoreBg = isPlayer1
        ? 'assets/images/ui/player-1-title-score-bg.png'
        : 'assets/images/ui/player-2-title-score-bg.png';
    final activePanelBg = isPlayer1
        ? 'assets/images/ui/hero-panel-player-1-acitve.png'
        : 'assets/images/ui/hero-panel-player-2-acitve.png';

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: isPlayer1 ? CrossAxisAlignment.start : CrossAxisAlignment.end,
      children: [
        // Hero avatar with active indicator
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isPlayer1) const Spacer(),
            Stack(
              clipBehavior: Clip.none,
              children: [
                // Active panel background
                if (isCurrentTurn)
                  Container(
                    width: 60,
                    height: 60,
                    decoration: BoxDecoration(
                      image: DecorationImage(
                        image: AssetImage(activePanelBg),
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                // Hero avatar
                Container(
                  width: isCurrentTurn ? 60 : 50,
                  height: isCurrentTurn ? 60 : 50,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isPlayer1 ? const Color(0xFF4CAF50) : const Color(0xFFEF5350),
                    border: Border.all(
                      color: isCurrentTurn ? Colors.amber : Colors.white,
                      width: isCurrentTurn ? 3 : 2,
                    ),
                  ),
                  child: hero?.imagePath != null
                      ? ClipOval(
                          child: Image.asset(
                            hero!.imagePath,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _buildFallbackAvatar(),
                          ),
                        )
                      : _buildFallbackAvatar(),
                ),
              ],
            ),
            if (isPlayer1) const Spacer(),
          ],
        ),
        const SizedBox(height: 4),
        // Name panel with score badge
        Stack(
          clipBehavior: Clip.none,
          children: [
            // Title background
            Container(
              height: 28,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                image: DecorationImage(
                  image: AssetImage(titleBg),
                  fit: BoxFit.fill,
                ),
              ),
              child: Center(
                child: Text(
                  label.length > 10 ? '${label.substring(0, 10)}...' : label,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            // Score badge
            Positioned(
              right: isPlayer1 ? -8 : null,
              left: isPlayer1 ? null : -8,
              top: -4,
              child: Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage(scoreBg),
                    fit: BoxFit.contain,
                  ),
                ),
                child: Center(
                  child: Text(
                    '$score',
                    style: const TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildFallbackAvatar() {
    return Center(
      child: Text(
        label.isNotEmpty ? label[0].toUpperCase() : 'P',
        style: const TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: Colors.white,
        ),
      ),
    );
  }
}

// Turn indicator widget for center-top
class _TurnIndicator extends StatelessWidget {
  final String currentPlayerName;
  final bool isPlayer1Turn;

  const _TurnIndicator({
    required this.currentPlayerName,
    required this.isPlayer1Turn,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Banner with player name
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.1),
                blurRadius: 4,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Text(
            "$currentPlayerName's Turn",
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.bold,
              color: Color(0xFF5D4037),
            ),
          ),
        ),
        const SizedBox(height: 4),
        // Turn flag arrow
        Transform.rotate(
          angle: isPlayer1Turn ? -0.5 : 0.5, // Point towards current player
          child: Image.asset(
            'assets/images/ui/turn-flag.png',
            width: 30,
            height: 20,
            errorBuilder: (_, __, ___) => Icon(
              isPlayer1Turn ? Icons.arrow_back : Icons.arrow_forward,
              color: Colors.amber,
              size: 20,
            ),
          ),
        ),
      ],
    );
  }
}

// Perk slots column for sides of the board
class _PerkSlotsColumn extends StatelessWidget {
  final hero_model.Hero? hero;
  final int playerNumber;
  final Map<Perk, int> perksRemaining;
  final void Function(Perk)? onPerkTap;

  const _PerkSlotsColumn({
    required this.hero,
    required this.playerNumber,
    required this.perksRemaining,
    this.onPerkTap,
  });

  @override
  Widget build(BuildContext context) {
    final isPlayer1 = playerNumber == 1;
    final itemBg = isPlayer1
        ? 'assets/images/ui/player-1-item-bg.png'
        : 'assets/images/ui/player-2-item-bg.png';

    final perks = hero?.perks ?? [];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(6, (index) {
          final perk = index < perks.length ? perks[index] : null;
          final count = perk != null ? (perksRemaining[perk] ?? 0) : 0;
          final isAvailable = count > 0 && onPerkTap != null;

          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: GestureDetector(
              onTap: isAvailable && perk != null ? () => onPerkTap!(perk) : null,
              child: Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage(itemBg),
                    fit: BoxFit.contain,
                  ),
                ),
                child: perk != null
                    ? Stack(
                        children: [
                          Center(
                            child: Icon(
                              _perkIcon(perk),
                              color: isAvailable
                                  ? Colors.white
                                  : Colors.white.withOpacity(0.5),
                              size: 20,
                            ),
                          ),
                          if (count > 0)
                            Positioned(
                              right: 2,
                              bottom: 2,
                              child: Container(
                                width: 14,
                                height: 14,
                                decoration: const BoxDecoration(
                                  color: Colors.amber,
                                  shape: BoxShape.circle,
                                ),
                                child: Center(
                                  child: Text(
                                    '$count',
                                    style: const TextStyle(
                                      fontSize: 9,
                                      fontWeight: FontWeight.bold,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                        ],
                      )
                    : null,
              ),
            ),
          );
        }),
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

// Styled game board with center divider overlay
class _StyledGameBoard extends StatelessWidget {
  final ChessGame game;

  const _StyledGameBoard({required this.game});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Stack(
          children: [
            // Game board
            GameWidget(game: game),
            // Center vertical divider (pink line)
            Positioned.fill(
              child: Center(
                child: Image.asset(
                  'assets/images/ui/border-vertical-line.png',
                  height: double.infinity,
                  fit: BoxFit.fitHeight,
                  errorBuilder: (_, __, ___) => Container(
                    width: 4,
                    color: const Color(0xFFE91E63).withOpacity(0.6),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
