#!/usr/bin/env python3
"""
Profile parameter optimizer CLI.

Searches for HeuristicProfile parameters that achieve the targets defined
in the OPTIMIZATION TARGETS section below.

Usage:
    python run_optimizer.py                           # Default settings
    python run_optimizer.py --population 30 --generations 100
    python run_optimizer.py --games 100 --generations 5  # Quick test
"""

import sys
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from optimizer import GeneticOptimizer, save_results, ParameterBounds
from optimizer.results import format_profile_as_code


# =============================================================================
# OPTIMIZATION TARGETS - Edit these to change fitness criteria
# =============================================================================
SLOT3_TARGET = 28.0      # Minimum slot 3 usage percentage
SLOT4_TARGET = 28.0      # Minimum slot 4 usage percentage
WIN_RATE_TARGET = 0.8   # Minimum win rate vs v1 (0.65 = 65%)
# =============================================================================


def main():
    parser = argparse.ArgumentParser(
        description='Optimize AI profile parameters using genetic algorithm',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Quick test run
    python run_optimizer.py --population 5 --generations 3 --games 50

    # Standard optimization
    python run_optimizer.py --population 20 --generations 50 --games 200

    # Thorough search
    python run_optimizer.py --population 30 --generations 100 --games 300
        """
    )

    parser.add_argument('--population', type=int, default=20,
                        help='Population size (default: 20)')
    parser.add_argument('--generations', type=int, default=50,
                        help='Max generations (default: 50)')
    parser.add_argument('--games', type=int, default=200,
                        help='Games per fitness evaluation (default: 200)')
    parser.add_argument('--target', type=float, default=95.0,
                        help='Target fitness to stop early (default: 95.0)')
    parser.add_argument('--elite', type=int, default=4,
                        help='Elite count preserved each generation (default: 4)')
    parser.add_argument('--mutation-rate', type=float, default=0.3,
                        help='Probability of mutating each parameter (default: 0.3)')
    parser.add_argument('--mutation-strength', type=float, default=0.15,
                        help='Mutation noise scale relative to range (default: 0.15)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed (default: 42)')
    parser.add_argument('--output', type=str, default='optimizer_results',
                        help='Output directory (default: optimizer_results)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')
    parser.add_argument('--code', action='store_true',
                        help='Print best profile as Python code')

    args = parser.parse_args()

    print("=" * 60)
    print("PROFILE PARAMETER OPTIMIZER")
    print("=" * 60)
    print(f"Fitness Targets:")
    print(f"  Slot 3:        >= {SLOT3_TARGET:.0f}%")
    print(f"  Slot 4:        >= {SLOT4_TARGET:.0f}%")
    print(f"  Win rate:      >= {WIN_RATE_TARGET*100:.0f}%")
    print(f"Settings:")
    print(f"  Population:    {args.population}")
    print(f"  Generations:   {args.generations}")
    print(f"  Games/eval:    {args.games}")
    print(f"  Target:        {args.target}")
    print(f"  Elite count:   {args.elite}")
    print(f"  Mutation rate: {args.mutation_rate}")
    print(f"  Mutation str:  {args.mutation_strength}")
    print(f"  Seed:          {args.seed}")
    print(f"  Output:        {args.output}/")
    print("=" * 60)

    # Estimate runtime
    games_per_gen = args.games * args.population
    total_games = games_per_gen * args.generations
    # Rough estimate: ~500 games/sec
    est_time = total_games / 500
    print(f"\nEstimated games: {total_games:,}")
    print(f"Estimated time:  ~{est_time/60:.1f} minutes")
    print()

    # Create optimizer
    optimizer = GeneticOptimizer(
        population_size=args.population,
        elite_count=args.elite,
        mutation_rate=args.mutation_rate,
        mutation_strength=args.mutation_strength,
        games_per_eval=args.games,
        seed=args.seed,
        slot3_target=SLOT3_TARGET,
        slot4_target=SLOT4_TARGET,
        win_target=WIN_RATE_TARGET
    )

    # Run optimization
    print("Starting optimization...\n")
    best = optimizer.run(
        max_generations=args.generations,
        target_fitness=args.target,
        verbose=not args.quiet
    )

    # Print results
    print("\n" + "=" * 60)
    print("OPTIMIZATION COMPLETE")
    print("=" * 60)

    if best and best.fitness:
        f = best.fitness
        print(f"\nBest Result:")
        print(f"  Fitness Score: {f.fitness_score:.1f}/100")
        print(f"  Slot Usage:    [{f.slot1_pct:.1f}%, {f.slot2_pct:.1f}%, "
              f"{f.slot3_pct:.1f}%, {f.slot4_pct:.1f}%]")
        print(f"  Win Rate vs v1: {f.win_rate_vs_v1*100:.1f}%")
        print(f"  Meets Criteria: {'YES' if f.meets_criteria(SLOT3_TARGET, SLOT4_TARGET, WIN_RATE_TARGET) else 'NO'}")

        # Target check
        print(f"\nTarget Check:")
        print(f"  Slot 3 >= {SLOT3_TARGET:.0f}%: {'PASS' if f.slot3_pct >= SLOT3_TARGET else f'FAIL ({f.slot3_pct:.1f}%)'}")
        print(f"  Slot 4 >= {SLOT4_TARGET:.0f}%: {'PASS' if f.slot4_pct >= SLOT4_TARGET else f'FAIL ({f.slot4_pct:.1f}%)'}")
        print(f"  Win >= {WIN_RATE_TARGET*100:.0f}%:    {'PASS' if f.win_rate_vs_v1 >= WIN_RATE_TARGET else f'FAIL ({f.win_rate_vs_v1*100:.1f}%)'}")

    # Save results
    saved_files = save_results(optimizer, args.output)
    print(f"\nResults saved to:")
    for name, path in saved_files.items():
        if path:
            print(f"  {name}: {path}")

    # Print as code if requested
    if args.code and best:
        print("\n" + "=" * 60)
        print("PROFILE CODE (add to profiles.py)")
        print("=" * 60)
        print(format_profile_as_code(best.params, name='v3'))

    # Summary statistics
    stats = optimizer.get_statistics()
    print(f"\nStatistics:")
    print(f"  Generations run: {stats.get('generations_run', 0)}")
    print(f"  Best generation: {stats.get('best_generation', 0)}")
    print(f"  Qualifying gens: {stats.get('qualifying_generations', 0)}")

    return 0 if (best and best.fitness and best.fitness.meets_criteria(SLOT3_TARGET, SLOT4_TARGET, WIN_RATE_TARGET)) else 1


if __name__ == '__main__':
    sys.exit(main())
