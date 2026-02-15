#!/usr/bin/env python3
"""
Decision comparison tool: run two AIs on identical board states to find
where the shadow AI diverges from the primary (oracle) AI.

Usage:
    python3 compare_decisions.py -n 20 --seed 0                    # 5×5 quick check
    python3 compare_decisions.py -n 30 --lanes 7 --slots 7         # 7×7 target
    python3 compare_decisions.py --primary hard_v3 --shadow minimax2  # reverse
"""

import sys
import argparse
import time
import json
from pathlib import Path
from collections import Counter
from dataclasses import dataclass, field

sys.path.insert(0, str(Path(__file__).parent / 'src'))

from game.engine import GameEngine
from game.state import GameState, Player
from game.config import GameConfig
from ai import create_ai_function, Difficulty, PROFILES
from ai import create_expectimax_ai


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Decision:
    """One decision point where both AIs evaluated the same state."""
    game_seed: int
    turn: int
    player: str
    offered_perks: dict          # {slot_int: perk_name}
    primary_slot: object         # int or 'pass'
    primary_perk: str            # perk name or 'PASS'
    shadow_slot: object
    shadow_perk: str
    primary_evals: dict          # {slot_str: {perk, score, target}}
    shadow_evals: dict
    lanes_won_p1: int
    lanes_won_p2: int
    game_progress: float         # 0.0-1.0


# ---------------------------------------------------------------------------
# ComparisonAI wrapper
# ---------------------------------------------------------------------------

class ComparisonAI:
    """Wraps a primary AI with a shadow AI for decision comparison."""

    def __init__(self, primary_fn, shadow_fn):
        self.primary = primary_fn
        self.shadow = shadow_fn
        self.decisions: list[Decision] = []
        self.current_seed: int = 0
        self.max_turns: int = 100

    def __call__(self, state: GameState):
        # Primary evaluates on real state
        primary_result = self.primary(state)
        primary_eval = (self.primary.get_last_evaluation()
                        if hasattr(self.primary, 'get_last_evaluation') else None)

        # Shadow evaluates on clone (prevents RNG contamination)
        shadow_state = state.clone()
        shadow_result = self.shadow(shadow_state)
        shadow_eval = (self.shadow.get_last_evaluation()
                       if hasattr(self.shadow, 'get_last_evaluation') else None)

        p_slot, p_target = primary_result
        s_slot, s_target = shadow_result

        p_perk = state.offered_perks.get(p_slot, 'PASS') if p_slot != 'pass' else 'PASS'
        s_perk = state.offered_perks.get(s_slot, 'PASS') if s_slot != 'pass' else 'PASS'

        self.decisions.append(Decision(
            game_seed=self.current_seed,
            turn=state.turn_number,
            player=state.current_player.name,
            offered_perks=dict(state.offered_perks),
            primary_slot=p_slot,
            primary_perk=p_perk,
            shadow_slot=s_slot,
            shadow_perk=s_perk,
            primary_evals=primary_eval or {},
            shadow_evals=shadow_eval or {},
            lanes_won_p1=state.lanes_won_by(Player.PLAYER1),
            lanes_won_p2=state.lanes_won_by(Player.PLAYER2),
            game_progress=state.turn_number / max(self.max_turns, 1),
        ))

        return primary_result

    # Forward attributes so engine logging works
    @property
    def get_last_evaluation(self):
        return (self.primary.get_last_evaluation
                if hasattr(self.primary, 'get_last_evaluation') else None)

    @property
    def ai_type(self):
        return getattr(self.primary, 'ai_type', 'comparison')


# ---------------------------------------------------------------------------
# Game runner
# ---------------------------------------------------------------------------

