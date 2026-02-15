"""Pool swap optimizer - finds perk-to-slot assignments that maximize win rate + slot diversity."""

import json
import time
from collections import Counter
from dataclasses import dataclass, field
from itertools import combinations
from pathlib import Path
from datetime import datetime

from src.game.config import GameConfig, DEFAULT_CONFIG
from src.ai import create_ai_function, create_expectimax_ai, get_minimax_profile, Difficulty
from src.simulation import SimulationRunner


# Default pools from GameConfig
DEFAULT_SLOT3 = DEFAULT_CONFIG.slot3_pool
DEFAULT_SLOT4 = DEFAULT_CONFIG.slot4_pool


def format_duration(seconds: float) -> str:
    """Format seconds as human-readable duration (e.g. '2h15m' or '45m30s')."""
    if seconds < 0:
        return '0s'
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f'{h}h{m:02d}m'
    if m > 0:
        return f'{m}m{s:02d}s'
    return f'{s}s'


@dataclass
class PoolConfig:
    """A single pool configuration to evaluate."""
    slot3_pool: tuple[str, ...]
    slot4_pool: tuple[str, ...]
    label: str = ""

    def to_dict(self) -> dict:
        return {
            'slot3': list(self.slot3_pool),
            'slot4': list(self.slot4_pool),
            'label': self.label,
        }

    @staticmethod
    def from_dict(d: dict) -> 'PoolConfig':
        return PoolConfig(
            slot3_pool=tuple(d['slot3']),
            slot4_pool=tuple(d['slot4']),
            label=d.get('label', ''),
        )


@dataclass
class SwapEvalResult:
    """Result from evaluating one pool configuration."""
    config: PoolConfig
    win_rate: float
    slot1_pct: float
    slot2_pct: float
    slot3_pct: float
    slot4_pct: float
    composite_score: float
    games_played: int
    elapsed_time: float
    perk_usage: dict[str, int] = field(default_factory=dict)

    def meets_primary(self, win_target: float = 0.70,
                      slot3_target: float = 25.0, slot4_target: float = 25.0) -> bool:
        return (self.win_rate >= win_target and
                self.slot3_pct >= slot3_target and
                self.slot4_pct >= slot4_target)

    def meets_stretch(self) -> bool:
        return self.win_rate >= 0.80 and self.slot3_pct >= 35.0 and self.slot4_pct >= 35.0

    def to_dict(self) -> dict:
        d = {
            'config': self.config.to_dict(),
            'win_rate': round(self.win_rate, 4),
            'slot1_pct': round(self.slot1_pct, 1),
            'slot2_pct': round(self.slot2_pct, 1),
            'slot3_pct': round(self.slot3_pct, 1),
            'slot4_pct': round(self.slot4_pct, 1),
            'composite_score': round(self.composite_score, 2),
            'games_played': self.games_played,
            'elapsed_time': round(self.elapsed_time, 2),
        }
        if self.perk_usage:
            d['perk_usage'] = dict(sorted(self.perk_usage.items(), key=lambda x: -x[1]))
        return d


def diff_from_baseline(result: SwapEvalResult, baseline: SwapEvalResult) -> dict:
    """Returns delta dict comparing result to baseline."""
    return {
        'label': result.config.label,
        'win_rate_delta': round(result.win_rate - baseline.win_rate, 4),
        'slot3_delta': round(result.slot3_pct - baseline.slot3_pct, 1),
        'slot4_delta': round(result.slot4_pct - baseline.slot4_pct, 1),
        'score_delta': round(result.composite_score - baseline.composite_score, 2),
    }


