"""Game state classes."""

from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Optional
import random

from .config import GameConfig, DEFAULT_CONFIG


class Player(Enum):
    """Player identifier."""
    PLAYER1 = 1
    PLAYER2 = 2

    def opponent(self) -> 'Player':
        """Return the other player."""
        return Player.PLAYER2 if self == Player.PLAYER1 else Player.PLAYER1


class TurnPhase(Enum):
    """Phase within a turn."""
    AUTO_PLACEMENT = auto()  # Automatic piece placement
    PERK_SELECTION = auto()  # Choose which perk slot to use
    PERK_TARGETING = auto()  # Choose target for perk (if needed)
    TURN_END = auto()        # End of turn processing


class TriggerType(Enum):
    """Types of triggers that can be set on lanes."""
    # Placement triggers (fire when opponent places on this lane)
    PORTAL = auto()      # Teleport placed piece to random lane
    TRAP = auto()        # Remove placed piece
    MIRROR = auto()      # Owner gets +2 pieces on same lane
    ECHO = auto()        # Owner gets +2 pieces on random lanes
    SHOCKWAVE = auto()   # Opponent loses 2 pieces elsewhere
    RETALIATE = auto()   # Owner's piece appears on opponent's side (raid)

    # Removal triggers (fire when opponent removes from this lane)
    HYDRA = auto()       # Owner gets +2 pieces on random lanes
    BACKFIRE = auto()    # Opponent loses 2 pieces
    ABSORB = auto()      # Owner recovers the removed piece on random lane


class DeferredType(Enum):
    """Types of deferred effects that fire at turn start."""
    SIGNAL = auto()      # Pull 1 of your pieces to this lane
    ENLIST = auto()      # Attempt to convert an enemy piece
    AMBUSH = auto()      # Remove 1 enemy piece from this lane
    REINFORCE = auto()   # Add 1 piece to this lane
    RAID = auto()        # Place 1 piece on enemy's side


