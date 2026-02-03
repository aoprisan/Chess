import 'hero.dart';

/// Which player's side (Player 1 = left/green, Player 2 = right/purple)
enum PlayerSide { player1, player2 }

/// A trigger set on a lane (e.g. PORTAL, TRAP, MIRROR)
class TriggerData {
  final String type;
  final int owner; // 1 or 2
  final int turnsLeft;
  final int orderId;

  const TriggerData({
    required this.type,
    required this.owner,
    required this.turnsLeft,
    this.orderId = 0,
  });

  factory TriggerData.fromJson(Map<String, dynamic> json) {
    return TriggerData(
      type: json['type'] as String,
      owner: json['owner'] as int,
      turnsLeft: json['turnsLeft'] as int? ?? 0,
      orderId: json['orderId'] as int? ?? 0,
    );
  }
}

/// A deferred effect pending on a lane (e.g. SIGNAL, ENLIST, AMBUSH, REINFORCE)
class DeferredData {
  final String type;
  final int owner; // 1 or 2
  final int targetLane;

  const DeferredData({
    required this.type,
    required this.owner,
    required this.targetLane,
  });

  factory DeferredData.fromJson(Map<String, dynamic> json) {
    return DeferredData(
      type: json['type'] as String,
      owner: json['owner'] as int,
      targetLane: json['targetLane'] as int? ?? 0,
    );
  }
}

/// Sanctuary marker (duration effect redirecting losses to a lane)
class SanctuaryData {
  final int lane;
  final int turnsLeft;

  const SanctuaryData({required this.lane, required this.turnsLeft});

  factory SanctuaryData.fromJson(Map<String, dynamic> json) {
    return SanctuaryData(
      lane: json['lane'] as int,
      turnsLeft: json['turnsLeft'] as int? ?? 0,
    );
  }
}

/// Capture marker (duration effect converting removed enemy pieces)
class CaptureData {
  final int lane;
  final int turnsLeft;

  const CaptureData({required this.lane, required this.turnsLeft});

  factory CaptureData.fromJson(Map<String, dynamic> json) {
    return CaptureData(
      lane: json['lane'] as int,
      turnsLeft: json['turnsLeft'] as int? ?? 0,
    );
  }
}

/// Pending raid on an enemy lane
class PendingRaidData {
  final int owner; // 1 or 2
  final int lane;
  final int turnsUntilResolve;
  final String source; // "RAID" or "RETALIATE"

  const PendingRaidData({
    required this.owner,
    required this.lane,
    required this.turnsUntilResolve,
    required this.source,
  });

  factory PendingRaidData.fromJson(Map<String, dynamic> json) {
    return PendingRaidData(
      owner: json['owner'] as int,
      lane: json['lane'] as int,
      turnsUntilResolve: json['turnsUntilResolve'] as int? ?? 0,
      source: json['source'] as String? ?? 'RAID',
    );
  }
}

/// Polarity of a lane effect
enum EffectPolarity { beneficial, detrimental }

/// Aggregated lane effect for display
class LaneEffect {
  final String effectName;
  final String effectType; // trigger, deferred, duration, raid
  final EffectPolarity polarity;
  final int ownerPlayer; // 1 or 2
  final int laneIndex;
  final bool onOwnerSide; // true = owner's half, false = opponent's half
  final int? turnsLeft;

  const LaneEffect({
    required this.effectName,
    required this.effectType,
    required this.polarity,
    required this.ownerPlayer,
    required this.laneIndex,
    required this.onOwnerSide,
    this.turnsLeft,
  });
}

/// Represents a single lane on the combat field (5 columns per side)
class Lane {
  /// Pieces on Player 1's side of this lane (indices 0-4, left to right toward center)
  final List<bool> player1Columns;

  /// Pieces on Player 2's side of this lane (indices 0-4, right to left toward center)
  final List<bool> player2Columns;

  /// Which player has won this lane (null if not yet won)
  final PlayerSide? winner;

  /// Active triggers on this lane
  final List<TriggerData> triggers;

  /// Pending deferred effects on this lane
  final List<DeferredData> deferred;

  const Lane({
    required this.player1Columns,
    required this.player2Columns,
    this.winner,
    this.triggers = const [],
    this.deferred = const [],
  });

  /// Create an empty lane
  factory Lane.empty() {
    return Lane(
      player1Columns: List.filled(5, false),
      player2Columns: List.filled(5, false),
    );
  }

  /// Count pieces for a player in this lane
  int countPieces(PlayerSide side) {
    final columns = side == PlayerSide.player1 ? player1Columns : player2Columns;
    return columns.where((filled) => filled).length;
  }

