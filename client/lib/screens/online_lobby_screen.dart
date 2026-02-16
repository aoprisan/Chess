import 'package:flutter/material.dart' hide Hero;
import 'package:flutter/services.dart';
import '../models/hero.dart';
import '../services/websocket_service.dart';
import '../services/auth_service.dart';
import '../services/multiplayer_service.dart';
import 'online_combat_screen.dart';

/// Screen for creating/joining multiplayer rooms or random matchmaking.
class OnlineLobbyScreen extends StatefulWidget {
  final Hero selectedHero;

  const OnlineLobbyScreen({super.key, required this.selectedHero});

  @override
  State<OnlineLobbyScreen> createState() => _OnlineLobbyScreenState();
}

class _OnlineLobbyScreenState extends State<OnlineLobbyScreen> {
  late WebSocketService _ws;
  late AuthService _auth;
  late MultiplayerService _multiplayer;
  final _roomCodeController = TextEditingController();
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _ws = WebSocketService();
    _auth = AuthService();
    _multiplayer = MultiplayerService(ws: _ws, auth: _auth);
    _multiplayer.addListener(_onStateChanged);
    _initConnection();
  }

  Future<void> _initConnection() async {
    await _auth.loadUser();
    await _multiplayer.connect();
    if (mounted) {
      setState(() => _initialized = true);
    }
  }

  void _onStateChanged() {
    if (!mounted) return;
    setState(() {});

    // Navigate to combat screen when match is found
    if (_multiplayer.state == MultiplayerState.playing) {
      _navigateToCombat();
    }
  }

  void _navigateToCombat() {
    Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => OnlineCombatScreen(
          myHero: widget.selectedHero,
          mySide: _multiplayer.mySide ?? 'player1',
          gameId: _multiplayer.gameId ?? '',
          ws: _ws,
          multiplayer: _multiplayer,
        ),
      ),
    );
  }

  @override
  void dispose() {
    _multiplayer.removeListener(_onStateChanged);
    _roomCodeController.dispose();
    // Don't dispose ws/multiplayer here - they'll be passed to combat screen
    if (_multiplayer.state != MultiplayerState.playing &&
        _multiplayer.state != MultiplayerState.matchFound) {
      _multiplayer.cancelMatchmaking();
      _multiplayer.dispose();
      _ws.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          Image.asset(
            'assets/images/ui/main-bg.png',
            fit: BoxFit.cover,
            repeat: ImageRepeat.repeat,
          ),
          SafeArea(
            child: _initialized
                ? _buildContent()
                : const Center(
                    child: CircularProgressIndicator(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Widget _buildContent() {
    final state = _multiplayer.state;

    // Show waiting UI for room/matchmaking states
    if (state == MultiplayerState.waitingInRoom ||
        state == MultiplayerState.findingMatch ||
        state == MultiplayerState.matchFound ||
        state == MultiplayerState.creatingRoom) {
      return _buildWaitingUI();
    }

    if (state == MultiplayerState.error) {
      return _buildErrorUI();
    }

    return _buildLobbyUI();
  }

  Widget _buildLobbyUI() {
    final screenWidth = MediaQuery.of(context).size.width;
    final cardWidth = (screenWidth * 0.45).clamp(320.0, 500.0);

    return Center(
      child: SingleChildScrollView(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Title
            Text(
              'Online Play',
              style: TextStyle(
                fontSize: (screenWidth * 0.04).clamp(24.0, 40.0),
                fontWeight: FontWeight.bold,
                color: Colors.white,
                shadows: const [
                  Shadow(color: Colors.black54, blurRadius: 8),
                ],
              ),
            ),
            const SizedBox(height: 8),
            // Selected hero chip
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 32,
                    height: 32,
                    child: Image.asset(
                      widget.selectedHero.imagePath,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.person,
                        color: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    widget.selectedHero.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 32),

            // Create Room card
            _buildOptionCard(
              width: cardWidth,
              title: 'Create Room',
              subtitle: 'Get a code to share with a friend',
              icon: Icons.add_circle_outline,
              color: const Color(0xFF4CAF50),
              onTap: () {
                _multiplayer.createRoom(widget.selectedHero.name.toLowerCase());
              },
            ),
            const SizedBox(height: 16),

            // Join Room card
            _buildJoinRoomCard(cardWidth),
            const SizedBox(height: 16),

            // Random Match card
            _buildOptionCard(
              width: cardWidth,
              title: 'Find Match',
              subtitle: 'Play against a random opponent',
              icon: Icons.search,
              color: const Color(0xFF2196F3),
              onTap: () {
                _multiplayer.findMatch(widget.selectedHero.name.toLowerCase());
              },
            ),
            const SizedBox(height: 24),

            // Back button
            TextButton.icon(
              onPressed: () => Navigator.pop(context),
              icon:
                  const Icon(Icons.arrow_back, color: Colors.white70, size: 18),
              label: const Text(
                'Back',
                style: TextStyle(color: Colors.white70, fontSize: 16),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOptionCard({
    required double width,
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: width,
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF2A2A2A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withValues(alpha: 0.6), width: 2),
          boxShadow: [
            BoxShadow(
              color: color.withValues(alpha: 0.2),
              blurRadius: 12,
              spreadRadius: 1,
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    subtitle,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade400,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: Colors.grey.shade600),
          ],
        ),
      ),
    );
  }

  Widget _buildJoinRoomCard(double width) {
    return Container(
      width: width,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF2A2A2A),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: const Color(0xFF9C27B0).withValues(alpha: 0.6), width: 2),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF9C27B0).withValues(alpha: 0.2),
            blurRadius: 12,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF9C27B0).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.login, color: Color(0xFF9C27B0), size: 28),
              ),
              const SizedBox(width: 16),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Join Room',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Enter a room code from a friend',
                      style: TextStyle(fontSize: 13, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _roomCodeController,
                  textCapitalization: TextCapitalization.characters,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 4,
                  ),
                  maxLength: 6,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
                    UpperCaseTextFormatter(),
                  ],
                  decoration: InputDecoration(
                    hintText: 'CODE',
                    hintStyle: TextStyle(
                      color: Colors.grey.shade600,
                      letterSpacing: 4,
                    ),
                    counterText: '',
                    filled: true,
                    fillColor: Colors.black26,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade700),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: Colors.grey.shade700),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF9C27B0)),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              ElevatedButton(
                onPressed: () {
                  final code = _roomCodeController.text.trim();
                  if (code.length == 6) {
                    _multiplayer.joinRoom(
                        code, widget.selectedHero.name.toLowerCase());
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF9C27B0),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Join',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildWaitingUI() {
    final state = _multiplayer.state;
    final isRoom = state == MultiplayerState.waitingInRoom ||
        state == MultiplayerState.creatingRoom;
    final isMatchFound = state == MultiplayerState.matchFound;

    String title;
    String subtitle;

    if (isMatchFound) {
      title = 'Match Found!';
      subtitle = 'Starting game...';
    } else if (isRoom) {
      title = 'Waiting for Friend';
      subtitle = 'Share this code with a friend';
    } else {
      title = 'Finding Match';
      subtitle = 'Looking for an opponent...';
    }

    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Animated indicator
          if (!isMatchFound)
            const SizedBox(
              width: 60,
              height: 60,
              child: CircularProgressIndicator(
                color: Colors.amber,
                strokeWidth: 3,
              ),
            )
          else
            const Icon(Icons.check_circle, color: Colors.green, size: 60),
          const SizedBox(height: 24),

          Text(
            title,
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 16,
              color: Colors.grey.shade400,
            ),
          ),

          // Room code display
          if (isRoom && _multiplayer.roomCode != null) ...[
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
              decoration: BoxDecoration(
                color: const Color(0xFF2A2A2A),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.amber, width: 2),
              ),
              child: Column(
                children: [
                  Text(
                    'Room Code',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey.shade400,
                    ),
                  ),
                  const SizedBox(height: 8),
                  SelectableText(
                    _multiplayer.roomCode!,
                    style: const TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.bold,
                      color: Colors.amber,
                      letterSpacing: 8,
                    ),
                  ),
                  const SizedBox(height: 12),
                  GestureDetector(
                    onTap: () {
                      Clipboard.setData(
                          ClipboardData(text: _multiplayer.roomCode!));
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Room code copied!'),
                          duration: Duration(seconds: 2),
                        ),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.copy, color: Colors.amber, size: 16),
                          SizedBox(width: 8),
                          Text(
                            'Copy Code',
                            style: TextStyle(
                                color: Colors.amber,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],

          const SizedBox(height: 32),

          // Cancel button
          if (!isMatchFound)
            TextButton.icon(
              onPressed: () {
                _multiplayer.cancelMatchmaking();
              },
              icon: const Icon(Icons.close, color: Colors.redAccent, size: 18),
              label: const Text(
                'Cancel',
                style: TextStyle(color: Colors.redAccent, fontSize: 16),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildErrorUI() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, color: Colors.redAccent, size: 60),
          const SizedBox(height: 16),
          const Text(
            'Connection Error',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _multiplayer.errorMessage ?? 'An unknown error occurred',
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey.shade400,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ElevatedButton.icon(
                onPressed: () {
                  _multiplayer.reset();
                  _initConnection();
                },
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.amber,
                  foregroundColor: Colors.black,
                ),
              ),
              const SizedBox(width: 16),
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text(
                  'Back',
                  style: TextStyle(color: Colors.white70),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// TextInputFormatter that converts to uppercase
class UpperCaseTextFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
    );
  }
}
