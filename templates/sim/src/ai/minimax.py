"""Expectimax AI with alpha-beta pruning for decision-theoretic planning."""

from enum import Enum, auto
from dataclasses import dataclass, fields, asdict
from typing import Optional, Union
from itertools import combinations

from src.game.state import TriggerType, DeferredType, Player


@dataclass
class MinimaxProfile:
    """Tunable parameters for minimax board evaluation."""
    name: str

    # Board structure weights
    lane_win_weight: float = 1000.0
    near_game_win_bonus: float = 300.0
    piece_advantage_mult: float = 20.0
    near_win_bonus: float = 200.0
    near_threat_bonus: float = 50.0

    # Trigger effect values (used in _evaluate_trigger)
    trigger_trap_portal_mult: float = 40.0
    trigger_mirror_value: float = 80.0
    trigger_echo_hydra_value: float = 80.0
    trigger_shockwave_backfire_value: float = 40.0
    trigger_absorb_value: float = 20.0
    trigger_retaliate_value: float = 30.0
    trigger_default_value: float = 25.0

    # Deferred effect values
    deferred_signal_value: float = 20.0
    deferred_enlist_value: float = 30.0
    deferred_ambush_value: float = 25.0
    deferred_reinforce_value: float = 20.0
    deferred_raid_value: float = 15.0
    deferred_default_value: float = 10.0
    deferred_discount: float = 0.7

    # Freeze weights (by threat level)
    freeze_near_win: float = 120.0
    freeze_near_threat: float = 80.0
    freeze_base: float = 40.0

    # Global effects
    cloak_value: float = 30.0
    blind_value: float = 30.0

    # Pending raid
    raid_pending_value: float = 25.0
    raid_discount_base: float = 0.5

    # Duration effects (per active instance)
    sanctuary_value: float = 20.0
    capture_value: float = 25.0

    # Trigger targeting bias (opponent targets high-value lanes, not uniform)
    trigger_targeting_bias: float = 1.5

    # Freeze protection (value of freezing a lane where YOU are near-win)
    freeze_protect_near_win: float = 150.0

    # Trigger contest boost (boost factor for triggers on contested lanes)
    trigger_contest_boost: float = 1.5

# Target type can be: None, single int, or tuple of two ints
TargetType = Union[None, int, tuple[int, int]]
Move = tuple[Union[int, str], TargetType]

# Perk categories (avoid circular import by defining here)
NO_TARGET_PERKS = {'GAMBIT', 'SCRAMBLE', 'STEAL', 'CLOAK', 'BLIND'}
TWO_TARGET_PERKS = {'REGROUP', 'DISRUPT'}


class NodeType(Enum):
    """Type of node in expectimax tree."""
    MAX = auto()      # Current player's decision (maximize)
    MIN = auto()      # Opponent's decision (minimize)
    CHANCE = auto()   # Random auto-placement (average)


@dataclass
class SearchResult:
    """Result from expectimax search."""
    score: float
    move: Optional[Move] = None


