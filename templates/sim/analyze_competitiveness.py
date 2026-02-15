#!/usr/bin/env python3
"""
Perk competitiveness analysis pipeline.

Runs games to collect per-decision AI evaluation data, ranks all 30 perks
by how competitive they are vs slots 1/2, then generates and evaluates
targeted balanced pool configs.

Usage:
    # Full pipeline (~7 min)
    python analyze_competitiveness.py --games 1000 --eval-games 400 --output competitiveness_results/full

    # Quick smoke test (~30s)
    python analyze_competitiveness.py --games 50 --eval-games 20 --output competitiveness_results/test
"""

import sys
import json
import time
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from optimizer.pool_swap import (
    PoolConfig, evaluate_pool_config, format_duration, PoolSwapOptimizer,
)
from optimizer.competitiveness import (
    run_data_collection,
    analyze_decisions,
    generate_balanced_configs,
    format_rankings_table,
    format_config_results,
    DEFAULT_SLOT3, DEFAULT_SLOT4,
)


def load_best_lopsided(path: str) -> PoolConfig | None:
    """Load the best lopsided config from a reshuffle results file."""
    try:
        with open(path) as f:
            data = json.load(f)
        results = data.get('top_20_validated', [])
        if not results:
            return None
        cfg = results[0]['config']
        return PoolConfig(
            slot3_pool=tuple(cfg['slot3']),
            slot4_pool=tuple(cfg['slot4']),
            label=cfg.get('label', 'best_lopsided'),
        )
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return None


