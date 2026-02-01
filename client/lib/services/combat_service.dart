import 'dart:async';
import 'dart:math';
import 'package:flutter/foundation.dart';
import '../models/combat_state.dart';
import '../models/hero.dart';
import 'websocket_service.dart';

/// Perk slot offered during perk selection phase
class PerkSlot {
  final int slotIndex;
  final int perkId;
  final String perkName;

  PerkSlot({
    required this.slotIndex,
    required this.perkId,
    required this.perkName,
  });

  factory PerkSlot.fromJson(Map<String, dynamic> json) {
    return PerkSlot(
      slotIndex: json['slotIndex'] as int,
      perkId: json['perkId'] as int,
      perkName: json['perkName'] as String,
    );
  }
}

/// Service for managing combat game state
class CombatService extends ChangeNotifier {
  CombatGameState? _gameState;
  final Random _random = Random();

  // V2: Server-driven state
  WebSocketService? _wsService;
  StreamSubscription<WSMessage>? _wsSubscription;
  String? _gameId;
  PlayerSide? _mySide;
  List<PerkSlot> _currentPerkSlots = [];
  int? _lastAutoPlacedLane;
  String? _lastError;
  bool _isServerDriven = false;

  // Getters
  CombatGameState? get gameState => _gameState;
  bool get isGameOver => _gameState?.isGameOver ?? false;
  String? get gameId => _gameId;
  PlayerSide? get mySide => _mySide;
  List<PerkSlot> get currentPerkSlots => _currentPerkSlots;
  int? get lastAutoPlacedLane => _lastAutoPlacedLane;
  String? get lastError => _lastError;
  bool get isServerDriven => _isServerDriven;
  bool get isMyTurn => _gameState?.currentPlayer == _mySide;

  /// Initialize a new combat game
  void initGame(String gameId, {Hero? player1Hero, Hero? player2Hero}) {
    _gameState = CombatGameState.initial(
      gameId,
      player1Hero: player1Hero,
      player2Hero: player2Hero,
    );
    notifyListeners();
  }

  /// Execute auto-placement for current player
  /// Returns the lane index where piece was placed, or -1 if no placement possible
  int autoPlace() {
    if (_gameState == null) return -1;
    if (_gameState!.status != CombatStatus.playing) return -1;

    final currentPlayer = _gameState!.currentPlayer;
    final remainingPieces = _gameState!.getRemainingPieces(currentPlayer);

    if (remainingPieces <= 0) {
      // No pieces left to place
      return -1;
    }

    // Find lanes that are not yet won and have space
    final availableLanes = <int>[];
    for (int i = 0; i < 5; i++) {
      final lane = _gameState!.lanes[i];
      if (lane.winner == null && lane.getNextEmptyColumn(currentPlayer) != -1) {
        availableLanes.add(i);
      }
    }

    if (availableLanes.isEmpty) {
      // No available lanes
      return -1;
    }

    // Pick a random lane
    final laneIndex = availableLanes[_random.nextInt(availableLanes.length)];

    // Place the piece
    _placePiece(laneIndex, currentPlayer);

    return laneIndex;
  }

  /// Place a piece in the specified lane for the specified player
  void _placePiece(int laneIndex, PlayerSide player) {
    if (_gameState == null) return;

    final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
    final lane = lanes[laneIndex];
    final columnIndex = lane.getNextEmptyColumn(player);

    if (columnIndex == -1) return; // Lane is full

    // Update the lane
    if (player == PlayerSide.player1) {
      final newColumns = List<bool>.from(lane.player1Columns);
      newColumns[columnIndex] = true;
      lanes[laneIndex] = lane.copyWith(player1Columns: newColumns);
    } else {
      final newColumns = List<bool>.from(lane.player2Columns);
      newColumns[columnIndex] = true;
      lanes[laneIndex] = lane.copyWith(player2Columns: newColumns);
    }

    // Update piece count
    final newP1Pieces = player == PlayerSide.player1
        ? _gameState!.player1Pieces - 1
        : _gameState!.player1Pieces;
    final newP2Pieces = player == PlayerSide.player2
        ? _gameState!.player2Pieces - 1
        : _gameState!.player2Pieces;

    _gameState = _gameState!.copyWith(
      lanes: lanes,
      player1Pieces: newP1Pieces,
      player2Pieces: newP2Pieces,
      currentPhase: TurnPhase.perkSelection,
      lastAutoPlacedLane: laneIndex,
    );

    // Check for lane win
    _checkLaneWin(laneIndex);

    notifyListeners();
  }

