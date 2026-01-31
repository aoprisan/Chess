import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/hero.dart';
import '../services/game_service.dart';
import 'game_screen.dart';

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
  Hero? _selectedHero;
  AIDifficulty _difficulty = AIDifficulty.medium;

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
              // Header
              Container(
                padding: const EdgeInsets.all(16),
                child: const Text(
                  'Choose Your Hero',
                  style: TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF5D4037),
                  ),
                ),
              ),
              // Hero Grid
              Expanded(
                flex: 2,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: GridView.builder(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 3,
                      childAspectRatio: 0.8,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                    ),
                    itemCount: Hero.allHeroes.length,
                    itemBuilder: (context, index) {
                      final hero = Hero.allHeroes[index];
                      final isSelected = _selectedHero?.type == hero.type;
                      return _HeroCard(
                        hero: hero,
                        isSelected: isSelected,
                        onTap: () => setState(() => _selectedHero = hero),
                      );
                    },
                  ),
                ),
              ),
              // Hero Details Panel
              if (_selectedHero != null)
                Expanded(
                  flex: 1,
                  child: _HeroDetailsPanel(hero: _selectedHero!),
                ),
              // AI Difficulty (if vs AI)
              if (widget.vsAI) _buildDifficultySelector(),
              // Action Buttons
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.pop(context),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          side: const BorderSide(color: Color(0xFF8D6E63)),
                        ),
                        child: const Text(
                          'Back',
                          style:
                              TextStyle(fontSize: 18, color: Color(0xFF8D6E63)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _selectedHero != null ? _startGame : null,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFFFB300),
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(
                          widget.online ? 'Find Match' : 'Start Game',
                          style: const TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDifficultySelector() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            'AI Difficulty: ',
            style: TextStyle(fontSize: 16, color: Color(0xFF5D4037)),
          ),
          const SizedBox(width: 12),
          SegmentedButton<AIDifficulty>(
            segments: const [
              ButtonSegment(value: AIDifficulty.easy, label: Text('Easy')),
              ButtonSegment(value: AIDifficulty.medium, label: Text('Medium')),
              ButtonSegment(value: AIDifficulty.hard, label: Text('Hard')),
            ],
            selected: {_difficulty},
            onSelectionChanged: (set) {
              setState(() => _difficulty = set.first);
            },
          ),
        ],
      ),
    );
  }

  void _startGame() {
    final gameService = context.read<GameService>();
    gameService.selectHero(_selectedHero!);
    gameService.setAIMode(widget.vsAI);
    gameService.setAIDifficulty(_difficulty);

    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (context) => GameScreen(
          vsAI: widget.vsAI,
          online: widget.online,
        ),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  final Hero hero;
  final bool isSelected;
  final VoidCallback onTap;

  const _HeroCard({
    required this.hero,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFFFFE082) : Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? const Color(0xFFFFB300) : Colors.transparent,
            width: 3,
          ),
          boxShadow: [
            BoxShadow(
              color: isSelected ? Colors.amber.withOpacity(0.4) : Colors.black12,
              blurRadius: isSelected ? 12 : 4,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Hero image
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: const Color(0xFFFFF8E1),
                shape: BoxShape.circle,
                border: Border.all(color: const Color(0xFFFFB300), width: 2),
              ),
              child: ClipOval(
                child: Image.asset(
                  hero.imagePath,
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Center(
                    child: Text(
                      hero.name[0],
                      style: const TextStyle(
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF5D4037),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              hero.name,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: Color(0xFF5D4037),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroDetailsPanel extends StatelessWidget {
  final Hero hero;

  const _HeroDetailsPanel({required this.hero});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Row(
        children: [
          // Hero avatar
          Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              color: const Color(0xFFFFF8E1),
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFFFFB300), width: 3),
            ),
            child: ClipOval(
              child: Image.asset(
                hero.imagePath,
                fit: BoxFit.cover,
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
          const SizedBox(width: 16),
          // Perks list
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  hero.name,
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF5D4037),
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Perks:',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    color: Color(0xFF8D6E63),
                  ),
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: hero.perks.map((perk) {
                    final count = hero.perkCounts[perk] ?? 1;
                    return Chip(
                      label: Text(
                        '${_perkName(perk)} x$count',
                        style: const TextStyle(fontSize: 12),
                      ),
                      backgroundColor: const Color(0xFFE3F2FD),
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _perkName(Perk perk) {
    switch (perk) {
      case Perk.anotherMove:
        return 'Extra Move';
      case Perk.removeEnemy:
        return 'Remove';
      case Perk.placeAnother:
        return 'Place';
      case Perk.scatterAround:
        return 'Scatter';
      case Perk.freeze:
        return 'Freeze';
      case Perk.cancelMove:
        return 'Undo';
    }
  }
}
