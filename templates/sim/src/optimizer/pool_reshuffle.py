"""Pool reshuffle optimizer — dramatic pool reassignment search.

Unlike pool_swap (single perk exchanges), this optimizer tries radically
different assignments: random partitions, uneven pool sizes, and multi-perk
moves across a 4-phase pipeline.

Phase 1: Random survey — random partitions across 7 size ratios
Phase 2: Smart partitions — usage-guided + category-aware + extrapolated
Phase 3: Local refinement — mutate top configs from phases 1+2
Phase 4: Validation — re-eval top configs with high game count
"""

import json
import random
import time
from collections import Counter
from pathlib import Path

from src.game.config import DEFAULT_CONFIG
from src.optimizer.pool_swap import (
    PoolConfig,
    SwapEvalResult,
    PoolSwapOptimizer,
    format_duration,
    diff_from_baseline,
)

DEFAULT_SLOT3 = DEFAULT_CONFIG.slot3_pool
DEFAULT_SLOT4 = DEFAULT_CONFIG.slot4_pool
ALL_PERKS = sorted(set(DEFAULT_SLOT3) | set(DEFAULT_SLOT4))

# Perk categories (from sim/src/perks/base.py)
PERK_CATEGORIES = {
    'duration':          ('FREEZE', 'CLOAK', 'BLIND', 'SANCTUARY', 'CAPTURE'),
    'placement_trigger': ('PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE', 'RETALIATE'),
    'removal_trigger':   ('HYDRA', 'BACKFIRE', 'ABSORB'),
    'immediate':         ('REGROUP', 'SCATTER', 'SCRAMBLE', 'SPLIT', 'KAMIKAZE',
                          'DISRUPT', 'DISPERSE', 'GAMBIT', 'STEAL', 'RUSH', 'NULLIFY'),
    'deferred':          ('SIGNAL', 'ENLIST', 'AMBUSH', 'REINFORCE', 'RAID'),
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _config_key(config: PoolConfig) -> frozenset:
    """Dedup key: frozenset of slot3 perks (slot4 is the complement)."""
    return frozenset(config.slot3_pool)


def deduplicate_configs(configs: list[PoolConfig]) -> list[PoolConfig]:
    """Remove duplicate configs (same slot3 set = same config)."""
    seen: set[frozenset] = set()
    unique = []
    for c in configs:
        key = _config_key(c)
        if key not in seen:
            seen.add(key)
            unique.append(c)
    return unique


def _make_config(slot3_perks: list[str] | tuple[str, ...], label: str) -> PoolConfig:
    """Build PoolConfig from slot3 list; slot4 is the complement."""
    s3 = tuple(sorted(slot3_perks))
    s4 = tuple(sorted(p for p in ALL_PERKS if p not in s3))
    return PoolConfig(slot3_pool=s3, slot4_pool=s4, label=label)


# ---------------------------------------------------------------------------
# Phase 1: Random partitions
# ---------------------------------------------------------------------------

SIZE_RATIOS = [
    (8, 22, 40),
    (10, 20, 50),
    (12, 18, 50),
    (15, 15, 50),
    (18, 12, 50),
    (20, 10, 50),
    (22, 8, 40),
]


def generate_random_partitions(s3_size: int, count: int,
                                rng: random.Random,
                                seen: set[frozenset]) -> list[PoolConfig]:
    """Generate `count` random partitions with `s3_size` perks in slot3."""
    configs = []
    attempts = 0
    max_attempts = count * 20
    while len(configs) < count and attempts < max_attempts:
        attempts += 1
        slot3 = rng.sample(ALL_PERKS, s3_size)
        key = frozenset(slot3)
        if key in seen:
            continue
        seen.add(key)
        label = f"rand-{s3_size}/{30 - s3_size}-{len(configs)}"
        configs.append(_make_config(slot3, label))
    return configs


def generate_phase1_configs(rng: random.Random) -> list[PoolConfig]:
    """Generate all phase 1 configs: baseline + random partitions across size ratios."""
    baseline = PoolConfig(
        slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline')
    configs = [baseline]
    seen: set[frozenset] = {_config_key(baseline)}

    for s3_size, _, count in SIZE_RATIOS:
        configs.extend(generate_random_partitions(s3_size, count, rng, seen))

    return configs


# ---------------------------------------------------------------------------
# Phase 2: Smart partitions
# ---------------------------------------------------------------------------

def load_prior_usage(report_file: str) -> dict[str, int]:
    """Load perk usage counts from a prior final_report.json or history file.

    Tries to extract perk_usage from the best_overall entry, or from the
    top entries in history. Returns {perk_name: total_usage_count}.
    """
    with open(report_file, 'r') as f:
        data = json.load(f)

    # final_report.json format
    if 'best_overall' in data and 'perk_usage' in data['best_overall']:
        return data['best_overall']['perk_usage']

    # History array format
    if isinstance(data, list):
        merged = Counter()
        for entry in data:
            if 'perk_usage' in entry:
                merged.update(entry['perk_usage'])
        return dict(merged)

    return {}


def generate_usage_guided_partitions(usage_data: dict[str, int],
                                      rng: random.Random,
                                      seen: set[frozenset]) -> list[PoolConfig]:
    """Generate configs based on perk usage rankings.

    Strategy: Put the most-used perks in the smaller pool so they're offered
    more often. Generate variants with 1-2 random perk swaps for noise.
    """
    configs = []

    # Rank all perks by usage (highest first)
    ranked = sorted(ALL_PERKS, key=lambda p: usage_data.get(p, 0), reverse=True)

    for s3_size in (8, 10, 12):
        # Base: top-N most used in slot3 (smaller pool = offered more often)
        base_s3 = ranked[:s3_size]
        key = frozenset(base_s3)
        if key not in seen:
            seen.add(key)
            configs.append(_make_config(base_s3, f"usage-top{s3_size}"))

        # Noised variants: swap 1-2 random perks
        for variant_i in range(25):
            s3 = list(base_s3)
            remaining = [p for p in ALL_PERKS if p not in s3]
            n_swaps = rng.randint(1, 2)
            for _ in range(n_swaps):
                if s3 and remaining:
                    out_idx = rng.randrange(len(s3))
                    in_idx = rng.randrange(len(remaining))
                    removed = s3[out_idx]
                    added = remaining[in_idx]
                    s3[out_idx] = added
                    remaining[in_idx] = removed
            key = frozenset(s3)
            if key not in seen:
                seen.add(key)
                label = f"usage-top{s3_size}-var{variant_i}"
                configs.append(_make_config(s3, label))

    return configs


def generate_category_partitions(rng: random.Random,
                                  seen: set[frozenset]) -> list[PoolConfig]:
    """Generate configs that group same-category perks together.

    Try putting each category predominantly in one pool, with various
    overall sizes.
    """
    configs = []
    categories = list(PERK_CATEGORIES.keys())

    # For each category, try putting it entirely in slot3
    for cat_name in categories:
        cat_perks = list(PERK_CATEGORIES[cat_name])

        # Fill rest of slot3 randomly from other perks to reach various sizes
        other_perks = [p for p in ALL_PERKS if p not in cat_perks]

        for target_s3_size in (10, 12, 15, 18):
            needed = target_s3_size - len(cat_perks)
            if needed < 0:
                # Category is too big for this target; take a subset
                s3 = rng.sample(cat_perks, target_s3_size)
            elif needed == 0:
                s3 = list(cat_perks)
            else:
                extras = rng.sample(other_perks, min(needed, len(other_perks)))
                s3 = cat_perks + extras

            key = frozenset(s3)
            if key not in seen:
                seen.add(key)
                label = f"cat-{cat_name}-in-s3-{len(s3)}/{30 - len(s3)}"
                configs.append(_make_config(s3, label))

    # Also try combining 2 categories in slot3
    for i in range(len(categories)):
        for j in range(i + 1, len(categories)):
            combined = list(PERK_CATEGORIES[categories[i]]) + list(PERK_CATEGORIES[categories[j]])
            s3_size = len(combined)
            if s3_size > 22:
                continue
            key = frozenset(combined)
            if key not in seen:
                seen.add(key)
                label = f"cat-{categories[i]}+{categories[j]}-{s3_size}/{30 - s3_size}"
                configs.append(_make_config(combined, label))

    return configs


def generate_extrapolated(top_results: list[SwapEvalResult],
                           rng: random.Random,
                           seen: set[frozenset],
                           n_per_source: int = 8) -> list[PoolConfig]:
    """Take top configs from phase 1, apply 2-4 random additional moves.

    Moves: move a random perk from one pool to the other (changing sizes),
    or swap two perks between pools.
    """
    configs = []

    for result in top_results[:10]:
        s3_set = set(result.config.slot3_pool)
        s4_set = set(result.config.slot4_pool)

        for var_i in range(n_per_source):
            s3 = set(s3_set)
            s4 = set(s4_set)
            n_moves = rng.randint(2, 4)

            for _ in range(n_moves):
                move_type = rng.choice(['swap', 'move_to_s4', 'move_to_s3'])
                s3_list = sorted(s3)
                s4_list = sorted(s4)

                if move_type == 'swap' and s3_list and s4_list:
                    a = rng.choice(s3_list)
                    b = rng.choice(s4_list)
                    s3.discard(a)
                    s3.add(b)
                    s4.discard(b)
                    s4.add(a)
                elif move_type == 'move_to_s4' and len(s3) > 5:
                    a = rng.choice(s3_list)
                    s3.discard(a)
                    s4.add(a)
                elif move_type == 'move_to_s3' and len(s4) > 5:
                    b = rng.choice(s4_list)
                    s4.discard(b)
                    s3.add(b)

            key = frozenset(s3)
            if key not in seen:
                seen.add(key)
                src_label = result.config.label[:15]
                label = f"extrap-{src_label}-{var_i}"
                configs.append(_make_config(sorted(s3), label))

    return configs


def generate_phase2_configs(phase1_results: list[SwapEvalResult],
                             rng: random.Random,
                             prior_usage: dict[str, int] | None = None,
                             seen: set[frozenset] | None = None) -> list[PoolConfig]:
    """Generate all phase 2 (smart) configs."""
    if seen is None:
        seen = set()
        # Add all phase1 configs to seen set
        for r in phase1_results:
            seen.add(_config_key(r.config))

    configs = []

    # Usage-guided (only if prior data available)
    if prior_usage:
        configs.extend(generate_usage_guided_partitions(prior_usage, rng, seen))
    else:
        # Without prior data, use phase 1 results to derive usage
        merged = Counter()
        for r in phase1_results:
            if r.perk_usage:
                merged.update(r.perk_usage)
        if merged:
            configs.extend(generate_usage_guided_partitions(dict(merged), rng, seen))

    # Category-aware
    configs.extend(generate_category_partitions(rng, seen))

    # Extrapolated from top phase 1 results
    configs.extend(generate_extrapolated(phase1_results, rng, seen))

    return configs


# ---------------------------------------------------------------------------
# Phase 3: Local refinement (neighbors)
# ---------------------------------------------------------------------------

def generate_neighbors(config: PoolConfig, rng: random.Random,
                        n_neighbors: int = 20,
                        seen: set[frozenset] | None = None) -> list[PoolConfig]:
    """Generate neighbor configs by small mutations.

    Mutations:
    - swap-1: Exchange 1 perk between pools (size unchanged)
    - swap-2: Exchange 2 perks (size unchanged)
    - move-1: Move 1 perk to the other pool (size changes by 1)
    """
    if seen is None:
        seen = set()

    configs = []
    s3_list = sorted(config.slot3_pool)
    s4_list = sorted(config.slot4_pool)
    src_label = config.label[:15]
    attempts = 0
    max_attempts = n_neighbors * 20

    while len(configs) < n_neighbors and attempts < max_attempts:
        attempts += 1
        mutation = rng.choice(['swap1', 'swap2', 'move1'])
        s3 = list(s3_list)
        s4 = list(s4_list)

        if mutation == 'swap1' and s3 and s4:
            i = rng.randrange(len(s3))
            j = rng.randrange(len(s4))
            s3[i], s4[j] = s4[j], s3[i]
        elif mutation == 'swap2' and len(s3) >= 2 and len(s4) >= 2:
            i1, i2 = rng.sample(range(len(s3)), 2)
            j1, j2 = rng.sample(range(len(s4)), 2)
            s3[i1], s4[j1] = s4[j1], s3[i1]
            s3[i2], s4[j2] = s4[j2], s3[i2]
        elif mutation == 'move1':
            if rng.random() < 0.5 and len(s3) > 5:
                # Move from s3 to s4
                idx = rng.randrange(len(s3))
                moved = s3.pop(idx)
                s4.append(moved)
            elif len(s4) > 5:
                # Move from s4 to s3
                idx = rng.randrange(len(s4))
                moved = s4.pop(idx)
                s3.append(moved)
            else:
                continue

        key = frozenset(s3)
        if key not in seen:
            seen.add(key)
            label = f"nbr-{src_label}-{mutation}-{len(configs)}"
            configs.append(_make_config(s3, label))

    return configs


def generate_phase3_configs(top_results: list[SwapEvalResult],
                             rng: random.Random,
                             n_neighbors: int = 20,
                             seen: set[frozenset] | None = None) -> list[PoolConfig]:
    """Generate phase 3 refinement configs from top results."""
    if seen is None:
        seen = set()

    configs = []
    for result in top_results[:20]:
        seen.add(_config_key(result.config))
        neighbors = generate_neighbors(result.config, rng, n_neighbors, seen)
        configs.extend(neighbors)

    return deduplicate_configs(configs)


# ---------------------------------------------------------------------------
# ReshuffleOptimizer
# ---------------------------------------------------------------------------

class ReshuffleOptimizer:
    """4-phase pool reshuffle optimizer.

    Delegates evaluation to PoolSwapOptimizer.run_program().
    """

    def __init__(self,
                 games_per_eval: int = 200,
                 games_validate: int = 1000,
                 seed: int = 42,
                 depth: int = 1,
                 minimax_profile: str = 'minimax-v3',
                 output_dir: str = 'reshuffle_results',
                 prior_history: str | None = None,
                 verbose: bool = True):
        self.games_per_eval = games_per_eval
        self.games_validate = games_validate
        self.seed = seed
        self.depth = depth
        self.minimax_profile = minimax_profile
        self.output_dir = output_dir
        self.prior_history = prior_history
        self.verbose = verbose

        self.rng = random.Random(seed)
        self.all_results: list[SwapEvalResult] = []
        self._seen: set[frozenset] = set()

    def _make_optimizer(self, games: int) -> PoolSwapOptimizer:
        opt = PoolSwapOptimizer(
            games_per_eval=games,
            seed=self.seed,
            depth=self.depth,
            minimax_profile=self.minimax_profile,
        )
        opt._output_dir = self.output_dir
        return opt

    def _print_phase_header(self, phase: int, title: str, n_configs: int, games: int):
        if not self.verbose:
            return
        print()
        print("=" * 60)
        print(f"PHASE {phase}: {title}")
        print(f"  Configs: {n_configs}, Games/eval: {games}")
        print("=" * 60)

    def _print_phase_summary(self, phase: int, results: list[SwapEvalResult], elapsed: float):
        if not self.verbose or not results:
            return
        best = results[0]
        print(f"\nPhase {phase} complete: {len(results)} configs in {format_duration(elapsed)}")
        print(f"  Best: {best.config.label}  WR={best.win_rate*100:.1f}%  "
              f"slots=[{best.slot1_pct:.0f},{best.slot2_pct:.0f},{best.slot3_pct:.0f},{best.slot4_pct:.0f}]  "
              f"score={best.composite_score:.1f}")
        print(f"  Pool sizes: slot3={len(best.config.slot3_pool)}, slot4={len(best.config.slot4_pool)}")

    def _sorted_results(self, results: list[SwapEvalResult]) -> list[SwapEvalResult]:
        return sorted(results, key=lambda r: r.composite_score, reverse=True)

    def run_phase1_survey(self) -> list[SwapEvalResult]:
        """Phase 1: Random partitions across size ratios."""
        configs = generate_phase1_configs(self.rng)
        for c in configs:
            self._seen.add(_config_key(c))

        self._print_phase_header(1, "Random survey", len(configs), self.games_per_eval)

        opt = self._make_optimizer(self.games_per_eval)
        start = time.time()
        results = opt.run_program(configs, verbose=self.verbose, output_dir=self.output_dir)
        elapsed = time.time() - start

        self.all_results.extend(results)
        self._print_phase_summary(1, results, elapsed)

        # Save phase results
        opt.save_results(self.output_dir, phase_label='phase1')
        return results

    def run_phase2_smart(self, phase1_results: list[SwapEvalResult]) -> list[SwapEvalResult]:
        """Phase 2: Usage-guided + category-aware + extrapolated."""
        prior_usage = None
        if self.prior_history:
            try:
                prior_usage = load_prior_usage(self.prior_history)
                if self.verbose:
                    print(f"  Loaded prior usage data: {len(prior_usage)} perks")
            except Exception as e:
                if self.verbose:
                    print(f"  Warning: could not load prior history: {e}")

        configs = generate_phase2_configs(phase1_results, self.rng, prior_usage, self._seen)

        self._print_phase_header(2, "Smart partitions", len(configs), self.games_per_eval)

        opt = self._make_optimizer(self.games_per_eval)
        start = time.time()
        results = opt.run_program(configs, verbose=self.verbose, output_dir=self.output_dir)
        elapsed = time.time() - start

        self.all_results.extend(results)
        self._print_phase_summary(2, results, elapsed)

        opt.save_results(self.output_dir, phase_label='phase2')
        return results

    def run_phase3_refine(self, prior_results: list[SwapEvalResult]) -> list[SwapEvalResult]:
        """Phase 3: Local refinement of top configs."""
        sorted_prior = self._sorted_results(prior_results)
        configs = generate_phase3_configs(sorted_prior, self.rng, seen=self._seen)

        self._print_phase_header(3, "Local refinement", len(configs), self.games_per_eval)

        opt = self._make_optimizer(self.games_per_eval)
        start = time.time()
        results = opt.run_program(configs, verbose=self.verbose, output_dir=self.output_dir)
        elapsed = time.time() - start

        self.all_results.extend(results)
        self._print_phase_summary(3, results, elapsed)

        opt.save_results(self.output_dir, phase_label='phase3')
        return results

    def run_phase4_validate(self) -> list[SwapEvalResult]:
        """Phase 4: Re-evaluate top 20 overall with high game count."""
        sorted_all = self._sorted_results(self.all_results)
        top_configs = []
        seen_keys: set[frozenset] = set()
        for r in sorted_all:
            key = _config_key(r.config)
            if key not in seen_keys:
                seen_keys.add(key)
                # Relabel for validation
                cfg = PoolConfig(
                    slot3_pool=r.config.slot3_pool,
                    slot4_pool=r.config.slot4_pool,
                    label=f"validate-{r.config.label[:25]}",
                )
                top_configs.append(cfg)
            if len(top_configs) >= 20:
                break

        # Always include baseline
        baseline_key = frozenset(DEFAULT_SLOT3)
        if baseline_key not in seen_keys:
            top_configs.insert(0, PoolConfig(
                slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4,
                label='validate-baseline'))

        self._print_phase_header(4, "Validation", len(top_configs), self.games_validate)

        opt = self._make_optimizer(self.games_validate)
        start = time.time()
        results = opt.run_program(top_configs, verbose=self.verbose, output_dir=self.output_dir)
        elapsed = time.time() - start

        self._print_phase_summary(4, results, elapsed)

        opt.save_results(self.output_dir, phase_label='phase4_validation')
        return results

    def run_all(self) -> list[SwapEvalResult]:
        """Run all 4 phases sequentially."""
        overall_start = time.time()

        if self.verbose:
            print("=" * 60)
            print("POOL RESHUFFLE OPTIMIZER")
            print("=" * 60)
            print(f"  Games/eval: {self.games_per_eval}")
            print(f"  Games/validate: {self.games_validate}")
            print(f"  AI: minimax depth={self.depth} ({self.minimax_profile})")
            print(f"  Seed: {self.seed}")
            print(f"  Output: {self.output_dir}")
            if self.prior_history:
                print(f"  Prior history: {self.prior_history}")
            print("=" * 60)

        # Phase 1
        results_p1 = self.run_phase1_survey()

        # Phase 2
        results_p2 = self.run_phase2_smart(results_p1)

        # Phase 3
        combined_12 = results_p1 + results_p2
        results_p3 = self.run_phase3_refine(combined_12)

        # Phase 4
        results_p4 = self.run_phase4_validate()

        wall_time = time.time() - overall_start

        # Save final report
        self._save_final_report(results_p1, results_p2, results_p3, results_p4, wall_time)

        if self.verbose:
            print()
            print("=" * 60)
            print(f"RESHUFFLE COMPLETE  ({format_duration(wall_time)})")
            print("=" * 60)
            if results_p4:
                best = results_p4[0]
                print(f"  Best validated: {best.config.label}")
                print(f"    WR={best.win_rate*100:.1f}%  "
                      f"slots=[{best.slot1_pct:.0f},{best.slot2_pct:.0f},{best.slot3_pct:.0f},{best.slot4_pct:.0f}]  "
                      f"score={best.composite_score:.1f}")
                print(f"    Pool sizes: slot3={len(best.config.slot3_pool)}, slot4={len(best.config.slot4_pool)}")

        return results_p4

    def _save_final_report(self,
                            results_p1: list[SwapEvalResult],
                            results_p2: list[SwapEvalResult],
                            results_p3: list[SwapEvalResult],
                            results_p4: list[SwapEvalResult],
                            wall_time: float):
        """Save combined final report from all phases."""
        out = Path(self.output_dir)
        out.mkdir(parents=True, exist_ok=True)

        # Find baseline
        baseline = next((r for r in results_p1 if 'baseline' in r.config.label), None)

        # Best from validation (or all if no validation)
        final_results = results_p4 if results_p4 else self.all_results
        best = max(final_results, key=lambda r: r.composite_score) if final_results else None

        report = {
            'wall_time_seconds': round(wall_time, 1),
            'wall_time_human': format_duration(wall_time),
            'settings': {
                'games_per_eval': self.games_per_eval,
                'games_validate': self.games_validate,
                'seed': self.seed,
                'depth': self.depth,
                'minimax_profile': self.minimax_profile,
            },
            'phases': {
                'phase1_random_survey': {
                    'configs_evaluated': len(results_p1),
                    'best_score': round(results_p1[0].composite_score, 2) if results_p1 else 0,
                    'best_label': results_p1[0].config.label if results_p1 else '',
                },
                'phase2_smart': {
                    'configs_evaluated': len(results_p2),
                    'best_score': round(results_p2[0].composite_score, 2) if results_p2 else 0,
                    'best_label': results_p2[0].config.label if results_p2 else '',
                },
                'phase3_refinement': {
                    'configs_evaluated': len(results_p3),
                    'best_score': round(results_p3[0].composite_score, 2) if results_p3 else 0,
                    'best_label': results_p3[0].config.label if results_p3 else '',
                },
                'phase4_validation': {
                    'configs_evaluated': len(results_p4),
                    'best_score': round(results_p4[0].composite_score, 2) if results_p4 else 0,
                    'best_label': results_p4[0].config.label if results_p4 else '',
                },
            },
            'total_evaluations': len(results_p1) + len(results_p2) + len(results_p3) + len(results_p4),
        }

        if best:
            report['best_overall'] = best.to_dict()
            # Show pool composition
            report['best_pools'] = {
                'slot3': list(best.config.slot3_pool),
                'slot4': list(best.config.slot4_pool),
                'slot3_size': len(best.config.slot3_pool),
                'slot4_size': len(best.config.slot4_pool),
            }

        if baseline:
            report['baseline'] = baseline.to_dict()
            if best:
                report['best_vs_baseline'] = diff_from_baseline(best, baseline)

        # Top 20 from validation
        if results_p4:
            report['top_20_validated'] = [r.to_dict() for r in results_p4[:20]]

        path = out / 'final_report.json'
        with open(path, 'w') as f:
            json.dump(report, f, indent=2)

        if self.verbose:
            print(f"\nFinal report saved to {path}")
