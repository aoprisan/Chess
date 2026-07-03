import 'dart:async';
import 'package:flutter/material.dart' hide Hero;
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/hero.dart';
import '../services/adventure_service.dart';
import '../services/auth_service.dart';
import '../services/combat_service.dart';
import '../services/websocket_service.dart';
import 'adventure_map_screen.dart';
import 'combat_screen.dart';
import 'hero_selection_screen.dart';
import 'upgrade_account_screen.dart';
import 'welcome_screen.dart';

class MainMenuScreen extends StatefulWidget {
  const MainMenuScreen({super.key});

  @override
  State<MainMenuScreen> createState() => _MainMenuScreenState();
}

class _MainMenuScreenState extends State<MainMenuScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkForActiveGame();
    });
  }

  Future<void> _checkForActiveGame() async {
    final authService = Provider.of<AuthService>(context, listen: false);
    final token = authService.token;
    if (token == null) return;

    final wsService = WebSocketService();
    try {
      await wsService.connect(token: token);

      // Listen for connect message with activeGameId
      StreamSubscription<WSMessage>? sub;
      sub = wsService.messages.listen((msg) {
        if (msg.type == MessageType.connect) {
          final activeGameId = msg.payload['activeGameId'] as String?;
          sub?.cancel();

          if (activeGameId != null && mounted) {
            _showResumeGameDialog(wsService, activeGameId);
          } else {
            wsService.disconnect();
          }
        }
      });

      // Timeout after 3 seconds
      Future.delayed(const Duration(seconds: 3), () {
        sub?.cancel();
        if (!mounted) {
          wsService.disconnect();
        }
      });
    } catch (_) {
      // Connection failed, ignore silently
    }
  }

  void _showResumeGameDialog(WebSocketService wsService, String gameId) {
    showDialog(
      context: context,
      barrierDismissible: false,
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
              const Icon(Icons.sports_esports, size: 48, color: Color(0xFF5D4037)),
              const SizedBox(height: 16),
              const Text(
                'Game In Progress',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF5D4037),
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'You have an active online game. Resume?',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color: Color(0xFF8D6E63),
                ),
              ),
              const SizedBox(height: 24),
              _StyledButton(
                text: 'Resume Game',
                onPressed: () {
                  Navigator.pop(dialogContext);
                  _resumeGame(wsService, gameId);
                },
              ),
              const SizedBox(height: 12),
              _StyledButton(
                text: 'Dismiss',
                onPressed: () {
                  Navigator.pop(dialogContext);
                  wsService.disconnect();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _resumeGame(WebSocketService wsService, String gameId) {
    final combatService = CombatService();
    combatService.initServerDrivenGame(wsService);

    // Listen for reconnect response
    StreamSubscription<WSMessage>? sub;
    sub = wsService.messages.listen((msg) {
      if (msg.type == MessageType.reconnect) {
        sub?.cancel();
        if (!mounted) return;

        final sideStr = msg.payload['side'] as String;
        final myHero = Hero.allHeroes.first; // Fallback
        final opponentHero = Hero.allHeroes.last;

        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => CombatScreen.online(
              myHero: myHero,
              opponentHero: opponentHero,
              combatService: combatService,
              wsService: wsService,
              mySide: sideStr,
            ),
          ),
        );
      }
    });

    // Send reconnect request
    wsService.reconnectToGame(gameId);

    // Store game ID for fallback
    SharedPreferences.getInstance().then((prefs) {
      prefs.setString('lastGameId', gameId);
    });
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
          // Profile indicator
          SafeArea(
            child: Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: _ProfileChip(),
              ),
            ),
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
                  // Adventure button
                  _StyledButton(
                    text: 'Adventure',
                    onPressed: () => _startAdventure(context),
                  ),
                  const SizedBox(height: 16),
                  // 1 vs 1 on this device (pass-and-play)
                  _StyledButton(
                    text: '2 Players',
                    onPressed: () => _navigateToHeroSelection(context,
                        mode: GameMode.localMultiplayer),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _startAdventure(BuildContext context) async {
    // Resume a saved journey directly; otherwise pick a hero first
    final hasSaved = await AdventureService.hasSavedJourney();
    if (!context.mounted) return;
    if (hasSaved) {
      Navigator.push(
        context,
        MaterialPageRoute(builder: (context) => const AdventureMapScreen()),
      );
    } else {
      _navigateToHeroSelection(context, mode: GameMode.adventure);
    }
  }

  void _navigateToHeroSelection(BuildContext context, {required GameMode mode}) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (context) => HeroSelectionScreen(mode: mode),
      ),
    );
  }

}

class _ProfileChip extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Consumer<AuthService>(
      builder: (context, auth, _) {
        final user = auth.currentUser;
        if (user == null) return const SizedBox.shrink();
        return GestureDetector(
          onTap: () => _showProfileDialogStatic(context, auth),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFF5E6D3).withValues(alpha: 0.9),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF8D6E63), width: 2),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.person, size: 20, color: Color(0xFF5D4037)),
                const SizedBox(width: 6),
                Text(
                  user.username,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF5D4037),
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.settings, size: 18, color: Color(0xFF8D6E63)),
              ],
            ),
          ),
        );
      },
    );
  }

  static void _showProfileDialogStatic(BuildContext context, AuthService authService) {
    final user = authService.currentUser;
    if (user == null) return;

    showDialog(
      context: context,
      builder: (dialogContext) => Dialog(
        backgroundColor: Colors.transparent,
        child: Container(
          width: 300,
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 24),
          decoration: BoxDecoration(
            color: const Color(0xFFF5E6D3),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFF8D6E63), width: 3),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.person, size: 48, color: Color(0xFF5D4037)),
              const SizedBox(height: 8),
              Text(
                user.username,
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF5D4037),
                ),
              ),
              if (user.isGuest)
                const Text(
                  'Guest Account',
                  style: TextStyle(fontSize: 13, color: Color(0xFF8D6E63)),
                ),
              const SizedBox(height: 20),
              if (user.isGuest) ...[
                _StyledButton(
                  text: 'Add Email & Password',
                  onPressed: () {
                    Navigator.pop(dialogContext);
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const UpgradeAccountScreen(),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 12),
              ],
              _StyledButton(
                text: 'Log Out',
                onPressed: () async {
                  Navigator.pop(dialogContext);
                  await authService.logout();
                  if (context.mounted) {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const WelcomeScreen(),
                      ),
                      (route) => false,
                    );
                  }
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