  /// Check if a side has filled their half of the lane
  bool isSideFilled(PlayerSide side) {
    final columns = side == PlayerSide.player1 ? player1Columns : player2Columns;
    return columns.every((filled) => filled);
  }

  /// Get the next empty column index for a side (-1 if full)
  int getNextEmptyColumn(PlayerSide side) {
    final columns = side == PlayerSide.player1 ? player1Columns : player2Columns;
    for (int i = 0; i < columns.length; i++) {
      if (!columns[i]) return i;
    }
    return -1;
  }

  Lane copyWith({
    List<bool>? player1Columns,
    List<bool>? player2Columns,
    PlayerSide? winner,
    List<TriggerData>? triggers,
    List<DeferredData>? deferred,
  }) {
    return Lane(
      player1Columns: player1Columns ?? List.from(this.player1Columns),
      player2Columns: player2Columns ?? List.from(this.player2Columns),
      winner: winner ?? this.winner,
      triggers: triggers ?? List.from(this.triggers),
      deferred: deferred ?? List.from(this.deferred),
    );
  }
}

/// Current phase of a turn
enum TurnPhase {
  deferredResolution, // Phase 1: Resolve pending effects
  autoPlacement,      // Phase 2: System places a piece
  perkSelection,      // Phase 3: Player chooses perk or passes
}

/// Game status
enum CombatStatus {
  setup,      // Selecting heroes
  playing,    // Game in progress
  finished,   // Game over
}

/// Full combat game state
class CombatGameState {
  final String gameId;

  /// The 5 lanes of the combat field
  final List<Lane> lanes;

  /// Current player's turn
  final PlayerSide currentPlayer;

  /// Current phase within the turn
  final TurnPhase currentPhase;

  /// Remaining pieces for each player (starts at 40)
  final int player1Pieces;
  final int player2Pieces;

  /// Lanes won by each player
  final int player1LanesWon;
  final int player2LanesWon;

  /// Game status
  final CombatStatus status;

  /// Winner of the game (null if not finished)
  final PlayerSide? gameWinner;

  /// Selected heroes
  final Hero? player1Hero;
  final Hero? player2Hero;

  /// Last lane that received auto-placement (for PlaceAnother perk targeting)
  final int? lastAutoPlacedLane;

  /// Lanes frozen by each player (opponent cannot place on frozen lanes for 1 turn)
  /// Key: lane index, Value: player who froze it (their opponent is blocked)
  final Map<int, PlayerSide> frozenLanes;

  /// Sanctuary markers per player
  final List<SanctuaryData> player1Sanctuaries;
  final List<SanctuaryData> player2Sanctuaries;

  /// Capture markers per player
  final List<CaptureData> player1Captures;
  final List<CaptureData> player2Captures;

  /// Pending raids
  final List<PendingRaidData> pendingRaids;

  /// Cloak duration remaining per player (0 = not cloaked)
  final int player1Cloaked;
  final int player2Cloaked;

  /// Blind duration remaining per player (0 = not blinded)
  final int player1Blinded;
  final int player2Blinded;

  const CombatGameState({
    required this.gameId,
    required this.lanes,
    required this.currentPlayer,
    required this.currentPhase,
    required this.player1Pieces,
    required this.player2Pieces,
    required this.player1LanesWon,
    required this.player2LanesWon,
    required this.status,
    this.gameWinner,
    this.player1Hero,
    this.player2Hero,
    this.lastAutoPlacedLane,
    this.frozenLanes = const {},
    this.player1Sanctuaries = const [],
    this.player2Sanctuaries = const [],
    this.player1Captures = const [],
    this.player2Captures = const [],
    this.pendingRaids = const [],
    this.player1Cloaked = 0,
    this.player2Cloaked = 0,
    this.player1Blinded = 0,
    this.player2Blinded = 0,
  });

  /// Create initial game state
  factory CombatGameState.initial(String gameId, {Hero? player1Hero, Hero? player2Hero}) {
    return CombatGameState(
      gameId: gameId,
      lanes: List.generate(5, (_) => Lane.empty()),
      currentPlayer: PlayerSide.player1,
      currentPhase: TurnPhase.autoPlacement, // Skip deferred in Phase A
      player1Pieces: 40,
      player2Pieces: 40,
      player1LanesWon: 0,
      player2LanesWon: 0,
      status: CombatStatus.playing,
      player1Hero: player1Hero,
      player2Hero: player2Hero,
    );
  }

