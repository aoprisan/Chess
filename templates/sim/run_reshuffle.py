#!/usr/bin/env python3
"""
Pool reshuffle optimizer CLI.

Tries radically different pool assignments — random partitions, uneven sizes,
category groupings — across a 4-phase pipeline to find configurations that
maximize win rate and slot diversity.

Usage:
    # Full 4-phase pipeline
    python run_reshuffle.py --output reshuffle_results

    # Quick (phase 1 only)
    python run_reshuffle.py --quick --output reshuffle_results/quick

    # With prior overnight data for usage-guided phase
    python run_reshuffle.py --prior-history pool_swap_results/overnight/final_report.json

    # Custom settings
    python run_reshuffle.py --games 100 --games-validate 500 --seed 42

    # Run specific phase only
    python run_reshuffle.py --phase 1 --output reshuffle_results/p1
"""

import sys
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from optimizer.pool_reshuffle import ReshuffleOptimizer, generate_phase1_configs
from optimizer.pool_swap import format_duration, DEFAULT_SLOT3, DEFAULT_SLOT4


def main():
    parser = argparse.ArgumentParser(
        description='Pool reshuffle optimizer — dramatic pool reassignment search',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Full 4-phase pipeline (~75 min at 200 games/eval)
    python run_reshuffle.py --output reshuffle_results/full

    # Quick phase 1 only (~25 min)
    python run_reshuffle.py --quick --output reshuffle_results/quick

    # With prior data for smarter phase 2
    python run_reshuffle.py --prior-history pool_swap_results/overnight/final_report.json

    # Fast smoke test (~2 min)
    python run_reshuffle.py --quick --games 20 --output reshuffle_results/test
        """
    )

    # Mode
    parser.add_argument('--quick', action='store_true',
                        help='Phase 1 only (random survey)')
    parser.add_argument('--phase', type=int, choices=[1, 2, 3, 4],
                        help='Run specific phase only (1-4)')

    # Eval settings
    parser.add_argument('--games', type=int, default=200,
                        help='Games per evaluation (default: 200)')
    parser.add_argument('--games-validate', type=int, default=1000,
                        help='Games per eval in validation phase (default: 1000)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed (default: 42)')
    parser.add_argument('--depth', type=int, default=1,
                        help='Minimax search depth (default: 1)')
    parser.add_argument('--minimax-profile', type=str, default='minimax-v3',
                        help='Minimax profile name (default: minimax-v3)')

    # Data
    parser.add_argument('--prior-history', type=str, default=None,
                        help='Prior report/history JSON for usage-guided generation')

    # Output
    parser.add_argument('--output', type=str, default='reshuffle_results',
                        help='Output directory (default: reshuffle_results)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')
    parser.add_argument('--show-pools', action='store_true',
                        help='Print best pools as Python code at the end')

    args = parser.parse_args()
    verbose = not args.quiet

    optimizer = ReshuffleOptimizer(
        games_per_eval=args.games,
        games_validate=args.games_validate,
        seed=args.seed,
        depth=args.depth,
        minimax_profile=args.minimax_profile,
        output_dir=args.output,
        prior_history=args.prior_history,
        verbose=verbose,
    )

    if args.quick:
        # Phase 1 only
        results = optimizer.run_phase1_survey()
    elif args.phase == 1:
        results = optimizer.run_phase1_survey()
    elif args.phase == 2:
        # Need phase 1 results first
        if verbose:
            print("Phase 2 requires phase 1 results. Running phase 1 first...")
        results_p1 = optimizer.run_phase1_survey()
        results = optimizer.run_phase2_smart(results_p1)
    elif args.phase == 3:
        if verbose:
            print("Phase 3 requires phases 1+2. Running them first...")
        results_p1 = optimizer.run_phase1_survey()
        results_p2 = optimizer.run_phase2_smart(results_p1)
        combined = results_p1 + results_p2
        results = optimizer.run_phase3_refine(combined)
    elif args.phase == 4:
        if verbose:
            print("Phase 4 requires phases 1-3. Running them first...")
        results = optimizer.run_all()
    else:
        # Full pipeline
        results = optimizer.run_all()

    # Summary
    if verbose and results:
        top_n = min(10, len(results))
        print()
        print("=" * 60)
        print(f"TOP {top_n} RESULTS")
        print("=" * 60)
        for i, r in enumerate(results[:top_n]):
            wr = r.win_rate * 100
            slots = f"[{r.slot1_pct:.0f},{r.slot2_pct:.0f},{r.slot3_pct:.0f},{r.slot4_pct:.0f}]"
            s3_size = len(r.config.slot3_pool)
            s4_size = len(r.config.slot4_pool)
            print(f" #{i+1:2d} {r.config.label:35s}  WR={wr:.1f}% slots={slots} "
                  f"score={r.composite_score:.1f}  ({s3_size}/{s4_size})")

    # Show pools
    if args.show_pools and results:
        best = results[0]
        print()
        print("=" * 60)
        print("BEST POOL CONFIG (Python code)")
        print("=" * 60)
        print(f"# slot3: {len(best.config.slot3_pool)} perks, slot4: {len(best.config.slot4_pool)} perks")
        print(f"slot3_pool = (")
        for p in sorted(best.config.slot3_pool):
            print(f"    '{p}',")
        print(f")")
        print(f"slot4_pool = (")
        for p in sorted(best.config.slot4_pool):
            print(f"    '{p}',")
        print(f")")

    if verbose:
        print(f"\nResults saved to {args.output}/")

    return 0


if __name__ == '__main__':
    sys.exit(main())
