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

        return LayoutBuilder(
          builder: (context, constraints) {
            final screenWidth = constraints.maxWidth;
            final screenHeight = constraints.maxHeight;

            return Column(
              children: [
                SizedBox(height: screenHeight * 0.01),
                // Turn indicator
                _TurnIndicator(
                  playerName: service.currentPlayerName,
                  isPlayer1: gameState.currentPlayer == PlayerSide.player1,
                  screenWidth: screenWidth,
                ),
                SizedBox(height: screenHeight * 0.01),
                // Player headers with avatars
                _PlayerHeaders(
                  player1Hero: widget.player1Hero,
                  player2Hero: widget.player2Hero,
                  player1Score: gameState.player1Pieces,
                  player2Score: gameState.player2Pieces,
                  currentPlayer: gameState.currentPlayer,
                  screenWidth: screenWidth,
                  screenHeight: screenHeight,
                ),
                SizedBox(height: screenHeight * 0.01),
                // Game board area
                Expanded(
                  child: _GameArea(
                    gameState: gameState,
                    player1Hero: widget.player1Hero,
                    player2Hero: widget.player2Hero,
                    screenWidth: screenWidth,
                    screenHeight: screenHeight,
                  ),
                ),
                SizedBox(height: screenHeight * 0.01),
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
                  screenWidth: screenWidth,
                ),
                SizedBox(height: screenHeight * 0.02),
              ],
            );
          },
        );
      },
    );
  }
}

/// Turn indicator pill at the top
class _TurnIndicator extends StatelessWidget {
  final String playerName;
  final bool isPlayer1;
  final double screenWidth;

  const _TurnIndicator({
    required this.playerName,
    required this.isPlayer1,
    required this.screenWidth,
  });

  @override
  Widget build(BuildContext context) {
    final fontSize = (screenWidth * 0.018).clamp(14.0, 20.0);
    final horizontalPadding = (screenWidth * 0.025).clamp(16.0, 28.0);
    final verticalPadding = (screenWidth * 0.01).clamp(6.0, 12.0);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: horizontalPadding,
        vertical: verticalPadding,
      ),
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
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.bold,
          color: const Color(0xFF333333),
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
  final double screenWidth;
  final double screenHeight;

