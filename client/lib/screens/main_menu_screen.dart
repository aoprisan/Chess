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
                  // Play vs Friend button
                  _StyledButton(
                    text: 'Play vs Friend',
                    onPressed: () => _navigateToHeroSelection(context, vsAI: false),
                  ),
                  const SizedBox(height: 16),
                  // Play vs AI button
                  _StyledButton(
                    text: 'Play vs AI',
                    onPressed: () => _navigateToHeroSelection(context, vsAI: true),
                  ),
                  const SizedBox(height: 16),
                  // Play Online button
                  _StyledButton(
                    text: 'Play Online',
                    onPressed: () => _navigateToHeroSelection(context, online: true),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _navigateToHeroSelection(BuildContext context,
      {bool vsAI = false, bool online = false}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => HeroSelectionScreen(
          vsAI: vsAI,
          online: online,
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
