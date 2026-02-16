import 'dart:async';
import 'package:flutter/foundation.dart';
import 'websocket_service.dart';
import 'auth_service.dart';

/// Multiplayer connection state
enum MultiplayerState {
  disconnected,
  connecting,
  connected,
  creatingRoom,
  waitingInRoom,
  findingMatch,
  matchFound,
  playing,
  opponentDisconnected,
  error,
}

/// Service that manages multiplayer session lifecycle.
/// Bridges WebSocket events to a reactive state model for the UI.
class MultiplayerService extends ChangeNotifier {
  final WebSocketService _ws;
  final AuthService _auth;
  StreamSubscription<WSMessage>? _subscription;

  MultiplayerState _state = MultiplayerState.disconnected;
  String? _roomCode;
  String? _gameId;
  String? _mySide; // "player1" or "player2"
  String? _errorMessage;
  Map<String, dynamic>? _lastGameState;

  // Callbacks for game events
  void Function(Map<String, dynamic>)? onGameStateUpdate;
  void Function(Map<String, dynamic>)? onAutoPlacement;
  void Function(Map<String, dynamic>)? onPerkResult;
  void Function(int laneIndex, String winner)? onLaneWon;
  void Function(String winner)? onGameWon;

  MultiplayerService({
    required WebSocketService ws,
    required AuthService auth,
  })  : _ws = ws,
        _auth = auth;

  MultiplayerState get state => _state;
  String? get roomCode => _roomCode;
  String? get gameId => _gameId;
  String? get mySide => _mySide;
  String? get errorMessage => _errorMessage;
  Map<String, dynamic>? get lastGameState => _lastGameState;
  bool get isMyTurn {
    if (_lastGameState == null || _mySide == null) return false;
    final game = _lastGameState!['game'] as Map<String, dynamic>?;
    if (game == null) return false;
    final currentPlayer = game['currentPlayer'];
    if (currentPlayer is int) {
      return (_mySide == 'player1' && currentPlayer == 1) ||
          (_mySide == 'player2' && currentPlayer == 2);
    }
    return false;
  }

  /// Connect to the server and start listening to messages
  Future<void> connect() async {
    if (_ws.isConnected) {
      _state = MultiplayerState.connected;
      _listenToMessages();
      notifyListeners();
      return;
    }

    _state = MultiplayerState.connecting;
    notifyListeners();

    try {
      final token = _auth.currentUser?.token;
      await _ws.connect(token: token);
      _state = MultiplayerState.connected;
      _listenToMessages();
    } catch (e) {
      _state = MultiplayerState.error;
      _errorMessage = 'Failed to connect: $e';
    }
    notifyListeners();
  }

  void _listenToMessages() {
    _subscription?.cancel();
    _subscription = _ws.messages.listen(_handleMessage, onError: (e) {
      _state = MultiplayerState.error;
      _errorMessage = 'Connection error: $e';
      notifyListeners();
    });
  }

  void _handleMessage(WSMessage msg) {
    switch (msg.type) {
      case MessageType.roomCreated:
        _roomCode = msg.payload['roomCode'] as String?;
        _state = MultiplayerState.waitingInRoom;
        notifyListeners();
        break;

      case MessageType.matchmakingStarted:
        _state = MultiplayerState.findingMatch;
        notifyListeners();
        break;

      case MessageType.matchmakingCanceled:
        _state = MultiplayerState.connected;
        _roomCode = null;
        notifyListeners();
        break;

      case MessageType.laneMatchFound:
        _gameId = msg.payload['gameId'] as String?;
        _mySide = msg.payload['side'] as String?;
        _state = MultiplayerState.matchFound;
        notifyListeners();
        // Transition to playing shortly
        Future.delayed(const Duration(milliseconds: 500), () {
          if (_state == MultiplayerState.matchFound) {
            _state = MultiplayerState.playing;
            notifyListeners();
          }
        });
        break;

      case MessageType.matchFound:
        _gameId = msg.payload['gameId'] as String?;
        final color = msg.payload['color'] as String?;
        _mySide = color == 'white' ? 'player1' : 'player2';
        _state = MultiplayerState.matchFound;
        notifyListeners();
        Future.delayed(const Duration(milliseconds: 500), () {
          if (_state == MultiplayerState.matchFound) {
            _state = MultiplayerState.playing;
            notifyListeners();
          }
        });
        break;

      case MessageType.laneGameState:
        _lastGameState = msg.payload;
        onGameStateUpdate?.call(msg.payload);
        notifyListeners();
        break;

      case MessageType.autoPlacement:
        onAutoPlacement?.call(msg.payload);
        break;

      case MessageType.perkResult:
        onPerkResult?.call(msg.payload);
        break;

      case MessageType.laneWon:
        final laneIndex = (msg.payload['laneIndex'] as num).toInt();
        final winner = msg.payload['winner'] as String;
        onLaneWon?.call(laneIndex, winner);
        break;

      case MessageType.gameWon:
        final winner = msg.payload['winner'] as String;
        onGameWon?.call(winner);
        break;

      case MessageType.opponentDisconnected:
        _state = MultiplayerState.opponentDisconnected;
        notifyListeners();
        break;

      case MessageType.error:
        _errorMessage = msg.payload['message'] as String?;
        // Don't change state for errors during gameplay
        if (_state != MultiplayerState.playing) {
          _state = MultiplayerState.error;
        }
        notifyListeners();
        break;

      default:
        break;
    }
  }

  /// Create a private room and wait for opponent
  void createRoom(String heroType, {String gameType = 'laneGame'}) {
    _state = MultiplayerState.creatingRoom;
    notifyListeners();
    _ws.createRoom(heroType, gameType: gameType);
  }

  /// Join an existing room by code
  void joinRoom(String roomCode, String heroType) {
    _ws.joinRoom(roomCode, heroType);
  }

  /// Start random matchmaking
  void findMatch(String heroType, {String gameType = 'laneGame'}) {
    _ws.findMatch(heroType, gameType: gameType);
  }

  /// Cancel matchmaking or room waiting
  void cancelMatchmaking() {
    _ws.cancelMatchmaking();
    _state = MultiplayerState.connected;
    _roomCode = null;
    notifyListeners();
  }

  /// Send a perk selection during gameplay
  void selectPerk(int perkId, {int? targetLane}) {
    if (_gameId == null) return;
    _ws.selectPerk(_gameId!, perkId, targetLane: targetLane);
  }

  /// Pass on perk selection
  void passPerk() {
    if (_gameId == null) return;
    _ws.passPerk(_gameId!);
  }

  /// Reset service state for a new session
  void reset() {
    _state = _ws.isConnected
        ? MultiplayerState.connected
        : MultiplayerState.disconnected;
    _roomCode = null;
    _gameId = null;
    _mySide = null;
    _errorMessage = null;
    _lastGameState = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
