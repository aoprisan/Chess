import 'package:flutter/material.dart' hide Hero;
import 'package:provider/provider.dart';
import '../models/hero.dart';
import '../services/game_service.dart';
import 'combat_screen.dart';

class HeroSelectionScreen extends StatefulWidget {
  final bool vsAI;
  final bool online;

  const HeroSelectionScreen({
    super.key,
    this.vsAI = false,
    this.online = false,
  });

  @override
  State<HeroSelectionScreen> createState() => _HeroSelectionScreenState();
}

class _HeroSelectionScreenState extends State<HeroSelectionScreen> {
  int _currentPlayer = 1; // 1 or 2
  Hero? _player1Hero;
  Hero? _player2Hero;
  bool _aiModeEnabled = true; // Default to true when in vsAI mode
  String _difficulty = 'medium';

  Hero? get _selectedHero => _currentPlayer == 1 ? _player1Hero : _player2Hero;

  bool get _needsTwoPlayers => !widget.vsAI && !widget.online;

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
            child: Column(
              children: [
                // Title Bar
                _buildTitleBar(),
                // Main content: Hero grid + Details panel
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Hero Grid (left side)
                        Expanded(
                          flex: 3,
                          child: _buildHeroGrid(),
                        ),
                        const SizedBox(width: 24),
                        // Details Panel (right side)
                        Expanded(
                          flex: 2,
                          child: _buildDetailsPanel(),
                        ),
                      ],
                    ),
                  ),
                ),
                // Bottom Bar with buttons
                _buildBottomBar(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTitleBar() {
    return Container(
      margin: const EdgeInsets.only(top: 16),
      child: Container(
        height: 60,
        width: 350,
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
              width: 80,
              height: 40,
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
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            const Text(
              'Choose your hero',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: Color(0xFF5D4037),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeroGrid() {
    return GridView.builder(
      shrinkWrap: true,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.75,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
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

  Widget _buildDetailsPanel() {
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
                ? const Center(
                    child: Text(
                      'Select a hero',
                      style: TextStyle(
                        fontSize: 16,
                        color: Color(0xFF8D6E63),
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
                                padding: const EdgeInsets.all(16),
                                child: Image.asset(
                                  _selectedHero!.imagePath,
                                  fit: BoxFit.contain,
                                  errorBuilder: (context, error, stackTrace) =>
                                      const Icon(Icons.person, size: 100),
                                ),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(bottom: 16),
                              child: Text(
                                _selectedHero!.name,
                                style: const TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF5D4037),
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
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Perks',
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.bold,
                                  color: Color(0xFF5D4037),
                                ),
                              ),
                              const SizedBox(height: 8),
                              // All perks list
                              ...Perk.values.map((perk) {
                                final hasPerk = _selectedHero!.perks.contains(perk);
                                return _PerkRow(
                                  perkName: _getPerkDisplayName(perk),
                                  isActive: hasPerk,
                                );
                              }),
                              const Spacer(),
                              // AI Mode checkbox (only in vsAI mode)
                              if (widget.vsAI) ...[
                                _buildAIModeCheckbox(),
                                const SizedBox(height: 8),
                                if (_aiModeEnabled) _buildDifficultySelector(),
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

  Widget _buildAIModeCheckbox() {
    return GestureDetector(
      onTap: () {
        setState(() {
          _aiModeEnabled = !_aiModeEnabled;
        });
      },
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              image: DecorationImage(
                image: AssetImage(
                  _aiModeEnabled
                      ? 'assets/images/ui/checkbox-active-bg.png'
                      : 'assets/images/ui/checkbox-bg.png',
                ),
                fit: BoxFit.contain,
              ),
            ),
          ),
          const SizedBox(width: 8),
          const Text(
            'AI Mode',
            style: TextStyle(
              fontSize: 14,
              color: Color(0xFF5D4037),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDifficultySelector() {
    return Container(
      height: 36,
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
            isSelected: _difficulty == 'easy',
            backgroundAsset: 'assets/images/ui/eazy-level-bg.png',
            onTap: () => setState(() => _difficulty = 'easy'),
          ),
          _DifficultyButton(
            label: 'Medium',
            isSelected: _difficulty == 'medium',
            backgroundAsset: 'assets/images/ui/medium-level-bg.png',
            onTap: () => setState(() => _difficulty = 'medium'),
          ),
          _DifficultyButton(
            label: 'Hard',
            isSelected: _difficulty == 'hard',
            backgroundAsset: 'assets/images/ui/hard-level-bg.png',
            onTap: () => setState(() => _difficulty = 'hard'),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomBar() {
    return Padding(
      padding: const EdgeInsets.all(16),
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
              width: 140,
              height: 45,
              decoration: const BoxDecoration(
                image: DecorationImage(
                  image: AssetImage('assets/images/ui/grey-btn-bg.png'),
                  fit: BoxFit.fill,
                ),
              ),
              child: const Center(
                child: Text(
                  'Back to menu',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF5D4037),
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          // Continue button
          GestureDetector(
            onTap: _selectedHero != null ? _handleContinue : null,
            child: Opacity(
              opacity: _selectedHero != null ? 1.0 : 0.5,
              child: Container(
                width: 160,
                height: 45,
                decoration: const BoxDecoration(
                  image: DecorationImage(
                    image: AssetImage('assets/images/ui/yellow-btn-bg.png'),
                    fit: BoxFit.fill,
                  ),
                ),
                child: Center(
                  child: Text(
                    widget.online ? 'Find Match' : 'Continue',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF5D4037),
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
    if (widget.vsAI && _aiModeEnabled) {
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
          vsAI: widget.vsAI && _aiModeEnabled,
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
  final VoidCallback? onTap;

  const _HeroCard({
    required this.hero,
    required this.isSelected,
    this.selectedByPlayer,
    this.isDisabled = false,
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
                  padding: const EdgeInsets.all(12),
                  child: Image.asset(
                    hero.imagePath,
                    fit: BoxFit.contain,
                    errorBuilder: (context, error, stackTrace) => Center(
                      child: Text(
                        hero.name[0],
                        style: const TextStyle(
                          fontSize: 40,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF5D4037),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  hero.name,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF5D4037),
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

  const _PerkRow({
    required this.perkName,
    required this.isActive,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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
                fontSize: 12,
                color: isActive ? const Color(0xFF5D4037) : const Color(0xFFB0A090),
              ),
            ),
          ),
          if (isActive)
            Image.asset(
              'assets/images/ui/active-perk-icon.png',
              width: 12,
              height: 12,
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
  final VoidCallback onTap;

  const _DifficultyButton({
    required this.label,
    required this.isSelected,
    required this.backgroundAsset,
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
                fontSize: 11,
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