def main():
    parser = argparse.ArgumentParser(
        description='Perk competitiveness analysis — find balanced pools that perform well',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Quick smoke test (~30s)
    python analyze_competitiveness.py --games 50 --eval-games 20 --output competitiveness_results/test

    # Full pipeline (~7 min)
    python analyze_competitiveness.py --games 1000 --eval-games 400 --output competitiveness_results/full

    # With lopsided reference
    python analyze_competitiveness.py --games 1000 --eval-games 400 \\
        --lopsided-ref reshuffle_results/full/final_report.json
        """
    )

    parser.add_argument('--games', type=int, default=1000,
                        help='Games for data collection phase (default: 1000)')
    parser.add_argument('--eval-games', type=int, default=400,
                        help='Games per config evaluation (default: 400)')
    parser.add_argument('--seed', type=int, default=0,
                        help='Random seed (default: 0)')
    parser.add_argument('--depth', type=int, default=1,
                        help='Minimax search depth (default: 1)')
    parser.add_argument('--minimax-profile', type=str, default='minimax-v3',
                        help='Minimax profile (default: minimax-v3)')
    parser.add_argument('--lopsided-ref', type=str, default=None,
                        help='Path to reshuffle final_report.json for lopsided data collection')
    parser.add_argument('--output', type=str, default='competitiveness_results',
                        help='Output directory (default: competitiveness_results)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')
    parser.add_argument('--collect-only', action='store_true',
                        help='Only run data collection + analysis, skip config evaluation')
    parser.add_argument('--show-pools', action='store_true',
                        help='Print best pool configs as Python code')

    args = parser.parse_args()
    verbose = not args.quiet

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    pipeline_start = time.time()

    # ---------------------------------------------------------------
    # Phase 1: Collect decision data
    # ---------------------------------------------------------------
    if verbose:
        print("=" * 70)
        print("PHASE 1: Collect AI decision data")
        print("=" * 70)

    baseline_config = PoolConfig(
        slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline'
    )

    configs_to_collect = [('baseline', baseline_config)]

    # Optionally also collect from best lopsided config
    if args.lopsided_ref:
        lopsided = load_best_lopsided(args.lopsided_ref)
        if lopsided:
            configs_to_collect.append(('lopsided', lopsided))
            if verbose:
                print(f"  Also collecting from lopsided config: {lopsided.label} "
                      f"({len(lopsided.slot3_pool)}/{len(lopsided.slot4_pool)})")

    all_collectors = {}
    for label, config in configs_to_collect:
        t0 = time.time()
        if verbose:
            n3 = len(config.slot3_pool)
            n4 = len(config.slot4_pool)
            print(f"\n  Collecting from '{label}' ({n3}/{n4}) — {args.games} games...", flush=True)

        collector = run_data_collection(
            config=config,
            n_games=args.games,
            seed=args.seed,
            depth=args.depth,
            minimax_profile=args.minimax_profile,
        )
        all_collectors[label] = collector

        elapsed = time.time() - t0
        if verbose:
            print(f"  -> {len(collector)} decisions in {format_duration(elapsed)}")

    # Merge all collector records
    from optimizer.competitiveness import DecisionCollector
    merged = DecisionCollector()
    for label, collector in all_collectors.items():
        merged.records.extend(collector.records)

    if verbose:
        print(f"\n  Total decisions: {len(merged)}")

    # ---------------------------------------------------------------
    # Phase 2: Analyze per-perk competitiveness
    # ---------------------------------------------------------------
    if verbose:
        print()
        print("=" * 70)
        print("PHASE 2: Analyze per-perk competitiveness")
        print("=" * 70)

    rankings = analyze_decisions(merged)

    if verbose:
        print()
        print(format_rankings_table(rankings))
        print()

    # Save rankings
    rankings_data = [r.to_dict() for r in rankings]
    with open(output_dir / 'rankings.json', 'w') as f:
        json.dump(rankings_data, f, indent=2)

    if verbose:
        # Quick summary
        top5 = [r.perk_name for r in rankings[:5]]
        bot5 = [r.perk_name for r in rankings[-5:]]
        print(f"  Top 5: {', '.join(top5)}")
        print(f"  Bottom 5: {', '.join(bot5)}")

    if args.collect_only:
        elapsed = time.time() - pipeline_start
        if verbose:
            print(f"\nDone (collect-only). Saved to {output_dir}/ in {format_duration(elapsed)}")
        return 0

    # ---------------------------------------------------------------
    # Phase 3: Generate balanced configs
    # ---------------------------------------------------------------
    if verbose:
        print()
        print("=" * 70)
        print("PHASE 3: Generate balanced configs from rankings")
        print("=" * 70)

    import random as rng_mod
    configs = generate_balanced_configs(rankings, rng=rng_mod.Random(args.seed))

    if verbose:
        # Count by pool size
        size_counts = {}
        for c in configs:
            n3 = len(c.slot3_pool)
            size_counts[n3] = size_counts.get(n3, 0) + 1
        print(f"\n  Generated {len(configs)} configs")
        for size, count in sorted(size_counts.items()):
            print(f"    {size}/{30 - size}: {count} configs")

    # Save generated configs
    configs_data = [{'slot3': list(c.slot3_pool), 'slot4': list(c.slot4_pool),
                     'label': c.label} for c in configs]
    with open(output_dir / 'generated_configs.json', 'w') as f:
        json.dump(configs_data, f, indent=2)

    # ---------------------------------------------------------------
    # Phase 4: Evaluate configs
    # ---------------------------------------------------------------
    if verbose:
        print()
        print("=" * 70)
        print(f"PHASE 4: Evaluate {len(configs)} configs ({args.eval_games} games each)")
        print("=" * 70)

    optimizer = PoolSwapOptimizer(
        games_per_eval=args.eval_games,
        seed=args.seed,
        depth=args.depth,
        minimax_profile=args.minimax_profile,
    )
    results = optimizer.run_program(configs, verbose=verbose, output_dir=str(output_dir))

    if verbose:
        print()
        print("=" * 70)
        print("RESULTS — Top configs")
        print("=" * 70)
        print()
        print(format_config_results(results))

    # Save final report
    report = {
        'wall_time_seconds': round(time.time() - pipeline_start, 1),
        'wall_time_human': format_duration(time.time() - pipeline_start),
        'settings': {
            'collection_games': args.games,
            'eval_games': args.eval_games,
            'seed': args.seed,
            'depth': args.depth,
            'minimax_profile': args.minimax_profile,
        },
        'total_decisions': len(merged),
        'total_configs_evaluated': len(results),
        'rankings': rankings_data,
        'results': [
            {
                'config': {'slot3': list(r.config.slot3_pool),
                           'slot4': list(r.config.slot4_pool),
                           'label': r.config.label},
                'win_rate': r.win_rate,
                'slot1_pct': r.slot1_pct,
                'slot2_pct': r.slot2_pct,
                'slot3_pct': r.slot3_pct,
                'slot4_pct': r.slot4_pct,
                'composite_score': r.composite_score,
                'games_played': r.games_played,
                'perk_usage': r.perk_usage,
            }
            for r in results
        ],
    }
    with open(output_dir / 'final_report.json', 'w') as f:
        json.dump(report, f, indent=2)

    # Show best pools
    if args.show_pools and results:
        best = results[0]
        print()
        print("=" * 60)
        print("BEST POOL CONFIG (Python code)")
        print("=" * 60)
        n3 = len(best.config.slot3_pool)
        n4 = len(best.config.slot4_pool)
        print(f"# {best.config.label}: WR={best.win_rate:.1%} score={best.composite_score:.1f} ({n3}/{n4})")
        print("slot3_pool = (")
        for p in sorted(best.config.slot3_pool):
            print(f"    '{p}',")
        print(")")
        print("slot4_pool = (")
        for p in sorted(best.config.slot4_pool):
            print(f"    '{p}',")
        print(")")

    elapsed = time.time() - pipeline_start
    if verbose:
        print(f"\nDone. Total time: {format_duration(elapsed)}")
        print(f"Results saved to {output_dir}/")

    return 0


if __name__ == '__main__':
    sys.exit(main())
