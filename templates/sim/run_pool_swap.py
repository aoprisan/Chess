#!/usr/bin/env python3
"""
Pool swap optimizer CLI.

Evaluates different slot 3/4 pool assignments to find configurations where
a minimax AI beats hard(v1) while making diverse use of all perk slots.

Usage:
    python run_pool_swap.py --eval-only --games 200
    python run_pool_swap.py --all-single-swaps --games 200
    python run_pool_swap.py --swaps BLIND,SCATTER CAPTURE,MIRROR --games 200
    python run_pool_swap.py --program my_program.json --games 200
    python run_pool_swap.py --greedy --rounds 5 --games 200
    python run_pool_swap.py --overnight --games-phase1 500 --games-phase2 1000 --top-n 20
"""

import sys
import time
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from optimizer.pool_swap import (
    PoolConfig,
    PoolSwapOptimizer,
    generate_all_single_swaps,
    generate_cumulative_swaps,
    generate_stacking_combos,
    load_program,
    save_final_report,
    format_duration,
    DEFAULT_SLOT3,
    DEFAULT_SLOT4,
)


def run_overnight(args, verbose: bool) -> int:
    """Run 3-phase overnight optimization pipeline."""
    overall_start = time.time()

    if verbose:
        print("=" * 60)
        print("OVERNIGHT POOL SWAP OPTIMIZATION")
        print("=" * 60)
        print(f"Phase 1: All single swaps ({args.games_phase1} games/eval)")
        print(f"Phase 2: Revalidate top {args.top_n} ({args.games_phase2} games/eval)")
        print(f"Phase 3: Stacking combos ({args.games_phase1} games/eval)")
        print(f"Test AI: minimax depth={args.depth} ({args.minimax_profile})")
        print(f"Opponent: hard(v1)")
        print(f"Output: {args.output}")
        print("=" * 60)
        print()

    common_kwargs = dict(
        seed=args.seed,
        depth=args.depth,
        minimax_profile=args.minimax_profile,
        win_target=args.win_target,
        slot3_target=args.slot3_target,
        slot4_target=args.slot4_target,
    )

    # ---- Phase 1: Landscape scan (all single swaps) ----
    if verbose:
        print("=" * 60)
        print("PHASE 1: Landscape scan (all single swaps)")
        print("=" * 60)

    optimizer_p1 = PoolSwapOptimizer(games_per_eval=args.games_phase1, **common_kwargs)
    optimizer_p1._output_dir = args.output
    configs_p1 = generate_all_single_swaps()
    results_p1 = optimizer_p1.run_program(configs_p1, verbose=verbose, output_dir=args.output)
    saved_p1 = optimizer_p1.save_results(args.output, phase_label='phase1')

    if verbose:
        elapsed = time.time() - overall_start
        print(f"\nPhase 1 complete: {len(results_p1)} configs evaluated in {format_duration(elapsed)}")
        print(f"  Best: {results_p1[0].config.label}  score={results_p1[0].composite_score:.1f}")
        for name, path in saved_p1.items():
            print(f"  {name}: {path}")
        print()

    # ---- Phase 2: Revalidate top N with more games ----
    if verbose:
        print("=" * 60)
        print(f"PHASE 2: Revalidate top {args.top_n} ({args.games_phase2} games/eval)")
        print("=" * 60)

    optimizer_p2 = PoolSwapOptimizer(games_per_eval=args.games_phase2, **common_kwargs)
    optimizer_p2._output_dir = args.output
    # Always include baseline in revalidation
    baseline_config = PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline')
    top_configs = [r.config for r in results_p1[:args.top_n] if 'baseline' not in r.config.label]
    revalidate_configs = [baseline_config] + top_configs[:args.top_n]
    results_p2 = optimizer_p2.run_program(revalidate_configs, verbose=verbose, output_dir=args.output)
    saved_p2 = optimizer_p2.save_results(args.output, phase_label='phase2')

    if verbose:
        elapsed = time.time() - overall_start
        print(f"\nPhase 2 complete: {len(results_p2)} configs evaluated in {format_duration(elapsed)} total")
        print(f"  Best: {results_p2[0].config.label}  score={results_p2[0].composite_score:.1f}")
        for name, path in saved_p2.items():
            print(f"  {name}: {path}")
        print()

    # ---- Phase 3: Stacking combos from top 5 ----
    if verbose:
        print("=" * 60)
        print("PHASE 3: Stacking combos from top validated configs")
        print("=" * 60)

    optimizer_p3 = PoolSwapOptimizer(games_per_eval=args.games_phase1, **common_kwargs)
    optimizer_p3._output_dir = args.output
    # Use top 5 non-baseline configs from phase 2 for stacking
    stacking_sources = [r.config for r in results_p2 if 'baseline' not in r.config.label][:5]
    combos = generate_stacking_combos(stacking_sources)
    results_p3 = optimizer_p3.run_program(combos, verbose=verbose, output_dir=args.output)
    saved_p3 = optimizer_p3.save_results(args.output, phase_label='phase3')

    if verbose:
        elapsed = time.time() - overall_start
        print(f"\nPhase 3 complete: {len(results_p3)} configs evaluated in {format_duration(elapsed)} total")
        print(f"  Best: {results_p3[0].config.label}  score={results_p3[0].composite_score:.1f}")
        for name, path in saved_p3.items():
            print(f"  {name}: {path}")
        print()

    # ---- Final report ----
    wall_time = time.time() - overall_start
    save_final_report(results_p1, results_p2, results_p3, args.output, wall_time)

    if verbose:
        print("=" * 60)
        print(f"OVERNIGHT RUN COMPLETE  ({format_duration(wall_time)})")
        print("=" * 60)

        # Quick summary of all phases
        all_results = results_p1 + results_p2 + results_p3
        best = max(all_results, key=lambda r: r.composite_score)
        print(f"  Best overall: {best.config.label}")
        print(f"    WR={best.win_rate*100:.1f}%  slots=[{best.slot1_pct:.0f},{best.slot2_pct:.0f},{best.slot3_pct:.0f},{best.slot4_pct:.0f}]  score={best.composite_score:.1f}")

    return 0


