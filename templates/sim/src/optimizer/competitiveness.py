"""Perk competitiveness analysis — per-perk scoring from AI decision data.

Collects AI evaluation data during games, ranks all 30 perks by how
competitive they are vs slot 1/2 defaults, then generates targeted
balanced pool configs for evaluation.

Pipeline:
  1. Collect: Run games with wrapped AI, capture per-decision eval data
  2. Analyze: Rank perks by competitiveness score
  3. Generate: Create balanced configs from rankings
  4. Evaluate: Run evaluate_pool_config() on generated configs
"""

import random
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from src.game.config import GameConfig, DEFAULT_CONFIG
from src.game.state import Player
from src.ai import create_expectimax_ai, create_ai_function, Difficulty, get_minimax_profile
from src.simulation.runner import SimulationRunner

from .pool_swap import PoolConfig, SwapEvalResult, evaluate_pool_config
from .pool_reshuffle import ALL_PERKS, PERK_CATEGORIES, _config_key

DEFAULT_SLOT3 = DEFAULT_CONFIG.slot3_pool
DEFAULT_SLOT4 = DEFAULT_CONFIG.slot4_pool


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------

@dataclass
class PerkDecisionRecord:
    """One AI decision about a single perk offering."""
    perk_name: str
    slot: int               # 3 or 4
    score: float
    was_selected: bool
    best_score: float       # score of the slot that was actually chosen
    score_gap: float        # best_score - this perk's score
    turn: int
    game_phase: str         # 'early', 'mid', 'late'
    contested_lanes: int    # lanes where both players have pieces
    near_win_lanes: int     # lanes where current player has 4+ pieces


class DecisionCollector:
    """Accumulates PerkDecisionRecord objects across many games."""

    def __init__(self):
        self.records: list[PerkDecisionRecord] = []

    def record_decision(self, state, evaluations: dict,
                        selected_slot: int | str) -> None:
        """Extract per-perk records from one AI decision.

        Args:
            state: GameState at decision time (has offered_perks, turn_number, lanes)
            evaluations: dict from get_last_evaluation(), maps str(slot) -> {perk, score, target}
            selected_slot: the slot the AI actually chose (int or 'pass')
        """
        if evaluations is None:
            return

        turn = state.turn_number
        game_phase = _classify_phase(turn)
        contested, near_win = _board_context(state)

        # Find the best score across all evaluated slots
        best_score = max(
            (e['score'] for e in evaluations.values()),
            default=0.0,
        )

        # Record slot 3 and 4 perks only (not slot 1/2/pass)
        for slot_str, eval_data in evaluations.items():
            try:
                slot_int = int(slot_str)
            except (ValueError, TypeError):
                continue  # skip 'pass'
            if slot_int not in (3, 4):
                continue

            perk_name = eval_data.get('perk')
            if not perk_name or perk_name == 'PASS':
                continue

            score = eval_data['score']
            was_selected = (str(selected_slot) == slot_str)

            self.records.append(PerkDecisionRecord(
                perk_name=perk_name,
                slot=slot_int,
                score=score,
                was_selected=was_selected,
                best_score=best_score,
                score_gap=best_score - score,
                turn=turn,
                game_phase=game_phase,
                contested_lanes=contested,
                near_win_lanes=near_win,
            ))

    def __len__(self):
        return len(self.records)


def _classify_phase(turn: int) -> str:
    """Classify turn into early/mid/late game phase."""
    if turn <= 8:
        return 'early'
    elif turn <= 20:
        return 'mid'
    else:
        return 'late'


def _board_context(state) -> tuple[int, int]:
    """Return (contested_lanes, near_win_lanes) for current player."""
    player = state.current_player
    contested = 0
    near_win = 0
    for lane in state.lanes:
        if lane.winner is not None:
            continue
        p_pieces = lane.pieces_for(player)
        o_pieces = lane.pieces_for(player.opponent())
        if p_pieces > 0 and o_pieces > 0:
            contested += 1
        if p_pieces >= state.config.SLOTS_PER_SIDE - 1:
            near_win += 1
    return contested, near_win


# ---------------------------------------------------------------------------
# AI wrapper
# ---------------------------------------------------------------------------

