import 'package:flutter/material.dart' hide Hero;
import 'package:provider/provider.dart';
import '../models/hero.dart';
import '../services/game_service.dart';
import 'combat_screen.dart';

class HeroSelectionScreen extends StatefulWidget {
  final bool online;

  const HeroSelectionScreen({
    super.key,
    this.online = false,
  });

  @override
  State<HeroSelectionScreen> createState() => _HeroSelectionScreenState();
}

class _HeroSelectionScreenState extends State<HeroSelectionScreen> {
  int _currentPlayer = 1; // 1 or 2
  Hero? _player1Hero;
  Hero? _player2Hero;
  bool _player1IsAI = false;
  bool _player2IsAI = false;
  String _difficulty = 'medium';

  Hero? get _selectedHero => _currentPlayer == 1 ? _player1Hero : _player2Hero;

  bool get _anyAI => _player1IsAI || _player2IsAI;
  bool get _currentPlayerIsAI => _currentPlayer == 1 ? _player1IsAI : _player2IsAI;

  bool get _needsTwoPlayers => !widget.online;

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
              'Choose your hero',
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
                : Row(
                    children: [
                      // Large hero image
                      Expanded(
                        flex: 3,
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
                              padding: EdgeInsets.only(bottom: padding),
                              child: Text(
                                _selectedHero!.name,
                                style: TextStyle(
                                  fontSize: heroNameSize,
                                  fontWeight: FontWeight.bold,
                                  color: const Color(0xFF5D4037),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                      // Perks list
                      Expanded(
                        flex: 2,
                        child: Padding(
                          padding: EdgeInsets.all(padding * 0.75),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Perks',
                                style: TextStyle(
                                  fontSize: perkFontSize,
                                  fontWeight: FontWeight.bold,
                                  color: const Color(0xFF5D4037),
                                ),
                              ),
                              SizedBox(height: padding * 0.5),
                              // All perks list
                              ...Perk.values.map((perk) {
                                final hasPerk = _selectedHero!.perks.contains(perk);
                                return _PerkRow(
                                  perkName: _getPerkDisplayName(perk),
                                  isActive: hasPerk,
                                  fontSize: perkFontSize * 0.85,
                                );
                              }),
                              const Spacer(),
                              // AI Mode section (offline only)
                              if (!widget.online) ...[
                                _buildAIModeCheckbox(screenWidth),
                                SizedBox(height: padding * 0.5),
                                Opacity(
                                  opacity: _anyAI ? 1.0 : 0.5,
                                  child: IgnorePointer(
                                    ignoring: !_anyAI,
                                    child: _buildDifficultySelector(screenWidth),
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
          ),
        ),
      ],
    );
  }

  Widget _buildAIModeCheckbox(double screenWidth) {
    final checkboxSize = (screenWidth * 0.025).clamp(20.0, 32.0);
    final fontSize = (screenWidth * 0.012).clamp(10.0, 14.0);

    return GestureDetector(
      onTap: () {
        setState(() {
          if (_currentPlayer == 1) {
            _player1IsAI = !_player1IsAI;
          } else {
            _player2IsAI = !_player2IsAI;
          }
        });
      },
      child: Row(
        children: [
          Container(
            width: checkboxSize,
            height: checkboxSize,
            decoration: BoxDecoration(
              image: DecorationImage(
                image: AssetImage(
                  _currentPlayerIsAI
                      ? 'assets/images/ui/checkbox-active-bg.png'
                      : 'assets/images/ui/checkbox-bg.png',
                ),
                fit: BoxFit.contain,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Text(
            'Player $_currentPlayer AI',
            style: TextStyle(
              fontSize: fontSize,
              color: const Color(0xFF5D4037),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDifficultySelector(double screenWidth) {
    final height = (screenWidth * 0.038).clamp(30.0, 48.0);
    final fontSize = (screenWidth * 0.012).clamp(10.0, 14.0);

    return Container(
      height: height,
      decoration: const BoxDecoration(
        image: DecorationImage(
          image: AssetImage('assets/images/ui/ai-mode-group-buttons-bg.png'),
          fit: BoxFit.fill,
        ),
      ),
      child: Row(
        children: [
          _DifficultyButton(
            label: 'Easy',
            isSelected: _anyAI && _difficulty == 'easy',
            backgroundAsset: 'assets/images/ui/eazy-level-bg.png',
            fontSize: fontSize,
            onTap: () => setState(() => _difficulty = 'easy'),
          ),
          _DifficultyButton(
            label: 'Medium',
            isSelected: _anyAI && _difficulty == 'medium',
            backgroundAsset: 'assets/images/ui/medium-level-bg.png',
            fontSize: fontSize,
            onTap: () => setState(() => _difficulty = 'medium'),
          ),
          _DifficultyButton(
            label: 'Hard',
            isSelected: _anyAI && _difficulty == 'hard',
            backgroundAsset: 'assets/images/ui/hard-level-bg.png',
            fontSize: fontSize,
            onTap: () => setState(() => _difficulty = 'hard'),
          ),
        ],
      ),
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
                  'Back to menu',
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
                    widget.online ? 'Find Match' : 'Continue',
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
    final gameService = context.read<GameService>();

    // Set Player 1's hero
    gameService.selectHero(_player1Hero!);

    // Set AI mode and difficulty
    if (_anyAI) {
      gameService.setAIMode(true);
      gameService.setAIDifficulty(_getDifficulty());
    } else {
      gameService.setAIMode(false);
    }

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
          player1IsAI: _player1IsAI,
          player2IsAI: _player2IsAI,
        ),
      ),
    );
  }

  AIDifficulty _getDifficulty() {
    switch (_difficulty) {
      case 'easy':
        return AIDifficulty.easy;
      case 'hard':
        return AIDifficulty.hard;
      default:
        return AIDifficulty.medium;
    }
  }

  String _getPerkDisplayName(Perk perk) {
    switch (perk) {
      case Perk.anotherMove:
        return 'Another move';
      case Perk.removeEnemy:
        return 'Remove enemy';
      case Perk.placeAnother:
        return 'Place another';
      case Perk.scatterAround:
        return 'Scatter around';
      case Perk.freeze:
        return 'Freeze';
      case Perk.cancelMove:
        return 'Cancel move';
    }
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

class _PerkRow extends StatelessWidget {
  final String perkName;
  final bool isActive;
  final double fontSize;

  const _PerkRow({
    required this.perkName,
    required this.isActive,
    this.fontSize = 12,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 2),
      padding: EdgeInsets.symmetric(horizontal: fontSize * 0.8, vertical: fontSize * 0.4),
      decoration: const BoxDecoration(
        image: DecorationImage(
          image: AssetImage('assets/images/ui/perk-bg.png'),
          fit: BoxFit.fill,
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Text(
              perkName,
              style: TextStyle(
                fontSize: fontSize,
                color: isActive ? const Color(0xFF5D4037) : const Color(0xFFB0A090),
              ),
            ),
          ),
          if (isActive)
            Image.asset(
              'assets/images/ui/active-perk-icon.png',
              width: fontSize,
              height: fontSize,
            ),
        ],
      ),
    );
  }
}

class _DifficultyButton extends StatelessWidget {
  final String label;
  final bool isSelected;
  final String backgroundAsset;
  final double fontSize;
  final VoidCallback onTap;

  const _DifficultyButton({
    required this.label,
    required this.isSelected,
    required this.backgroundAsset,
    this.fontSize = 11,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          decoration: isSelected
              ? BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage(backgroundAsset),
                    fit: BoxFit.fill,
                  ),
                )
              : null,
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: fontSize,
                fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                color: const Color(0xFF5D4037),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