def compute_pool_swap_score(win_rate: float, slot3_pct: float, slot4_pct: float,
                            win_target: float = 0.70,
                            slot3_target: float = 25.0,
                            slot4_target: float = 25.0) -> float:
    """Smooth composite: win_rate dominates, slot bonuses reward diversity.

    base          = win_rate * 100                     (0-100)
    slot3_bonus   = min(slot3_pct / target, 1.0) * 15  (0-15)
    slot4_bonus   = min(slot4_pct / target, 1.0) * 15  (0-15)
    all_met_bonus = 20 if all targets met else 0
    Total range: 0-150
    """
    base = win_rate * 100
    slot3_bonus = min(slot3_pct / slot3_target, 1.0) * 15 if slot3_target > 0 else 0
    slot4_bonus = min(slot4_pct / slot4_target, 1.0) * 15 if slot4_target > 0 else 0

    all_met = (win_rate >= win_target and
               slot3_pct >= slot3_target and
               slot4_pct >= slot4_target)
    all_met_bonus = 20.0 if all_met else 0.0

    return base + slot3_bonus + slot4_bonus + all_met_bonus


def evaluate_pool_config(config: PoolConfig,
                         n_games: int = 200,
                         seed: int = 0,
                         depth: int = 1,
                         minimax_profile: str = 'minimax-v3',
                         win_target: float = 0.70,
                         slot3_target: float = 25.0,
                         slot4_target: float = 25.0) -> SwapEvalResult:
    """Evaluate a pool configuration by running minimax vs hard(v1).

    Runs two suites (half games each) to remove first-mover bias:
    - Suite A: test (minimax) as P1, opponent (hard v1) as P2
    - Suite B: opponent as P1, test as P2
    Averages win rate and slot percentages from test player's perspective.
    """
    start = time.time()
    games_per_suite = n_games // 2

    game_config = GameConfig(slot3_pool=config.slot3_pool, slot4_pool=config.slot4_pool)
    mm_profile = get_minimax_profile(minimax_profile)

    # Suite A: minimax as P1 vs hard(v1) as P2
    ai_test_p1 = create_expectimax_ai(depth, profile=mm_profile)
    ai_opp_p2 = create_ai_function(Difficulty.HARD, 'v1')
    runner_a = SimulationRunner(ai_test_p1, ai_opp_p2, seed_start=seed, config=game_config)
    result_a = runner_a.run(games_per_suite, verbose=False)

    # Suite B: hard(v1) as P1 vs minimax as P2
    ai_opp_p1 = create_ai_function(Difficulty.HARD, 'v1')
    ai_test_p2 = create_expectimax_ai(depth, profile=mm_profile)
    runner_b = SimulationRunner(ai_opp_p1, ai_test_p2, seed_start=seed + 10000, config=game_config)
    result_b = runner_b.run(games_per_suite, verbose=False)

    # Win rate: average test player's wins from both suites
    win_rate = (result_a.player1_win_rate + result_b.player2_win_rate) / 2

    # Slot pcts: average test player's slot usage from both suites
    p1_slots = result_a.slot_percentages_p1  # test is P1 in suite A
    p2_slots = result_b.slot_percentages_p2  # test is P2 in suite B
    slot1 = (p1_slots.get(1, 0) + p2_slots.get(1, 0)) / 2
    slot2 = (p1_slots.get(2, 0) + p2_slots.get(2, 0)) / 2
    slot3 = (p1_slots.get(3, 0) + p2_slots.get(3, 0)) / 2
    slot4 = (p1_slots.get(4, 0) + p2_slots.get(4, 0)) / 2

    # Perk usage: merge test player's usage from both suites
    perk_usage = Counter(result_a.perk_usage_p1)
    perk_usage.update(result_b.perk_usage_p2)

    score = compute_pool_swap_score(win_rate, slot3, slot4, win_target, slot3_target, slot4_target)
    elapsed = time.time() - start

    return SwapEvalResult(
        config=config,
        win_rate=win_rate,
        slot1_pct=slot1,
        slot2_pct=slot2,
        slot3_pct=slot3,
        slot4_pct=slot4,
        composite_score=score,
        games_played=n_games,
        elapsed_time=elapsed,
        perk_usage=dict(perk_usage),
    )


# ---------------------------------------------------------------------------
# Program generators
# ---------------------------------------------------------------------------