  /// Get remaining pieces for a player
  int getRemainingPieces(PlayerSide side) {
    return side == PlayerSide.player1 ? player1Pieces : player2Pieces;
  }

  /// Get lanes won by a player
  int getLanesWon(PlayerSide side) {
    return side == PlayerSide.player1 ? player1LanesWon : player2LanesWon;
  }

  /// Get hero for a player
  Hero? getHero(PlayerSide side) {
    return side == PlayerSide.player1 ? player1Hero : player2Hero;
  }

  /// Check if game is over (3 lanes won)
  bool get isGameOver => player1LanesWon >= 3 || player2LanesWon >= 3;

  /// Check if a player's pieces are cloaked (hidden from opponent)
  bool isCloaked(PlayerSide side) {
    return side == PlayerSide.player1 ? player1Cloaked > 0 : player2Cloaked > 0;
  }

  /// Check if a player is blinded (cannot see their own pieces)
  bool isBlinded(PlayerSide side) {
    return side == PlayerSide.player1 ? player1Blinded > 0 : player2Blinded > 0;
  }

  CombatGameState copyWith({
    List<Lane>? lanes,
    PlayerSide? currentPlayer,
    TurnPhase? currentPhase,
    int? player1Pieces,
    int? player2Pieces,
    int? player1LanesWon,
    int? player2LanesWon,
    CombatStatus? status,
    PlayerSide? gameWinner,
    Hero? player1Hero,
    Hero? player2Hero,
    int? lastAutoPlacedLane,
    Map<int, PlayerSide>? frozenLanes,
    List<SanctuaryData>? player1Sanctuaries,
    List<SanctuaryData>? player2Sanctuaries,
    List<CaptureData>? player1Captures,
    List<CaptureData>? player2Captures,
    List<PendingRaidData>? pendingRaids,
    int? player1Cloaked,
    int? player2Cloaked,
    int? player1Blinded,
    int? player2Blinded,
  }) {
    // Handle potential null from hot reload of old state
    final currentFrozenLanes = this.frozenLanes;
    return CombatGameState(
      gameId: gameId,
      lanes: lanes ?? this.lanes.map((l) => l.copyWith()).toList(),
      currentPlayer: currentPlayer ?? this.currentPlayer,
      currentPhase: currentPhase ?? this.currentPhase,
      player1Pieces: player1Pieces ?? this.player1Pieces,
      player2Pieces: player2Pieces ?? this.player2Pieces,
      player1LanesWon: player1LanesWon ?? this.player1LanesWon,
      player2LanesWon: player2LanesWon ?? this.player2LanesWon,
      status: status ?? this.status,
      gameWinner: gameWinner ?? this.gameWinner,
      player1Hero: player1Hero ?? this.player1Hero,
      player2Hero: player2Hero ?? this.player2Hero,
      lastAutoPlacedLane: lastAutoPlacedLane ?? this.lastAutoPlacedLane,
      frozenLanes: frozenLanes ?? (currentFrozenLanes.isEmpty ? const {} : Map.from(currentFrozenLanes)),
      player1Sanctuaries: player1Sanctuaries ?? List.from(this.player1Sanctuaries),
      player2Sanctuaries: player2Sanctuaries ?? List.from(this.player2Sanctuaries),
      player1Captures: player1Captures ?? List.from(this.player1Captures),
      player2Captures: player2Captures ?? List.from(this.player2Captures),
      pendingRaids: pendingRaids ?? List.from(this.pendingRaids),
      player1Cloaked: player1Cloaked ?? this.player1Cloaked,
      player2Cloaked: player2Cloaked ?? this.player2Cloaked,
      player1Blinded: player1Blinded ?? this.player1Blinded,
      player2Blinded: player2Blinded ?? this.player2Blinded,
    );
  }

  /// Check if a lane is frozen for a specific player (they cannot place there)
  bool isLaneFrozenFor(int laneIndex, PlayerSide player) {
    final frozenBy = frozenLanes[laneIndex];
    if (frozenBy == null) return false;
    // Lane is frozen for the opponent of whoever froze it
    return frozenBy != player;
  }

