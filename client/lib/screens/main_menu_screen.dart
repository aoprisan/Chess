import 'package:flutter/material.dart';
import 'hero_selection_screen.dart';

class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key});

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
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Container(
                  padding: const EdgeInsets.all(20),
                  child: const Text(
                    '♔ Kiddie Chess ♚',
                    style: TextStyle(
                      fontSize: 42,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF5D4037),
                      shadows: [
                        Shadow(
                          offset: Offset(2, 2),
                          blurRadius: 4,
                          color: Colors.black26,
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                // Subtitle
                const Text(
                  'Chess with Superpowers!',
                  style: TextStyle(
                    fontSize: 20,
                    color: Color(0xFF8D6E63),
                    fontStyle: FontStyle.italic,
                  ),
                ),
                const SizedBox(height: 60),
                // Play vs Player button
                _MenuButton(
                  text: 'Play vs Friend',
                  icon: Icons.people,
                  color: const Color(0xFF4CAF50),
                  onPressed: () => _navigateToHeroSelection(context, vsAI: false),
                ),
                const SizedBox(height: 20),
                // Play vs AI button
                _MenuButton(
                  text: 'Play vs AI',
                  icon: Icons.smart_toy,
                  color: const Color(0xFF2196F3),
                  onPressed: () => _navigateToHeroSelection(context, vsAI: true),
                ),
                const SizedBox(height: 20),
                // Online Play button
                _MenuButton(
                  text: 'Play Online',
                  icon: Icons.public,
                  color: const Color(0xFFFF9800),
                  onPressed: () => _navigateToHeroSelection(context, online: true),
                ),
                const SizedBox(height: 40),
                // Settings button
                TextButton.icon(
                  onPressed: () {
                    // TODO: Navigate to settings
                  },
                  icon: const Icon(Icons.settings, color: Color(0xFF8D6E63)),
                  label: const Text(
                    'Settings',
                    style: TextStyle(color: Color(0xFF8D6E63), fontSize: 16),
                  ),
                ),
              ],
            ),
          ),
        ),
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

class _MenuButton extends StatelessWidget {
  final String text;
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;

  const _MenuButton({
    required this.text,
    required this.icon,
    required this.color,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 250,
      height: 60,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(30),
          ),
          elevation: 4,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 28),
            const SizedBox(width: 12),
            Text(
              text,
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