  /// Check if a lane has been won
  void _checkLaneWin(int laneIndex) {
    if (_gameState == null) return;

    final lane = _gameState!.lanes[laneIndex];
    if (lane.winner != null) return; // Already won

    PlayerSide? winner;
    if (lane.isSideFilled(PlayerSide.player1)) {
      winner = PlayerSide.player1;
    } else if (lane.isSideFilled(PlayerSide.player2)) {
      winner = PlayerSide.player2;
    }

    if (winner != null) {
      final lanes = _gameState!.lanes.map((l) => l.copyWith()).toList();
      lanes[laneIndex] = lane.copyWith(winner: winner);

      final newP1LanesWon = winner == PlayerSide.player1
          ? _gameState!.player1LanesWon + 1
          : _gameState!.player1LanesWon;
      final newP2LanesWon = winner == PlayerSide.player2
          ? _gameState!.player2LanesWon + 1
          : _gameState!.player2LanesWon;

      _gameState = _gameState!.copyWith(
        lanes: lanes,
        player1LanesWon: newP1LanesWon,
        player2LanesWon: newP2LanesWon,
      );

      // Check for game win
      _checkGameWin();
    }
  }

  /// Check if the game has been won
  void _checkGameWin() {
    if (_gameState == null) return;

    if (_gameState!.player1LanesWon >= 3) {
      _gameState = _gameState!.copyWith(
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player1,
      );
    } else if (_gameState!.player2LanesWon >= 3) {
      _gameState = _gameState!.copyWith(
        status: CombatStatus.finished,
        gameWinner: PlayerSide.player2,
      );
    }

    notifyListeners();
  }

  /// End the current turn and switch to the other player
  void endTurn() {
    if (_gameState == null) return;
    if (_gameState!.status != CombatStatus.playing) return;

    final nextPlayer = _gameState!.currentPlayer == PlayerSide.player1
        ? PlayerSide.player2
        : PlayerSide.player1;

    _gameState = _gameState!.copyWith(
      currentPlayer: nextPlayer,
      currentPhase: TurnPhase.autoPlacement,
      lastAutoPlacedLane: null,
    );

    notifyListeners();
  }

  /// Skip the perk selection and end turn
  void skipTurn() {
    endTurn();
  }

  /// Execute a full turn (auto-place + skip to next player)
  /// Returns the lane index where piece was placed
  int executeTurn() {
    final laneIndex = autoPlace();
    // Don't auto-end turn - let player decide via UI
    return laneIndex;
  }

  /// Reset the game
  void resetGame() {
    _gameState = null;
    notifyListeners();
  }

  /// Get display name for a player
  String getPlayerName(PlayerSide side) {
    final hero = _gameState?.getHero(side);
    return hero?.name ?? (side == PlayerSide.player1 ? 'Player 1' : 'Player 2');
  }

  /// Get the current player's name
  String get currentPlayerName {
    if (_gameState == null) return '';
    return getPlayerName(_gameState!.currentPlayer);
  }

  // ============================================================================
  // V2 Server-Driven Methods
  // ============================================================================

  /// Initialize a server-driven V2 game
  void initServerDrivenGame(WebSocketService wsService) {
    _wsService = wsService;
    _isServerDriven = true;
    _lastError = null;

    // Listen to WebSocket messages
    _wsSubscription?.cancel();
    _wsSubscription = wsService.messages.listen(_handleServerMessage);
  }

  /// Join a V2 lane game
  void joinLaneGame(String playerId, String heroType, bool vsAI, String? aiDifficulty) {
    if (_wsService == null) {
      _lastError = 'WebSocket not connected';
      notifyListeners();
      return;
    }
    _wsService!.joinLaneGame(playerId, heroType, vsAI, aiDifficulty);
  }

  /// Select a perk during perk selection phase
  void selectPerk(int perkId, {int? targetLane}) {
    if (_wsService == null || _gameId == null) {
      _lastError = 'Not in a game';
      notifyListeners();
      return;
    }
    _wsService!.selectPerk(_gameId!, perkId, targetLane: targetLane);
  }

  /// Pass on perk selection
  void passPerkSelection() {
    selectPerk(0);
  }

  /// Handle incoming server messages
  void _handleServerMessage(WSMessage message) {
    switch (message.type) {
      case MessageType.laneMatchFound:
        _handleLaneMatchFound(message.payload);
        break;
      case MessageType.laneGameState:
        _handleLaneGameState(message.payload);
        break;
      case MessageType.autoPlacement:
        _handleAutoPlacement(message.payload);
        break;
      case MessageType.perkResult:
        _handlePerkResult(message.payload);
        break;
      case MessageType.laneWon:
        _handleLaneWon(message.payload);
        break;
      case MessageType.gameWon:
        _handleGameWon(message.payload);
        break;
      case MessageType.error:
        _handleError(message.payload);
        break;
      default:
        break;
    }
  }

