import 'dart:async';
import 'package:flutter/material.dart' hide Hero;
import 'package:provider/provider.dart';
import '../models/hero.dart';
import '../services/auth_service.dart';
import '../services/combat_service.dart';
import '../services/websocket_service.dart';
import 'combat_screen.dart';

enum GameMode { solo, localMultiplayer, online }

class HeroSelectionScreen extends StatefulWidget {
  final GameMode mode;

  const HeroSelectionScreen({
    super.key,
    this.mode = GameMode.solo,
  });

  @override
  State<HeroSelectionScreen> createState() => _HeroSelectionScreenState();
}

class _HeroSelectionScreenState extends State<HeroSelectionScreen> {
  int _currentPlayer = 1; // 1 or 2
  Hero? _player1Hero;
  Hero? _player2Hero;

  // AI mode settings per player
  bool _player1IsAI = false;
  bool _player2IsAI = false;
  String _player1AIDifficulty = 'medium';
  String _player2AIDifficulty = 'medium';

  // Online matchmaking state
  bool _isSearching = false;
  StreamSubscription<WSMessage>? _onlineMatchSub;
  WebSocketService? _onlineWsService;
  CombatService? _onlineCombatService;

  Hero? get _selectedHero => _currentPlayer == 1 ? _player1Hero : _player2Hero;

  bool get _needsTwoPlayers => widget.mode != GameMode.online;

