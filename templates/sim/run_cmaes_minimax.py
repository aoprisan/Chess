#!/usr/bin/env python3
"""
CMA-ES minimax profile parameter optimizer CLI.

Uses Covariance Matrix Adaptation Evolution Strategy to search for
MinimaxProfile parameters that achieve target slot distribution and win rate
against minimax-v1 (default weights) opponent.

Usage:
    python run_cmaes_minimax.py                           # Default settings
    python run_cmaes_minimax.py --generations 100 --games 200
    python run_cmaes_minimax.py --sigma 0.2 --games 300   # Smaller step size
"""

import sys
import argparse
import warnings
from pathlib import Path

# Suppress cma's matplotlib warning
warnings.filterwarnings('ignore', message='Could not import matplotlib')

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from optimizer.minimax_cmaes import MinimaxCMAESOptimizer, format_minimax_profile_as_code
from optimizer.results import save_results


# =============================================================================
# OPTIMIZATION TARGETS - Edit these to change fitness criteria
# =============================================================================
SLOT3_TARGET = 25.0      # Minimum slot 3 usage percentage
SLOT4_TARGET = 25.0      # Minimum slot 4 usage percentage
WIN_RATE_TARGET = 0.65   # Minimum win rate vs minimax-v1, averaged P1+P2
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description='Optimize minimax AI profile parameters using CMA-ES',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Quick test run
    python run_cmaes_minimax.py --generations 5 --games 50

    # Standard optimization
    python run_cmaes_minimax.py --generations 100 --games 200

    # Thorough search with smaller steps
    python run_cmaes_minimax.py --generations 200 --games 300 --sigma 0.2
        """
    )

    parser.add_argument('--generations', type=int, default=100,
                        help='Max generations (default: 100)')
    parser.add_argument('--games', type=int, default=200,
                        help='Games per fitness evaluation (default: 200)')
    parser.add_argument('--sigma', type=float, default=0.3,
                        help='Initial step size in normalized space (default: 0.3)')
    parser.add_argument('--depth', type=int, default=1,
                        help='Minimax search depth for evaluation (default: 1)')
    parser.add_argument('--target', type=float, default=95.0,
                        help='Target fitness to stop early (default: 95.0)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed (default: 42)')
    parser.add_argument('--output', type=str, default='cmaes_minimax_results',
                        help='Output directory (default: cmaes_minimax_results)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')
    parser.add_argument('--code', action='store_true',
                        help='Print best profile as Python code')

    args = parser.parse_args()

    print("=" * 60)
    print("CMA-ES MINIMAX PROFILE OPTIMIZER")
    print("=" * 60)
    print(f"Fitness Targets:")
    print(f"  Slot 3:        >= {SLOT3_TARGET:.0f}%")
    print(f"  Slot 4:        >= {SLOT4_TARGET:.0f}%")
    print(f"  Win vs mm-v1:  >= {WIN_RATE_TARGET*100:.0f}% (avg P1+P2)")
    print(f"Settings:")
    print(f"  Generations:   {args.generations}")
    print(f"  Games/eval:    {args.games}")
    print(f"  Depth:         {args.depth}")
    print(f"  Sigma:         {args.sigma}")
    print(f"  Target:        {args.target}")
    print(f"  Seed:          {args.seed}")
    print(f"  Output:        {args.output}/")
    print("=" * 60)

    optimizer = MinimaxCMAESOptimizer(
        sigma=args.sigma,
        games_per_eval=args.games,
        seed=args.seed,
        depth=args.depth,
        slot3_target=SLOT3_TARGET,
        slot4_target=SLOT4_TARGET,
        win_target=WIN_RATE_TARGET
    )

    print(f"\nStarting CMA-ES minimax optimization...\n")
    best = optimizer.run(
        max_generations=args.generations,
        target_fitness=args.target,
        verbose=not args.quiet
    )

    print("\n" + "=" * 60)
    print("OPTIMIZATION COMPLETE")
    print("=" * 60)

    if best and best.fitness:
        f = best.fitness
        print(f"\nBest Result:")
        print(f"  Fitness Score: {f.fitness_score:.1f}/100")
        print(f"  Slot Usage:    [{f.slot1_pct:.1f}%, {f.slot2_pct:.1f}%, "
              f"{f.slot3_pct:.1f}%, {f.slot4_pct:.1f}%]")
        print(f"  Win Rate vs mm-v1: {f.win_rate*100:.1f}%")
        print(f"  Meets Criteria: {'YES' if f.meets_criteria(SLOT3_TARGET, SLOT4_TARGET, WIN_RATE_TARGET) else 'NO'}")

        print(f"\nTarget Check:")
        print(f"  Slot 3 >= {SLOT3_TARGET:.0f}%: {'PASS' if f.slot3_pct >= SLOT3_TARGET else f'FAIL ({f.slot3_pct:.1f}%)'}")
        print(f"  Slot 4 >= {SLOT4_TARGET:.0f}%: {'PASS' if f.slot4_pct >= SLOT4_TARGET else f'FAIL ({f.slot4_pct:.1f}%)'}")
        print(f"  Win >= {WIN_RATE_TARGET*100:.0f}%:    {'PASS' if f.win_rate >= WIN_RATE_TARGET else f'FAIL ({f.win_rate*100:.1f}%)'}")

    saved_files = save_results(optimizer, args.output)
    print(f"\nResults saved to:")
    for name, path in saved_files.items():
        if path:
            print(f"  {name}: {path}")

    if args.code and best:
        print("\n" + "=" * 60)
        print("PROFILE CODE (add to profiles.py)")
        print("=" * 60)
        print(format_minimax_profile_as_code(best.params, name='minimax-v2'))

    stats = optimizer.get_statistics()
    print(f"\nStatistics:")
    print(f"  Generations run: {stats.get('generations_run', 0)}")
    print(f"  Best generation: {stats.get('best_generation', 0)}")
    print(f"  Population size: {optimizer.pop_size} (auto-selected by CMA-ES)")

    return 0 if (best and best.fitness and best.fitness.meets_criteria(SLOT3_TARGET, SLOT4_TARGET, WIN_RATE_TARGET)) else 1


if __name__ == '__main__':
    sys.exit(main())