def get_valid_targets_for_perk(state, player, perk_name: str) -> list[TargetType]:
    """
    Get all valid targets for a specific perk.

    Returns:
        List of valid targets (None, int, or tuple[int, int])
    """
    from src.game.rules import GameRules

    opponent = player.opponent()

    # No-target perks
    if perk_name in NO_TARGET_PERKS:
        return [None]

    # Two-target perks
    if perk_name in TWO_TARGET_PERKS:
        if perk_name == 'REGROUP':
            # Swap between two of your lanes with pieces (exclude won lanes)
            my_lanes = [i for i in state.get_lanes_with_pieces(player)
                        if state.lanes[i].winner is None]
            if len(my_lanes) >= 2:
                return list(combinations(my_lanes, 2))
            return []
        elif perk_name == 'DISRUPT':
            # Swap between two enemy lanes with pieces (exclude won lanes)
            enemy_lanes = state.get_non_empty_enemy_lanes(player)
            if len(enemy_lanes) >= 2:
                return list(combinations(enemy_lanes, 2))
            return []

    # Single-target perks - determine valid lanes based on perk type

    # Placement target (your lane, not full, not frozen)
    if perk_name in ['PLACE_ANOTHER', 'REINFORCE', 'SIGNAL']:
        return GameRules.get_valid_placement_lanes(state, player)

    # Removal target (enemy lane with pieces)
    if perk_name == 'REMOVE_ENEMY':
        return GameRules.get_valid_removal_lanes(state, player)

    # Freeze target (any non-won, non-frozen lane)
    if perk_name == 'FREEZE':
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and l.freeze_turns == 0]

    # Sacrifice perks (your lane with pieces, not won)
    if perk_name in ['SPLIT', 'KAMIKAZE', 'SCATTER']:
        return [i for i in state.get_lanes_with_pieces(player)
                if state.lanes[i].winner is None]

    # Enemy pieces target (not won)
    if perk_name == 'DISPERSE':
        return [i for i in state.get_lanes_with_pieces(opponent)
                if state.lanes[i].winner is None]

    # Rush - any non-won lane
    if perk_name == 'RUSH':
        return [i for i, l in enumerate(state.lanes) if l.winner is None]

    # Placement triggers (opponent's side, not won by us)
    if perk_name in ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE']:
        return [i for i, l in enumerate(state.lanes) if l.winner != player]

    # Your-side triggers (need your pieces)
    if perk_name in ['HYDRA', 'BACKFIRE', 'ABSORB', 'RETALIATE']:
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and l.pieces_for(player) > 0]

    # Enlist/Capture/Sanctuary/Ambush - non-won lane, not full for you
    if perk_name in ['ENLIST', 'CAPTURE', 'SANCTUARY', 'AMBUSH']:
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and not l.is_full_for(player)]

    # Raid - enemy side not full
    if perk_name == 'RAID':
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and not l.is_full_for(opponent)]

    # Nullify - lanes with triggers, deferred effects, or pending raids
    if perk_name == 'NULLIFY':
        raid_lanes = {r['lane'] for r in state.pending_raids}
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and (l.has_triggers() or l.has_deferred() or i in raid_lanes)]

    # Default: any non-won lane
    return [i for i, l in enumerate(state.lanes) if l.winner is None]


def get_all_moves(state, player) -> list[Move]:
    """
    Generate all valid (slot, target) combinations for current position.

    Args:
        state: Current game state
        player: Player to generate moves for

    Returns:
        List of (slot, target) tuples including 'pass'
    """
    moves: list[Move] = [('pass', None)]

    for slot, perk_name in state.offered_perks.items():
        targets = get_valid_targets_for_perk(state, player, perk_name)
        for target in targets:
            moves.append((slot, target))

    return moves


def simulate_perk_selection(state, move: Move):
    """
    Clone state and execute perk selection, then end turn.

    Args:
        state: Current game state
        move: (slot, target) tuple

    Returns:
        New state after move and turn switch
    """
    from src.game.rules import GameRules
    from src.perks.base import execute_perk

    new_state = state.clone()
    slot, target = move
    player = new_state.current_player

    if slot != 'pass':
        perk_name = new_state.offered_perks.get(slot)
        if perk_name:
            success, _ = execute_perk(new_state, player, perk_name, target)
            if success:
                new_state.record_slot_usage(slot, player)
                new_state.record_perk_usage(perk_name, player)

    # Check lane wins after perk
    for i in range(len(new_state.lanes)):
        if new_state.lanes[i].winner is None:
            GameRules.check_lane_win(new_state, i, player)

    # Check game over
    new_state.check_game_over()

    # Switch player (handles duration decrements)
    if not new_state.game_over:
        new_state.switch_player()

    return new_state