def wrap_ai_with_collector(ai_func, collector: DecisionCollector):
    """Wrap an AI function to intercept evaluation data after each call.

    Returns a new callable with the same interface and monkey-patched
    .get_last_evaluation() and .ai_type attributes.
    """

    def wrapped(state):
        result = ai_func(state)

        # Grab evaluation data and record it
        if hasattr(ai_func, 'get_last_evaluation'):
            evaluations = ai_func.get_last_evaluation()
            if evaluations is not None:
                slot = result[0]
                collector.record_decision(state, evaluations, slot)

        return result

    # Proxy attributes the engine expects
    if hasattr(ai_func, 'get_last_evaluation'):
        wrapped.get_last_evaluation = ai_func.get_last_evaluation
    if hasattr(ai_func, 'ai_type'):
        wrapped.ai_type = ai_func.ai_type

    return wrapped


def run_data_collection(config: PoolConfig,
                        n_games: int = 1000,
                        seed: int = 0,
                        depth: int = 1,
                        minimax_profile: str = 'minimax-v3',
                        ) -> DecisionCollector:
    """Run games and collect per-decision AI evaluation data.

    Uses two-suite methodology (test as P1 and P2) to remove first-mover bias.
    Only collects data from the test (minimax) AI, not the opponent.

    Returns:
        DecisionCollector with all recorded decisions
    """
    collector = DecisionCollector()
    games_per_suite = n_games // 2
    game_config = GameConfig(slot3_pool=config.slot3_pool, slot4_pool=config.slot4_pool)
    mm_profile = get_minimax_profile(minimax_profile)

    # Suite A: minimax as P1 vs hard(v1) as P2
    ai_test = create_expectimax_ai(depth, profile=mm_profile)
    ai_test_wrapped = wrap_ai_with_collector(ai_test, collector)
    ai_opp = create_ai_function(Difficulty.HARD, 'v1')
    runner_a = SimulationRunner(ai_test_wrapped, ai_opp, seed_start=seed, config=game_config)
    runner_a.run(games_per_suite, verbose=False)

    # Suite B: hard(v1) as P1 vs minimax as P2
    ai_test2 = create_expectimax_ai(depth, profile=mm_profile)
    ai_test2_wrapped = wrap_ai_with_collector(ai_test2, collector)
    ai_opp2 = create_ai_function(Difficulty.HARD, 'v1')
    runner_b = SimulationRunner(ai_opp2, ai_test2_wrapped,
                                seed_start=seed + 10000, config=game_config)
    runner_b.run(games_per_suite, verbose=False)

    return collector


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

@dataclass
class PerkCompetitivenessReport:
    """Per-perk competitiveness analysis."""
    perk_name: str
    times_offered: int
    times_selected: int
    selection_rate: float
    beat_slot1_rate: float      # fraction of times this perk scored > slot 1
    avg_score_gap: float        # avg (best_score - this) when not selected
    competitiveness: float      # composite score 0-1
    # Phase breakdown
    selection_rate_early: float
    selection_rate_mid: float
    selection_rate_late: float

    def to_dict(self) -> dict:
        return {
            'perk_name': self.perk_name,
            'times_offered': self.times_offered,
            'times_selected': self.times_selected,
            'selection_rate': round(self.selection_rate, 4),
            'beat_slot1_rate': round(self.beat_slot1_rate, 4),
            'avg_score_gap': round(self.avg_score_gap, 2),
            'competitiveness': round(self.competitiveness, 4),
            'selection_rate_early': round(self.selection_rate_early, 4),
            'selection_rate_mid': round(self.selection_rate_mid, 4),
            'selection_rate_late': round(self.selection_rate_late, 4),
        }


