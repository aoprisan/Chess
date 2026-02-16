import 'package:flutter/material.dart' hide Hero;
import '../models/hero.dart';
import '../models/combat_state.dart';
import '../services/combat_service.dart';
import '../services/websocket_service.dart';
import '../services/multiplayer_service.dart';
import '../widgets/perk_card.dart';
import '../widgets/perk_selection_panel.dart';
import '../widgets/lane_selector.dart';
import '../widgets/lane_effect_indicator.dart';

/// Online multiplayer combat screen. Receives game state from the server
/// and sends perk selections via WebSocket.
class OnlineCombatScreen extends StatefulWidget {
  final Hero myHero;
  final String mySide; // "player1" or "player2"
  final String gameId;
  final WebSocketService ws;
  final MultiplayerService multiplayer;

  const OnlineCombatScreen({
    super.key,
    required this.myHero,
    required this.mySide,
    required this.gameId,
    required this.ws,
    required this.multiplayer,
  });

  @override
  State<OnlineCombatScreen> createState() => _OnlineCombatScreenState();
}

class _OnlineCombatScreenState extends State<OnlineCombatScreen> {
  CombatGameState? _gameState;
  List<PerkSlot> _currentPerkSlots = [];
  bool _gameOver = false;
  String? _winnerSide;

  // Perk selection state
  int? _selectedPerkId;
  bool _isSelectingLane = false;
  int? _firstSelectedLane;

  // Piece placement animation tracking
  int? _lastPlacedLane;
  PlayerSide? _lastPlacedPlayer;
  int _placementCounter = 0;

  bool get _isPlayer1 => widget.mySide == 'player1';
  PlayerSide get _myPlayerSide =>
      _isPlayer1 ? PlayerSide.player1 : PlayerSide.player2;

  bool get _isMyTurn {
    if (_gameState == null) return false;
    return _gameState!.currentPlayer == _myPlayerSide;
  }

  Hero get _opponentHero {
    // Use placeholder hero for opponent - we know the name from server state
    return Hero.allHeroes.firstWhere(
      (h) => h != widget.myHero,
      orElse: () => Hero.allHeroes.first,
    );
  }

  Hero get _player1Hero => _isPlayer1 ? widget.myHero : _opponentHero;
  Hero get _player2Hero => _isPlayer1 ? _opponentHero : widget.myHero;

  @override
  void initState() {
    super.initState();
    _setupListeners();
  }

  void _setupListeners() {
    widget.multiplayer.onGameStateUpdate = _onGameStateUpdate;
    widget.multiplayer.onAutoPlacement = _onAutoPlacement;
    widget.multiplayer.onPerkResult = _onPerkResult;
    widget.multiplayer.onLaneWon = _onLaneWon;
    widget.multiplayer.onGameWon = _onGameWon;
    widget.multiplayer.addListener(_onMultiplayerChanged);

    // If we already have state from the multiplayer service, use it
    if (widget.multiplayer.lastGameState != null) {
      _onGameStateUpdate(widget.multiplayer.lastGameState!);
    }
  }

  void _onMultiplayerChanged() {
    if (!mounted) return;
    if (widget.multiplayer.state == MultiplayerState.opponentDisconnected) {
      setState(() {});
    }
  }

  void _onGameStateUpdate(Map<String, dynamic> payload) {
    if (!mounted) return;
    final gameData = payload['game'] as Map<String, dynamic>?;
    if (gameData == null) return;

    setState(() {
      _gameState = _parseGameState(gameData);
      _currentPerkSlots = _parsePerkSlots(gameData);
    });
  }

  void _onAutoPlacement(Map<String, dynamic> payload) {
    if (!mounted) return;
    final laneIndex = (payload['laneIndex'] as num?)?.toInt();
    final playerStr = payload['player'] as String?;
    if (laneIndex != null && laneIndex >= 0) {
      setState(() {
        _lastPlacedLane = laneIndex;
        _lastPlacedPlayer =
            playerStr == 'player1' ? PlayerSide.player1 : PlayerSide.player2;
        _placementCounter++;
      });
    }
  }

  void _onPerkResult(Map<String, dynamic> payload) {
    // Perk result is informational - game state update follows
  }

  void _onLaneWon(int laneIndex, String winner) {
    // Lane won - game state update follows
  }

