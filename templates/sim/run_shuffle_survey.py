#!/usr/bin/env python3
"""
Random shuffle survey — exhaustively sample random 15/15 pool splits.

Evaluates thousands of random perk assignments across slots 3/4 to find
configurations that achieve both high win rate and balanced slot usage.

Resumable: rerun with higher --shuffles to accumulate more data.

Usage:
    # Smoke test (~40s)
    python3 run_shuffle_survey.py --shuffles 20 --games 50 --output shuffle_results/test

    # First overnight run (~5.6h)
    python3 run_shuffle_survey.py --shuffles 10000 --output shuffle_results/full

    # Extend to 20K (resumes, does 10K new)
    python3 run_shuffle_survey.py --shuffles 20000 --output shuffle_results/full
"""

import sys
import json
import math
import random
import time
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / 'src'))

from optimizer.pool_swap import (
    PoolConfig, SwapEvalResult, evaluate_pool_config, format_duration,
)
from optimizer.pool_reshuffle import ALL_PERKS, _config_key


def load_history(output_dir: Path) -> list[dict]:
    """Load existing incremental history if present."""
    path = output_dir / 'history_incremental.json'
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return []


def build_seen(history: list[dict]) -> set[frozenset]:
    """Build dedup set from loaded history."""
    seen = set()
    for entry in history:
        cfg = entry['config']
        seen.add(frozenset(cfg['slot3']))
    return seen


def generate_random_partition(rng: random.Random, seen: set[frozenset]) -> PoolConfig | None:
    """Generate a random unique 15/15 partition. Returns None if can't find one in 1000 tries."""
    for _ in range(1000):
        perks = list(ALL_PERKS)
        rng.shuffle(perks)
        s3 = tuple(sorted(perks[:15]))
        key = frozenset(s3)
        if key not in seen:
            seen.add(key)
            s4 = tuple(sorted(perks[15:]))
            return PoolConfig(slot3_pool=s3, slot4_pool=s4, label='')
    return None


def save_incremental(history: list[dict], output_dir: Path):
    """Save full history to incremental file."""
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / 'history_incremental.json', 'w') as f:
        json.dump(history, f)


def percentile(values: list[float], p: float) -> float:
    """Compute p-th percentile (0-100) of a sorted list."""
    if not values:
        return 0.0
    k = (len(values) - 1) * p / 100.0
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return values[int(k)]
    return values[f] * (c - k) + values[c] * (k - f)


def print_distribution(name: str, values: list[float], fmt: str = '.1f'):
    """Print distribution stats for a list of values."""
    if not values:
        print(f"  {name}: no data")
        return
    sv = sorted(values)
    mean = sum(sv) / len(sv)
    variance = sum((x - mean) ** 2 for x in sv) / len(sv)
    std = variance ** 0.5
    print(f"  {name}:")
    print(f"    mean={mean:{fmt}}  std={std:{fmt}}  min={sv[0]:{fmt}}  max={sv[-1]:{fmt}}")
    print(f"    p5={percentile(sv, 5):{fmt}}  p25={percentile(sv, 25):{fmt}}  "
          f"p50={percentile(sv, 50):{fmt}}  p75={percentile(sv, 75):{fmt}}  "
          f"p95={percentile(sv, 95):{fmt}}")


