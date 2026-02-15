"""AI module for game strategy and decision making."""

from .heuristics import Difficulty
from .strategy import (
    AIPlayer,
    create_ai_function,
    easy_ai,
    medium_ai,
    hard_ai,
    random_ai
)
from .profiles import (
    HeuristicProfile,
    PROFILES,
    get_profile,
    MinimaxProfile,
    MINIMAX_PROFILES,
    get_minimax_profile,
)

# Import expectimax directly (minimax uses lazy imports internally to avoid circular deps)
from .minimax import (
    ExpectimaxAI,
    create_expectimax_ai,
    expectimax_depth1,
    expectimax_depth2,
    expectimax_depth3,
)

__all__ = [
    # Heuristic AI
    'Difficulty',
    'AIPlayer',
    'create_ai_function',
    'easy_ai',
    'medium_ai',
    'hard_ai',
    'random_ai',
    # Profiles
    'HeuristicProfile',
    'PROFILES',
    'get_profile',
    'MinimaxProfile',
    'MINIMAX_PROFILES',
    'get_minimax_profile',
    # Expectimax AI
    'ExpectimaxAI',
    'create_expectimax_ai',
    'expectimax_depth1',
    'expectimax_depth2',
    'expectimax_depth3',
]
