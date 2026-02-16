import 'package:flutter/material.dart';
import 'hero_selection_screen.dart';

class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key});

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
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Logo
                  Image.asset(
                    'assets/images/ui/KiddieChess.png',
                    width: 400,
                    fit: BoxFit.contain,
                  ),
                  const SizedBox(height: 60),
                  // Play Solo button
                  _StyledButton(
                    text: 'Play Solo',
                    onPressed: () => _navigateToHeroSelection(context, mode: GameMode.solo),
                  ),
                  const SizedBox(height: 16),
                  // Play with Friend button
                  _StyledButton(
                    text: 'Play with Friend',
                    onPressed: () => _showFriendModeDialog(context),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _navigateToHeroSelection(BuildContext context, {required GameMode mode}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => HeroSelectionScreen(mode: mode),
      ),
    );
  }

  void _showFriendModeDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          width: 280,
          padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
          decoration: BoxDecoration(
            color: const Color(0xFFF5E6D3),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF8D6E63), width: 3),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Play with Friend',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF5D4037),
                ),
              ),
              const SizedBox(height: 24),
              _StyledButton(
                text: 'Same Device',
                onPressed: () {
                  Navigator.pop(dialogContext);
                  _navigateToHeroSelection(context, mode: GameMode.localMultiplayer);
                },
              ),
              const SizedBox(height: 12),
              _StyledButton(
                text: 'Online',
                onPressed: () {
                  Navigator.pop(dialogContext);
                  _navigateToHeroSelection(context, mode: GameMode.online);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StyledButton extends StatelessWidget {
  final String text;
  final VoidCallback onPressed;

  const _StyledButton({
    required this.text,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 220,
        height: 50,
        decoration: const BoxDecoration(
          image: DecorationImage(
            image: AssetImage('assets/images/ui/yellow-btn-bg.png'),
            fit: BoxFit.fill,
          ),
        ),
        child: Center(
          child: Text(
            text,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.bold,
              color: Color(0xFF5D4037),
            ),
          ),
        ),
      ),
    );
  }
}
