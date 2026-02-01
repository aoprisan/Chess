"""Expectimax AI with alpha-beta pruning for decision-theoretic planning."""

from enum import Enum, auto
from dataclasses import dataclass
from typing import Optional, Union
from itertools import combinations

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
            # Swap between two of your lanes with pieces
            my_lanes = state.get_lanes_with_pieces(player)
            if len(my_lanes) >= 2:
                return list(combinations(my_lanes, 2))
            return []
        elif perk_name == 'DISRUPT':
            # Swap between two enemy lanes with pieces
            enemy_lanes = state.get_lanes_with_pieces(opponent)
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

    # Sacrifice perks (your lane with pieces)
    if perk_name in ['SPLIT', 'KAMIKAZE', 'SCATTER']:
        return state.get_lanes_with_pieces(player)

    # Enemy pieces target
    if perk_name == 'DISPERSE':
        return state.get_lanes_with_pieces(opponent)

    # Rush - any non-won lane
    if perk_name == 'RUSH':
        return [i for i, l in enumerate(state.lanes) if l.winner is None]

    # Placement triggers (opponent's side, not won by us)
    if perk_name in ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE']:
        return [i for i, l in enumerate(state.lanes) if l.winner != player]

    # Your-side triggers (need your pieces)
    if perk_name in ['HYDRA', 'BACKFIRE', 'ABSORB', 'RETALIATE', 'ENLIST', 'CAPTURE']:
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and l.pieces_for(player) > 0]

    # Sanctuary - your available lane
    if perk_name == 'SANCTUARY':
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and not l.is_full_for(player)]

    # Ambush - any non-won lane not full for you
    if perk_name == 'AMBUSH':
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and not l.is_full_for(player)]

    # Raid - enemy side not full
    if perk_name == 'RAID':
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and not l.is_full_for(opponent)]

    # Nullify - lanes with triggers
    if perk_name == 'NULLIFY':
        return [i for i, l in enumerate(state.lanes)
                if l.winner is None and l.has_triggers()]

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
                new_state.record_slot_usage(slot)
                new_state.record_perk_usage(perk_name)

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


def evaluate_board_state(state, player) -> float:
    """
    Evaluate board position for expectimax.
    Higher = better for player.

    Args:
        state: Current game state
        player: Player to evaluate for

    Returns:
        Position evaluation score
    """
    opponent = player.opponent()
    score = 0.0

    # Lane wins (heavily weighted)
    my_lanes = state.lanes_won_by(player)
    their_lanes = state.lanes_won_by(opponent)
    score += my_lanes * 1000.0
    score -= their_lanes * 1000.0

    # If close to winning/losing, adjust urgency
    if my_lanes == 2:
        score += 300.0  # One lane from winning
    if their_lanes == 2:
        score -= 300.0  # One lane from losing

    for i, lane in enumerate(state.lanes):
        if lane.winner is not None:
            continue

        my_pieces = lane.pieces_for(player)
        their_pieces = lane.pieces_for(opponent)

        # Piece advantage per lane
        score += (my_pieces - their_pieces) * 20.0

        # Near-win positions (4 pieces = one away from winning lane)
        if my_pieces >= 4:
            score += 200.0
        elif my_pieces >= 3:
            score += 50.0

        if their_pieces >= 4:
            score -= 200.0
        elif their_pieces >= 3:
            score -= 50.0

        # Trigger value (our triggers on lanes opponent uses)
        for trigger in lane.triggers:
            if trigger['owner'] == player:
                score += 25.0  # Our triggers have potential value
            else:
                score -= 25.0  # Enemy triggers are threats

        # Freeze value
        if lane.is_frozen_for(opponent):
            score += 40.0
        if lane.is_frozen_for(player):
            score -= 40.0

    # Global effects value
    if state.is_cloaked(player):
        score += 30.0
    if state.is_blinded(opponent):
        score += 30.0
    if state.is_cloaked(opponent):
        score -= 30.0
    if state.is_blinded(player):
        score -= 30.0

    # Sanctuary/Capture value
    if state.has_sanctuary(player):
        score += 20.0
    if state.has_capture(player):
        score += 25.0

    return score


def expectimax(state, depth: int, alpha: float, beta: float,
               node_type: NodeType, root_player) -> SearchResult:
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
    # Terminal: game over
    if state.game_over:
        return SearchResult(terminal_score(state, root_player))

    # Terminal: depth exhausted
    if depth <= 0:
        return SearchResult(evaluate_board_state(state, root_player))

    if node_type == NodeType.CHANCE:
        return _expectimax_chance(state, depth, alpha, beta, root_player)
    elif node_type == NodeType.MAX:
        return _expectimax_max(state, depth, alpha, beta, root_player)
    else:  # MIN
        return _expectimax_min(state, depth, alpha, beta, root_player)


def _expectimax_chance(state, depth: int, alpha: float, beta: float,
                       root_player) -> SearchResult:
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
        return expectimax(new_state, depth, alpha, beta, next_type, root_player)

    # Average over all possible auto-placement lanes
    total_score = 0.0
    for lane in available_lanes:
        child = simulate_auto_placement(state, lane)

        if child.game_over:
            total_score += terminal_score(child, root_player)
        else:
            # After auto-placement, it's perk selection time
            next_type = NodeType.MAX if child.current_player == root_player else NodeType.MIN
            result = expectimax(child, depth, alpha, beta, next_type, root_player)
            total_score += result.score

    avg_score = total_score / len(available_lanes)
    return SearchResult(avg_score, None)


def _expectimax_max(state, depth: int, alpha: float, beta: float,
                    root_player) -> SearchResult:
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
            result = expectimax(child, depth - 1, alpha, beta, NodeType.CHANCE, root_player)
            score = result.score

        if score > max_score:
            max_score = score
            best_move = move

        alpha = max(alpha, score)
        if beta <= alpha:
            break  # Prune

    return SearchResult(max_score, best_move)


def _expectimax_min(state, depth: int, alpha: float, beta: float,
                    root_player) -> SearchResult:
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
            result = expectimax(child, depth - 1, alpha, beta, NodeType.CHANCE, root_player)
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

    def __init__(self, depth: int = 2):
        """
        Initialize expectimax AI.

        Args:
            depth: Search depth (number of full turns to look ahead)
        """
        self.depth = depth
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
                    root_player=player
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


def create_expectimax_ai(depth: int):
    """
    Factory function for expectimax AI.

    Args:
        depth: Search depth

    Returns:
        AI function compatible with GameEngine with .get_last_evaluation() method
    """
    ai = ExpectimaxAI(depth)

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