def run_comparison_games(primary_fn, shadow_fn, n_games, seed_start, max_turns, config):
    """Run games and collect decision comparisons."""
    p1_wrapper = ComparisonAI(primary_fn, shadow_fn)
    p2_wrapper = ComparisonAI(primary_fn, shadow_fn)
    p1_wrapper.max_turns = max_turns
    p2_wrapper.max_turns = max_turns

    results = {'p1_wins': 0, 'p2_wins': 0, 'draws': 0,
               'game_lengths': [], 'elapsed': 0.0}
    start = time.time()

    for i in range(n_games):
        seed = seed_start + i
        p1_wrapper.current_seed = seed
        p2_wrapper.current_seed = seed

        engine = GameEngine(seed=seed, config=config)
        final = engine.run_game(p1_wrapper, p2_wrapper, max_turns=max_turns)

        results['game_lengths'].append(final.turn_number)
        if final.winner == Player.PLAYER1:
            results['p1_wins'] += 1
        elif final.winner == Player.PLAYER2:
            results['p2_wins'] += 1
        else:
            results['draws'] += 1

        elapsed = time.time() - start
        avg = elapsed / (i + 1)
        eta = avg * (n_games - i - 1)
        print(f"  Game {i+1}/{n_games}  seed={seed}  "
              f"turns={final.turn_number}  winner={final.winner}  "
              f"[{elapsed:.1f}s, ETA {eta:.0f}s]")

    results['elapsed'] = time.time() - start
    return p1_wrapper.decisions + p2_wrapper.decisions, results


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def print_report(decisions: list[Decision], game_results: dict,
                 primary_name: str, shadow_name: str, max_turns: int):
    total = len(decisions)
    if total == 0:
        print("No decisions to analyze.")
        return

    agrees = [d for d in decisions if str(d.primary_slot) == str(d.shadow_slot)]
    disagrees = [d for d in decisions if str(d.primary_slot) != str(d.shadow_slot)]

    n_agree = len(agrees)
    n_disagree = len(disagrees)

    # --- Header ---
    print(f"\n{'='*60}")
    print(f" Decision Comparison: {primary_name} vs {shadow_name}")
    print(f"{'='*60}")
    print(f"\nGames: {game_results['p1_wins']+game_results['p2_wins']+game_results['draws']}  "
          f"P1 wins: {game_results['p1_wins']}  P2 wins: {game_results['p2_wins']}  "
          f"Draws: {game_results['draws']}  Time: {game_results['elapsed']:.1f}s")

    # --- A. Agreement rate ---
    print(f"\n--- Agreement Rate ---")
    print(f"Total decisions: {total}")
    print(f"Agreements:      {n_agree} ({n_agree/total*100:.1f}%)")
    print(f"Disagreements:   {n_disagree} ({n_disagree/total*100:.1f}%)")

    if n_disagree == 0:
        print("\nNo disagreements to analyze.")
        return

    # --- B. Slot preference on disagreements ---
    print(f"\n--- Slot Preference on Disagreements ({n_disagree}) ---")
    primary_slots = Counter(str(d.primary_slot) for d in disagrees)
    shadow_slots = Counter(str(d.shadow_slot) for d in disagrees)

    print(f"{'':15s} {primary_name:>15s}  {shadow_name:>15s}")
    for slot in ['1', '2', '3', '4', 'pass']:
        pc = primary_slots.get(slot, 0)
        sc = shadow_slots.get(slot, 0)
        pp = pc / n_disagree * 100
        sp = sc / n_disagree * 100
        label = f"Slot {slot}" if slot != 'pass' else "Pass"
        print(f"  {label:13s} {pc:4d} ({pp:5.1f}%)    {sc:4d} ({sp:5.1f}%)")

    # --- C. Top disagreement patterns ---
    print(f"\n--- Top Disagreement Patterns ---")
    patterns = Counter((d.primary_perk, d.shadow_perk) for d in disagrees)
    for (pp, sp), count in patterns.most_common(15):
        pct = count / n_disagree * 100
        print(f"  {primary_name}={pp:15s}  {shadow_name}={sp:15s}  {count:4d} ({pct:.1f}%)")

    # --- D. Per-perk analysis ---
    print(f"\n--- Per-Perk Preference ---")

    # Count how often each AI picks each perk (all decisions)
    primary_perk_counts = Counter(d.primary_perk for d in decisions)
    shadow_perk_counts = Counter(d.shadow_perk for d in decisions)
    all_perks = sorted(set(list(primary_perk_counts.keys()) + list(shadow_perk_counts.keys())))

    print(f"\n{'Perk':17s} {primary_name:>8s}  {shadow_name:>8s}  {'Ratio':>7s}")
    print("-" * 50)
    perk_ratios = []
    for perk in all_perks:
        pc = primary_perk_counts.get(perk, 0)
        sc = shadow_perk_counts.get(perk, 0)
        ratio = pc / sc if sc > 0 else (float('inf') if pc > 0 else 1.0)
        perk_ratios.append((perk, pc, sc, ratio))

    # Sort by ratio descending (perks minimax prefers more)
    perk_ratios.sort(key=lambda x: -x[3])
    for perk, pc, sc, ratio in perk_ratios:
        if pc + sc < 3:
            continue  # skip very rare perks
        ratio_str = f"{ratio:.2f}x" if ratio < 100 else "inf"
        print(f"  {perk:15s} {pc:7d}   {sc:7d}   {ratio_str:>7s}")

    # --- E. v3 score when minimax picked a perk vs when it didn't ---
    print(f"\n--- {shadow_name} Score Calibration (when {primary_name} picked each perk) ---")
    # For each perk that minimax picked, what was v3's score for it?
    perk_scores_when_primary_picked = {}  # perk -> list of shadow scores
    perk_scores_when_primary_skipped = {}  # perk -> list of shadow scores

    for d in decisions:
        if not d.shadow_evals:
            continue
        # Find shadow's score for the perk that primary picked
        primary_slot_str = str(d.primary_slot)
        for slot_str, eval_data in d.shadow_evals.items():
            if not isinstance(eval_data, dict):
                continue
            perk = eval_data.get('perk', '')
            score = eval_data.get('score', 0)
            if slot_str == primary_slot_str:
                perk_scores_when_primary_picked.setdefault(perk, []).append(score)
            else:
                perk_scores_when_primary_skipped.setdefault(perk, []).append(score)

    print(f"\n{'Perk':17s} {'Avg when chosen':>15s}  {'Avg when skipped':>16s}  {'Delta':>7s}")
    print("-" * 62)
    for perk in sorted(perk_scores_when_primary_picked.keys()):
        picked = perk_scores_when_primary_picked.get(perk, [])
        skipped = perk_scores_when_primary_skipped.get(perk, [])
        if len(picked) < 2:
            continue
        avg_picked = sum(picked) / len(picked)
        avg_skipped = sum(skipped) / len(skipped) if skipped else 0
        delta = avg_picked - avg_skipped
        print(f"  {perk:15s} {avg_picked:14.1f}   {avg_skipped:15.1f}   {delta:+6.1f}")

    # --- F. Game phase breakdown ---
    print(f"\n--- Disagreement by Game Phase ---")
    phases = {'Early': [], 'Mid': [], 'Late': []}
    for d in decisions:
        progress = d.game_progress
        if progress < 0.33:
            phases['Early'].append(d)
        elif progress < 0.67:
            phases['Mid'].append(d)
        else:
            phases['Late'].append(d)

    print(f"{'Phase':8s} {'Total':>7s} {'Disagree':>9s} {'Rate':>7s}")
    for phase_name in ['Early', 'Mid', 'Late']:
        ds = phases[phase_name]
        total_phase = len(ds)
        disagree_phase = sum(1 for d in ds if str(d.primary_slot) != str(d.shadow_slot))
        rate = disagree_phase / total_phase * 100 if total_phase > 0 else 0
        print(f"  {phase_name:6s} {total_phase:7d} {disagree_phase:9d} {rate:6.1f}%")

    # --- G. Win-state breakdown ---
    print(f"\n--- Disagreement by Win State ---")
    states = {'Winning': [], 'Even': [], 'Losing': []}
    for d in decisions:
        if d.player == 'PLAYER1':
            my_lanes, their_lanes = d.lanes_won_p1, d.lanes_won_p2
        else:
            my_lanes, their_lanes = d.lanes_won_p2, d.lanes_won_p1
        if my_lanes > their_lanes:
            states['Winning'].append(d)
        elif my_lanes < their_lanes:
            states['Losing'].append(d)
        else:
            states['Even'].append(d)

    print(f"{'State':10s} {'Total':>7s} {'Disagree':>9s} {'Rate':>7s}")
    for state_name in ['Winning', 'Even', 'Losing']:
        ds = states[state_name]
        total_s = len(ds)
        disagree_s = sum(1 for d in ds if str(d.primary_slot) != str(d.shadow_slot))
        rate = disagree_s / total_s * 100 if total_s > 0 else 0
        print(f"  {state_name:8s} {total_s:7d} {disagree_s:9d} {rate:6.1f}%")