def simulate_auto_placement(state, lane: int):
    """
    Clone state and simulate auto-placement on specific lane.

    Args:
        state: Current game state (in AUTO_PLACEMENT phase)
        lane: Lane to place on

    Returns:
        New state after placement with offered perks
    """
    from src.game.rules import GameRules
    from src.game.state import TurnPhase
    from src.perks.triggers import fire_placement_triggers
    from src.perks.deferred import process_pending_raids, process_deferred_effects

    new_state = state.clone()
    player = new_state.current_player

    # Process pending raids
    process_pending_raids(new_state, player)

    # Process deferred effects
    process_deferred_effects(new_state, player)

    # Check lane wins after deferred
    for i in range(len(new_state.lanes)):
        if new_state.lanes[i].winner is None:
            GameRules.check_lane_win(new_state, i, player)

    # Check game over
    if new_state.check_game_over():
        return new_state

    # Do the auto-placement
    if new_state.lanes[lane].winner is None and not new_state.lanes[lane].is_full_for(player):
        new_state.lanes[lane].add_piece(player)
        new_state.auto_placed_lane = lane

        # Fire placement triggers
        fire_placement_triggers(new_state, lane, player)

        # Check lane win
        GameRules.check_lane_win(new_state, lane, player)

        # Check game over
        if new_state.check_game_over():
            return new_state

    # Move to perk selection phase and offer perks
    new_state.turn_phase = TurnPhase.PERK_SELECTION

    # Offer perks (simplified version)
    for slot in [1, 2, 3, 4]:
        available = GameRules.get_available_perks(new_state, player, slot)
        if available:
            if slot in [3, 4]:
                perk = new_state.rng.choice(available)
            else:
                perk = available[0]
            new_state.offered_perks[slot] = perk

    return new_state


def terminal_score(state, player) -> float:
    """Score for game-over states."""
    if state.winner == player:
        return 10000.0
    elif state.winner == player.opponent():
        return -10000.0
    return 0.0  # Draw


def _evaluate_trigger(trigger_type, my_pieces, their_pieces, slots_per_side,
                      expected_firings, profile: MinimaxProfile) -> float:
    """Compute effect value for a trigger scaled by expected firings and board context.

    When a trigger would cause or approach a lane win, value it at lane-win scale
    (near_win_bonus) rather than piece scale (piece_advantage_mult). This makes
    triggers on contested lanes competitive with direct piece placement.

    Args:
        trigger_type: Type of trigger
        my_pieces: Trigger owner's pieces on this lane
        their_pieces: Opponent's pieces on this lane
        slots_per_side: Max pieces per side
        expected_firings: Expected number of times this trigger fires (remaining / n_open_lanes)
        profile: MinimaxProfile with tunable weights
    """
    near_win = slots_per_side - 1

    near_threat = slots_per_side - 2

    if trigger_type in (TriggerType.TRAP, TriggerType.PORTAL):
        # Removes/redirects opponent's placed piece.
        # Value scales with how critical the denial is.
        if their_pieces >= near_win:
            effect_value = profile.near_win_bonus
        elif their_pieces >= near_threat:
            effect_value = profile.near_threat_bonus
        else:
            effect_value = their_pieces * profile.trigger_trap_portal_mult
    elif trigger_type == TriggerType.MIRROR:
        # Places +2 on same lane. Value based on resulting board position.
        after_fire = my_pieces + 2
        if after_fire >= slots_per_side:
            effect_value = profile.near_win_bonus
        elif after_fire >= near_win:
            effect_value = profile.near_win_bonus * 0.5
        elif after_fire >= near_threat:
            effect_value = profile.near_threat_bonus
        else:
            effect_value = profile.trigger_mirror_value * after_fire / slots_per_side
    elif trigger_type in (TriggerType.ECHO, TriggerType.HYDRA):
        # Places +2 pieces on random lanes
        effect_value = profile.trigger_echo_hydra_value
    elif trigger_type in (TriggerType.SHOCKWAVE, TriggerType.BACKFIRE):
        # Removes 2 enemy pieces elsewhere
        effect_value = profile.trigger_shockwave_backfire_value
    elif trigger_type == TriggerType.ABSORB:
        # Recovers 1 removed piece on random lane
        effect_value = profile.trigger_absorb_value
    elif trigger_type == TriggerType.RETALIATE:
        # Places 1 piece on enemy side
        effect_value = profile.trigger_retaliate_value
    else:
        effect_value = profile.trigger_default_value
    return effect_value * expected_firings