  /// Aggregate all persistent lane effects into a map keyed by lane index
  Map<int, List<LaneEffect>> getActiveLaneEffects() {
    final effects = <int, List<LaneEffect>>{};

    // Triggers set on your own lane (beneficial)
    const beneficialTriggers = {'mirror', 'echo', 'retaliate', 'hydra', 'backfire', 'absorb'};
    // Triggers set on enemy lane (detrimental)
    const detrimentalTriggers = {'portal', 'trap', 'shockwave'};

    for (int i = 0; i < lanes.length; i++) {
      final lane = lanes[i];
      if (lane.winner != null) continue;

      for (final trigger in lane.triggers) {
        final polarity = beneficialTriggers.contains(trigger.type)
            ? EffectPolarity.beneficial
            : detrimentalTriggers.contains(trigger.type)
                ? EffectPolarity.detrimental
                : EffectPolarity.beneficial;
        final onOwnerSide = polarity == EffectPolarity.beneficial;
        effects.putIfAbsent(i, () => []).add(LaneEffect(
          effectName: trigger.type.toUpperCase(),
          effectType: 'trigger',
          polarity: polarity,
          ownerPlayer: trigger.owner,
          laneIndex: i,
          onOwnerSide: onOwnerSide,
          turnsLeft: trigger.turnsLeft,
        ));
      }

      // Deferred effects
      const beneficialDeferred = {'signal', 'enlist', 'reinforce'};
      const detrimentalDeferred = {'ambush'};

      for (final def in lane.deferred) {
        final polarity = beneficialDeferred.contains(def.type)
            ? EffectPolarity.beneficial
            : detrimentalDeferred.contains(def.type)
                ? EffectPolarity.detrimental
                : EffectPolarity.beneficial;
        final onOwnerSide = polarity == EffectPolarity.beneficial;
        effects.putIfAbsent(i, () => []).add(LaneEffect(
          effectName: def.type.toUpperCase(),
          effectType: 'deferred',
          polarity: polarity,
          ownerPlayer: def.owner,
          laneIndex: i,
          onOwnerSide: onOwnerSide,
          turnsLeft: 1, // deferred resolves next turn
        ));
      }
    }

    // Sanctuaries (beneficial, on owner's target lane)
    for (final s in player1Sanctuaries) {
      if (s.lane >= 0 && s.lane < lanes.length && lanes[s.lane].winner == null) {
        effects.putIfAbsent(s.lane, () => []).add(LaneEffect(
          effectName: 'SANCTUARY',
          effectType: 'duration',
          polarity: EffectPolarity.beneficial,
          ownerPlayer: 1,
          laneIndex: s.lane,
          onOwnerSide: true,
          turnsLeft: s.turnsLeft,
        ));
      }
    }
    for (final s in player2Sanctuaries) {
      if (s.lane >= 0 && s.lane < lanes.length && lanes[s.lane].winner == null) {
        effects.putIfAbsent(s.lane, () => []).add(LaneEffect(
          effectName: 'SANCTUARY',
          effectType: 'duration',
          polarity: EffectPolarity.beneficial,
          ownerPlayer: 2,
          laneIndex: s.lane,
          onOwnerSide: true,
          turnsLeft: s.turnsLeft,
        ));
      }
    }

    // Captures (beneficial, on owner's target lane)
    for (final c in player1Captures) {
      if (c.lane >= 0 && c.lane < lanes.length && lanes[c.lane].winner == null) {
        effects.putIfAbsent(c.lane, () => []).add(LaneEffect(
          effectName: 'CAPTURE',
          effectType: 'duration',
          polarity: EffectPolarity.beneficial,
          ownerPlayer: 1,
          laneIndex: c.lane,
          onOwnerSide: true,
          turnsLeft: c.turnsLeft,
        ));
      }
    }
    for (final c in player2Captures) {
      if (c.lane >= 0 && c.lane < lanes.length && lanes[c.lane].winner == null) {
        effects.putIfAbsent(c.lane, () => []).add(LaneEffect(
          effectName: 'CAPTURE',
          effectType: 'duration',
          polarity: EffectPolarity.beneficial,
          ownerPlayer: 2,
          laneIndex: c.lane,
          onOwnerSide: true,
          turnsLeft: c.turnsLeft,
        ));
      }
    }

    // Pending raids (detrimental, on opponent's lane)
    for (final raid in pendingRaids) {
      if (raid.lane >= 0 && raid.lane < lanes.length && lanes[raid.lane].winner == null) {
        effects.putIfAbsent(raid.lane, () => []).add(LaneEffect(
          effectName: raid.source == 'RETALIATE' ? 'RETALIATE' : 'RAID',
          effectType: 'raid',
          polarity: EffectPolarity.detrimental,
          ownerPlayer: raid.owner,
          laneIndex: raid.lane,
          onOwnerSide: false, // raids appear on opponent's side
          turnsLeft: raid.turnsUntilResolve,
        ));
      }
    }

    return effects;
  }
}