def print_summary(history: list[dict], wall_time: float):
    """Print comprehensive summary of all results."""
    n = len(history)
    if n == 0:
        print("No results to summarize.")
        return

    wrs = [r['win_rate'] * 100 for r in history]
    s3s = [r['slot3_pct'] for r in history]
    s4s = [r['slot4_pct'] for r in history]
    balances = [min(r['slot3_pct'], r['slot4_pct']) for r in history]

    print(f"\n{'=' * 70}")
    print(f"SHUFFLE SURVEY SUMMARY — {n:,} configs evaluated")
    print(f"{'=' * 70}")
    print(f"  Wall time: {format_duration(wall_time)}")
    print()

    print("--- Distributions ---")
    print_distribution("Win rate (%)", wrs)
    print_distribution("Slot 3 (%)", s3s)
    print_distribution("Slot 4 (%)", s4s)
    print_distribution("min(S3%, S4%)", balances)

    print()
    print("--- Threshold counts ---")
    wr65 = sum(1 for w in wrs if w >= 65)
    wr70 = sum(1 for w in wrs if w >= 70)
    s3_25 = sum(1 for s in s3s if s >= 25)
    s4_25 = sum(1 for s in s4s if s >= 25)
    both_25 = sum(1 for r in history if r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25)
    all_three_65 = sum(1 for r in history
                       if r['win_rate'] >= 0.65 and r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25)
    all_three_60 = sum(1 for r in history
                       if r['win_rate'] >= 0.60 and r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25)
    print(f"  WR >= 65%:                   {wr65:>6,} / {n:,} ({wr65/n*100:.1f}%)")
    print(f"  WR >= 70%:                   {wr70:>6,} / {n:,} ({wr70/n*100:.1f}%)")
    print(f"  S3 >= 25%:                   {s3_25:>6,} / {n:,} ({s3_25/n*100:.1f}%)")
    print(f"  S4 >= 25%:                   {s4_25:>6,} / {n:,} ({s4_25/n*100:.1f}%)")
    print(f"  S3>=25% AND S4>=25%:         {both_25:>6,} / {n:,} ({both_25/n*100:.1f}%)")
    print(f"  WR>=60% AND S3>=25% AND S4>=25%: {all_three_60:>4,} / {n:,} ({all_three_60/n*100:.1f}%)")
    print(f"  WR>=65% AND S3>=25% AND S4>=25%: {all_three_65:>4,} / {n:,} ({all_three_65/n*100:.1f}%)")

    # Top 20 by composite score
    by_score = sorted(history, key=lambda r: r['composite_score'], reverse=True)
    print()
    print("--- Top 20 by composite score ---")
    print(f"  {'#':<4} {'WR':>6} {'S1%':>5} {'S2%':>5} {'S3%':>5} {'S4%':>5} {'Score':>6} {'Label'}")
    for i, r in enumerate(by_score[:20], 1):
        print(f"  {i:<4} {r['win_rate']*100:>5.1f} {r['slot1_pct']:>5.1f} {r['slot2_pct']:>5.1f} "
              f"{r['slot3_pct']:>5.1f} {r['slot4_pct']:>5.1f} {r['composite_score']:>5.1f}  {r['config']['label']}")

    # Top 20 by balance
    by_balance = sorted(history, key=lambda r: min(r['slot3_pct'], r['slot4_pct']), reverse=True)
    print()
    print("--- Top 20 by balance (min(S3%, S4%)) ---")
    print(f"  {'#':<4} {'WR':>6} {'S3%':>5} {'S4%':>5} {'min':>5} {'Score':>6}")
    for i, r in enumerate(by_balance[:20], 1):
        bal = min(r['slot3_pct'], r['slot4_pct'])
        print(f"  {i:<4} {r['win_rate']*100:>5.1f} {r['slot3_pct']:>5.1f} {r['slot4_pct']:>5.1f} "
              f"{bal:>5.1f} {r['composite_score']:>5.1f}")

    # Top 20 by WR
    by_wr = sorted(history, key=lambda r: r['win_rate'], reverse=True)
    print()
    print("--- Top 20 by win rate ---")
    print(f"  {'#':<4} {'WR':>6} {'S1%':>5} {'S2%':>5} {'S3%':>5} {'S4%':>5} {'Score':>6}")
    for i, r in enumerate(by_wr[:20], 1):
        print(f"  {i:<4} {r['win_rate']*100:>5.1f} {r['slot1_pct']:>5.1f} {r['slot2_pct']:>5.1f} "
              f"{r['slot3_pct']:>5.1f} {r['slot4_pct']:>5.1f} {r['composite_score']:>5.1f}")

    # Configs meeting all three criteria
    if all_three_65 > 0:
        print()
        print(f"--- All {all_three_65} configs with WR>=65% AND S3>=25% AND S4>=25% ---")
        hits = [r for r in history
                if r['win_rate'] >= 0.65 and r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25]
        hits.sort(key=lambda r: r['composite_score'], reverse=True)
        for r in hits[:50]:
            print(f"  WR={r['win_rate']*100:.1f}% S3={r['slot3_pct']:.1f}% S4={r['slot4_pct']:.1f}% "
                  f"score={r['composite_score']:.1f}  {r['config']['label']}")
            print(f"    slot3: {r['config']['slot3']}")
    elif all_three_60 > 0:
        print()
        print(f"--- All {all_three_60} configs with WR>=60% AND S3>=25% AND S4>=25% ---")
        hits = [r for r in history
                if r['win_rate'] >= 0.60 and r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25]
        hits.sort(key=lambda r: r['composite_score'], reverse=True)
        for r in hits[:50]:
            print(f"  WR={r['win_rate']*100:.1f}% S3={r['slot3_pct']:.1f}% S4={r['slot4_pct']:.1f}% "
                  f"score={r['composite_score']:.1f}  {r['config']['label']}")

    return by_score, by_balance, by_wr