def generate_all_single_swaps() -> list[PoolConfig]:
    """All 225 configs: baseline + each swap of one slot3 perk with one slot4 perk."""
    configs = [PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline')]

    for s3_perk in DEFAULT_SLOT3:
        for s4_perk in DEFAULT_SLOT4:
            new_s3 = tuple(s4_perk if p == s3_perk else p for p in DEFAULT_SLOT3)
            new_s4 = tuple(s3_perk if p == s4_perk else p for p in DEFAULT_SLOT4)
            label = f"swap {s3_perk}<->{s4_perk}"
            configs.append(PoolConfig(slot3_pool=new_s3, slot4_pool=new_s4, label=label))

    return configs


def generate_cumulative_swaps(swaps: list[tuple[str, str]]) -> list[PoolConfig]:
    """Apply swaps cumulatively. Entry 0=baseline, entry N=first N swaps applied.
    Each (a, b) = move a from slot3 to slot4, move b from slot4 to slot3."""
    configs = [PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline')]

    current_s3 = list(DEFAULT_SLOT3)
    current_s4 = list(DEFAULT_SLOT4)

    for a, b in swaps:
        # Swap: a goes from slot3 to slot4, b goes from slot4 to slot3
        s3_idx = current_s3.index(a)
        s4_idx = current_s4.index(b)
        current_s3[s3_idx] = b
        current_s4[s4_idx] = a
        label = f"swap {a}<->{b}"
        configs.append(PoolConfig(
            slot3_pool=tuple(current_s3),
            slot4_pool=tuple(current_s4),
            label=label,
        ))

    return configs


def generate_stacking_combos(top_configs: list[PoolConfig], max_depth: int = 3) -> list[PoolConfig]:
    """From top single-swap configs, generate cumulative combo configs.

    Detects which swap each config represents (diff vs default pools),
    then generates all pairs and triples of those swaps applied together.
    """
    # Detect what swap each config represents
    swaps = []
    for cfg in top_configs:
        moved_to_s4 = None
        moved_to_s3 = None
        for p in DEFAULT_SLOT3:
            if p not in cfg.slot3_pool:
                moved_to_s4 = p
                break
        for p in DEFAULT_SLOT4:
            if p not in cfg.slot4_pool:
                moved_to_s3 = p
                break
        if moved_to_s4 and moved_to_s3:
            swaps.append((moved_to_s4, moved_to_s3))

    if not swaps:
        return [PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline')]

    configs = [PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='combo-baseline')]

    # Generate combinations of depth 2..max_depth
    for depth in range(2, min(max_depth + 1, len(swaps) + 1)):
        for combo in combinations(range(len(swaps)), depth):
            s3 = list(DEFAULT_SLOT3)
            s4 = list(DEFAULT_SLOT4)
            swap_labels = []
            valid = True
            for idx in combo:
                a, b = swaps[idx]
                if a not in s3 or b not in s4:
                    valid = False
                    break
                s3_idx = s3.index(a)
                s4_idx = s4.index(b)
                s3[s3_idx] = b
                s4[s4_idx] = a
                swap_labels.append(f"{a}<->{b}")
            if valid:
                label = f"combo({'+'.join(swap_labels)})"
                configs.append(PoolConfig(slot3_pool=tuple(s3), slot4_pool=tuple(s4), label=label))

    return configs


def extract_top_configs(history_file: str, n: int = 15) -> list[PoolConfig]:
    """Load history JSON, sort by composite_score, return top N configs."""
    with open(history_file, 'r') as f:
        data = json.load(f)
    data.sort(key=lambda x: x.get('composite_score', 0), reverse=True)
    return [PoolConfig.from_dict(entry['config']) for entry in data[:n]]


def load_program(filepath: str) -> list[PoolConfig]:
    """Load program from JSON file.

    Format: [{"slot3": [...], "slot4": [...], "label": "..."},  ...]
    """
    with open(filepath, 'r') as f:
        data = json.load(f)
    return [PoolConfig.from_dict(entry) for entry in data]


# ---------------------------------------------------------------------------
# Optimizer class
# ---------------------------------------------------------------------------

class PoolSwapOptimizer:
    def __init__(self, games_per_eval: int = 200, seed: int = 42, depth: int = 1,
                 minimax_profile: str = 'minimax-v3',
                 win_target: float = 0.70,
                 slot3_target: float = 25.0, slot4_target: float = 25.0):
        self.games_per_eval = games_per_eval
        self.seed = seed
        self.depth = depth
        self.minimax_profile = minimax_profile
        self.win_target = win_target
        self.slot3_target = slot3_target
        self.slot4_target = slot4_target
        self.history: list[SwapEvalResult] = []
        self._output_dir: str | None = None

    def _evaluate(self, config: PoolConfig) -> SwapEvalResult:
        return evaluate_pool_config(
            config,
            n_games=self.games_per_eval,
            seed=self.seed,
            depth=self.depth,
            minimax_profile=self.minimax_profile,
            win_target=self.win_target,
            slot3_target=self.slot3_target,
            slot4_target=self.slot4_target,
        )

    def _save_incremental(self, output_dir: str):
        """Overwrite incremental history file after each eval for crash recovery."""
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)
        path = out / 'history_incremental.json'
        with open(path, 'w') as f:
            json.dump([r.to_dict() for r in self.history], f, indent=2)

    def run_program(self, configs: list[PoolConfig], verbose: bool = True,
                    output_dir: str | None = None) -> list[SwapEvalResult]:
        """Evaluate each config in sequence, log all results.

        Returns all results sorted by composite_score (descending).
        """
        total = len(configs)
        results: list[SwapEvalResult] = []
        start_time = time.time()

        for i, config in enumerate(configs):
            result = self._evaluate(config)
            results.append(result)
            self.history.append(result)

            # Incremental save for crash recovery
            save_dir = output_dir or self._output_dir
            if save_dir:
                self._save_incremental(save_dir)

            if verbose:
                elapsed = time.time() - start_time
                avg_per_eval = elapsed / (i + 1)
                remaining = avg_per_eval * (total - i - 1)
                elapsed_str = format_duration(elapsed)
                eta_str = format_duration(remaining)
                wr_pct = result.win_rate * 100
                slots = f"[{result.slot1_pct:.0f},{result.slot2_pct:.0f},{result.slot3_pct:.0f},{result.slot4_pct:.0f}]"
                print(f"[{i+1:3d}/{total}] {config.label:30s}  WR={wr_pct:.1f}% slots={slots} score={result.composite_score:.1f}  ({elapsed_str}, ETA {eta_str})")

        results.sort(key=lambda r: r.composite_score, reverse=True)
        return results

    def run_greedy(self, max_rounds: int = 10, verbose: bool = True) -> list[SwapEvalResult]:
        """Greedy hill climbing: generate all single swaps from current best,
        pick best, apply, repeat."""
        current_s3 = list(DEFAULT_SLOT3)
        current_s4 = list(DEFAULT_SLOT4)
        all_results: list[SwapEvalResult] = []

        for round_num in range(max_rounds):
            if verbose:
                print(f"\n--- Greedy Round {round_num + 1}/{max_rounds} ---")

            # Generate all single swaps from current state
            configs = [PoolConfig(slot3_pool=tuple(current_s3), slot4_pool=tuple(current_s4),
                                  label=f'round{round_num+1}-baseline')]

            for s3_perk in current_s3:
                for s4_perk in current_s4:
                    new_s3 = tuple(s4_perk if p == s3_perk else p for p in current_s3)
                    new_s4 = tuple(s3_perk if p == s4_perk else p for p in current_s4)
                    label = f"r{round_num+1} {s3_perk}<->{s4_perk}"
                    configs.append(PoolConfig(slot3_pool=new_s3, slot4_pool=new_s4, label=label))

            round_results = self.run_program(configs, verbose=verbose)
            all_results.extend(round_results)

            best = round_results[0]
            baseline = next(r for r in round_results if 'baseline' in r.config.label)

            if best.composite_score <= baseline.composite_score:
                if verbose:
                    print(f"No improvement found. Stopping.")
                break

            # Apply best swap
            current_s3 = list(best.config.slot3_pool)
            current_s4 = list(best.config.slot4_pool)

            if verbose:
                print(f"Best: {best.config.label}  score={best.composite_score:.1f}")

        return sorted(all_results, key=lambda r: r.composite_score, reverse=True)

    def save_results(self, output_dir: str = 'pool_swap_results',
                     phase_label: str | None = None) -> dict[str, str]:
        """Save history + best config + summary to JSON.

        If phase_label is set, files are prefixed with the phase label instead of timestamp.
        """
        out = Path(output_dir)
        out.mkdir(parents=True, exist_ok=True)

        if phase_label:
            prefix = phase_label
        else:
            prefix = datetime.now().strftime('%Y%m%d_%H%M%S')

        saved = {}

        # History
        history_path = out / f'{prefix}_history.json'
        with open(history_path, 'w') as f:
            json.dump([r.to_dict() for r in self.history], f, indent=2)
        saved['history'] = str(history_path)

        # Best config
        if self.history:
            best = max(self.history, key=lambda r: r.composite_score)
            best_path = out / f'{prefix}_best_config.json'
            with open(best_path, 'w') as f:
                json.dump(best.to_dict(), f, indent=2)
            saved['best_config'] = str(best_path)

        # Summary (with baseline delta if baseline exists)
        sorted_results = sorted(self.history, key=lambda r: r.composite_score, reverse=True)
        baseline_result = next((r for r in self.history if 'baseline' in r.config.label), None)

        top_entries = []
        for r in sorted_results[:10]:
            entry = r.to_dict()
            if baseline_result and r is not baseline_result:
                entry['baseline_delta'] = diff_from_baseline(r, baseline_result)
            top_entries.append(entry)

        summary = {
            'settings': {
                'games_per_eval': self.games_per_eval,
                'seed': self.seed,
                'depth': self.depth,
                'minimax_profile': self.minimax_profile,
                'win_target': self.win_target,
                'slot3_target': self.slot3_target,
                'slot4_target': self.slot4_target,
            },
            'total_evaluations': len(self.history),
            'top_10': top_entries,
            'bottom_10': [r.to_dict() for r in sorted_results[-10:]],
        }
        if baseline_result:
            summary['baseline'] = baseline_result.to_dict()

        summary_path = out / f'{prefix}_summary.json'
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2)
        saved['summary'] = str(summary_path)

        return saved


