import 'dart:async';
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Message types for WebSocket communication
enum MessageType {
  connect,
  disconnect,
  joinGame,
  leaveGame,
  makeMove,
  usePerk,
  gameState,
  error,
  matchFound,
  opponentDisconnected,
  // V2 Lane Game message types
  joinLaneGame,
  laneGameState,
  autoPlacement,
  selectPerk,
  perkResult,
  turnPhaseChanged,
  laneWon,
  gameWon,
  laneMatchFound,
}

/// WebSocket message wrapper
class WSMessage {
  final MessageType type;
  final Map<String, dynamic> payload;

  WSMessage({required this.type, required this.payload});

  Map<String, dynamic> toJson() => {
        'type': type.name,
        'payload': payload,
      };

  factory WSMessage.fromJson(Map<String, dynamic> json) => WSMessage(
        type: MessageType.values.byName(json['type']),
        payload: json['payload'] ?? {},
      );
}

/// WebSocket service for real-time communication with game server
class WebSocketService {
  WebSocketChannel? _channel;
  final _messageController = StreamController<WSMessage>.broadcast();
  bool _isConnected = false;

  Stream<WSMessage> get messages => _messageController.stream;
  bool get isConnected => _isConnected;

  /// Connect to game server
  Future<void> connect(String serverUrl) async {
    if (_isConnected) return;

    try {
      _channel = WebSocketChannel.connect(Uri.parse(serverUrl));
      _isConnected = true;

      _channel!.stream.listen(
        (data) {
          final json = jsonDecode(data as String);
          final message = WSMessage.fromJson(json);
          _messageController.add(message);
        },
        onError: (error) {
          _messageController.addError(error);
          _isConnected = false;
        },
        onDone: () {
          _isConnected = false;
        },
      );
    } catch (e) {
      _isConnected = false;
      rethrow;
    }
  }

  /// Disconnect from server
  void disconnect() {
    _channel?.sink.close();
    _isConnected = false;
  }

  /// Send a message to the server
  void send(WSMessage message) {
    if (!_isConnected || _channel == null) {
      throw Exception('Not connected to server');
    }
    _channel!.sink.add(jsonEncode(message.toJson()));
  }

  /// Request to join matchmaking queue
  void joinMatchmaking(String playerId, String heroType, bool vsAI, String? aiDifficulty) {
    send(WSMessage(
      type: MessageType.joinGame,
      payload: {
        'playerId': playerId,
        'heroType': heroType,
        'vsAI': vsAI,
        'aiDifficulty': aiDifficulty,
      },
    ));
  }

  /// Send a move to the server
  void makeMove(String gameId, int fromRow, int fromCol, int toRow, int toCol) {
    send(WSMessage(
      type: MessageType.makeMove,
      payload: {
        'gameId': gameId,
        'fromRow': fromRow,
        'fromCol': fromCol,
        'toRow': toRow,
        'toCol': toCol,
      },
    ));
  }

  /// Use a perk
  void usePerk(String gameId, String perk, Map<String, dynamic>? perkData) {
    send(WSMessage(
      type: MessageType.usePerk,
      payload: {
        'gameId': gameId,
        'perk': perk,
        'data': perkData,
      },
    ));
  }

  // ============================================================================
  // V2 Lane Game Methods
  // ============================================================================

  /// Request to join a V2 lane game
  void joinLaneGame(String playerId, String heroType, bool vsAI, String? aiDifficulty) {
    send(WSMessage(
      type: MessageType.joinLaneGame,
      payload: {
        'playerId': playerId,
        'heroType': heroType,
        'vsAI': vsAI,
        'aiDifficulty': aiDifficulty,
      },
    ));
  }

  /// Select a perk during perk selection phase
  /// perkId: 0 = pass, 1 = PlaceAnother, 2 = RemoveEnemy
  /// targetLane: which lane to target (required for most perks)
  void selectPerk(String gameId, int perkId, {int? targetLane}) {
    send(WSMessage(
      type: MessageType.selectPerk,
      payload: {
        'gameId': gameId,
        'perkId': perkId,
        if (targetLane != null) 'targetLane': targetLane,
      },
    ));
  }

  /// Pass on perk selection (equivalent to selectPerk with perkId 0)
  void passPerk(String gameId) {
    selectPerk(gameId, 0);
  }

  void dispose() {
    disconnect();
    _messageController.close();
  }
}