@dataclass
class LaneState:
    """State of a single lane."""

    # Piece counts per player (0 to SLOTS_PER_SIDE)
    player1_pieces: int = 0
    player2_pieces: int = 0

    # Lane ownership (None if not yet won)
    winner: Optional[Player] = None

    # Duration effects
    freeze_player: Optional[Player] = None  # Which player is blocked from this lane
    freeze_turns: int = 0

    # Note: Cloak/Blind are now GLOBAL effects tracked in GameState, not per-lane
    # Note: Sanctuary/Capture are also GLOBAL effects tracked as lists in GameState

    # Triggers set on this lane - FIFO list of (trigger_type, owner, turns, order_id)
    # Order ID is used to maintain FIFO ordering across all triggers
    triggers: list = field(default_factory=list)

    # Deferred effects pending on this lane
    # Format: list of {'type': DeferredType, 'owner': Player, 'target_lane': int}
    deferred: list = field(default_factory=list)

    def pieces_for(self, player: Player) -> int:
        """Get piece count for a player."""
        return self.player1_pieces if player == Player.PLAYER1 else self.player2_pieces

    def set_pieces_for(self, player: Player, count: int) -> None:
        """Set piece count for a player."""
        if player == Player.PLAYER1:
            self.player1_pieces = count
        else:
            self.player2_pieces = count

    def add_piece(self, player: Player) -> bool:
        """Add a piece for player. Returns True if successful."""
        current = self.pieces_for(player)
        if current >= DEFAULT_CONFIG.SLOTS_PER_SIDE:
            return False
        self.set_pieces_for(player, current + 1)
        return True

    def remove_piece(self, player: Player) -> bool:
        """Remove a piece for player. Returns True if successful."""
        current = self.pieces_for(player)
        if current <= 0:
            return False
        self.set_pieces_for(player, current - 1)
        return True

    def is_full_for(self, player: Player) -> bool:
        """Check if lane is full for a player."""
        return self.pieces_for(player) >= DEFAULT_CONFIG.SLOTS_PER_SIDE

    def is_frozen_for(self, player: Player) -> bool:
        """Check if lane is frozen for a player."""
        return self.freeze_player == player and self.freeze_turns > 0

    def check_winner(self, current_player: Optional['Player'] = None) -> Optional[Player]:
        """
        Check and set winner if a player filled their side.

        Args:
            current_player: If provided, this player is checked first (priority on ties)

        Returns:
            The winning player, or None if no winner yet
        """
        if self.winner is not None:
            return self.winner

        p1_full = self.player1_pieces >= DEFAULT_CONFIG.SLOTS_PER_SIDE
        p2_full = self.player2_pieces >= DEFAULT_CONFIG.SLOTS_PER_SIDE

        if p1_full and p2_full:
            # Both full - prioritize current player
            if current_player == Player.PLAYER2:
                self.winner = Player.PLAYER2
            else:
                self.winner = Player.PLAYER1
        elif p1_full:
            self.winner = Player.PLAYER1
        elif p2_full:
            self.winner = Player.PLAYER2

        return self.winner

    def decrement_freeze(self) -> None:
        """Decrement freeze counter at turn end."""
        if self.freeze_turns > 0:
            self.freeze_turns -= 1
            if self.freeze_turns == 0:
                self.freeze_player = None

    def add_deferred(self, deferred_type: 'DeferredType', owner: 'Player', target_lane: int = None) -> None:
        """Add a deferred effect to this lane."""
        self.deferred.append({
            'type': deferred_type,
            'owner': owner,
            'target_lane': target_lane if target_lane is not None else -1
        })

    def pop_deferred_for(self, player: 'Player') -> list:
        """Get and remove all deferred effects for a player."""
        owned = [d for d in self.deferred if d['owner'] == player]
        self.deferred = [d for d in self.deferred if d['owner'] != player]
        return owned

    def add_trigger(self, trigger_type: 'TriggerType', owner: 'Player', duration: int = 2, order_id: int = 0) -> None:
        """
        Add a trigger to this lane. Triggers are stored as a FIFO list.

        Args:
            trigger_type: Type of trigger
            owner: Player who set the trigger
            duration: How many turns until expiry
            order_id: Global ordering ID for FIFO processing
        """
        self.triggers.append({
            'type': trigger_type,
            'owner': owner,
            'turns': duration,
            'order_id': order_id
        })

    def get_trigger(self, trigger_type: 'TriggerType') -> Optional[dict]:
        """Get first trigger info of given type if exists."""
        for t in self.triggers:
            if t['type'] == trigger_type:
                return t
        return None

    def has_trigger_type(self, trigger_type: 'TriggerType') -> bool:
        """Check if any trigger of given type exists on this lane."""
        return any(t['type'] == trigger_type for t in self.triggers)

    def remove_trigger(self, trigger_type: 'TriggerType') -> bool:
        """Remove first trigger of given type. Returns True if it existed."""
        for i, t in enumerate(self.triggers):
            if t['type'] == trigger_type:
                self.triggers.pop(i)
                return True
        return False

    def remove_trigger_by_order(self, order_id: int) -> bool:
        """Remove trigger by its order ID. Returns True if it existed."""
        for i, t in enumerate(self.triggers):
            if t['order_id'] == order_id:
                self.triggers.pop(i)
                return True
        return False

    def get_placement_triggers(self, for_opponent_of: 'Player') -> list[tuple['TriggerType', 'Player', int]]:
        """
        Get triggers that fire when for_opponent_of places here, in FIFO order.

        Returns list of (trigger_type, owner, order_id) sorted by order_id.
        """
        placement_types = {TriggerType.PORTAL, TriggerType.TRAP, TriggerType.MIRROR,
                          TriggerType.ECHO, TriggerType.SHOCKWAVE, TriggerType.RETALIATE}
        result = []
        for t in self.triggers:
            if t['type'] in placement_types and t['owner'] != for_opponent_of:
                result.append((t['type'], t['owner'], t['order_id']))
        # Sort by order_id for FIFO processing
        result.sort(key=lambda x: x[2])
        return result

    def get_removal_triggers(self, for_opponent_of: 'Player') -> list[tuple['TriggerType', 'Player', int]]:
        """
        Get triggers that fire when for_opponent_of removes from here, in FIFO order.

        Returns list of (trigger_type, owner, order_id) sorted by order_id.
        """
        removal_types = {TriggerType.HYDRA, TriggerType.BACKFIRE, TriggerType.ABSORB}
        result = []
        for t in self.triggers:
            if t['type'] in removal_types and t['owner'] != for_opponent_of:
                result.append((t['type'], t['owner'], t['order_id']))
        # Sort by order_id for FIFO processing
        result.sort(key=lambda x: x[2])
        return result

    def decrement_triggers(self) -> list['TriggerType']:
        """Decrement trigger timers and remove expired ones. Returns expired types."""
        expired = []
        remaining = []
        for t in self.triggers:
            t['turns'] -= 1
            if t['turns'] <= 0:
                expired.append(t['type'])
            else:
                remaining.append(t)
        self.triggers = remaining
        return expired

    def clear_all_triggers(self) -> int:
        """Remove all triggers from this lane. Returns count removed."""
        count = len(self.triggers)
        self.triggers = []
        return count

    def has_triggers(self) -> bool:
        """Check if this lane has any active triggers."""
        return len(self.triggers) > 0

    def clear_triggers(self) -> None:
        """Alias for clear_all_triggers for simpler syntax."""
        self.triggers = []

    def clear_deferred(self) -> None:
        """Clear all deferred effects on this lane."""
        self.deferred = []

    def clear_all_effects(self) -> None:
        """Clear all triggers, deferred effects, and freeze on this lane (for lane win cleanup)."""
        self.triggers = []
        self.deferred = []
        self.freeze_player = None
        self.freeze_turns = 0