def _evaluate_deferred(d_type, profile: MinimaxProfile) -> float:
    """Compute base value for a deferred effect (before delay discount)."""
    if d_type == DeferredType.SIGNAL:
        return profile.deferred_signal_value
    elif d_type == DeferredType.ENLIST:
        return profile.deferred_enlist_value
    elif d_type == DeferredType.AMBUSH:
        return profile.deferred_ambush_value
    elif d_type == DeferredType.REINFORCE:
        return profile.deferred_reinforce_value
    elif d_type == DeferredType.RAID:
        return profile.deferred_raid_value
    return profile.deferred_default_value


def evaluate_board_state(state, player, profile: MinimaxProfile = None) -> float:
    """
    Evaluate board position for expectimax.
    Higher = better for player.

    Args:
        state: Current game state
        player: Player to evaluate for
        profile: MinimaxProfile with tunable weights (uses defaults if None)

    Returns:
        Position evaluation score
    """
    if profile is None:
        profile = _DEFAULT_PROFILE

    opponent = player.opponent()
    score = 0.0

    # Lane wins (heavily weighted)
    my_lanes = state.lanes_won_by(player)
    their_lanes = state.lanes_won_by(opponent)
    score += my_lanes * profile.lane_win_weight
    score -= their_lanes * profile.lane_win_weight

    # If close to winning/losing, adjust urgency
    lanes_to_win = state.config.LANES_TO_WIN
    if my_lanes == lanes_to_win - 1:
        score += profile.near_game_win_bonus
    if their_lanes == lanes_to_win - 1:
        score -= profile.near_game_win_bonus

    slots_per_side = state.config.SLOTS_PER_SIDE
    near_win = slots_per_side - 1
    near_threat = slots_per_side - 2

    # Count non-won lanes for trigger expected firings
    n_open_lanes = max(1, sum(1 for l in state.lanes if l.winner is None))

    for i, lane in enumerate(state.lanes):
        if lane.winner is not None:
            continue

        my_pieces = lane.pieces_for(player)
        their_pieces = lane.pieces_for(opponent)

        # Piece advantage per lane
        score += (my_pieces - their_pieces) * profile.piece_advantage_mult

        # Near-win positions (one away from winning lane)
        if my_pieces >= near_win:
            score += profile.near_win_bonus
        elif my_pieces >= near_threat:
            score += profile.near_threat_bonus

        if their_pieces >= near_win:
            score -= profile.near_win_bonus
        elif their_pieces >= near_threat:
            score -= profile.near_threat_bonus

        # Trigger value — expected firings scaled by board context + targeting bias
        for trigger in lane.triggers:
            remaining = trigger.get('turns', 1)
            # Geometric probability: chance of at least one placement here over remaining turns
            base_prob = 1.0 - (1.0 - 1.0 / n_open_lanes) ** remaining

            # Targeting bias: opponent targets high-value lanes, not uniform
            # Removal triggers (HYDRA, BACKFIRE, ABSORB): opponent removes where YOU have pieces
            # Placement triggers: opponent places where THEY have pieces
            t_type = trigger['type']
            if t_type in (TriggerType.HYDRA, TriggerType.BACKFIRE, TriggerType.ABSORB):
                relevance = my_pieces / max(1, slots_per_side)
            else:
                relevance = their_pieces / max(1, slots_per_side)

            # How contested is this lane (0.0 = empty, 1.0 = nearly full on both sides)
            contestedness = (my_pieces + their_pieces) / (2.0 * slots_per_side)

            # Boost expected firings on contested lanes
            tactical_prob = base_prob * (1.0 + relevance * (profile.trigger_targeting_bias - 1.0))
            expected_firings = tactical_prob + contestedness * (1.0 - tactical_prob) * profile.trigger_contest_boost
            # Clamp to [0, 1] since it's a probability-like weight
            expected_firings = min(1.0, expected_firings)

            if trigger['owner'] == player:
                score += _evaluate_trigger(t_type, my_pieces, their_pieces,
                                           slots_per_side, expected_firings, profile)
            else:
                score -= _evaluate_trigger(t_type, their_pieces, my_pieces,
                                           slots_per_side, expected_firings, profile)

        # Deferred effects value
        for deferred in lane.deferred:
            d_type = deferred['type']
            # SIGNAL resolves in 1 turn — use gentler discount
            if d_type == DeferredType.SIGNAL:
                discount = (1.0 + profile.deferred_discount) / 2
            else:
                discount = profile.deferred_discount
            value = _evaluate_deferred(d_type, profile) * discount
            if deferred['owner'] == player:
                score += value
            else:
                score -= value

        # Freeze value — scaled by how threatening the frozen lane is
        if lane.is_frozen_for(opponent):
            # Blocking value: freeze stops opponent's progress
            if their_pieces >= near_win:
                score += profile.freeze_near_win
            elif their_pieces >= near_threat:
                score += profile.freeze_near_threat
            else:
                score += profile.freeze_base
            # Protection value: freeze protects YOUR near-win lane from disruption
            if my_pieces >= near_win:
                score += profile.freeze_protect_near_win
            elif my_pieces >= near_threat:
                score += profile.freeze_protect_near_win * 0.4
        if lane.is_frozen_for(player):
            if my_pieces >= near_win:
                score -= profile.freeze_near_win
            elif my_pieces >= near_threat:
                score -= profile.freeze_near_threat
            else:
                score -= profile.freeze_base
            # Opponent's protection value from freezing your lane
            if their_pieces >= near_win:
                score -= profile.freeze_protect_near_win
            elif their_pieces >= near_threat:
                score -= profile.freeze_protect_near_win * 0.4

    # Global effects value
    if state.is_cloaked(player):
        score += profile.cloak_value
    if state.is_blinded(opponent):
        score += profile.blind_value
    if state.is_cloaked(opponent):
        score -= profile.cloak_value
    if state.is_blinded(player):
        score -= profile.blind_value

    # Pending raids value
    for raid in state.pending_raids:
        turns_left = raid.get('turns_until_resolve', 0)
        discount = profile.raid_discount_base ** max(0, turns_left)
        raid_value = profile.raid_pending_value * discount
        if raid['owner'] == player:
            score += raid_value
        else:
            score -= raid_value

    # Sanctuary value — scaled by how many pieces are at risk
    my_total_pieces = sum(lane.pieces_for(player) for lane in state.lanes if lane.winner is None)
    opp_total_pieces = sum(lane.pieces_for(opponent) for lane in state.lanes if lane.winner is None)
    my_risk_factor = min(2.0, max(0.5, my_total_pieces / max(1, slots_per_side)))
    opp_risk_factor = min(2.0, max(0.5, opp_total_pieces / max(1, slots_per_side)))
    p_sanctuaries = state.player1_sanctuaries if player == Player.PLAYER1 else state.player2_sanctuaries
    o_sanctuaries = state.player2_sanctuaries if player == Player.PLAYER1 else state.player1_sanctuaries
    score += sum(profile.sanctuary_value * my_risk_factor for _, turns in p_sanctuaries if turns > 0)
    score -= sum(profile.sanctuary_value * opp_risk_factor for _, turns in o_sanctuaries if turns > 0)

    # Capture value — count active instances
    p_captures = state.player1_captures if player == Player.PLAYER1 else state.player2_captures
    o_captures = state.player2_captures if player == Player.PLAYER1 else state.player1_captures
    score += sum(profile.capture_value for _, turns in p_captures if turns > 0)
    score -= sum(profile.capture_value for _, turns in o_captures if turns > 0)

    return score