  @override
  void dispose() {
    _onlineMatchSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Pirate doodle tiled background
          Image.asset(
            'assets/images/ui/main-bg.png',
            fit: BoxFit.cover,
            repeat: ImageRepeat.repeat,
          ),
          // Content
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final isWide = constraints.maxWidth > 800;
                final screenWidth = constraints.maxWidth;
                final screenHeight = constraints.maxHeight;

                return Column(
                  children: [
                    // Title Bar
                    _buildTitleBar(screenWidth),
                    // Main content: Hero grid + Details panel
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.symmetric(
                          horizontal: screenWidth * 0.02,
                          vertical: 8,
                        ),
                        child: isWide
                            ? Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  // Hero Grid (left side) - more compact
                                  SizedBox(
                                    width: screenWidth * 0.42,
                                    child: _buildHeroGrid(screenWidth, screenHeight),
                                  ),
                                  SizedBox(width: screenWidth * 0.02),
                                  // Details Panel (right side) - takes remaining space
                                  Expanded(
                                    child: _buildDetailsPanel(screenWidth, screenHeight),
                                  ),
                                ],
                              )
                            : SingleChildScrollView(
                                child: Column(
                                  children: [
                                    _buildHeroGrid(screenWidth, screenHeight),
                                    const SizedBox(height: 16),
                                    SizedBox(
                                      height: screenHeight * 0.5,
                                      child: _buildDetailsPanel(screenWidth, screenHeight),
                                    ),
                                  ],
                                ),
                              ),
                      ),
                    ),
                    // Bottom Bar with buttons
                    _buildBottomBar(screenWidth),
                  ],
                );
              },
            ),
          ),
          // Searching for opponent overlay
          if (_isSearching)
            GestureDetector(
              onTap: () {},
              child: Container(
                color: Colors.black.withValues(alpha: 0.7),
                child: Center(
                  child: Container(
                    width: 280,
                    padding: const EdgeInsets.all(32),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF5E6D3),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: const Color(0xFF8D6E63), width: 3),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const CircularProgressIndicator(
                          color: Color(0xFF5D4037),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Searching for opponent...',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF5D4037),
                          ),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        GestureDetector(
                          onTap: _cancelSearch,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                            decoration: BoxDecoration(
                              color: Colors.red.shade400,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'Cancel',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildTitleBar(double screenWidth) {
    final titleWidth = (screenWidth * 0.30).clamp(180.0, 350.0);
    final titleHeight = titleWidth * 0.16;
    final badgeWidth = titleWidth * 0.22;
    final badgeHeight = badgeWidth * 0.5;
    final fontSize = (screenWidth * 0.016).clamp(10.0, 16.0);

    return Container(
      margin: const EdgeInsets.only(top: 8),
      child: Container(
        height: titleHeight,
        width: titleWidth,
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: AssetImage('assets/images/ui/title-bg.png'),
            fit: BoxFit.contain,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Player badge
            Container(
              width: badgeWidth,
              height: badgeHeight,
              decoration: BoxDecoration(
                image: DecorationImage(
                  image: AssetImage(
                    _currentPlayer == 1
                        ? 'assets/images/ui/player-1-player-bg.png'
                        : 'assets/images/ui/player-2-player-bg.png',
                  ),
                  fit: BoxFit.contain,
                ),
              ),
              child: Center(
                child: Text(
                  'Player $_currentPlayer',
                  style: TextStyle(
                    fontSize: fontSize * 0.6,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              widget.mode == GameMode.solo && _currentPlayer == 2
                  ? 'Choose AI hero'
                  : 'Choose your hero',
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: FontWeight.bold,
                color: const Color(0xFF5D4037),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroGrid(double screenWidth, double screenHeight) {
    final spacing = (screenWidth * 0.01).clamp(4.0, 12.0);
    final crossAxisCount = screenWidth > 800 ? 3 : (screenWidth > 500 ? 3 : 2);

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        childAspectRatio: 0.85,
        crossAxisSpacing: spacing * 0.8,
        mainAxisSpacing: spacing * 0.8,
      ),
      itemCount: Hero.allHeroes.length,
      itemBuilder: (context, index) {
        final hero = Hero.allHeroes[index];
        final isSelectedByPlayer1 = _player1Hero?.type == hero.type;
        final isSelectedByPlayer2 = _player2Hero?.type == hero.type;
        final isCurrentSelection = _selectedHero?.type == hero.type;

        // Disable hero if already selected by the other player
        final isDisabled = (_currentPlayer == 2 && isSelectedByPlayer1);

        return _HeroCard(
          hero: hero,
          isSelected: isCurrentSelection,
          selectedByPlayer: isSelectedByPlayer1 ? 1 : (isSelectedByPlayer2 ? 2 : null),
          isDisabled: isDisabled,
          screenWidth: screenWidth,
          onTap: isDisabled
              ? null
              : () {
                  setState(() {
                    if (_currentPlayer == 1) {
                      _player1Hero = hero;
                    } else {
                      _player2Hero = hero;
                    }
                  });
                },
        );
      },
    );
  }

  Widget _buildDetailsPanel(double screenWidth, double screenHeight) {
    final padding = (screenWidth * 0.015).clamp(10.0, 20.0);
    final heroNameSize = (screenWidth * 0.022).clamp(16.0, 28.0);
    final perkFontSize = (screenWidth * 0.013).clamp(11.0, 15.0);

    final isAI = _currentPlayer == 1 ? _player1IsAI : _player2IsAI;
    final difficulty = _currentPlayer == 1 ? _player1AIDifficulty : _player2AIDifficulty;
    // In solo mode, Player 2 is always AI — show difficulty only (no toggle)
    final isSoloP2 = widget.mode == GameMode.solo && _currentPlayer == 2;
    final showAIToggle = widget.mode == GameMode.localMultiplayer;

    return Column(
      children: [
        // Hero details container
        Expanded(
          child: Container(
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage('assets/images/ui/hero-details-panel-bg.png'),
                fit: BoxFit.fill,
              ),
            ),
            child: _selectedHero == null
                ? Center(
                    child: Text(
                      'Select a hero',
                      style: TextStyle(
                        fontSize: perkFontSize,
                        color: const Color(0xFF8D6E63),
                      ),
                    ),
                  )
                : Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Expanded(
                          child: Padding(
                            padding: EdgeInsets.all(padding),
                            child: Image.asset(
                              _selectedHero!.imagePath,
                              fit: BoxFit.contain,
                              errorBuilder: (context, error, stackTrace) =>
                                  const Icon(Icons.person, size: 60),
                            ),
                          ),
                        ),
                        Padding(
                          padding: EdgeInsets.only(bottom: padding * 0.5),
                          child: Text(
                            _selectedHero!.name,
                            style: TextStyle(
                              fontSize: heroNameSize,
                              fontWeight: FontWeight.bold,
                              color: const Color(0xFF5D4037),
                            ),
                          ),
                        ),
                        // AI Mode toggle (local multiplayer only)
                        if (showAIToggle)
                          Padding(
                            padding: EdgeInsets.only(bottom: padding * 0.3),
                            child: GestureDetector(
                              onTap: () {
                                setState(() {
                                  if (_currentPlayer == 1) {
                                    _player1IsAI = !_player1IsAI;
                                    if (_player1IsAI) _player1AIDifficulty = 'medium';
                                  } else {
                                    _player2IsAI = !_player2IsAI;
                                    if (_player2IsAI) _player2AIDifficulty = 'medium';
                                  }
                                });
                              },
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Container(
                                    width: 20,
                                    height: 20,
                                    decoration: BoxDecoration(
                                      color: isAI ? const Color(0xFF4CAF50) : Colors.transparent,
                                      border: Border.all(
                                        color: isAI ? const Color(0xFF4CAF50) : const Color(0xFF8D6E63),
                                        width: 2,
                                      ),
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: isAI
                                        ? const Icon(Icons.check, size: 14, color: Colors.white)
                                        : null,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'AI Mode',
                                    style: TextStyle(
                                      fontSize: perkFontSize,
                                      fontWeight: FontWeight.bold,
                                      color: const Color(0xFF5D4037),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        // Difficulty selector (visible when AI is on, or in solo P2)
                        if (isAI || isSoloP2)
                          Padding(
                            padding: EdgeInsets.only(bottom: padding),
                            child: _buildDifficultySelector(
                              difficulty: isSoloP2 ? _player2AIDifficulty : difficulty,
                              enabled: true,
                              fontSize: perkFontSize,
                            ),
                          )
                        else
                          SizedBox(height: padding * 0.5),
                      ],
                    ),
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildDifficultySelector({
    required String difficulty,
    required bool enabled,
    required double fontSize,
  }) {
    const difficulties = ['easy', 'medium', 'hard'];
    const labels = {'easy': 'Easy', 'medium': 'Medium', 'hard': 'Hard'};
    const colors = {
      'easy': Color(0xFF4CAF50),
      'medium': Color(0xFFFF9800),
      'hard': Color(0xFFFF9800),
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: difficulties.map((d) {
        final isSelected = difficulty == d;
        final color = colors[d]!;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 3),
          child: GestureDetector(
            onTap: enabled
                ? () {
                    setState(() {
                      if (_currentPlayer == 1) {
                        _player1AIDifficulty = d;
                      } else {
                        _player2AIDifficulty = d;
                      }
                    });
                  }
                : null,
            child: Container(
              padding: EdgeInsets.symmetric(
                horizontal: fontSize * 0.8,
                vertical: fontSize * 0.3,
              ),
              decoration: BoxDecoration(
                color: isSelected ? color : Colors.transparent,
                border: Border.all(
                  color: isSelected ? color : const Color(0xFF8D6E63).withValues(alpha: 0.4),
                  width: 1.5,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Text(
                labels[d]!,
                style: TextStyle(
                  fontSize: fontSize * 0.9,
                  fontWeight: FontWeight.bold,
                  color: isSelected ? Colors.white : const Color(0xFF8D6E63),
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildBottomBar(double screenWidth) {
    final buttonWidth = (screenWidth * 0.14).clamp(120.0, 180.0);
    final buttonHeight = (screenWidth * 0.045).clamp(40.0, 56.0);
    final fontSize = (screenWidth * 0.014).clamp(11.0, 16.0);
    final padding = (screenWidth * 0.015).clamp(12.0, 20.0);

    return Padding(
      padding: EdgeInsets.all(padding),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Back button
          GestureDetector(
            onTap: () {
              if (_currentPlayer == 2 && _needsTwoPlayers) {
                // Go back to Player 1 selection
                setState(() {
                  _currentPlayer = 1;
                  _player2Hero = null;
                });
              } else {
                Navigator.pop(context);
              }
            },
            child: Container(
              width: buttonWidth,
              height: buttonHeight,
              decoration: const BoxDecoration(
                image: DecorationImage(
                  image: AssetImage('assets/images/ui/grey-btn-bg.png'),
                  fit: BoxFit.fill,
                ),
              ),
              child: Center(
                child: Text(
                  (_currentPlayer == 2 && _needsTwoPlayers) ? 'Back' : 'Back to menu',
                  style: TextStyle(
                    fontSize: fontSize * 0.9,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF5D4037),
                  ),
                ),
              ),
            ),
          ),
          SizedBox(width: padding),
          // Continue button
          GestureDetector(
            onTap: _selectedHero != null ? _handleContinue : null,
            child: Opacity(
              opacity: _selectedHero != null ? 1.0 : 0.5,
              child: Container(
                width: buttonWidth * 1.1,
                height: buttonHeight,
                decoration: const BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage('assets/images/ui/yellow-btn-bg.png'),
                    fit: BoxFit.fill,
                  ),
                ),
                child: Center(
                  child: Text(
                    widget.mode == GameMode.online
                        ? 'Find Match'
                        : (_needsTwoPlayers && _currentPlayer == 1)
                            ? 'Continue'
                            : 'Start',
                    style: TextStyle(
                      fontSize: fontSize,
                      fontWeight: FontWeight.bold,
                      color: const Color(0xFF5D4037),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleContinue() {
    if (_needsTwoPlayers && _currentPlayer == 1) {
      // Move to Player 2 selection
      setState(() {
        _currentPlayer = 2;
      });
    } else {
      // Start the game
      _startGame();
    }
  }

  void _startGame() {
    if (widget.mode == GameMode.online) {
      _startOnlineGame();
      return;
    }

    final p1AI = widget.mode == GameMode.solo ? false : _player1IsAI;
    final p2AI = widget.mode == GameMode.solo ? true : _player2IsAI;

    // For AI mode, use the same hero for player 2 if not selected
    final player2 = _player2Hero ?? Hero.allHeroes.firstWhere(
      (h) => h.type != _player1Hero!.type,
    );

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (context) => CombatScreen(
          player1Hero: _player1Hero!,
          player2Hero: player2,
          player1IsAI: p1AI,
          player2IsAI: p2AI,
          player1AIDifficulty: _player1AIDifficulty,
          player2AIDifficulty: _player2AIDifficulty,
        ),
      ),
    );
  }

  void _startOnlineGame() async {
    final authService = Provider.of<AuthService>(context, listen: false);
    final token = authService.token;
    final userId = authService.currentUser?.userId;
    if (token == null || userId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please log in to play online')),
      );
      return;
    }

    // Show searching overlay
    setState(() => _isSearching = true);

    final wsService = WebSocketService();
    final combatService = CombatService();

    try {
      await wsService.connect(token: token);
      combatService.initServerDrivenGame(wsService);

      // Listen for match found
      StreamSubscription<WSMessage>? matchSub;
      matchSub = wsService.messages.listen((msg) {
        if (msg.type == MessageType.laneMatchFound) {
          matchSub?.cancel();
          if (!mounted) return;
          setState(() => _isSearching = false);

          // Determine opponent hero for combat screen display
          final opponentHeroType = msg.payload['opponentHero'] as String? ?? 'yeti';
          final opponentHero = Hero.allHeroes.firstWhere(
            (h) => h.type.name == opponentHeroType,
            orElse: () => Hero.allHeroes.first,
          );

          final mySide = msg.payload['side'] as String;
          final myHero = _player1Hero!;

          Navigator.pushReplacement(
            context,
            MaterialPageRoute(
              builder: (context) => CombatScreen.online(
                myHero: myHero,
                opponentHero: opponentHero,
                combatService: combatService,
                wsService: wsService,
                mySide: mySide == 'player1' ? 'player1' : 'player2',
              ),
            ),
          );
        }
      });

      _onlineMatchSub = matchSub;
      _onlineWsService = wsService;
      _onlineCombatService = combatService;

      // Send join request
      combatService.joinLaneGame(userId, _player1Hero!.type.name, false, null);
    } catch (e) {
      setState(() => _isSearching = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Connection failed: $e')),
        );
      }
    }
  }

  void _cancelSearch() {
    _onlineMatchSub?.cancel();
    _onlineWsService?.disconnect();
    _onlineCombatService?.disconnectFromServer();
    setState(() => _isSearching = false);
  }
}

class _HeroCard extends StatelessWidget {
  final Hero hero;
  final bool isSelected;
  final int? selectedByPlayer;
  final bool isDisabled;
  final double screenWidth;
  final VoidCallback? onTap;

  const _HeroCard({
    required this.hero,
    required this.isSelected,
    this.selectedByPlayer,
    this.isDisabled = false,
    required this.screenWidth,
    this.onTap,
  });

  String get _backgroundAsset {
    if (isSelected && selectedByPlayer == 1) {
      return 'assets/images/ui/hero-panel-player-1-acitve.png';
    } else if (isSelected && selectedByPlayer == 2) {
      return 'assets/images/ui/hero-panel-player-2-acitve.png';
    } else if (!isSelected && selectedByPlayer == 1) {
      // Show green border for previously selected by player 1 (when player 2 is selecting)
      return 'assets/images/ui/hero-panel-player-1-acitve.png';
    }
    return 'assets/images/ui/hero-panel.png';
  }

  @override
  Widget build(BuildContext context) {
    final padding = (screenWidth * 0.01).clamp(6.0, 12.0);
    final fontSize = (screenWidth * 0.012).clamp(10.0, 14.0);

    return GestureDetector(
      onTap: onTap,
      child: Opacity(
        opacity: isDisabled ? 0.5 : 1.0,
        child: Container(
          decoration: BoxDecoration(
            image: DecorationImage(
              image: AssetImage(_backgroundAsset),
              fit: BoxFit.fill,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Expanded(
                child: Padding(
                  padding: EdgeInsets.all(padding),
                  child: Image.asset(
                    hero.imagePath,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => Center(
                      child: Text(
                        hero.name[0],
                        style: TextStyle(
                          fontSize: fontSize * 2.5,
                          fontWeight: FontWeight.bold,
                          color: const Color(0xFF5D4037),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: EdgeInsets.only(bottom: padding),
                child: Text(
                  hero.name,
                  style: TextStyle(
                    fontSize: fontSize,
                    fontWeight: FontWeight.bold,
                    color: const Color(0xFF5D4037),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