@dataclass
class GameState:
    """Complete game state."""

    config: GameConfig = field(default_factory=lambda: DEFAULT_CONFIG)

    # Board state - list of LaneState
    lanes: list[LaneState] = field(default_factory=list)

    # Current game state
    current_player: Player = Player.PLAYER1
    turn_phase: TurnPhase = TurnPhase.AUTO_PLACEMENT
    turn_number: int = 1

    # Game result
    game_over: bool = False
    winner: Optional[Player] = None

    # Current turn state
    auto_placed_lane: Optional[int] = None  # Lane where auto-placement happened
    offered_perks: dict = field(default_factory=dict)  # slot -> perk_type
    selected_perk: Optional[str] = None

    # Statistics tracking
    slot_usage: dict = field(default_factory=lambda: {1: 0, 2: 0, 3: 0, 4: 0, 'pass': 0})
    perk_usage: dict = field(default_factory=dict)

    # Random state for deterministic games
    rng: random.Random = field(default_factory=random.Random)

    # Global duration effects (affect entire field, not per-lane)
    player1_cloaked: int = 0  # Turns remaining for P1's entire field being cloaked
    player2_cloaked: int = 0  # Turns remaining for P2's entire field being cloaked
    player1_blinded: int = 0  # Turns remaining for P1 being blinded (can't see enemy)
    player2_blinded: int = 0  # Turns remaining for P2 being blinded (can't see enemy)

    # Sanctuary: All YOUR lost pieces redirect here - supports MULTIPLE markers
    # Format: list of (lane, turns_remaining)
    player1_sanctuaries: list = field(default_factory=list)
    player2_sanctuaries: list = field(default_factory=list)

    # Capture: All ENEMY pieces you remove redirect here - supports MULTIPLE markers
    # Format: list of (lane, turns_remaining)
    player1_captures: list = field(default_factory=list)
    player2_captures: list = field(default_factory=list)

    # Pending raids - list of {'owner': Player, 'lane': int, 'turns_until_resolve': int}
    # Raids placed on enemy's side, resolved at start of raider's turn after 2 full turns
    pending_raids: list = field(default_factory=list)

    # Global trigger order counter for FIFO ordering
    trigger_order_counter: int = 0

    def __post_init__(self):
        """Initialize lanes if empty."""
        if not self.lanes:
            self.lanes = [LaneState() for _ in range(self.config.LANES)]

    def set_seed(self, seed: int) -> None:
        """Set random seed for deterministic games."""
        self.rng = random.Random(seed)

    def lanes_won_by(self, player: Player) -> int:
        """Count lanes won by a player."""
        return sum(1 for lane in self.lanes if lane.winner == player)

    def check_game_over(self) -> bool:
        """Check if game is over and set winner."""
        if self.game_over:
            return True

        p1_wins = self.lanes_won_by(Player.PLAYER1)
        p2_wins = self.lanes_won_by(Player.PLAYER2)

        if p1_wins >= self.config.LANES_TO_WIN:
            self.game_over = True
            self.winner = Player.PLAYER1
        elif p2_wins >= self.config.LANES_TO_WIN:
            self.game_over = True
            self.winner = Player.PLAYER2

        return self.game_over

    def get_available_lanes(self, player: Player) -> list[int]:
        """Get lanes where player can place a piece."""
        available = []
        for i, lane in enumerate(self.lanes):
            if lane.winner is None and not lane.is_full_for(player) and not lane.is_frozen_for(player):
                available.append(i)
        return available

    def get_lanes_with_pieces(self, player: Player) -> list[int]:
        """Get lanes where player has at least one piece."""
        return [i for i, lane in enumerate(self.lanes) if lane.pieces_for(player) > 0]

    def get_non_empty_enemy_lanes(self, player: Player) -> list[int]:
        """Get lanes where opponent has at least one piece."""
        opponent = player.opponent()
        return [i for i, lane in enumerate(self.lanes) if lane.pieces_for(opponent) > 0 and lane.winner is None]

    def is_cloaked(self, player: Player) -> bool:
        """Check if player's entire field is cloaked (hidden from opponent)."""
        if player == Player.PLAYER1:
            return self.player1_cloaked > 0
        return self.player2_cloaked > 0

    def is_blinded(self, player: Player) -> bool:
        """Check if player is blinded (can't see opponent's pieces)."""
        if player == Player.PLAYER1:
            return self.player1_blinded > 0
        return self.player2_blinded > 0

    def get_sanctuary_lane(self, player: Player) -> Optional[int]:
        """
        Get a sanctuary lane for a player (where their lost pieces redirect).
        If multiple sanctuaries exist, randomly picks one.
        Returns None if no valid sanctuary.
        """
        sanctuaries = self.player1_sanctuaries if player == Player.PLAYER1 else self.player2_sanctuaries
        # Filter to active sanctuaries on non-won, non-full lanes
        valid = [
            (lane, turns) for lane, turns in sanctuaries
            if turns > 0 and self.lanes[lane].winner is None and not self.lanes[lane].is_full_for(player)
        ]
        if not valid:
            return None
        # Randomly select from valid sanctuaries
        return self.rng.choice(valid)[0]

    def get_capture_lane(self, player: Player) -> Optional[int]:
        """
        Get a capture lane for a player (where enemy pieces they remove redirect).
        If multiple capture zones exist, randomly picks one.
        Returns None if no valid capture zone.
        """
        captures = self.player1_captures if player == Player.PLAYER1 else self.player2_captures
        # Filter to active captures on non-won, non-full lanes
        valid = [
            (lane, turns) for lane, turns in captures
            if turns > 0 and self.lanes[lane].winner is None and not self.lanes[lane].is_full_for(player)
        ]
        if not valid:
            return None
        # Randomly select from valid captures
        return self.rng.choice(valid)[0]

    def has_sanctuary(self, player: Player) -> bool:
        """Check if player has any active sanctuary."""
        sanctuaries = self.player1_sanctuaries if player == Player.PLAYER1 else self.player2_sanctuaries
        return any(turns > 0 for _, turns in sanctuaries)

    def has_capture(self, player: Player) -> bool:
        """Check if player has any active capture zone."""
        captures = self.player1_captures if player == Player.PLAYER1 else self.player2_captures
        return any(turns > 0 for _, turns in captures)

    def set_cloaked(self, player: Player, turns: int) -> None:
        """Set cloak effect on player's entire field."""
        if player == Player.PLAYER1:
            self.player1_cloaked = turns
        else:
            self.player2_cloaked = turns

    def set_blinded(self, player: Player, turns: int) -> None:
        """Set blind effect on player (can't see enemy)."""
        if player == Player.PLAYER1:
            self.player1_blinded = turns
        else:
            self.player2_blinded = turns

    def add_sanctuary(self, player: Player, lane: int, turns: int) -> None:
        """Add a sanctuary marker for player. Multiple sanctuaries can be active."""
        if player == Player.PLAYER1:
            self.player1_sanctuaries.append((lane, turns))
        else:
            self.player2_sanctuaries.append((lane, turns))

    def add_capture(self, player: Player, lane: int, turns: int) -> None:
        """Add a capture zone for player. Multiple capture zones can be active."""
        if player == Player.PLAYER1:
            self.player1_captures.append((lane, turns))
        else:
            self.player2_captures.append((lane, turns))

    # Legacy compatibility - these now just add to the list
    def set_sanctuary(self, player: Player, lane: int, turns: int) -> None:
        """Add sanctuary lane for player (legacy compatibility, now adds to list)."""
        self.add_sanctuary(player, lane, turns)

    def set_capture(self, player: Player, lane: int, turns: int) -> None:
        """Add capture lane for player (legacy compatibility, now adds to list)."""
        self.add_capture(player, lane, turns)

    def get_next_trigger_order(self) -> int:
        """Get the next trigger order ID and increment the counter."""
        order_id = self.trigger_order_counter
        self.trigger_order_counter += 1
        return order_id

    def remove_piece_with_redirects(self, lane_idx: int, piece_owner: 'Player',
                                      remover: Optional['Player'] = None) -> dict:
        """
        Remove a piece with Sanctuary/Capture redirection logic.

        This is the centralized removal function that should be used whenever
        a piece is removed from the board (except for voluntary moves like Scatter).

        Args:
            lane_idx: Lane to remove from
            piece_owner: Owner of the piece being removed
            remover: Player causing the removal (for Capture check). If None, no Capture check.

        Returns:
            dict with removal details:
            - 'removed': bool - whether a piece was removed
            - 'redirected': bool - whether redirection occurred
            - 'redirect_type': 'sanctuary' or 'capture' or None
            - 'destination': int or None - destination lane if redirected
            - 'converted': bool - True if piece was converted to remover's (Capture)
        """
        lane = self.lanes[lane_idx]

        # Check if there's a piece to remove
        if lane.pieces_for(piece_owner) <= 0:
            return {'removed': False, 'redirected': False, 'redirect_type': None,
                    'destination': None, 'converted': False}

        # Check Capture first (if remover is opponent and has active Capture)
        if remover is not None and remover != piece_owner:
            capture_lane = self.get_capture_lane(remover)
            if capture_lane is not None and self.lanes[capture_lane].winner is None:
                # Remove piece from source lane
                lane.remove_piece(piece_owner)
                # Add as remover's piece on capture lane
                self.lanes[capture_lane].add_piece(remover)
                return {'removed': True, 'redirected': True, 'redirect_type': 'capture',
                        'destination': capture_lane, 'converted': True}

        # Check Sanctuary (if piece owner has active Sanctuary)
        sanctuary_lane = self.get_sanctuary_lane(piece_owner)
        if sanctuary_lane is not None and self.lanes[sanctuary_lane].winner is None:
            # Remove piece from source lane
            lane.remove_piece(piece_owner)
            # Add piece to sanctuary lane (still owned by original owner)
            self.lanes[sanctuary_lane].add_piece(piece_owner)
            return {'removed': True, 'redirected': True, 'redirect_type': 'sanctuary',
                    'destination': sanctuary_lane, 'converted': False}

        # Normal removal - no redirection
        lane.remove_piece(piece_owner)
        return {'removed': True, 'redirected': False, 'redirect_type': None,
                'destination': None, 'converted': False}

    def cleanup_won_lane(self, lane_idx: int) -> None:
        """
        Clean up all effects on a lane when it is won.
        Called when a lane.winner is set.
        """
        lane = self.lanes[lane_idx]
        lane.clear_all_effects()

        # Remove any sanctuaries/captures pointing to this lane
        self.player1_sanctuaries = [(l, t) for l, t in self.player1_sanctuaries if l != lane_idx]
        self.player2_sanctuaries = [(l, t) for l, t in self.player2_sanctuaries if l != lane_idx]
        self.player1_captures = [(l, t) for l, t in self.player1_captures if l != lane_idx]
        self.player2_captures = [(l, t) for l, t in self.player2_captures if l != lane_idx]

        # Remove pending raids on this lane
        self.pending_raids = [r for r in self.pending_raids if r['lane'] != lane_idx]

    def switch_player(self) -> None:
        """Switch to the other player's turn."""
        self.current_player = self.current_player.opponent()
        self.turn_number += 1
        self.turn_phase = TurnPhase.AUTO_PLACEMENT
        self.auto_placed_lane = None
        self.offered_perks = {}
        self.selected_perk = None

        # Decrement duration effects on lanes
        for lane in self.lanes:
            lane.decrement_freeze()
            lane.decrement_triggers()

        # Decrement global duration effects
        if self.player1_cloaked > 0:
            self.player1_cloaked -= 1
        if self.player2_cloaked > 0:
            self.player2_cloaked -= 1
        if self.player1_blinded > 0:
            self.player1_blinded -= 1
        if self.player2_blinded > 0:
            self.player2_blinded -= 1

        # Decrement sanctuary timers and remove expired ones
        self.player1_sanctuaries = [(l, t - 1) for l, t in self.player1_sanctuaries if t > 1]
        self.player2_sanctuaries = [(l, t - 1) for l, t in self.player2_sanctuaries if t > 1]

        # Decrement capture timers and remove expired ones
        self.player1_captures = [(l, t - 1) for l, t in self.player1_captures if t > 1]
        self.player2_captures = [(l, t - 1) for l, t in self.player2_captures if t > 1]

        # Decrement raid timers (raids resolve when turns_until_resolve reaches 0)
        for raid in self.pending_raids:
            if 'turns_until_resolve' in raid:
                raid['turns_until_resolve'] -= 1

    def record_slot_usage(self, slot: int | str) -> None:
        """Record which slot was used."""
        if slot in self.slot_usage:
            self.slot_usage[slot] += 1

    def record_perk_usage(self, perk_type: str) -> None:
        """Record which perk was used."""
        self.perk_usage[perk_type] = self.perk_usage.get(perk_type, 0) + 1

    def clone(self) -> 'GameState':
        """Create a deep copy of the game state."""
        import copy
        new_state = GameState(
            config=self.config,
            lanes=[LaneState(
                player1_pieces=lane.player1_pieces,
                player2_pieces=lane.player2_pieces,
                winner=lane.winner,
                freeze_player=lane.freeze_player,
                freeze_turns=lane.freeze_turns,
                triggers=copy.deepcopy(lane.triggers),
                deferred=copy.deepcopy(lane.deferred)
            ) for lane in self.lanes],
            current_player=self.current_player,
            turn_phase=self.turn_phase,
            turn_number=self.turn_number,
            game_over=self.game_over,
            winner=self.winner,
            auto_placed_lane=self.auto_placed_lane,
            offered_perks=self.offered_perks.copy(),
            selected_perk=self.selected_perk,
            slot_usage=self.slot_usage.copy(),
            perk_usage=self.perk_usage.copy(),
            # Global duration effects
            player1_cloaked=self.player1_cloaked,
            player2_cloaked=self.player2_cloaked,
            player1_blinded=self.player1_blinded,
            player2_blinded=self.player2_blinded,
            # Multiple sanctuary/capture support
            player1_sanctuaries=copy.deepcopy(self.player1_sanctuaries),
            player2_sanctuaries=copy.deepcopy(self.player2_sanctuaries),
            player1_captures=copy.deepcopy(self.player1_captures),
            player2_captures=copy.deepcopy(self.player2_captures),
            pending_raids=copy.deepcopy(self.pending_raids),
            trigger_order_counter=self.trigger_order_counter
        )
        # Note: RNG state is not cloned - each clone gets fresh RNG
        return new_state