def save_final_report(history: list[dict], wall_time: float, args, output_dir: Path):
    """Save final report JSON."""
    wrs = [r['win_rate'] * 100 for r in history]
    s3s = [r['slot3_pct'] for r in history]
    s4s = [r['slot4_pct'] for r in history]

    by_score = sorted(history, key=lambda r: r['composite_score'], reverse=True)

    report = {
        'wall_time_seconds': round(wall_time, 1),
        'wall_time_human': format_duration(wall_time),
        'settings': {
            'target_shuffles': args.shuffles,
            'games_per_eval': args.games,
            'seed': args.seed,
            'depth': args.depth,
            'minimax_profile': args.minimax_profile,
            'board': '5x5 (LANES=5, SLOTS_PER_SIDE=5)',
        },
        'total_evaluated': len(history),
        'stats': {
            'wr_mean': round(sum(wrs) / len(wrs), 2) if wrs else 0,
            'wr_std': round((sum((x - sum(wrs)/len(wrs))**2 for x in wrs) / len(wrs))**0.5, 2) if wrs else 0,
            'wr_min': round(min(wrs), 1) if wrs else 0,
            'wr_max': round(max(wrs), 1) if wrs else 0,
            's3_mean': round(sum(s3s) / len(s3s), 1) if s3s else 0,
            's4_mean': round(sum(s4s) / len(s4s), 1) if s4s else 0,
        },
        'threshold_counts': {
            'wr_ge_65': sum(1 for w in wrs if w >= 65),
            'wr_ge_70': sum(1 for w in wrs if w >= 70),
            's3_ge_25': sum(1 for s in s3s if s >= 25),
            's4_ge_25': sum(1 for s in s4s if s >= 25),
            's3_and_s4_ge_25': sum(1 for r in history if r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25),
            'all_three_65': sum(1 for r in history
                                if r['win_rate'] >= 0.65 and r['slot3_pct'] >= 25 and r['slot4_pct'] >= 25),
        },
        'top_20_by_score': by_score[:20],
    }

    with open(output_dir / 'final_report.json', 'w') as f:
        json.dump(report, f, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description='Random shuffle survey — sample random 15/15 pool splits',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    # Smoke test
    python3 run_shuffle_survey.py --shuffles 20 --games 50 --output shuffle_results/test

    # Overnight run
    python3 run_shuffle_survey.py --shuffles 10000 --output shuffle_results/full

    # Extend existing run
    python3 run_shuffle_survey.py --shuffles 20000 --output shuffle_results/full
        """
    )
    parser.add_argument('--shuffles', type=int, default=10000,
                        help='Target total number of shuffles (default: 10000)')
    parser.add_argument('--games', type=int, default=200,
                        help='Games per evaluation (default: 200)')
    parser.add_argument('--seed', type=int, default=42,
                        help='Random seed for shuffle generation (default: 42)')
    parser.add_argument('--depth', type=int, default=1,
                        help='Minimax search depth (default: 1)')
    parser.add_argument('--minimax-profile', type=str, default='minimax-v3',
                        help='Minimax profile (default: minimax-v3)')
    parser.add_argument('--output', type=str, default='shuffle_results',
                        help='Output directory (default: shuffle_results)')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')

    args = parser.parse_args()
    verbose = not args.quiet
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # --- Load existing history ---
    history = load_history(output_dir)
    seen = build_seen(history)
    n_existing = len(history)

    if verbose:
        print(f"Output: {output_dir}/")
        print(f"Loaded {n_existing:,} existing results")

    n_needed = max(0, args.shuffles - n_existing)
    if n_needed == 0:
        if verbose:
            print(f"Already have {n_existing:,} >= target {args.shuffles:,}. No new evals needed.")
            print_summary(history, 0)
            save_final_report(history, 0, args, output_dir)
        return 0

    if verbose:
        est_time = n_needed * args.games * 0.01  # rough estimate at depth 1
        print(f"Need {n_needed:,} new evals to reach target {args.shuffles:,}")
        print(f"Estimated time: {format_duration(est_time)} (at depth {args.depth})")
        print(f"Settings: {args.games} games/eval, depth {args.depth}, profile {args.minimax_profile}")
        print()

    # --- Generate and evaluate ---
    rng = random.Random(args.seed)
    # Advance RNG past already-generated shuffles so we don't repeat the same sequence
    # (even though seen-set catches dupes, this keeps generation deterministic)
    for _ in range(n_existing):
        perks = list(ALL_PERKS)
        rng.shuffle(perks)

    pipeline_start = time.time()
    eval_count = 0

    for i in range(n_needed):
        config = generate_random_partition(rng, seen)
        if config is None:
            if verbose:
                print(f"Cannot generate more unique partitions after {eval_count} new evals.")
            break

        global_idx = n_existing + eval_count
        config = PoolConfig(
            slot3_pool=config.slot3_pool,
            slot4_pool=config.slot4_pool,
            label=f'shuffle_{global_idx}',
        )

        result = evaluate_pool_config(
            config,
            n_games=args.games,
            seed=args.seed,
            depth=args.depth,
            minimax_profile=args.minimax_profile,
        )

        result_dict = result.to_dict()
        history.append(result_dict)
        eval_count += 1

        # Incremental save
        save_incremental(history, output_dir)

        if verbose:
            elapsed = time.time() - pipeline_start
            avg = elapsed / eval_count
            remaining = avg * (n_needed - eval_count)
            wr = result.win_rate * 100
            slots = f"[{result.slot1_pct:.0f},{result.slot2_pct:.0f},{result.slot3_pct:.0f},{result.slot4_pct:.0f}]"
            total = n_existing + eval_count
            print(f"[{total:>6,}/{args.shuffles:,}] WR={wr:5.1f}% slots={slots} "
                  f"score={result.composite_score:5.1f}  "
                  f"({format_duration(elapsed)}, ETA {format_duration(remaining)})")

    wall_time = time.time() - pipeline_start

    if verbose:
        print(f"\nCompleted {eval_count:,} new evals in {format_duration(wall_time)}")

    # --- Summary ---
    if verbose:
        print_summary(history, wall_time)

    save_final_report(history, wall_time, args, output_dir)

    if verbose:
        print(f"\nResults saved to {output_dir}/")

    return 0


if __name__ == '__main__':
    sys.exit(main())