_DEFAULT_PROFILE = MinimaxProfile(name='minimax-v1')


def expectimax(state, depth: int, alpha: float, beta: float,
               node_type: NodeType, root_player, profile: MinimaxProfile = None) -> SearchResult:
    """
    Expectimax search with alpha-beta pruning on MAX/MIN nodes.

    Args:
        state: Current game state
        depth: Remaining search depth
        alpha, beta: Pruning bounds (only used for MAX/MIN)
        node_type: Type of current node
        root_player: The player we're optimizing for

    Returns:
        SearchResult with score and best move (if applicable)
    """
    if profile is None:
        profile = _DEFAULT_PROFILE

    # Terminal: game over
    if state.game_over:
        return SearchResult(terminal_score(state, root_player))

    # Terminal: depth exhausted
    if depth <= 0:
        return SearchResult(evaluate_board_state(state, root_player, profile))

    if node_type == NodeType.CHANCE:
        return _expectimax_chance(state, depth, alpha, beta, root_player, profile)
    elif node_type == NodeType.MAX:
        return _expectimax_max(state, depth, alpha, beta, root_player, profile)
    else:  # MIN
        return _expectimax_min(state, depth, alpha, beta, root_player, profile)


def _expectimax_chance(state, depth: int, alpha: float, beta: float,
                       root_player, profile: MinimaxProfile) -> SearchResult:
    """Handle random auto-placement by averaging over possible lanes."""
    from src.game.rules import GameRules
    from src.game.state import TurnPhase

    player = state.current_player
    available_lanes = GameRules.get_valid_placement_lanes(state, player)

    if not available_lanes:
        # No valid lanes - skip directly to perk selection
        # Create a state that's in perk selection phase
        new_state = state.clone()
        new_state.turn_phase = TurnPhase.PERK_SELECTION
        # Offer perks
        for slot in [1, 2, 3, 4]:
            available = GameRules.get_available_perks(new_state, player, slot)
            if available:
                if slot in [3, 4]:
                    perk = new_state.rng.choice(available)
                else:
                    perk = available[0]
                new_state.offered_perks[slot] = perk

        next_type = NodeType.MAX if player == root_player else NodeType.MIN
        return expectimax(new_state, depth, alpha, beta, next_type, root_player, profile)

    # Average over all possible auto-placement lanes
    total_score = 0.0
    for lane in available_lanes:
        child = simulate_auto_placement(state, lane)

        if child.game_over:
            total_score += terminal_score(child, root_player)
        else:
            # After auto-placement, it's perk selection time
            next_type = NodeType.MAX if child.current_player == root_player else NodeType.MIN
            result = expectimax(child, depth, alpha, beta, next_type, root_player, profile)
            total_score += result.score

    avg_score = total_score / len(available_lanes)
    return SearchResult(avg_score, None)