def save_final_report(results_p1: list[SwapEvalResult],
                      results_p2: list[SwapEvalResult],
                      results_p3: list[SwapEvalResult],
                      output_dir: str,
                      wall_time: float):
    """Save combined final report from all 3 overnight phases."""
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # Find baseline from phase 1
    baseline = next((r for r in results_p1 if 'baseline' in r.config.label), None)

    # Overall best across all phases
    all_results = results_p1 + results_p2 + results_p3
    best = max(all_results, key=lambda r: r.composite_score)

    report = {
        'wall_time_seconds': round(wall_time, 1),
        'wall_time_human': format_duration(wall_time),
        'phases': {
            'phase1_landscape': {
                'configs_evaluated': len(results_p1),
                'best_score': round(results_p1[0].composite_score, 2) if results_p1 else 0,
                'best_label': results_p1[0].config.label if results_p1 else '',
            },
            'phase2_revalidate': {
                'configs_evaluated': len(results_p2),
                'best_score': round(results_p2[0].composite_score, 2) if results_p2 else 0,
                'best_label': results_p2[0].config.label if results_p2 else '',
            },
            'phase3_stacking': {
                'configs_evaluated': len(results_p3),
                'best_score': round(results_p3[0].composite_score, 2) if results_p3 else 0,
                'best_label': results_p3[0].config.label if results_p3 else '',
            },
        },
        'best_overall': best.to_dict(),
    }

    if baseline:
        report['baseline'] = baseline.to_dict()
        report['best_vs_baseline'] = diff_from_baseline(best, baseline)

    path = out / 'final_report.json'
    with open(path, 'w') as f:
        json.dump(report, f, indent=2)
    print(f"\nFinal report saved to {path}")