def analyze_decisions(collector: DecisionCollector) -> list[PerkCompetitivenessReport]:
    """Analyze collected decisions and rank perks by competitiveness.

    Returns:
        List of PerkCompetitivenessReport, sorted by competitiveness descending.
    """
    # Group records by perk
    by_perk: dict[str, list[PerkDecisionRecord]] = defaultdict(list)
    for rec in collector.records:
        by_perk[rec.perk_name].append(rec)

    # For normalization: find max avg_gap across all perks
    all_avg_gaps = []
    for perk_name, records in by_perk.items():
        not_selected = [r for r in records if not r.was_selected]
        if not_selected:
            all_avg_gaps.append(sum(r.score_gap for r in not_selected) / len(not_selected))
    max_avg_gap = max(all_avg_gaps) if all_avg_gaps else 1.0

    reports = []
    for perk_name, records in by_perk.items():
        n = len(records)
        selected = [r for r in records if r.was_selected]
        n_selected = len(selected)
        selection_rate = n_selected / n if n > 0 else 0.0

        # Beat slot 1 rate: how often this perk's score > slot 1's score
        beat_slot1_count = 0
        for r in records:
            # We don't have direct slot 1 score in the record, but we can
            # approximate: if this perk was selected, it beat everything including slot 1.
            # If not selected and score_gap > 0, check if slot 1 could have been the winner.
            # Actually, we have the evaluation dict from the collector records...
            # Simpler: the perk "beats slot 1" if it was selected (since slot 1 is always
            # available, being selected means it scored higher than slot 1).
            if r.was_selected:
                beat_slot1_count += 1
        beat_slot1_rate = beat_slot1_count / n if n > 0 else 0.0

        # Avg score gap when not selected
        not_selected = [r for r in records if not r.was_selected]
        avg_gap = (sum(r.score_gap for r in not_selected) / len(not_selected)
                   if not_selected else 0.0)
        norm_avg_gap = avg_gap / max_avg_gap if max_avg_gap > 0 else 0.0

        # Phase breakdown
        by_phase: dict[str, list[PerkDecisionRecord]] = defaultdict(list)
        for r in records:
            by_phase[r.game_phase].append(r)

        def phase_sel_rate(phase: str) -> float:
            recs = by_phase.get(phase, [])
            if not recs:
                return 0.0
            return sum(1 for r in recs if r.was_selected) / len(recs)

        sel_early = phase_sel_rate('early')
        sel_mid = phase_sel_rate('mid')
        sel_late = phase_sel_rate('late')

        # Phase versatility: low variance across phases = high versatility
        phase_rates = [sel_early, sel_mid, sel_late]
        phase_mean = sum(phase_rates) / 3
        phase_var = sum((r - phase_mean) ** 2 for r in phase_rates) / 3
        # Normalize: max variance for a 0-1 variable is 0.25
        phase_versatility = 1.0 - min(phase_var / 0.1, 1.0)

        # Composite competitiveness score
        competitiveness = (
            0.40 * selection_rate +
            0.30 * beat_slot1_rate +
            0.20 * (1.0 - norm_avg_gap) +
            0.10 * phase_versatility
        )

        reports.append(PerkCompetitivenessReport(
            perk_name=perk_name,
            times_offered=n,
            times_selected=n_selected,
            selection_rate=selection_rate,
            beat_slot1_rate=beat_slot1_rate,
            avg_score_gap=avg_gap,
            competitiveness=competitiveness,
            selection_rate_early=sel_early,
            selection_rate_mid=sel_mid,
            selection_rate_late=sel_late,
        ))

    reports.sort(key=lambda r: r.competitiveness, reverse=True)
    return reports


# ---------------------------------------------------------------------------
# Config generation from rankings
# ---------------------------------------------------------------------------

def _make_config(slot3_perks: list[str] | tuple[str, ...],
                 label: str) -> PoolConfig:
    """Build PoolConfig: slot3 = given, slot4 = complement."""
    s3 = tuple(sorted(slot3_perks))
    s4 = tuple(sorted(p for p in ALL_PERKS if p not in s3))
    return PoolConfig(slot3_pool=s3, slot4_pool=s4, label=label)