def _expectimax_max(state, depth: int, alpha: float, beta: float,
                    root_player, profile: MinimaxProfile) -> SearchResult:
    """Maximize: current player chooses best perk."""
    max_score = float('-inf')
    best_move: Move = ('pass', None)

    moves = get_all_moves(state, state.current_player)

    # Move ordering: try likely good moves first for better pruning
    # PlaceAnother and RemoveEnemy are usually valuable
    def move_priority(m: Move) -> int:
        slot, _ = m
        if slot == 1:  # PlaceAnother
            return 0
        elif slot == 2:  # RemoveEnemy
            return 1
        elif slot in [3, 4]:
            return 2
        return 3  # pass

    moves.sort(key=move_priority)

    for move in moves:
        child = simulate_perk_selection(state, move)

        if child.game_over:
            score = terminal_score(child, root_player)
        else:
            # After perk selection, opponent's turn starts with CHANCE
            result = expectimax(child, depth - 1, alpha, beta, NodeType.CHANCE, root_player, profile)
            score = result.score

        if score > max_score:
            max_score = score
            best_move = move

        alpha = max(alpha, score)
        if beta <= alpha:
            break  # Prune

    return SearchResult(max_score, best_move)


def _expectimax_min(state, depth: int, alpha: float, beta: float,
                    root_player, profile: MinimaxProfile) -> SearchResult:
    """Minimize: opponent chooses move that's worst for us."""
    min_score = float('inf')
    best_move: Move = ('pass', None)

    moves = get_all_moves(state, state.current_player)

    # Move ordering for opponent too
    def move_priority(m: Move) -> int:
        slot, _ = m
        if slot == 1:
            return 0
        elif slot == 2:
            return 1
        elif slot in [3, 4]:
            return 2
        return 3

    moves.sort(key=move_priority)

    for move in moves:
        child = simulate_perk_selection(state, move)

        if child.game_over:
            score = terminal_score(child, root_player)
        else:
            # After perk selection, our turn starts with CHANCE
            result = expectimax(child, depth - 1, alpha, beta, NodeType.CHANCE, root_player, profile)
            score = result.score

        if score < min_score:
            min_score = score
            best_move = move

        beta = min(beta, score)
        if beta <= alpha:
            break  # Prune

    return SearchResult(min_score, best_move)


