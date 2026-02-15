"""Lane scoring heuristics for AI decision making."""

from typing import TYPE_CHECKING
from enum import Enum, auto

if TYPE_CHECKING:
    from ..game.state import GameState, Player, LaneState


class Difficulty(Enum):
    """AI difficulty levels."""
    EASY = auto()
    MEDIUM = auto()
    HARD = auto()


# Scoring weights by difficulty
WEIGHTS = {
    Difficulty.EASY: {
        'win_lane': 60,           # About to win a lane (have 4 pieces)
        'block_opponent': 30,     # Opponent about to win (they have 4)
        'advance_position': 10,   # General piece advancement
        'trigger_potential': 5,   # Lane has useful triggers
        'random_noise': 20,       # Random factor (0 to this value)
    },
    Difficulty.MEDIUM: {
        'win_lane': 100,
        'block_opponent': 80,
        'advance_position': 15,
        'trigger_potential': 10,
        'random_noise': 10,
    },
    Difficulty.HARD: {
        'win_lane': 120,
        'block_opponent': 100,
        'advance_position': 20,
        'trigger_potential': 15,
        'random_noise': 2,
        'multiple_threat_bonus': 50,  # Bonus for creating multiple threats
    },
}


def score_lane_for_placement(state: 'GameState', player: 'Player',
                              lane_idx: int, difficulty: Difficulty) -> float:
    """
    Score a lane for piece placement.
    Higher score = better lane to place on.

    Args:
        state: Current game state
        player: Player making the decision
        lane_idx: Lane to evaluate
        difficulty: AI difficulty level

    Returns:
        Score for this lane
    """
    lane = state.lanes[lane_idx]
    opponent = player.opponent()
    weights = WEIGHTS[difficulty]

    if lane.winner is not None:
        return -1000  # Can't place on won lane

    if lane.is_frozen_for(player):
        return -1000  # Can't place on frozen lane

    if lane.is_full_for(player):
        return -1000  # Lane is full

    score = 0.0
    my_pieces = lane.pieces_for(player)
    their_pieces = lane.pieces_for(opponent)

    near_win = state.config.SLOTS_PER_SIDE - 1

    # Win lane opportunity (one piece away from filling lane)
    if my_pieces == near_win:
        score += weights['win_lane']

    # Block opponent (they're one piece away from filling)
    if their_pieces == near_win:
        score += weights['block_opponent']

    # General position advancement
    score += my_pieces * weights['advance_position']

    # Trigger potential (if we have triggers set up here)
    if lane.has_triggers():
        for trigger in lane.triggers:
            if trigger['owner'] == player:
                score += weights['trigger_potential']

    # Random noise for variety
    if weights['random_noise'] > 0:
        score += state.rng.random() * weights['random_noise']

    # Hard mode: multiple threat detection
    if difficulty == Difficulty.HARD and 'multiple_threat_bonus' in weights:
        # Count lanes where we have significant presence
        near_threat = state.config.SLOTS_PER_SIDE - 2
        threat_lanes = sum(1 for l in state.lanes
                          if l.winner is None and l.pieces_for(player) >= near_threat)
        if threat_lanes >= 2:
            score += weights['multiple_threat_bonus']

    return score


def score_lane_for_removal(state: 'GameState', player: 'Player',
                           lane_idx: int, difficulty: Difficulty) -> float:
    """
    Score a lane for enemy piece removal.
    Higher score = better lane to remove from.

    Args:
        state: Current game state
        player: Player making the decision
        lane_idx: Lane to evaluate
        difficulty: AI difficulty level

    Returns:
        Score for this lane
    """
    lane = state.lanes[lane_idx]
    opponent = player.opponent()
    weights = WEIGHTS[difficulty]

    if lane.winner is not None:
        return -1000

    their_pieces = lane.pieces_for(opponent)
    if their_pieces == 0:
        return -1000  # No pieces to remove

    score = 0.0

    near_win = state.config.SLOTS_PER_SIDE - 1

    # High priority: opponent about to win
    if their_pieces >= near_win:
        score += weights['block_opponent'] * 1.5

    # Good target: opponent has significant presence
    score += their_pieces * weights['advance_position']

    # Consider capture effect (capture is now global, any removal goes to capture zone)
    capture_lane = state.get_capture_lane(player)
    if capture_lane is not None:
        score += 30  # Bonus for having capture active (removed pieces become ours)

    # Random noise
    if weights['random_noise'] > 0:
        score += state.rng.random() * weights['random_noise']

    return score


