"""Profile parameter optimizer module."""

from .bounds import ParameterBounds
from .fitness import FitnessResult, evaluate_profile, compute_fitness
from .genetic import Individual, GeneticOptimizer
from .cmaes import CMAESOptimizer
from .results import save_results, load_best_profile
from .minimax_bounds import MinimaxParameterBounds
from .minimax_fitness import MinimaxFitnessResult, evaluate_minimax_profile, compute_minimax_fitness
from .minimax_cmaes import MinimaxCMAESOptimizer
from .pool_swap import (
    PoolConfig,
    SwapEvalResult,
    compute_pool_swap_score,
    evaluate_pool_config,
    generate_all_single_swaps,
    generate_cumulative_swaps,
    load_program,
    PoolSwapOptimizer,
)
from .pool_reshuffle import ReshuffleOptimizer
from .competitiveness import (
    DecisionCollector,
    PerkDecisionRecord,
    PerkCompetitivenessReport,
    run_data_collection,
    analyze_decisions,
    generate_balanced_configs,
)

__all__ = [
    'ParameterBounds',
    'FitnessResult',
    'evaluate_profile',
    'compute_fitness',
    'Individual',
    'GeneticOptimizer',
    'CMAESOptimizer',
    'save_results',
    'load_best_profile',
    # Minimax optimizer
    'MinimaxParameterBounds',
    'MinimaxFitnessResult',
    'evaluate_minimax_profile',
    'compute_minimax_fitness',
    'MinimaxCMAESOptimizer',
    # Pool swap optimizer
    'PoolConfig',
    'SwapEvalResult',
    'compute_pool_swap_score',
    'evaluate_pool_config',
    'generate_all_single_swaps',
    'generate_cumulative_swaps',
    'load_program',
    'PoolSwapOptimizer',
    # Pool reshuffle optimizer
    'ReshuffleOptimizer',
    # Competitiveness analysis
    'DecisionCollector',
    'PerkDecisionRecord',
    'PerkCompetitivenessReport',
    'run_data_collection',
    'analyze_decisions',
    'generate_balanced_configs',
]