class ExpectimaxAI:
    """Expectimax AI player with configurable depth."""

    def __init__(self, depth: int = 2, profile: MinimaxProfile = None):
        """
        Initialize expectimax AI.

        Args:
            depth: Search depth (number of full turns to look ahead)
            profile: MinimaxProfile for evaluation weights (uses default if None)
        """
        self.depth = depth
        self.profile = profile or _DEFAULT_PROFILE
        self._last_evaluation: Optional[dict] = None

    def choose_move(self, state) -> Move:
        """
        Choose best move using expectimax search.

        Args:
            state: Current game state (should be in PERK_SELECTION phase)

        Returns:
            (slot, target) tuple
        """
        if state.game_over:
            self._last_evaluation = {'pass': {'perk': None, 'score': 0, 'target': None}}
            return ('pass', None)

        # Get all moves and evaluate each for logging
        player = state.current_player
        moves = get_all_moves(state, player)
        evaluations = {}

        # Evaluate each move individually for logging purposes
        best_score = float('-inf')
        best_move: Move = ('pass', None)

        for move in moves:
            slot, target = move
            child = simulate_perk_selection(state, move)

            if child.game_over:
                score = terminal_score(child, player)
            else:
                result = expectimax(
                    child,
                    depth=self.depth - 1,
                    alpha=float('-inf'),
                    beta=float('inf'),
                    node_type=NodeType.CHANCE,
                    root_player=player,
                    profile=self.profile
                )
                score = result.score

            # Get perk name for this slot
            perk_name = state.offered_perks.get(slot, 'PASS') if slot != 'pass' else 'PASS'

            evaluations[str(slot)] = {
                'perk': perk_name,
                'score': round(score, 2),
                'target': target
            }

            if score > best_score:
                best_score = score
                best_move = move

        self._last_evaluation = evaluations
        return best_move if best_move else ('pass', None)

    def get_last_evaluation(self) -> Optional[dict]:
        """
        Get the evaluation data from the last decision.

        Returns:
            Dict mapping slot -> {perk, score, target} or None if no evaluation yet
        """
        return self._last_evaluation


def create_expectimax_ai(depth: int, profile: MinimaxProfile = None):
    """
    Factory function for expectimax AI.

    Args:
        depth: Search depth
        profile: MinimaxProfile for evaluation weights (uses default if None)

    Returns:
        AI function compatible with GameEngine with .get_last_evaluation() method
    """
    ai = ExpectimaxAI(depth, profile=profile)

    def ai_function(state) -> Move:
        return ai.choose_move(state)

    ai_function.get_last_evaluation = ai.get_last_evaluation
    ai_function.ai_type = f'minimax{depth}'

    return ai_function


# Preset difficulty levels with persistent instances for evaluation tracking
_expectimax_d1 = ExpectimaxAI(depth=1)
_expectimax_d2 = ExpectimaxAI(depth=2)
_expectimax_d3 = ExpectimaxAI(depth=3)


def expectimax_depth1(state) -> Move:
    """Expectimax AI with depth 1."""
    return _expectimax_d1.choose_move(state)


expectimax_depth1.get_last_evaluation = _expectimax_d1.get_last_evaluation
expectimax_depth1.ai_type = 'minimax1'


def expectimax_depth2(state) -> Move:
    """Expectimax AI with depth 2."""
    return _expectimax_d2.choose_move(state)


expectimax_depth2.get_last_evaluation = _expectimax_d2.get_last_evaluation
expectimax_depth2.ai_type = 'minimax2'


def expectimax_depth3(state) -> Move:
    """Expectimax AI with depth 3."""
    return _expectimax_d3.choose_move(state)


expectimax_depth3.get_last_evaluation = _expectimax_d3.get_last_evaluation
expectimax_depth3.ai_type = 'minimax3'