def evaluate_board_state(state: 'GameState', player: 'Player') -> float:
    """
    Evaluate overall board position for a player.
    Used for lookahead evaluation.

    Args:
        state: Current game state
        player: Player to evaluate for

    Returns:
        Position evaluation score (higher = better for player)
    """
    opponent = player.opponent()
    score = 0.0

    # Count lanes won
    my_lanes = state.lanes_won_by(player)
    their_lanes = state.lanes_won_by(opponent)
    score += my_lanes * 100
    score -= their_lanes * 100

    # Evaluate piece advantage on each lane
    for lane in state.lanes:
        if lane.winner is None:
            my_pieces = lane.pieces_for(player)
            their_pieces = lane.pieces_for(opponent)

            # Piece difference on this lane
            score += (my_pieces - their_pieces) * 5

            near_win = state.config.SLOTS_PER_SIDE - 1

            # Near-win bonus
            if my_pieces >= near_win:
                score += 30
            if their_pieces >= near_win:
                score -= 30

    return score


def get_best_placement_lane(state: 'GameState', player: 'Player',
                            difficulty: Difficulty) -> int | None:
    """
    Get the best lane for placing a piece.

    Args:
        state: Current game state
        player: Player making the decision
        difficulty: AI difficulty level

    Returns:
        Best lane index, or None if no valid lanes
    """
    from src.game.rules import GameRules

    valid_lanes = GameRules.get_valid_placement_lanes(state, player)
    if not valid_lanes:
        return None

    # Score each lane
    lane_scores = [
        (lane, score_lane_for_placement(state, player, lane, difficulty))
        for lane in valid_lanes
    ]

    # Easy mode: sometimes ignore best option
    if difficulty == Difficulty.EASY and state.rng.random() < 0.3:
        return state.rng.choice(valid_lanes)

    # Pick best scoring lane
    best_lane, _ = max(lane_scores, key=lambda x: x[1])
    return best_lane


def avg_placement_score(state: 'GameState', player: 'Player',
                        difficulty: Difficulty) -> float:
    """Average placement score across valid lanes (for random-target perks)."""
    from src.game.rules import GameRules
    valid = GameRules.get_valid_placement_lanes(state, player)
    if not valid:
        return 0.0
    return sum(score_lane_for_placement(state, player, l, difficulty) for l in valid) / len(valid)


def avg_removal_score(state: 'GameState', player: 'Player',
                      difficulty: Difficulty) -> float:
    """Average removal score across valid lanes (for random-target perks)."""
    from src.game.rules import GameRules
    valid = GameRules.get_valid_removal_lanes(state, player)
    if not valid:
        return 0.0
    return sum(score_lane_for_removal(state, player, l, difficulty) for l in valid) / len(valid)


def get_best_removal_lane(state: 'GameState', player: 'Player',
                          difficulty: Difficulty) -> int | None:
    """
    Get the best lane for removing an enemy piece.

    Args:
        state: Current game state
        player: Player making the decision
        difficulty: AI difficulty level

    Returns:
        Best lane index, or None if no valid lanes
    """
    from src.game.rules import GameRules

    valid_lanes = GameRules.get_valid_removal_lanes(state, player)
    if not valid_lanes:
        return None

    # Score each lane
    lane_scores = [
        (lane, score_lane_for_removal(state, player, lane, difficulty))
        for lane in valid_lanes
    ]

    # Easy mode: sometimes pick randomly
    if difficulty == Difficulty.EASY and state.rng.random() < 0.3:
        return state.rng.choice(valid_lanes)

    # Pick best scoring lane
    best_lane, _ = max(lane_scores, key=lambda x: x[1])
    return best_lane