  void _onGameWon(String winner) {
    if (!mounted) return;
    setState(() {
      _gameOver = true;
      _winnerSide = winner;
    });
  }

  CombatGameState _parseGameState(Map<String, dynamic> data) {
    // Parse lanes
    final lanesData = data['lanes'] as List<dynamic>? ?? [];
    final lanes = <Lane>[];
    for (int i = 0; i < 5; i++) {
      if (i < lanesData.length && lanesData[i] != null) {
        final laneData = lanesData[i] as Map<String, dynamic>;
        lanes.add(_parseLane(laneData));
      } else {
        lanes.add(Lane.empty());
      }
    }

    // Parse current player
    final currentPlayerVal = data['currentPlayer'];
    PlayerSide currentPlayer;
    if (currentPlayerVal is int) {
      currentPlayer =
          currentPlayerVal == 1 ? PlayerSide.player1 : PlayerSide.player2;
    } else {
      currentPlayer = PlayerSide.player1;
    }

    // Parse phase
    final phaseStr = data['currentPhase'] as String? ?? 'perkSelection';
    TurnPhase phase;
    switch (phaseStr) {
      case 'autoPlacement':
        phase = TurnPhase.autoPlacement;
        break;
      case 'perkSelection':
        phase = TurnPhase.perkSelection;
        break;
      default:
        phase = TurnPhase.deferredResolution;
    }

    // Parse winner
    final winnerVal = data['winner'];
    PlayerSide? gameWinner;
    if (winnerVal is int && winnerVal > 0) {
      gameWinner =
          winnerVal == 1 ? PlayerSide.player1 : PlayerSide.player2;
    }

    final statusStr = data['status'] as String? ?? 'playing';
    CombatStatus status;
    switch (statusStr) {
      case 'finished':
        status = CombatStatus.finished;
        break;
      case 'setup':
        status = CombatStatus.setup;
        break;
      default:
        status = CombatStatus.playing;
    }

    // Parse frozen lanes
    final frozenLanes = <int, PlayerSide>{};
    for (int i = 0; i < lanes.length; i++) {
      final laneData = i < lanesData.length ? lanesData[i] as Map<String, dynamic>? : null;
      if (laneData != null) {
        final freezePlayer = laneData['freezePlayer'];
        final freezeTurns = laneData['freezeTurns'];
        if (freezePlayer is int && freezePlayer > 0 && freezeTurns is int && freezeTurns > 0) {
          frozenLanes[i] = freezePlayer == 1 ? PlayerSide.player1 : PlayerSide.player2;
        }
      }
    }

    // Parse sanctuaries
    final p1Sanctuaries = _parseSanctuaries(data['player1Sanctuaries']);
    final p2Sanctuaries = _parseSanctuaries(data['player2Sanctuaries']);

    // Parse captures
    final p1Captures = _parseCaptures(data['player1Captures']);
    final p2Captures = _parseCaptures(data['player2Captures']);

    // Parse pending raids
    final pendingRaids = _parsePendingRaids(data['pendingRaids']);

    // Count pieces on board for display
    int p1Pieces = 0;
    int p2Pieces = 0;
    for (final lane in lanes) {
      p1Pieces += lane.countPieces(PlayerSide.player1);
      p2Pieces += lane.countPieces(PlayerSide.player2);
    }

    return CombatGameState(
      gameId: data['id'] as String? ?? widget.gameId,
      lanes: lanes,
      currentPlayer: currentPlayer,
      currentPhase: phase,
      player1Pieces: p1Pieces,
      player2Pieces: p2Pieces,
      player1LanesWon: (data['player1LanesWon'] as num?)?.toInt() ?? 0,
      player2LanesWon: (data['player2LanesWon'] as num?)?.toInt() ?? 0,
      status: status,
      gameWinner: gameWinner,
      player1Hero: _player1Hero,
      player2Hero: _player2Hero,
      lastAutoPlacedLane: (data['lastAutoPlacedLane'] as num?)?.toInt(),
      frozenLanes: frozenLanes,
      player1Sanctuaries: p1Sanctuaries,
      player2Sanctuaries: p2Sanctuaries,
      player1Captures: p1Captures,
      player2Captures: p2Captures,
      pendingRaids: pendingRaids,
      player1Cloaked: (data['player1Cloaked'] as num?)?.toInt() ?? 0,
      player2Cloaked: (data['player2Cloaked'] as num?)?.toInt() ?? 0,
      player1Blinded: (data['player1Blinded'] as num?)?.toInt() ?? 0,
      player2Blinded: (data['player2Blinded'] as num?)?.toInt() ?? 0,
    );
  }