def main():
    parser = argparse.ArgumentParser(
        description='Pool swap optimizer - find best perk-to-slot assignments',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Evaluate baseline only
    python run_pool_swap.py --eval-only --games 200

    # All 225 single swaps
    python run_pool_swap.py --all-single-swaps --games 200

    # Cumulative swaps from CLI
    python run_pool_swap.py --swaps BLIND,SCATTER CAPTURE,MIRROR --games 200

    # Load pre-planned program
    python run_pool_swap.py --program my_program.json --games 200

    # Greedy hill climbing
    python run_pool_swap.py --greedy --rounds 5 --games 200

    # Overnight 3-phase optimization
    python run_pool_swap.py --overnight --games-phase1 500 --games-phase2 1000 --top-n 20
        """
    )

    # Mode (mutually exclusive)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--eval-only', action='store_true',
                      help='Evaluate baseline config only')
    mode.add_argument('--all-single-swaps', action='store_true',
                      help='Evaluate all 225 single-perk swaps + baseline')
    mode.add_argument('--swaps', nargs='+', metavar='A,B',
                      help='Cumulative swaps: each A,B moves A from slot3->slot4, B from slot4->slot3')
    mode.add_argument('--program', type=str, metavar='FILE',
                      help='Load program from JSON file')
    mode.add_argument('--greedy', action='store_true',
                      help='Greedy hill climbing (auto picks best swap each round)')
    mode.add_argument('--overnight', action='store_true',
                      help='3-phase overnight run: landscape -> revalidate -> stacking')

    # Eval settings
    parser.add_argument('--games', type=int, default=200,
                        help='Games per evaluation (default: 200)')
    parser.add_argument('--depth', type=int, default=1,
                        help='Minimax search depth (default: 1)')
    parser.add_argument('--minimax-profile', type=str, default='minimax-v3',
                        help='Minimax profile name (default: minimax-v3)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed (default: 42)')

    # Targets
    parser.add_argument('--win-target', type=float, default=0.70,
                        help='Win rate target (default: 0.70)')
    parser.add_argument('--slot3-target', type=float, default=25.0,
                        help='Slot 3 usage target %% (default: 25.0)')
    parser.add_argument('--slot4-target', type=float, default=25.0,
                        help='Slot 4 usage target %% (default: 25.0)')

    # Greedy options
    parser.add_argument('--rounds', type=int, default=10,
                        help='Max greedy rounds (default: 10)')

    # Overnight options
    parser.add_argument('--games-phase1', type=int, default=500,
                        help='Games per eval in phase 1 & 3 (default: 500)')
    parser.add_argument('--games-phase2', type=int, default=1000,
                        help='Games per eval in phase 2 (default: 1000)')
    parser.add_argument('--top-n', type=int, default=20,
                        help='Top N configs to revalidate in phase 2 (default: 20)')

    # Output
    parser.add_argument('--output', type=str, default='pool_swap_results',
                        help='Output directory (default: pool_swap_results)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')
    parser.add_argument('--show-pools', action='store_true',
                        help='Print best pools as Python code')

    args = parser.parse_args()
    verbose = not args.quiet

    # Overnight mode has its own flow
    if args.overnight:
        return run_overnight(args, verbose)

    # Build optimizer
    optimizer = PoolSwapOptimizer(
        games_per_eval=args.games,
        seed=args.seed,
        depth=args.depth,
        minimax_profile=args.minimax_profile,
        win_target=args.win_target,
        slot3_target=args.slot3_target,
        slot4_target=args.slot4_target,
    )
    optimizer._output_dir = args.output

    # Build config list
    if args.eval_only:
        configs = [PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline')]
        mode_label = '1 config (baseline)'
    elif args.all_single_swaps:
        configs = generate_all_single_swaps()
        mode_label = f'{len(configs)} configs (all single swaps)'
    elif args.swaps:
        swap_pairs = []
        for s in args.swaps:
            parts = s.split(',')
            if len(parts) != 2:
                print(f"Error: swap '{s}' must be in A,B format", file=sys.stderr)
                return 1
            swap_pairs.append((parts[0].strip().upper(), parts[1].strip().upper()))
        configs = generate_cumulative_swaps(swap_pairs)
        mode_label = f'{len(configs)} configs (cumulative swaps)'
    elif args.program:
        configs = load_program(args.program)
        mode_label = f'{len(configs)} configs (from {args.program})'
    elif args.greedy:
        configs = None  # greedy generates its own
        mode_label = f'greedy (max {args.rounds} rounds)'
    else:
        print("Error: no mode selected", file=sys.stderr)
        return 1

    # Header
    if verbose:
        print("=" * 60)
        print("POOL SWAP OPTIMIZER")
        print("=" * 60)
        print(f"Targets: WR >= {args.win_target*100:.0f}%, "
              f"Slot3 >= {args.slot3_target:.0f}%, "
              f"Slot4 >= {args.slot4_target:.0f}%")
        print(f"Test AI: minimax depth={args.depth} ({args.minimax_profile})")
        print(f"Opponent: hard(v1)")
        print(f"Games/eval: {args.games}, Program: {mode_label}")
        print("=" * 60)
        print()

    # Run
    if args.greedy:
        results = optimizer.run_greedy(max_rounds=args.rounds, verbose=verbose)
    else:
        results = optimizer.run_program(configs, verbose=verbose, output_dir=args.output)

    # Summary
    if verbose and results:
        top_n = min(5, len(results))
        print()
        print("=" * 60)
        print(f"RESULTS (top {top_n})")
        print("=" * 60)
        for i, r in enumerate(results[:top_n]):
            wr = r.win_rate * 100
            slots = f"[{r.slot1_pct:.0f},{r.slot2_pct:.0f},{r.slot3_pct:.0f},{r.slot4_pct:.0f}]"
            primary = "PRIMARY" if r.meets_primary(args.win_target, args.slot3_target, args.slot4_target) else ""
            print(f" #{i+1:2d} {r.config.label:30s}  WR={wr:.1f}% slots={slots} score={r.composite_score:.1f}  {primary}")

        best = results[0]
        meets = best.meets_primary(args.win_target, args.slot3_target, args.slot4_target)
        print(f"\nBest meets primary target: {'YES' if meets else 'NO'}")

    # Show pools
    if args.show_pools and results:
        best = results[0]
        print()
        print("=" * 60)
        print("BEST POOL CONFIG (Python code)")
        print("=" * 60)
        print(f"slot3_pool = (")
        for p in best.config.slot3_pool:
            print(f"    '{p}',")
        print(f")")
        print(f"slot4_pool = (")
        for p in best.config.slot4_pool:
            print(f"    '{p}',")
        print(f")")

    # Save
    saved = optimizer.save_results(args.output)
    if verbose:
        print(f"\nResults saved to {args.output}/")
        for name, path in saved.items():
            print(f"  {name}: {path}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
