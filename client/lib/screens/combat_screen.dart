import 'package:flutter/material.dart' hide Hero;
import 'package:provider/provider.dart';
import '../models/hero.dart';
import '../models/combat_state.dart';
import '../services/combat_service.dart';

class CombatScreen extends StatefulWidget {
  final Hero player1Hero;
  final Hero player2Hero;
  final bool vsAI;

  const CombatScreen({
    super.key,
    required this.player1Hero,
    required this.player2Hero,
    this.vsAI = false,
  });

  @override
  State<CombatScreen> createState() => _CombatScreenState();
}

class _CombatScreenState extends State<CombatScreen> {
  late CombatService _combatService;
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _combatService = CombatService();
    // Initialize game after first frame
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initGame();
    });
  }

  void _initGame() {
    _combatService.initGame(
      'game_${DateTime.now().millisecondsSinceEpoch}',
      player1Hero: widget.player1Hero,
      player2Hero: widget.player2Hero,
    );
    setState(() {
      _initialized = true;
    });
    // Auto-place for first turn
    _combatService.executeTurn();
  }

  @override
  void dispose() {
    _combatService.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: _combatService,
      child: Scaffold(
        body: Stack(
          fit: StackFit.expand,
          children: [
            // Background
            Image.asset(
              'assets/images/ui/main-bg.png',
              fit: BoxFit.cover,
              repeat: ImageRepeat.repeat,
            ),
            // Content
            SafeArea(
              child: _initialized
                  ? _buildContent()
                  : const Center(child: CircularProgressIndicator()),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    return Consumer<CombatService>(
      builder: (context, service, child) {
        final gameState = service.gameState;
        if (gameState == null) {
          return const Center(child: CircularProgressIndicator());
        }

        return Column(
          children: [
            const SizedBox(height: 8),
            // Turn indicator
            _TurnIndicator(
              playerName: service.currentPlayerName,
              isPlayer1: gameState.currentPlayer == PlayerSide.player1,
            ),
            const SizedBox(height: 8),
            // Player headers with avatars
            _PlayerHeaders(
              player1Hero: widget.player1Hero,
              player2Hero: widget.player2Hero,
              player1Score: gameState.player1Pieces,
              player2Score: gameState.player2Pieces,
              currentPlayer: gameState.currentPlayer,
            ),
            const SizedBox(height: 8),
            // Game board area
            Expanded(
              child: _GameArea(
                gameState: gameState,
                player1Hero: widget.player1Hero,
                player2Hero: widget.player2Hero,
              ),
            ),
            const SizedBox(height: 8),
            // Skip turn button
            _SkipTurnButton(
              onPressed: gameState.status == CombatStatus.playing
                  ? () {
                      _combatService.skipTurn();
                      // Auto-place for next turn
                      _combatService.executeTurn();
                    }
                  : null,
              isGameOver: gameState.status == CombatStatus.finished,
              winner: gameState.gameWinner,
              player1Name: widget.player1Hero.name,
              player2Name: widget.player2Hero.name,
            ),
            const SizedBox(height: 16),
          ],
        );
      },
    );
  }
}

/// Turn indicator pill at the top
class _TurnIndicator extends StatelessWidget {
  final String playerName;
  final bool isPlayer1;

  const _TurnIndicator({
    required this.playerName,
    required this.isPlayer1,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.1),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        '$playerName Turn',
        style: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: Color(0xFF333333),
        ),
      ),
    );
  }
}

/// Player headers with avatars and scores
class _PlayerHeaders extends StatelessWidget {
  final Hero player1Hero;
  final Hero player2Hero;
  final int player1Score;
  final int player2Score;
  final PlayerSide currentPlayer;