  Lane _parseLane(Map<String, dynamic> data) {
    // Parse player1Slots (array of bools)
    final p1Slots = data['player1Slots'] as List<dynamic>? ?? [];
    final p1Columns = List.generate(
        5, (i) => i < p1Slots.length ? (p1Slots[i] as bool? ?? false) : false);

    final p2Slots = data['player2Slots'] as List<dynamic>? ?? [];
    final p2Columns = List.generate(
        5, (i) => i < p2Slots.length ? (p2Slots[i] as bool? ?? false) : false);

    // Parse winner
    final winnerVal = data['winner'];
    PlayerSide? winner;
    if (winnerVal is int && winnerVal > 0) {
      winner = winnerVal == 1 ? PlayerSide.player1 : PlayerSide.player2;
    }

    // Parse triggers
    final triggersData = data['triggers'] as List<dynamic>? ?? [];
    final triggers =
        triggersData.map((t) => TriggerData.fromJson(t as Map<String, dynamic>)).toList();

    // Parse deferred
    final deferredData = data['deferred'] as List<dynamic>? ?? [];
    final deferred =
        deferredData.map((d) => DeferredData.fromJson(d as Map<String, dynamic>)).toList();

    return Lane(
      player1Columns: p1Columns,
      player2Columns: p2Columns,
      winner: winner,
      triggers: triggers,
      deferred: deferred,
    );
  }