def generate_balanced_configs(
    rankings: list[PerkCompetitivenessReport],
    seen: Optional[set] = None,
    rng: Optional[random.Random] = None,
) -> list[PoolConfig]:
    """Generate balanced (13-17 per pool) configs from competitiveness rankings.

    Strategies:
    1. Top-competitive 15/15: best 15 in slot3, rest in slot4
    2. Avoid dead-weight: remove bottom N from default pools
    3. Category-concentrated: group competitive perks by category
    4. Noised variants: random 1-2 swaps from each base config
    """
    if seen is None:
        seen = set()
    if rng is None:
        rng = random.Random(42)

    configs: list[PoolConfig] = []
    # Ranked names from analysis + any perks that weren't offered (appended at bottom)
    ranked_names = [r.perk_name for r in rankings]
    unseen = [p for p in ALL_PERKS if p not in ranked_names]
    ranked_names = ranked_names + unseen

    def add(cfg: PoolConfig) -> bool:
        key = _config_key(cfg)
        if key in seen:
            return False
        seen.add(key)
        configs.append(cfg)
        return True

    # Baseline
    add(PoolConfig(slot3_pool=DEFAULT_SLOT3, slot4_pool=DEFAULT_SLOT4, label='baseline'))

    # --- Strategy 1: Top-competitive 15/15 ---
    if len(ranked_names) >= 15:
        top15 = ranked_names[:15]
        add(_make_config(top15, 'top15_competitive'))
        # Also try top 14 and top 16
        if len(ranked_names) >= 14:
            add(_make_config(ranked_names[:14], 'top14_competitive'))
        if len(ranked_names) >= 16:
            add(_make_config(ranked_names[:16], 'top16_competitive'))
        if len(ranked_names) >= 13:
            add(_make_config(ranked_names[:13], 'top13_competitive'))
        if len(ranked_names) >= 17:
            add(_make_config(ranked_names[:17], 'top17_competitive'))

    # --- Strategy 2: Avoid dead-weight ---
    # Take default pools but move bottom-ranked perks to make smaller slot3
    # and larger slot4, or vice versa
    if len(rankings) >= 5:
        # Bottom 5 by competitiveness
        bottom5 = set(ranked_names[-5:])

        # Move bottom perks from slot3 to slot4
        s3_minus = [p for p in DEFAULT_SLOT3 if p not in bottom5]
        if 13 <= len(s3_minus) <= 17:
            add(_make_config(s3_minus, 'slot3_drop_bottom5'))

        # Move bottom perks from slot4 to slot3
        s4_minus = [p for p in DEFAULT_SLOT4 if p not in bottom5]
        s3_plus = list(DEFAULT_SLOT3) + [p for p in bottom5 if p in DEFAULT_SLOT4]
        if 13 <= len(s3_plus) <= 17:
            add(_make_config(s3_plus, 'slot3_absorb_bottom5'))

        # Bottom 3
        bottom3 = set(ranked_names[-3:])
        s3_minus3 = [p for p in DEFAULT_SLOT3 if p not in bottom3]
        if 13 <= len(s3_minus3) <= 17:
            add(_make_config(s3_minus3, 'slot3_drop_bottom3'))

    # --- Strategy 3: Category-concentrated competitive ---
    # Group top perks by their category, put dominant category in one slot
    if len(rankings) >= 15:
        top15_set = set(ranked_names[:15])

        # Placement triggers + other top perks in slot3
        placement_triggers = [p for p in PERK_CATEGORIES['placement_trigger']
                              if p in top15_set]
        remaining_top = [p for p in ranked_names[:15] if p not in placement_triggers]
        # Try: all placement triggers + fill to 15 from remaining top
        s3_pt = placement_triggers + remaining_top[:15 - len(placement_triggers)]
        add(_make_config(s3_pt, 'placement_triggers_slot3'))

        # Deferred + triggers in slot3
        deferred = [p for p in PERK_CATEGORIES['deferred'] if p in top15_set]
        triggers = (placement_triggers +
                    [p for p in PERK_CATEGORIES['removal_trigger'] if p in top15_set])
        s3_dt = list(set(deferred + triggers))
        fill = [p for p in ranked_names if p not in s3_dt]
        while len(s3_dt) < 15 and fill:
            s3_dt.append(fill.pop(0))
        if 13 <= len(s3_dt) <= 17:
            add(_make_config(s3_dt[:15], 'deferred_triggers_slot3'))

        # Duration perks concentrated
        durations = [p for p in PERK_CATEGORIES['duration'] if p in top15_set]
        s3_dur = durations + [p for p in ranked_names if p not in durations][:15 - len(durations)]
        add(_make_config(s3_dur, 'duration_slot3'))

        # Immediate perks concentrated
        immediates = [p for p in PERK_CATEGORIES['immediate'] if p in top15_set]
        s3_imm = immediates + [p for p in ranked_names if p not in immediates][:15 - len(immediates)]
        add(_make_config(s3_imm, 'immediate_slot3'))

    # --- Strategy 4: Score-banded ---
    # Split perks into two groups by alternating rank (odd/even)
    n_total = len(ranked_names)
    if n_total >= 15:
        odd_ranked = [ranked_names[i] for i in range(0, n_total, 2)]  # 1st, 3rd, 5th...
        even_ranked = [ranked_names[i] for i in range(1, n_total, 2)]  # 2nd, 4th, 6th...
        add(_make_config(odd_ranked, 'interleaved_odd_slot3'))
        add(_make_config(even_ranked, 'interleaved_even_slot3'))

    # --- Strategy 5: Top-half of each category ---
    # For each category, take the better-ranked half into slot3
    s3_top_half = []
    for cat_name, cat_perks in PERK_CATEGORIES.items():
        # Rank within category
        cat_ranked = [p for p in ranked_names if p in cat_perks]
        half = max(1, len(cat_ranked) // 2)
        s3_top_half.extend(cat_ranked[:half])
    if 13 <= len(s3_top_half) <= 17:
        add(_make_config(s3_top_half, 'top_half_per_category'))
    elif len(s3_top_half) > 17:
        add(_make_config(s3_top_half[:15], 'top_half_per_category_trimmed'))

    # --- Strategy 6: Noised variants of promising configs ---
    base_configs = list(configs)  # snapshot
    for base in base_configs:
        if base.label == 'baseline':
            continue
        for i in range(3):
            s3 = list(base.slot3_pool)
            s4 = list(base.slot4_pool)
            # Swap 1-2 random perks between pools
            n_swaps = rng.randint(1, 2)
            for _ in range(n_swaps):
                if s3 and s4:
                    p3 = rng.choice(s3)
                    p4 = rng.choice(s4)
                    s3[s3.index(p3)] = p4
                    s4[s4.index(p4)] = p3
            if 13 <= len(s3) <= 17:
                add(_make_config(s3, f'{base.label}_noise{i}'))

    return configs


# ---------------------------------------------------------------------------
# Pretty printing
# ---------------------------------------------------------------------------

def format_rankings_table(rankings: list[PerkCompetitivenessReport]) -> str:
    """Format rankings as a readable table."""
    lines = []
    lines.append(f"{'Rank':<5} {'Perk':<15} {'Offered':>8} {'Selected':>9} "
                 f"{'SelRate':>8} {'BeatS1':>7} {'AvgGap':>7} {'Score':>7} "
                 f"{'Early':>6} {'Mid':>6} {'Late':>6}")
    lines.append('-' * 100)
    for i, r in enumerate(rankings, 1):
        lines.append(
            f"{i:<5} {r.perk_name:<15} {r.times_offered:>8} {r.times_selected:>9} "
            f"{r.selection_rate:>7.1%} {r.beat_slot1_rate:>6.1%} "
            f"{r.avg_score_gap:>7.1f} {r.competitiveness:>6.3f} "
            f"{r.selection_rate_early:>5.1%} {r.selection_rate_mid:>5.1%} "
            f"{r.selection_rate_late:>5.1%}"
        )
    return '\n'.join(lines)


def format_config_results(results: list[SwapEvalResult], top_n: int = 20) -> str:
    """Format evaluation results as a readable table."""
    lines = []
    lines.append(f"{'Rank':<5} {'Label':<35} {'WR':>6} {'S3%':>5} {'S4%':>5} "
                 f"{'Score':>6} {'S3#':>4} {'S4#':>4}")
    lines.append('-' * 80)
    for i, r in enumerate(results[:top_n], 1):
        n3 = len(r.config.slot3_pool)
        n4 = len(r.config.slot4_pool)
        lines.append(
            f"{i:<5} {r.config.label:<35} {r.win_rate:>5.1%} "
            f"{r.slot3_pct:>4.1f} {r.slot4_pct:>4.1f} "
            f"{r.composite_score:>5.1f} {n3:>4} {n4:>4}"
        )
    return '\n'.join(lines)