  const _PlayerHeaders({
    required this.player1Hero,
    required this.player2Hero,
    required this.player1Score,
    required this.player2Score,
    required this.currentPlayer,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          // Player 1 panel (left, green)
          Expanded(
            child: _PlayerPanel(
              hero: player1Hero,
              score: player1Score,
              isPlayer1: true,
              isCurrentTurn: currentPlayer == PlayerSide.player1,
            ),
          ),
          // Flag indicator in the middle
          _FlagIndicator(isPlayer1Turn: currentPlayer == PlayerSide.player1),
          // Player 2 panel (right, purple)
          Expanded(
            child: _PlayerPanel(
              hero: player2Hero,
              score: player2Score,
              isPlayer1: false,
              isCurrentTurn: currentPlayer == PlayerSide.player2,
            ),
          ),
        ],
      ),
    );
  }
}

/// Individual player panel with avatar and score
class _PlayerPanel extends StatelessWidget {
  final Hero hero;
  final int score;
  final bool isPlayer1;
  final bool isCurrentTurn;

  const _PlayerPanel({
    required this.hero,
    required this.score,
    required this.isPlayer1,
    required this.isCurrentTurn,
  });

  @override
  Widget build(BuildContext context) {
    final titleBg = isPlayer1
        ? 'assets/images/ui/combat/player-1-title-bg.png'
        : 'assets/images/ui/combat/player-2-title-bg.png';
    final scoreBg = isPlayer1
        ? 'assets/images/ui/combat/player-1-title-score-bg.png'
        : 'assets/images/ui/combat/player-2-title-score-bg.png';

    return Row(
      mainAxisAlignment: isPlayer1 ? MainAxisAlignment.start : MainAxisAlignment.end,
      children: [
        if (!isPlayer1) ...[
          // Score badge (left for player 2)
          _buildScoreBadge(scoreBg),
          // Title bar
          _buildTitleBar(titleBg),
          const SizedBox(width: 8),
          // Avatar
          _buildAvatar(),
        ] else ...[
          // Avatar
          _buildAvatar(),
          const SizedBox(width: 8),
          // Title bar
          _buildTitleBar(titleBg),
          // Score badge (right for player 1)
          _buildScoreBadge(scoreBg),
        ],
      ],
    );
  }