  List<SanctuaryData> _parseSanctuaries(dynamic data) {
    if (data == null || data is! List) return [];
    return data
        .map((s) => SanctuaryData.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  List<CaptureData> _parseCaptures(dynamic data) {
    if (data == null || data is! List) return [];
    return data
        .map((c) => CaptureData.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  List<PendingRaidData> _parsePendingRaids(dynamic data) {
    if (data == null || data is! List) return [];
    return data
        .map((r) => PendingRaidData.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  List<PerkSlot> _parsePerkSlots(Map<String, dynamic> data) {
    final slotsData = data['currentPerkSlots'] as List<dynamic>? ?? [];
    return slotsData
        .map((s) => PerkSlot.fromJson(s as Map<String, dynamic>))
        .toList();
  }

  void _cancelLaneSelection() {
    setState(() {
      _isSelectingLane = false;
      _selectedPerkId = null;
      _firstSelectedLane = null;
    });
  }

  List<int> _getValidLanes() {
    if (_selectedPerkId == null || _gameState == null) return [];
    return LaneValidator.getValidLanesForPerk(
      _selectedPerkId!,
      _gameState!,
      _gameState!.currentPlayer,
      firstSelectedLane: _firstSelectedLane,
    );
  }

  void _onLaneSelected(int laneIndex) {
    if (_selectedPerkId == null) return;

    // Dual-lane perks: Regroup (33) and Disrupt (34)
    if (_selectedPerkId == 33 || _selectedPerkId == 34) {
      if (_firstSelectedLane == null) {
        setState(() => _firstSelectedLane = laneIndex);
        return;
      }
    }

    // Send perk selection to server
    widget.multiplayer.selectPerk(
      _selectedPerkId!,
      targetLane: laneIndex,
    );

    setState(() {
      _isSelectingLane = false;
      _selectedPerkId = null;
      _firstSelectedLane = null;
    });
  }

  void _onPerkSelected(int perkId) {
    if (LaneValidator.perkRequiresTarget(perkId)) {
      setState(() {
        _selectedPerkId = perkId;
        _isSelectingLane = true;
      });
    } else {
      // Non-targeted perk - send directly
      widget.multiplayer.selectPerk(perkId, targetLane: -1);
    }
  }

  void _onPass() {
    widget.multiplayer.passPerk();
  }

  bool _shouldShowPerkOverlay() {
    if (_gameState == null || _gameState!.status == CombatStatus.finished) {
      return false;
    }
    if (_isSelectingLane) return false;
    if (_gameState!.currentPhase == TurnPhase.perkSelection && _isMyTurn) {
      return true;
    }
    return false;
  }

  @override
  void dispose() {
    widget.multiplayer.onGameStateUpdate = null;
    widget.multiplayer.onAutoPlacement = null;
    widget.multiplayer.onPerkResult = null;
    widget.multiplayer.onLaneWon = null;
    widget.multiplayer.onGameWon = null;
    widget.multiplayer.removeListener(_onMultiplayerChanged);
    widget.multiplayer.dispose();
    widget.ws.dispose();
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
            child: _gameState != null
                ? _buildContent()
                : const Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(color: Colors.amber),
                        SizedBox(height: 16),
                        Text(
                          'Waiting for game state...',
                          style: TextStyle(color: Colors.white70, fontSize: 16),
                        ),
                      ],
                    ),
                  ),
          ),
          // Perk targeting info bar
          if (_isSelectingLane && _selectedPerkId != null)
            _buildPerkTargetingBar(),
          // Opponent disconnected overlay
          if (widget.multiplayer.state ==
              MultiplayerState.opponentDisconnected)
            _buildDisconnectedOverlay(),
        ],
      ),
    );
  }

  Widget _buildContent() {
    final gameState = _gameState!;

    return LayoutBuilder(
      builder: (context, constraints) {
        final screenWidth = constraints.maxWidth;
        final screenHeight = constraints.maxHeight;

        return Column(
          children: [
            SizedBox(height: screenHeight * 0.005),
            // Turn indicator
            _buildTurnIndicator(screenWidth),
            SizedBox(height: screenHeight * 0.005),
            // Player headers
            _buildPlayerHeaders(screenWidth, screenHeight),
            SizedBox(height: screenHeight * 0.005),
            // Game board
            Expanded(
              child: _buildGameBoard(gameState, screenWidth, screenHeight),
            ),
            SizedBox(height: screenHeight * 0.005),
            // Perk selection area
            if (_shouldShowPerkOverlay())
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: CompactPerkBar(
                  perkSlots: _currentPerkSlots,
                  isMyTurn: _isMyTurn,
                  onPerkSelected: _onPerkSelected,
                  onPass: _onPass,
                ),
              ),
            // Waiting for opponent indicator
            if (gameState.currentPhase == TurnPhase.perkSelection &&
                !_isMyTurn &&
                gameState.status != CombatStatus.finished)
              _buildWaitingIndicator(screenWidth),
            // Auto-placement indicator
            if (gameState.currentPhase == TurnPhase.autoPlacement &&
                gameState.status != CombatStatus.finished)
              _buildAutoPlacingIndicator(screenWidth),
            // Game over
            if (gameState.status == CombatStatus.finished || _gameOver)
              _buildGameOverUI(screenWidth),
            SizedBox(height: screenHeight * 0.01),
          ],
        );
      },
    );
  }

  Widget _buildTurnIndicator(double screenWidth) {
    final isP1Turn = _gameState!.currentPlayer == PlayerSide.player1;
    final hero = isP1Turn ? _player1Hero : _player2Hero;
    final label = _isMyTurn ? 'Your Turn' : "${hero.name}'s Turn";
    final fontSize = (screenWidth * 0.018).clamp(14.0, 20.0);

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: (screenWidth * 0.025).clamp(16.0, 28.0),
        vertical: (screenWidth * 0.01).clamp(6.0, 12.0),
      ),
      decoration: BoxDecoration(
        color: _isMyTurn ? Colors.amber.shade100 : Colors.white,
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
        label,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.bold,
          color: _isMyTurn ? Colors.amber.shade900 : const Color(0xFF333333),
        ),
      ),
    );
  }

  Widget _buildPlayerHeaders(double screenWidth, double screenHeight) {
    final horizontalPadding = (screenWidth * 0.02).clamp(8.0, 20.0);
    final avatarWidth = (screenWidth * 0.10).clamp(50.0, 140.0);
    final avatarHeight = (screenHeight * 0.10).clamp(60.0, 160.0);
    final fontSize = (screenWidth * 0.018).clamp(13.0, 20.0);
    final isP1Turn =
        _gameState!.currentPlayer == PlayerSide.player1;

    return Padding(
      padding: EdgeInsets.symmetric(horizontal: horizontalPadding),
      child: Row(
        children: [
          // Player 1
          Expanded(
            child: _buildPlayerPanel(
              hero: _player1Hero,
              score: _gameState!.player1Pieces,
              isPlayer1: true,
              isCurrentTurn: isP1Turn,
              isMe: _isPlayer1,
              avatarWidth: avatarWidth,
              avatarHeight: avatarHeight,
              fontSize: fontSize,
              screenWidth: screenWidth,
            ),
          ),
          // Flag in the middle
          SizedBox(
            width: (screenWidth * 0.08).clamp(50.0, 90.0),
            height: avatarHeight,
            child: Center(
              child: Container(
                width: 4,
                height: avatarHeight * 0.6,
                decoration: BoxDecoration(
                  color: const Color(0xFFE57373),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
          // Player 2
          Expanded(
            child: _buildPlayerPanel(
              hero: _player2Hero,
              score: _gameState!.player2Pieces,
              isPlayer1: false,
              isCurrentTurn: !isP1Turn,
              isMe: !_isPlayer1,
              avatarWidth: avatarWidth,
              avatarHeight: avatarHeight,
              fontSize: fontSize,
              screenWidth: screenWidth,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPlayerPanel({
    required Hero hero,
    required int score,
    required bool isPlayer1,
    required bool isCurrentTurn,
    required bool isMe,
    required double avatarWidth,
    required double avatarHeight,
    required double fontSize,
    required double screenWidth,
  }) {
    final titleBg = isPlayer1
        ? 'assets/images/ui/combat/player-1-title-bg.png'
        : 'assets/images/ui/combat/player-2-title-bg.png';
    final scoreBg = isPlayer1
        ? 'assets/images/ui/combat/player-1-title-score-bg.png'
        : 'assets/images/ui/combat/player-2-title-score-bg.png';
    final barWidth = (screenWidth * 0.14).clamp(90.0, 160.0);
    final barHeight = (screenWidth * 0.05).clamp(34.0, 52.0);
    final badgeWidth = (screenWidth * 0.065).clamp(45.0, 75.0);

    final avatar = SizedBox(
      width: avatarWidth,
      height: avatarHeight,
      child: Stack(
        children: [
          Image.asset(
            hero.imagePath,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => Container(
              decoration: BoxDecoration(
                color: isPlayer1 ? Colors.green.shade100 : Colors.purple.shade100,
                shape: BoxShape.circle,
              ),
              child: Center(
                child: Text(hero.name[0],
                    style: TextStyle(
                        fontSize: avatarWidth * 0.4,
                        fontWeight: FontWeight.bold)),
              ),
            ),
          ),
          if (isMe)
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.amber,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    'YOU',
                    style: TextStyle(
                      fontSize: fontSize * 0.7,
                      fontWeight: FontWeight.bold,
                      color: Colors.black,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );

    final titleBar = Container(
      width: barWidth,
      height: barHeight,
      decoration: BoxDecoration(
        image: DecorationImage(image: AssetImage(titleBg), fit: BoxFit.fill),
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
                color: Colors.white),
          ),
        ),
      ),
    );

    final scoreBadge = Container(
      width: badgeWidth,
      height: barHeight,
      decoration: BoxDecoration(
        image: DecorationImage(image: AssetImage(scoreBg), fit: BoxFit.fill),
      ),
      child: Center(
        child: Text(
          '$score',
          style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.bold,
              color: const Color(0xFF333333)),
        ),
      ),
    );

    return Row(
      mainAxisAlignment:
          isPlayer1 ? MainAxisAlignment.start : MainAxisAlignment.end,
      children: isPlayer1
          ? [avatar, const SizedBox(width: 4), titleBar, scoreBadge]
          : [scoreBadge, titleBar, const SizedBox(width: 4), avatar],
    );
  }

  Widget _buildGameBoard(
      CombatGameState gameState, double screenWidth, double screenHeight) {
    final borderRadius = (screenWidth * 0.015).clamp(10.0, 20.0);
    final padding = (screenWidth * 0.008).clamp(4.0, 10.0);

    return Padding(
      padding: EdgeInsets.symmetric(
          horizontal: (screenWidth * 0.015).clamp(8.0, 16.0)),
      child: Container(
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
            CustomPaint(size: Size.infinite, painter: _GridPainter()),
            // Center line
            Positioned.fill(
              child: Center(
                child: Container(
                  width: (screenWidth * 0.004).clamp(3.0, 5.0),
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
                  final pieceSize = (screenWidth * 0.045).clamp(34.0, 55.0);

                  return Stack(
                    children: _buildPieces(
                        gameState, cellWidth, cellHeight, pieceSize),
                  );
                },
              ),
            ),
            // Lane win indicators
            ..._buildLaneWinIndicators(gameState),
            // Frozen lane indicators
            ..._buildFrozenLaneIndicators(gameState),
            // Lane effect indicators
            ..._buildLaneEffectIndicators(gameState),
            // Lane selection highlights
            if (_isSelectingLane) ..._buildLaneSelectionHighlights(gameState),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildPieces(CombatGameState gameState, double cellWidth,
      double cellHeight, double pieceSize) {
    final pieces = <Widget>[];

    int? animateCol;
    if (_lastPlacedLane != null && _lastPlacedPlayer != null) {
      final lane = gameState.lanes[_lastPlacedLane!];
      final cols = _lastPlacedPlayer == PlayerSide.player1
          ? lane.player1Columns
          : lane.player2Columns;
      for (int c = cols.length - 1; c >= 0; c--) {
        if (cols[c]) {
          animateCol = c;
          break;
        }
      }
    }

    for (int laneIndex = 0; laneIndex < 5; laneIndex++) {
      final lane = gameState.lanes[laneIndex];

      // Player 1 pieces
      final hideP1 = gameState.isCloaked(PlayerSide.player1) &&
          _myPlayerSide != PlayerSide.player1;
      if (!hideP1) {
        for (int col = 0; col < 5; col++) {
          if (lane.player1Columns[col]) {
            final isNewPiece = laneIndex == _lastPlacedLane &&
                _lastPlacedPlayer == PlayerSide.player1 &&
                col == animateCol;
            pieces.add(_buildPiece(
              laneIndex: laneIndex,
              columnIndex: col,
              isPlayer1: true,
              cellWidth: cellWidth,
              cellHeight: cellHeight,
              hero: _player1Hero,
              pieceSize: pieceSize,
              animate: isNewPiece,
            ));
          }
        }
      }

      // Player 2 pieces
      final hideP2 = gameState.isCloaked(PlayerSide.player2) &&
          _myPlayerSide != PlayerSide.player2;
      if (!hideP2) {
        for (int col = 0; col < 5; col++) {
          if (lane.player2Columns[col]) {
            final isNewPiece = laneIndex == _lastPlacedLane &&
                _lastPlacedPlayer == PlayerSide.player2 &&
                col == animateCol;
            pieces.add(_buildPiece(
              laneIndex: laneIndex,
              columnIndex: col,
              isPlayer1: false,
              cellWidth: cellWidth,
              cellHeight: cellHeight,
              hero: _player2Hero,
              pieceSize: pieceSize,
              animate: isNewPiece,
            ));
          }
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
    bool animate = false,
  }) {
    final gridColumn = isPlayer1 ? columnIndex : (9 - columnIndex);
    final targetX = gridColumn * cellWidth + (cellWidth - pieceSize) / 2;
    final y = laneIndex * cellHeight + (cellHeight - pieceSize) / 2;

    final bgAsset = isPlayer1
        ? 'assets/images/ui/combat/player-1-item-bg.png'
        : 'assets/images/ui/combat/player-2-item-bg.png';

    final pieceWidget = Container(
      width: pieceSize,
      height: pieceSize,
      decoration: BoxDecoration(
        image: DecorationImage(image: AssetImage(bgAsset), fit: BoxFit.contain),
      ),
      child: Padding(
        padding: EdgeInsets.all(pieceSize * 0.1),
        child: ClipOval(
          child: Image.asset(
            hero.imagePath,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              color: isPlayer1 ? Colors.green.shade200 : Colors.purple.shade200,
              child: Center(
                child: Text(hero.name[0],
                    style: TextStyle(
                        fontSize: pieceSize * 0.35,
                        fontWeight: FontWeight.bold)),
              ),
            ),
          ),
        ),
      ),
    );

    if (!animate) {
      return Positioned(left: targetX, top: y, child: pieceWidget);
    }

    final startX = isPlayer1 ? -pieceSize : cellWidth * 10;
    return Positioned(
      top: y,
      left: 0,
      right: 0,
      height: pieceSize,
      child: TweenAnimationBuilder<double>(
        key: ValueKey('place_$_placementCounter'),
        tween: Tween(begin: startX, end: targetX),
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
        builder: (context, x, child) {
          return Stack(
            clipBehavior: Clip.none,
            children: [Positioned(left: x, child: child!)],
          );
        },
        child: pieceWidget,
      ),
    );
  }

  List<Widget> _buildLaneWinIndicators(CombatGameState gameState) {
    final indicators = <Widget>[];
    for (int i = 0; i < 5; i++) {
      final lane = gameState.lanes[i];
      if (lane.winner != null) {
        indicators.add(Positioned.fill(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final laneHeight = constraints.maxHeight / 5;
              return Stack(children: [
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
              ]);
            },
          ),
        ));
      }
    }
    return indicators;
  }

  List<Widget> _buildFrozenLaneIndicators(CombatGameState gameState) {
    final indicators = <Widget>[];
    if (gameState.frozenLanes.isEmpty) return indicators;

    for (final entry in gameState.frozenLanes.entries) {
      final laneIndex = entry.key;
      final frozenBy = entry.value;
      final lane = gameState.lanes[laneIndex];
      if (lane.winner != null) continue;

      indicators.add(Positioned.fill(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final laneHeight = constraints.maxHeight / 5;
            final halfWidth = constraints.maxWidth / 2;
            final isRightSideFrozen = frozenBy == PlayerSide.player1;

            return Stack(children: [
              Positioned(
                top: laneIndex * laneHeight,
                left: isRightSideFrozen ? halfWidth : 0,
                width: halfWidth,
                height: laneHeight,
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.25),
                    border: Border.all(color: Colors.blue.shade400, width: 2),
                  ),
                  child: Center(
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.ac_unit,
                            color: Colors.blue.shade300, size: 16),
                        const SizedBox(width: 4),
                        Text('FROZEN',
                            style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                                color: Colors.blue.shade300)),
                      ],
                    ),
                  ),
                ),
              ),
            ]);
          },
        ),
      ));
    }
    return indicators;
  }

  List<Widget> _buildLaneEffectIndicators(CombatGameState gameState) {
    final allEffects = gameState.getActiveLaneEffects();
    if (allEffects.isEmpty) return [];
    final indicators = <Widget>[];

    for (final entry in allEffects.entries) {
      final laneIndex = entry.key;
      final effects = entry.value;
      if (effects.isEmpty) continue;
      if (gameState.lanes[laneIndex].winner != null) continue;

      final leftEffects = <LaneEffect>[];
      final rightEffects = <LaneEffect>[];

      for (final effect in effects) {
        final isOnLeftSide = effect.onOwnerSide
            ? effect.ownerPlayer == 1
            : effect.ownerPlayer == 2;
        if (isOnLeftSide) {
          leftEffects.add(effect);
        } else {
          rightEffects.add(effect);
        }
      }

      if (leftEffects.isNotEmpty || rightEffects.isNotEmpty) {
        indicators.add(Positioned.fill(
          child: LayoutBuilder(
            builder: (context, constraints) {
              final laneHeight = constraints.maxHeight / 5;
              final halfWidth = constraints.maxWidth / 2;
              final top = laneIndex * laneHeight;
              final widgets = <Widget>[];
              if (leftEffects.isNotEmpty) {
                widgets.add(LaneEffectOverlay(
                    effects: leftEffects,
                    laneHeight: laneHeight,
                    halfWidth: halfWidth,
                    laneIndex: laneIndex,
                    top: top,
                    isLeftSide: true));
              }
              if (rightEffects.isNotEmpty) {
                widgets.add(LaneEffectOverlay(
                    effects: rightEffects,
                    laneHeight: laneHeight,
                    halfWidth: halfWidth,
                    laneIndex: laneIndex,
                    top: top,
                    isLeftSide: false));
              }
              return Stack(children: widgets);
            },
          ),
        ));
      }
    }
    return indicators;
  }

  List<Widget> _buildLaneSelectionHighlights(CombatGameState gameState) {
    final validLanes = _getValidLanes();

    return [
      Positioned.fill(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final laneHeight = constraints.maxHeight / 5;

            return Stack(
              children: List.generate(5, (i) {
                final lane = gameState.lanes[i];
                if (lane.winner != null) return const SizedBox.shrink();

                final isValid = validLanes.contains(i);
                if (!isValid) {
                  return Positioned(
                    top: i * laneHeight,
                    left: 0,
                    right: 0,
                    height: laneHeight,
                    child: Container(
                        color: Colors.grey.withValues(alpha: 0.15)),
                  );
                }

                return Positioned(
                  top: i * laneHeight,
                  left: 0,
                  right: 0,
                  height: laneHeight,
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _onLaneSelected(i),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.amber.withValues(alpha: 0.3),
                        border: Border.all(
                            color: Colors.amber.shade400, width: 3),
                      ),
                      child: Center(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade700
                                .withValues(alpha: 0.9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Text('Lane ${i + 1}',
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white)),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            );
          },
        ),
      ),
    ];
  }

  Widget _buildPerkTargetingBar() {
    final perkInfo = PerkDefinitions.getPerk(_selectedPerkId!);
    final screenWidth = MediaQuery.of(context).size.width;
    final fontSize = (screenWidth * 0.016).clamp(12.0, 18.0);

    return Positioned(
      top: MediaQuery.of(context).padding.top + 8,
      left: 16,
      right: 16,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.grey.shade900.withValues(alpha: 0.95),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: perkInfo?.categoryColor ?? Colors.amber, width: 2),
        ),
        child: Row(
          children: [
            Expanded(
              child: Text(
                'Select a lane for ${perkInfo?.name ?? "perk"}',
                style: TextStyle(
                    fontSize: fontSize,
                    color: Colors.amber.shade400,
                    fontWeight: FontWeight.w500),
              ),
            ),
            GestureDetector(
              onTap: _cancelLaneSelection,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.grey.shade700,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Text('Cancel',
                    style: TextStyle(color: Colors.white, fontSize: 13)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildWaitingIndicator(double screenWidth) {
    final fontSize = (screenWidth * 0.016).clamp(12.0, 20.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: Colors.grey.shade400),
          ),
          const SizedBox(width: 8),
          Text(
            'Waiting for opponent...',
            style: TextStyle(
                fontSize: fontSize,
                color: Colors.grey.shade400,
                fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildAutoPlacingIndicator(double screenWidth) {
    final fontSize = (screenWidth * 0.016).clamp(12.0, 20.0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(
                strokeWidth: 2, color: Colors.amber.shade400),
          ),
          const SizedBox(width: 8),
          Text(
            'Placing piece...',
            style: TextStyle(
                fontSize: fontSize,
                fontWeight: FontWeight.bold,
                color: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildGameOverUI(double screenWidth) {
    final gameState = _gameState;
    final winner = _winnerSide ?? (gameState?.gameWinner?.name);
    final iWon = winner == widget.mySide;
    final fontSize = (screenWidth * 0.022).clamp(16.0, 28.0);

    return Column(
      children: [
        Container(
          padding: EdgeInsets.symmetric(
            horizontal: screenWidth * 0.03,
            vertical: screenWidth * 0.012,
          ),
          decoration: BoxDecoration(
            color: iWon ? Colors.green.shade100 : Colors.red.shade100,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Text(
            iWon ? 'You Win!' : 'You Lose!',
            style: TextStyle(
              fontSize: fontSize,
              fontWeight: FontWeight.bold,
              color: iWon ? Colors.green.shade700 : Colors.red.shade700,
            ),
          ),
        ),
        const SizedBox(height: 12),
        GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
            decoration: BoxDecoration(
              image: const DecorationImage(
                image:
                    AssetImage('assets/images/ui/combat/red-btn-bg.png'),
                fit: BoxFit.fill,
              ),
              borderRadius: BorderRadius.circular(25),
            ),
            child: Text(
              'Back to Menu',
              style: TextStyle(
                fontSize: (screenWidth * 0.016).clamp(12.0, 20.0),
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDisconnectedOverlay() {
    return Container(
      color: Colors.black.withValues(alpha: 0.7),
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(32),
          margin: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: const Color(0xFF2A2A2A),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.redAccent, width: 2),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off, color: Colors.redAccent, size: 48),
              const SizedBox(height: 16),
              const Text(
                'Opponent Disconnected',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Your opponent has left the game.',
                style: TextStyle(
                    fontSize: 14, color: Colors.grey.shade400),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                ),
                child: const Text('Back to Menu',
                    style: TextStyle(color: Colors.white)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Grid painter for the game board
class _GridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFFE0E0E0)
      ..strokeWidth = 1;

    final cellWidth = size.width / 10;
    for (int i = 1; i < 10; i++) {
      final x = i * cellWidth;
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
    }

    final cellHeight = size.height / 5;
    for (int i = 1; i < 5; i++) {
      final y = i * cellHeight;
      canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