# ---------------------------------------------------------------------------
# AI factory
# ---------------------------------------------------------------------------

def make_ai(spec: str, depth_override: int = None):
    """Parse an AI spec like 'minimax2', 'hard_v3', 'hard_v1'."""
    if spec.startswith('minimax'):
        d = depth_override or int(spec[-1])
        return create_expectimax_ai(d), f"Minimax(d={d})"

    parts = spec.split('_')
    difficulty_str = parts[0]
    profile = parts[1] if len(parts) > 1 else 'v1'

    diff_map = {'easy': Difficulty.EASY, 'medium': Difficulty.MEDIUM, 'hard': Difficulty.HARD}
    difficulty = diff_map.get(difficulty_str)
    if difficulty is None:
        raise ValueError(f"Unknown AI spec: {spec}")

    return create_ai_function(difficulty, profile), f"{difficulty_str.title()}({profile})"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Compare AI decisions on identical board states')
    parser.add_argument('-n', '--games', type=int, default=30)
    parser.add_argument('--seed', type=int, default=0)
    parser.add_argument('--lanes', type=int, default=5)
    parser.add_argument('--slots', type=int, default=5)
    parser.add_argument('--primary', default='minimax2',
                        help='Primary AI spec (default: minimax2)')
    parser.add_argument('--shadow', default='hard_v3',
                        help='Shadow AI spec (default: hard_v3)')
    parser.add_argument('--depth', type=int, default=None,
                        help='Override minimax depth')
    parser.add_argument('--export', type=str, default=None,
                        help='Export raw data to JSON file')
    args = parser.parse_args()

    # Board config
    config = None
    if args.lanes != 5 or args.slots != 5:
        lanes_to_win = args.lanes // 2 + 1
        config = GameConfig(LANES=args.lanes, SLOTS_PER_SIDE=args.slots,
                            LANES_TO_WIN=lanes_to_win)
    max_turns = args.lanes * args.slots * 4

    # Build AIs
    primary_fn, primary_name = make_ai(args.primary, args.depth)
    shadow_fn, shadow_name = make_ai(args.shadow, args.depth)

    print(f"Comparing: {primary_name} (primary) vs {shadow_name} (shadow)")
    print(f"Board: {args.lanes} lanes x {args.slots} slots  |  "
          f"{args.games} games  |  seed {args.seed}+")
    print()

    decisions, game_results = run_comparison_games(
        primary_fn, shadow_fn, args.games, args.seed, max_turns, config)

    print_report(decisions, game_results, primary_name, shadow_name, max_turns)

    if args.export:
        export_data = {
            'primary': primary_name,
            'shadow': shadow_name,
            'games': game_results,
            'decisions': [
                {
                    'seed': d.game_seed, 'turn': d.turn, 'player': d.player,
                    'offered': d.offered_perks,
                    'primary_slot': d.primary_slot, 'primary_perk': d.primary_perk,
                    'shadow_slot': d.shadow_slot, 'shadow_perk': d.shadow_perk,
                    'primary_evals': d.primary_evals, 'shadow_evals': d.shadow_evals,
                    'lanes_won_p1': d.lanes_won_p1, 'lanes_won_p2': d.lanes_won_p2,
                    'game_progress': round(d.game_progress, 3),
                }
                for d in decisions
            ]
        }
        with open(args.export, 'w') as f:
            json.dump(export_data, f, indent=2, default=str)
        print(f"\nExported {len(decisions)} decisions to {args.export}")


if __name__ == '__main__':
    main()