  const _PlayerHeaders({
    required this.player1Hero,
    required this.player2Hero,
    required this.player1Score,
    required this.player2Score,
    required this.currentPlayer,
    required this.screenWidth,
    required this.screenHeight,
  });

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = (screenWidth * 0.02).clamp(8.0, 20.0);

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
      child: Row(
        children: [
          // Player 1 panel (left, green)
          Expanded(
            child: _PlayerPanel(
              hero: player1Hero,
              score: player1Score,
              isPlayer1: true,
              isCurrentTurn: currentPlayer == PlayerSide.player1,
              screenWidth: screenWidth,
              screenHeight: screenHeight,
            ),
          ),
          // Flag indicator in the middle
          _FlagIndicator(
            isPlayer1Turn: currentPlayer == PlayerSide.player1,
            screenWidth: screenWidth,
            screenHeight: screenHeight,
          ),
          // Player 2 panel (right, purple)
          Expanded(
            child: _PlayerPanel(
              hero: player2Hero,
              score: player2Score,
              isPlayer1: false,
              isCurrentTurn: currentPlayer == PlayerSide.player2,
              screenWidth: screenWidth,
              screenHeight: screenHeight,
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
  final double screenWidth;
  final double screenHeight;

  const _PlayerPanel({
    required this.hero,
    required this.score,
    required this.isPlayer1,
    required this.isCurrentTurn,
    required this.screenWidth,
    required this.screenHeight,
  });

  @override
  Widget build(BuildContext context) {
    final titleBg = isPlayer1
        ? 'assets/images/ui/combat/player-1-title-bg.png'
        : 'assets/images/ui/combat/player-2-title-bg.png';
    final scoreBg = isPlayer1
        ? 'assets/images/ui/combat/player-1-title-score-bg.png'
        : 'assets/images/ui/combat/player-2-title-score-bg.png';
    final spacing = (screenWidth * 0.008).clamp(4.0, 10.0);

    return Row(
      mainAxisAlignment: isPlayer1 ? MainAxisAlignment.start : MainAxisAlignment.end,
      children: [
        if (!isPlayer1) ...[
          // Score badge (left for player 2)
          _buildScoreBadge(scoreBg),
          // Title bar
          _buildTitleBar(titleBg),
          SizedBox(width: spacing),
          // Avatar
          _buildAvatar(),
        ] else ...[
          // Avatar
          _buildAvatar(),
          SizedBox(width: spacing),
          // Title bar
          _buildTitleBar(titleBg),
          // Score badge (right for player 1)
          _buildScoreBadge(scoreBg),
        ],
      ],
    );
  }

  Widget _buildAvatar() {
    final avatarWidth = (screenWidth * 0.08).clamp(50.0, 100.0);
    final avatarHeight = (screenHeight * 0.12).clamp(60.0, 120.0);

    return SizedBox(
      width: avatarWidth,
      height: avatarHeight,
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
              style: TextStyle(
                fontSize: (screenWidth * 0.025).clamp(20.0, 36.0),
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTitleBar(String bgAsset) {
    final barWidth = (screenWidth * 0.1).clamp(70.0, 120.0);
    final barHeight = (screenWidth * 0.04).clamp(28.0, 45.0);
    final fontSize = (screenWidth * 0.014).clamp(11.0, 18.0);

    return Container(
      width: barWidth,
      height: barHeight,
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
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildScoreBadge(String bgAsset) {
    final badgeWidth = (screenWidth * 0.05).clamp(35.0, 60.0);
    final badgeHeight = (screenWidth * 0.04).clamp(28.0, 45.0);
    final fontSize = (screenWidth * 0.014).clamp(11.0, 18.0);

    return Container(
      width: badgeWidth,
      height: badgeHeight,
      decoration: BoxDecoration(
        image: DecorationImage(
          image: AssetImage(bgAsset),
          fit: BoxFit.fill,
        ),
      ),
      child: Center(
        child: Text(
          '$score',
          style: TextStyle(
            fontSize: fontSize,
            fontWeight: FontWeight.bold,
            color: const Color(0xFF333333),
          ),
        ),
      ),
    );
  }
}

/// Flag indicator showing whose turn it is
class _FlagIndicator extends StatelessWidget {
  final bool isPlayer1Turn;
  final double screenWidth;
  final double screenHeight;

  const _FlagIndicator({
    required this.isPlayer1Turn,
    required this.screenWidth,
    required this.screenHeight,
  });

  @override
  Widget build(BuildContext context) {
    final indicatorWidth = (screenWidth * 0.06).clamp(40.0, 70.0);
    final indicatorHeight = (screenHeight * 0.12).clamp(60.0, 120.0);
    final poleWidth = (screenWidth * 0.004).clamp(3.0, 5.0);
    final flagWidth = (screenWidth * 0.03).clamp(20.0, 40.0);
    final flagHeight = (screenWidth * 0.04).clamp(28.0, 50.0);

    return SizedBox(
      width: indicatorWidth,
      height: indicatorHeight,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Flag pole (vertical line)
          Positioned(
            top: indicatorHeight * 0.2,
            child: Container(
              width: poleWidth,
              height: indicatorHeight * 0.8,
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
            top: indicatorHeight * 0.2,
            left: isPlayer1Turn ? 0 : null,
            right: isPlayer1Turn ? null : 0,
            child: Transform.flip(
              flipX: isPlayer1Turn,
              child: Image.asset(
                'assets/images/ui/combat/turn-flag.png',
                width: flagWidth,
                height: flagHeight,
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
  final double screenWidth;
  final double screenHeight;

  const _GameArea({
    required this.gameState,
    required this.player1Hero,
    required this.player2Hero,
    required this.screenWidth,
    required this.screenHeight,
  });

  @override
  Widget build(BuildContext context) {
    final horizontalPadding = (screenWidth * 0.01).clamp(4.0, 12.0);
    final spacing = (screenWidth * 0.005).clamp(2.0, 6.0);

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
      child: Row(
        children: [
          // Player 1 placement buttons (left)
          _PlacementSlots(
            isPlayer1: true,
            screenWidth: screenWidth,
            screenHeight: screenHeight,
          ),
          SizedBox(width: spacing),
          // Game board
          Expanded(
            child: _GameBoard(
              gameState: gameState,
              player1Hero: player1Hero,
              player2Hero: player2Hero,
              screenWidth: screenWidth,
              screenHeight: screenHeight,
            ),
          ),
          SizedBox(width: spacing),
          // Player 2 placement buttons (right)
          _PlacementSlots(
            isPlayer1: false,
            screenWidth: screenWidth,
            screenHeight: screenHeight,
          ),
        ],
      ),
    );
  }
}

/// Side placement slot buttons
class _PlacementSlots extends StatelessWidget {
  final bool isPlayer1;
  final double screenWidth;
  final double screenHeight;

  const _PlacementSlots({
    required this.isPlayer1,
    required this.screenWidth,
    required this.screenHeight,
  });

  @override
  Widget build(BuildContext context) {
    final asset = isPlayer1
        ? 'assets/images/ui/combat/player-1-place-btn.png'
        : 'assets/images/ui/combat/player-2-place-btn.png';
    final slotSize = (screenWidth * 0.04).clamp(30.0, 50.0);
    final verticalSpacing = (screenHeight * 0.008).clamp(2.0, 6.0);

    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(6, (index) {
        return Padding(
          padding: EdgeInsets.symmetric(vertical: verticalSpacing),
          child: SizedBox(
            width: slotSize,
            height: slotSize,
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
  final double screenWidth;
  final double screenHeight;

  const _GameBoard({
    required this.gameState,
    required this.player1Hero,
    required this.player2Hero,
    required this.screenWidth,
    required this.screenHeight,
  });

  @override
  Widget build(BuildContext context) {
    final borderRadius = (screenWidth * 0.015).clamp(10.0, 20.0);
    final centerLineWidth = (screenWidth * 0.004).clamp(3.0, 5.0);
    final padding = (screenWidth * 0.008).clamp(4.0, 10.0);

    return Container(
      decoration: BoxDecoration(
        image: const DecorationImage(
          image: AssetImage('assets/images/ui/combat/game-field-bg.png'),
          fit: BoxFit.fill,
        ),
        borderRadius: BorderRadius.circular(borderRadius),
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
                width: centerLineWidth,
                decoration: BoxDecoration(
                  color: const Color(0xFFE57373).withValues(alpha: 0.6),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          // Game pieces
          Padding(
            padding: EdgeInsets.all(padding),
            child: LayoutBuilder(
              builder: (context, constraints) {
                final cellWidth = constraints.maxWidth / 10;
                final cellHeight = constraints.maxHeight / 5;
                final pieceSize = (screenWidth * 0.035).clamp(28.0, 44.0);

                return Stack(
                  children: _buildPieces(cellWidth, cellHeight, pieceSize),
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

  List<Widget> _buildPieces(double cellWidth, double cellHeight, double pieceSize) {
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
            pieceSize: pieceSize,
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
            pieceSize: pieceSize,
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
    required double pieceSize,
  }) {
    // Calculate position
    // Player 1: columns 0-4 map to grid positions 0-4 (left to right)
    // Player 2: columns 0-4 map to grid positions 9-5 (right to left)
    final gridColumn = isPlayer1 ? columnIndex : (9 - columnIndex);
    final x = gridColumn * cellWidth + (cellWidth - pieceSize) / 2;
    final y = laneIndex * cellHeight + (cellHeight - pieceSize) / 2;

    final bgAsset = isPlayer1
        ? 'assets/images/ui/combat/player-1-item-bg.png'
        : 'assets/images/ui/combat/player-2-item-bg.png';

    return Positioned(
      left: x,
      top: y,
      child: Container(
        width: pieceSize,
        height: pieceSize,
        decoration: BoxDecoration(
          image: DecorationImage(
            image: AssetImage(bgAsset),
            fit: BoxFit.contain,
          ),
        ),
        child: Padding(
          padding: EdgeInsets.all(pieceSize * 0.1),
          child: ClipOval(
            child: Image.asset(
              hero.imagePath,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) => Container(
                color: isPlayer1 ? Colors.green.shade200 : Colors.purple.shade200,
                child: Center(
                  child: Text(
                    hero.name[0],
                    style: TextStyle(
                      fontSize: pieceSize * 0.35,
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
  final double screenWidth;

  const _SkipTurnButton({
    required this.onPressed,
    required this.isGameOver,
    required this.winner,
    required this.player1Name,
    required this.player2Name,
    required this.screenWidth,
  });

  @override
  Widget build(BuildContext context) {
    final buttonWidth = (screenWidth * 0.15).clamp(120.0, 180.0);
    final buttonHeight = (screenWidth * 0.045).clamp(36.0, 56.0);
    final fontSize = (screenWidth * 0.016).clamp(12.0, 20.0);
    final winnerFontSize = (screenWidth * 0.022).clamp(16.0, 28.0);

    if (isGameOver) {
      final winnerName = winner == PlayerSide.player1 ? player1Name : player2Name;
      return Column(
        children: [
          Container(
            padding: EdgeInsets.symmetric(
              horizontal: screenWidth * 0.03,
              vertical: screenWidth * 0.012,
            ),
            decoration: BoxDecoration(
              color: winner == PlayerSide.player1
                  ? Colors.green.shade100
                  : Colors.purple.shade100,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Text(
              '$winnerName Wins!',
              style: TextStyle(
                fontSize: winnerFontSize,
                fontWeight: FontWeight.bold,
                color: winner == PlayerSide.player1
                    ? Colors.green.shade700
                    : Colors.purple.shade700,
              ),
            ),
          ),
          SizedBox(height: screenWidth * 0.012),
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              width: buttonWidth,
              height: buttonHeight,
              decoration: BoxDecoration(
                image: const DecorationImage(
                  image: AssetImage('assets/images/ui/combat/red-btn-bg.png'),
                  fit: BoxFit.fill,
                ),
                borderRadius: BorderRadius.circular(25),
              ),
              child: Center(
                child: Text(
                  'Back to Menu',
                  style: TextStyle(
                    fontSize: fontSize,
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
        width: buttonWidth,
        height: buttonHeight,
        decoration: BoxDecoration(
          image: const DecorationImage(
            image: AssetImage('assets/images/ui/combat/red-btn-bg.png'),
            fit: BoxFit.fill,
          ),
          borderRadius: BorderRadius.circular(25),
        ),
        child: Center(
          child: Text(
            'Skip Turn',
            style: TextStyle(
              fontSize: fontSize * 1.1,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}