  Widget _buildAvatar() {
    return SizedBox(
      width: 80,
      height: 100,
      child: Image.asset(
        hero.imagePath,
        fit: BoxFit.contain,
        errorBuilder: (context, error, stackTrace) => Container(
          decoration: BoxDecoration(
            color: isPlayer1 ? Colors.green.shade100 : Colors.purple.shade100,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              hero.name[0],
              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTitleBar(String bgAsset) {
    return Container(
      width: 100,
      height: 40,
      decoration: BoxDecoration(
        image: DecorationImage(
          image: AssetImage(bgAsset),
          fit: BoxFit.fill,
        ),
      ),
      child: Center(
        child: Padding(
          padding: EdgeInsets.only(
            left: isPlayer1 ? 8 : 0,
            right: isPlayer1 ? 0 : 8,
          ),
          child: Text(
            hero.name,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildScoreBadge(String bgAsset) {
    return Container(
      width: 50,
      height: 40,
      decoration: BoxDecoration(
        image: DecorationImage(
          image: AssetImage(bgAsset),
          fit: BoxFit.fill,
        ),
      ),
      child: Center(
        child: Text(
          '$score',
          style: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: Color(0xFF333333),
          ),
        ),
      ),
    );
  }
}

/// Flag indicator showing whose turn it is
class _FlagIndicator extends StatelessWidget {
  final bool isPlayer1Turn;

  const _FlagIndicator({required this.isPlayer1Turn});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 60,
      height: 100,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Flag pole (vertical line)
          Positioned(
            top: 20,
            child: Container(
              width: 4,
              height: 80,
              decoration: BoxDecoration(
                color: const Color(0xFFE57373),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // Flag triangle
          AnimatedPositioned(
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeInOut,
            top: 20,
            left: isPlayer1Turn ? 0 : null,
            right: isPlayer1Turn ? null : 0,
            child: Transform.flip(
              flipX: isPlayer1Turn,
              child: Image.asset(
                'assets/images/ui/combat/turn-flag.png',
                width: 30,
                height: 40,
                fit: BoxFit.contain,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Main game area with board and side buttons
class _GameArea extends StatelessWidget {
  final CombatGameState gameState;
  final Hero player1Hero;
  final Hero player2Hero;

  const _GameArea({
    required this.gameState,
    required this.player1Hero,
    required this.player2Hero,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      child: Row(
        children: [
          // Player 1 placement buttons (left)
          const _PlacementSlots(isPlayer1: true),
          const SizedBox(width: 4),
          // Game board
          Expanded(
            child: _GameBoard(
              gameState: gameState,
              player1Hero: player1Hero,
              player2Hero: player2Hero,
            ),
          ),
          const SizedBox(width: 4),
          // Player 2 placement buttons (right)
          const _PlacementSlots(isPlayer1: false),
        ],
      ),
    );
  }
}

/// Side placement slot buttons
class _PlacementSlots extends StatelessWidget {
  final bool isPlayer1;

  const _PlacementSlots({required this.isPlayer1});

  @override
  Widget build(BuildContext context) {
    final asset = isPlayer1
        ? 'assets/images/ui/combat/player-1-place-btn.png'
        : 'assets/images/ui/combat/player-2-place-btn.png';

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(6, (index) {
        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: SizedBox(
            width: 44,
            height: 44,
            child: Image.asset(
              asset,
              fit: BoxFit.contain,
            ),
          ),
        );
      }),
    );
  }
}

/// The main game board with grid
class _GameBoard extends StatelessWidget {
  final CombatGameState gameState;
  final Hero player1Hero;
  final Hero player2Hero;

  const _GameBoard({
    required this.gameState,
    required this.player1Hero,
    required this.player2Hero,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        image: const DecorationImage(
          image: AssetImage('assets/images/ui/combat/game-field-bg.png'),
          fit: BoxFit.fill,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Stack(
        children: [
          // Grid lines
          CustomPaint(
            size: Size.infinite,
            painter: _GridPainter(),
          ),
          // Center vertical line (flag pole)
          Positioned.fill(
            child: Center(
              child: Container(
                width: 4,
                decoration: BoxDecoration(
                  color: const Color(0xFFE57373).withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          // Game pieces
          Padding(
            padding: const EdgeInsets.all(8),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final cellWidth = constraints.maxWidth / 10;
                final cellHeight = constraints.maxHeight / 5;

                return Stack(
                  children: _buildPieces(cellWidth, cellHeight),
                );
              },
            ),
          ),
          // Lane win indicators
          ..._buildLaneWinIndicators(),
        ],
      ),
    );
  }

  List<Widget> _buildPieces(double cellWidth, double cellHeight) {
    final pieces = <Widget>[];

    for (int laneIndex = 0; laneIndex < 5; laneIndex++) {
      final lane = gameState.lanes[laneIndex];

      // Player 1 pieces (columns 0-4 on left side)
      for (int col = 0; col < 5; col++) {
        if (lane.player1Columns[col]) {
          pieces.add(_buildPiece(
            laneIndex: laneIndex,
            columnIndex: col,
            isPlayer1: true,
            cellWidth: cellWidth,
            cellHeight: cellHeight,
            hero: player1Hero,
          ));
        }
      }

      // Player 2 pieces (columns 5-9 on right side, but stored as 0-4 in player2Columns)
      for (int col = 0; col < 5; col++) {
        if (lane.player2Columns[col]) {
          pieces.add(_buildPiece(
            laneIndex: laneIndex,
            columnIndex: col,
            isPlayer1: false,
            cellWidth: cellWidth,
            cellHeight: cellHeight,
            hero: player2Hero,
          ));
        }
      }
    }

    return pieces;
  }

  Widget _buildPiece({
    required int laneIndex,
    required int columnIndex,
    required bool isPlayer1,
    required double cellWidth,
    required double cellHeight,
    required Hero hero,
  }) {
    // Calculate position
    // Player 1: columns 0-4 map to grid positions 0-4 (left to right)
    // Player 2: columns 0-4 map to grid positions 9-5 (right to left)
    final gridColumn = isPlayer1 ? columnIndex : (9 - columnIndex);
    final x = gridColumn * cellWidth + (cellWidth - 36) / 2;
    final y = laneIndex * cellHeight + (cellHeight - 36) / 2;

    final bgAsset = isPlayer1
        ? 'assets/images/ui/combat/player-1-item-bg.png'
        : 'assets/images/ui/combat/player-2-item-bg.png';

    return Positioned(
      left: x,
      top: y,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          image: DecorationImage(
            image: AssetImage(bgAsset),
            fit: BoxFit.contain,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: ClipOval(
            child: Image.asset(
              hero.imagePath,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(
                color: isPlayer1 ? Colors.green.shade200 : Colors.purple.shade200,
                child: Center(
                  child: Text(
                    hero.name[0],
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildLaneWinIndicators() {
    final indicators = <Widget>[];

    for (int i = 0; i < 5; i++) {
      final lane = gameState.lanes[i];
      if (lane.winner != null) {
        indicators.add(Positioned(
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          child: LayoutBuilder(
            builder: (context, constraints) {
              final laneHeight = constraints.maxHeight / 5;
              return Stack(
                children: [
                  Positioned(
                    top: i * laneHeight,
                    left: 0,
                    right: 0,
                    height: laneHeight,
                    child: Container(
                      decoration: BoxDecoration(
                        color: (lane.winner == PlayerSide.player1
                                ? Colors.green
                                : Colors.purple)
                            .withValues(alpha: 0.2),
                        border: Border.all(
                          color: lane.winner == PlayerSide.player1
                              ? Colors.green
                              : Colors.purple,
                          width: 2,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ));
      }
    }

    return indicators;
  }
}

/// Custom painter for grid lines
class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFE0E0E0)
      ..strokeWidth = 1;

    // Draw vertical lines (9 lines for 10 columns)
    final cellWidth = size.width / 10;
    for (int i = 1; i < 10; i++) {
      final x = i * cellWidth;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }

    // Draw horizontal lines (4 lines for 5 rows)
    final cellHeight = size.height / 5;
    for (int i = 1; i < 5; i++) {
      final y = i * cellHeight;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Skip turn button at the bottom
class _SkipTurnButton extends StatelessWidget {
  final VoidCallback? onPressed;
  final bool isGameOver;
  final PlayerSide? winner;
  final String player1Name;
  final String player2Name;

  const _SkipTurnButton({
    required this.onPressed,
    required this.isGameOver,
    required this.winner,
    required this.player1Name,
    required this.player2Name,
  });

  @override
  Widget build(BuildContext context) {
    if (isGameOver) {
      final winnerName = winner == PlayerSide.player1 ? player1Name : player2Name;
      return Column(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
            decoration: BoxDecoration(
              color: winner == PlayerSide.player1
                  ? Colors.green.shade100
                  : Colors.purple.shade100,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Text(
              '$winnerName Wins!',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
                color: winner == PlayerSide.player1
                    ? Colors.green.shade700
                    : Colors.purple.shade700,
              ),
            ),
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: 160,
              height: 50,
              decoration: BoxDecoration(
                image: const DecorationImage(
                  image: AssetImage('assets/images/ui/combat/red-btn-bg.png'),
                  fit: BoxFit.fill,
                ),
                borderRadius: BorderRadius.circular(25),
              ),
              child: const Center(
                child: Text(
                  'Back to Menu',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ],
      );
    }

    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 160,
        height: 50,
        decoration: BoxDecoration(
          image: const DecorationImage(
            image: AssetImage('assets/images/ui/combat/red-btn-bg.png'),
            fit: BoxFit.fill,
          ),
          borderRadius: BorderRadius.circular(25),
        ),
        child: const Center(
          child: Text(
            'Skip Turn',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