  void _handleLaneMatchFound(Map<String, dynamic> payload) {
    _gameId = payload['gameId'] as String;
    final sideStr = payload['side'] as String;
    _mySide = sideStr == 'player1' ? PlayerSide.player1 : PlayerSide.player2;
    notifyListeners();
  }

  void _handleLaneGameState(Map<String, dynamic> payload) {
    final gameData = payload['game'] as Map<String, dynamic>;
    _updateGameStateFromServer(gameData);
    notifyListeners();
  }

  void _handleAutoPlacement(Map<String, dynamic> payload) {
    _lastAutoPlacedLane = payload['laneIndex'] as int;
    notifyListeners();
  }

  void _handlePerkResult(Map<String, dynamic> payload) {
    final success = payload['success'] as bool;
    if (!success) {
      _lastError = payload['error'] as String?;
    } else {
      _lastError = null;
    }
    notifyListeners();
  }

  void _handleLaneWon(Map<String, dynamic> payload) {
    // Lane won notification - state will be updated via laneGameState
    notifyListeners();
  }

  void _handleGameWon(Map<String, dynamic> payload) {
    // Game won notification - state will be updated via laneGameState
    notifyListeners();
  }

  void _handleError(Map<String, dynamic> payload) {
    _lastError = payload['message'] as String?;
    notifyListeners();
  }

  /// Update local game state from server data
  void _updateGameStateFromServer(Map<String, dynamic> gameData) {
    _gameId = gameData['id'] as String;

    // Parse lanes
    final lanesData = gameData['lanes'] as List<dynamic>;
    final lanes = <Lane>[];
    for (final laneData in lanesData) {
      final p1Slots = (laneData['player1Slots'] as List<dynamic>).cast<bool>();
      final p2Slots = (laneData['player2Slots'] as List<dynamic>).cast<bool>();
      final winnerVal = laneData['winner'] as int?;
      PlayerSide? winner;
      if (winnerVal == 1) winner = PlayerSide.player1;
      if (winnerVal == 2) winner = PlayerSide.player2;

      lanes.add(Lane(
        player1Columns: p1Slots,
        player2Columns: p2Slots,
        winner: winner,
      ));
    }

    // Parse current player
    final currentPlayerVal = gameData['currentPlayer'] as int;
    final currentPlayer = currentPlayerVal == 1 ? PlayerSide.player1 : PlayerSide.player2;

    // Parse phase
    final phaseStr = gameData['currentPhase'] as String;
    TurnPhase phase;
    switch (phaseStr) {
      case 'deferredResolution':
        phase = TurnPhase.deferredResolution;
        break;
      case 'autoPlacement':
        phase = TurnPhase.autoPlacement;
        break;
      case 'perkSelection':
        phase = TurnPhase.perkSelection;
        break;
      default:
        phase = TurnPhase.autoPlacement;
    }

    // Parse status
    final statusStr = gameData['status'] as String;
    CombatStatus status;
    switch (statusStr) {
      case 'setup':
        status = CombatStatus.setup;
        break;
      case 'playing':
        status = CombatStatus.playing;
        break;
      case 'finished':
        status = CombatStatus.finished;
        break;
      default:
        status = CombatStatus.playing;
    }

    // Parse winner
    final winnerVal = gameData['winner'] as int?;
    PlayerSide? gameWinner;
    if (winnerVal == 1) gameWinner = PlayerSide.player1;
    if (winnerVal == 2) gameWinner = PlayerSide.player2;

    // Parse perk slots
    final perkSlotsData = gameData['currentPerkSlots'] as List<dynamic>?;
    if (perkSlotsData != null) {
      _currentPerkSlots = perkSlotsData
          .map((slot) => PerkSlot.fromJson(slot as Map<String, dynamic>))
          .toList();
    }

    _gameState = CombatGameState(
      gameId: _gameId!,
      lanes: lanes,
      currentPlayer: currentPlayer,
      currentPhase: phase,
      player1Pieces: 40, // V2 has unlimited pieces
      player2Pieces: 40,
      player1LanesWon: gameData['player1LanesWon'] as int? ?? 0,
      player2LanesWon: gameData['player2LanesWon'] as int? ?? 0,
      status: status,
      gameWinner: gameWinner,
      lastAutoPlacedLane: gameData['lastAutoPlacedLane'] as int?,
    );
  }

  /// Disconnect from server and clean up
  void disconnectFromServer() {
    _wsSubscription?.cancel();
    _wsSubscription = null;
    _wsService = null;
    _isServerDriven = false;
    _gameId = null;
    _mySide = null;
    _currentPerkSlots = [];
    _lastAutoPlacedLane = null;
    _lastError = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _wsSubscription?.cancel();
    super.dispose();
  }
}
