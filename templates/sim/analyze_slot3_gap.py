#!/usr/bin/env python3
"""
Analyze why slot 3 usage correlates with lower win rates.

Reads game logs and produces 5 reports correlating slot 3 perk choices
with game outcomes to identify which perks, score margins, game phases,
and board contexts are problematic.

Usage:
    python analyze_slot3_gap.py                          # Analyze logs/ directory
    python analyze_slot3_gap.py logs --player PLAYER1    # Filter to one side
    python analyze_slot3_gap.py --json out.json           # Export to JSON
"""

import json
import sys
import argparse
from pathlib import Path
from collections import defaultdict
import statistics
from typing import Optional

from analyze_logs import load_logs, extract_decisions, extract_game_summaries, Decision, GameSummary

# Slot 3 perks (React & Protect pool)
SLOT_3_PERKS = {
    'FREEZE', 'CLOAK', 'PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE',
    'HYDRA', 'BACKFIRE', 'REGROUP', 'SCATTER', 'SIGNAL', 'ABSORB',
    'SANCTUARY', 'RETALIATE'
}

SLOT_4_PERKS = {
    'SCRAMBLE', 'BLIND', 'SPLIT', 'KAMIKAZE', 'DISRUPT', 'DISPERSE',
    'GAMBIT', 'STEAL', 'RUSH', 'ENLIST', 'AMBUSH', 'REINFORCE',
    'NULLIFY', 'CAPTURE', 'RAID'
}


def build_game_outcome_map(summaries: list[GameSummary]) -> dict[str, GameSummary]:
    """Map game filename -> GameSummary for quick lookup."""
    return {s.game_file: s for s in summaries}


def get_slot_number(decision: Decision) -> Optional[int]:
    """Get the slot number (1-4) for a decision, or None for pass."""
    slot = decision.selected_slot
    if slot == 'pass':
        return None
    try:
        return int(slot)
    except (ValueError, TypeError):
        return None


def get_perk_name(decision: Decision) -> Optional[str]:
    """Get the name of the selected perk."""
    slot_key = str(decision.selected_slot)
    eval_data = decision.evaluations.get(slot_key, {})
    return eval_data.get('perk')


def get_slot1_score(decision: Decision) -> Optional[float]:
    """Get the score of slot 1 (PlaceAnother) if available."""
    eval_data = decision.evaluations.get('1', {})
    score = eval_data.get('score')
    return score if score is not None and score > -99 else None


def get_slot2_score(decision: Decision) -> Optional[float]:
    """Get the score of slot 2 (RemoveEnemy) if available."""
    eval_data = decision.evaluations.get('2', {})
    score = eval_data.get('score')
    return score if score is not None and score > -99 else None


def compute_lane_stats(board_state: dict, player: str) -> dict:
    """Extract lane statistics from board state.

    Board uses p1_pieces/p2_pieces. `player` determines which is "ours".

    Returns dict with:
      - our_near_win: lanes where we have 4+ pieces
      - opp_near_win: lanes where opponent has 4+ pieces
      - contested: lanes where both sides have 3+ pieces
    """
    if not board_state:
        return {}

    lanes = board_state.get('lanes', [])
    our_key = 'p1_pieces' if player == 'PLAYER1' else 'p2_pieces'
    opp_key = 'p2_pieces' if player == 'PLAYER1' else 'p1_pieces'
    our_near_win = 0
    opp_near_win = 0
    contested = 0

    for lane in lanes:
        our = lane.get(our_key, 0)
        opp = lane.get(opp_key, 0)
        winner = lane.get('winner')

        if winner:
            continue

        if our >= 4:
            our_near_win += 1
        if opp >= 4:
            opp_near_win += 1
        if our >= 3 and opp >= 3:
            contested += 1

    return {
        'our_near_win': our_near_win,
        'opp_near_win': opp_near_win,
        'contested': contested,
    }


def did_player_win(game: GameSummary, player: str) -> Optional[bool]:
    """Check if the given player won the game. None if draw."""
    if game.winner is None:
        return None
    return game.winner == player


# =============================================================================
# Report 1: Slot 3 Win/Loss Correlation
# =============================================================================

def report_slot3_win_loss(decisions: list[Decision],
                          outcome_map: dict[str, GameSummary],
                          player_filter: Optional[str]) -> dict:
    """Group games by slot 3 usage rate, compare win rates."""
    # Per-game: count total decisions, count slot 3 decisions
    game_stats = defaultdict(lambda: {'total': 0, 'slot3': 0, 'player': None})

    for d in decisions:
        if player_filter and d.player != player_filter:
            continue
        key = d.game_file
        game_stats[key]['total'] += 1
        game_stats[key]['player'] = d.player
        slot = get_slot_number(d)
        if slot == 3:
            game_stats[key]['slot3'] += 1

    # Bucket games by slot 3 usage rate
    buckets = {'low (0-10%)': [], 'med (10-20%)': [], 'high (20%+)': []}

    for game_file, stats in game_stats.items():
        if stats['total'] == 0:
            continue
        rate = stats['slot3'] / stats['total'] * 100
        game = outcome_map.get(game_file)
        if not game:
            continue

        won = did_player_win(game, stats['player'])
        entry = {
            'game': game_file,
            'rate': rate,
            'slot3_count': stats['slot3'],
            'total_decisions': stats['total'],
            'won': won,
            'turns': game.total_turns,
        }

        if rate < 10:
            buckets['low (0-10%)'].append(entry)
        elif rate < 20:
            buckets['med (10-20%)'].append(entry)
        else:
            buckets['high (20%+)'].append(entry)

    results = {}
    for bucket_name, games in buckets.items():
        if not games:
            results[bucket_name] = {'count': 0}
            continue

        wins = sum(1 for g in games if g['won'] is True)
        losses = sum(1 for g in games if g['won'] is False)
        draws = sum(1 for g in games if g['won'] is None)
        avg_turns = statistics.mean([g['turns'] for g in games])
        avg_rate = statistics.mean([g['rate'] for g in games])

        results[bucket_name] = {
            'count': len(games),
            'wins': wins,
            'losses': losses,
            'draws': draws,
            'win_rate': wins / (wins + losses) * 100 if (wins + losses) > 0 else 0,
            'avg_turns': round(avg_turns, 1),
            'avg_slot3_rate': round(avg_rate, 1),
        }

    return results


# =============================================================================
# Report 2: Per-Perk Win Correlation
# =============================================================================

def report_per_perk_win(decisions: list[Decision],
                        outcome_map: dict[str, GameSummary],
                        player_filter: Optional[str]) -> dict:
    """For each slot 3 perk: selection count, win rate, score margin vs slot 1/2."""
    # Track per perk: games where it was chosen, and outcomes
    perk_data = defaultdict(lambda: {
        'chosen_count': 0,
        'wins': 0,
        'losses': 0,
        'margins_vs_slot1': [],  # score(slot3) - score(slot1)
        'margins_vs_slot2': [],
        'scores': [],
        'games_won': set(),
        'games_lost': set(),
    })

    for d in decisions:
        if player_filter and d.player != player_filter:
            continue

        perk = get_perk_name(d)
        if not perk or perk not in SLOT_3_PERKS:
            continue

        game = outcome_map.get(d.game_file)
        if not game:
            continue

        won = did_player_win(game, d.player)
        data = perk_data[perk]
        data['chosen_count'] += 1
        data['scores'].append(d.selected_score)

        if won is True:
            data['wins'] += 1
            data['games_won'].add(d.game_file)
        elif won is False:
            data['losses'] += 1
            data['games_lost'].add(d.game_file)

        # Score margin vs slot 1
        s1 = get_slot1_score(d)
        if s1 is not None:
            data['margins_vs_slot1'].append(d.selected_score - s1)

        # Score margin vs slot 2
        s2 = get_slot2_score(d)
        if s2 is not None:
            data['margins_vs_slot2'].append(d.selected_score - s2)

    # Build result
    results = {}
    for perk, data in sorted(perk_data.items(), key=lambda x: -x[1]['chosen_count']):
        total = data['wins'] + data['losses']
        results[perk] = {
            'chosen_count': data['chosen_count'],
            'unique_games_won': len(data['games_won']),
            'unique_games_lost': len(data['games_lost']),
            'win_rate': data['wins'] / total * 100 if total > 0 else 0,
            'avg_score': round(statistics.mean(data['scores']), 1) if data['scores'] else 0,
            'avg_margin_vs_slot1': round(statistics.mean(data['margins_vs_slot1']), 1) if data['margins_vs_slot1'] else None,
            'avg_margin_vs_slot2': round(statistics.mean(data['margins_vs_slot2']), 1) if data['margins_vs_slot2'] else None,
        }

    return results


# =============================================================================
# Report 3: Score Margin Analysis
# =============================================================================

def report_score_margins(decisions: list[Decision],
                         outcome_map: dict[str, GameSummary],
                         player_filter: Optional[str]) -> dict:
    """When slot 3 is chosen, bucket by margin vs slot 1, show win rate per bucket."""
    buckets = {
        'slot3 loses (<0)': [],
        'barely wins (0-10)': [],
        'wins clearly (10-50)': [],
        'dominates (50+)': [],
    }

    for d in decisions:
        if player_filter and d.player != player_filter:
            continue

        slot = get_slot_number(d)
        if slot != 3:
            continue

        s1 = get_slot1_score(d)
        if s1 is None:
            continue

        margin = d.selected_score - s1

        game = outcome_map.get(d.game_file)
        if not game:
            continue

        won = did_player_win(game, d.player)
        entry = {'margin': margin, 'won': won, 'perk': get_perk_name(d)}

        if margin < 0:
            buckets['slot3 loses (<0)'].append(entry)
        elif margin < 10:
            buckets['barely wins (0-10)'].append(entry)
        elif margin < 50:
            buckets['wins clearly (10-50)'].append(entry)
        else:
            buckets['dominates (50+)'].append(entry)

    results = {}
    for name, entries in buckets.items():
        if not entries:
            results[name] = {'count': 0}
            continue

        wins = sum(1 for e in entries if e['won'] is True)
        losses = sum(1 for e in entries if e['won'] is False)
        avg_margin = statistics.mean([e['margin'] for e in entries])

        # Top perks in this bucket
        perk_counts = defaultdict(int)
        for e in entries:
            if e['perk']:
                perk_counts[e['perk']] += 1
        top_perks = sorted(perk_counts.items(), key=lambda x: -x[1])[:5]

        results[name] = {
            'count': len(entries),
            'wins': wins,
            'losses': losses,
            'win_rate': wins / (wins + losses) * 100 if (wins + losses) > 0 else 0,
            'avg_margin': round(avg_margin, 1),
            'top_perks': top_perks,
        }

    return results


# =============================================================================
# Report 4: Game Phase Analysis
# =============================================================================

def report_game_phase(decisions: list[Decision],
                      outcome_map: dict[str, GameSummary],
                      player_filter: Optional[str]) -> dict:
    """When in the game is slot 3 chosen? Win rate by phase."""
    phases = {
        'early (1-5)': [],
        'mid (6-12)': [],
        'late (13+)': [],
    }

    for d in decisions:
        if player_filter and d.player != player_filter:
            continue

        slot = get_slot_number(d)
        if slot != 3:
            continue

        game = outcome_map.get(d.game_file)
        if not game:
            continue

        won = did_player_win(game, d.player)
        entry = {'turn': d.turn, 'won': won, 'perk': get_perk_name(d)}

        if d.turn <= 5:
            phases['early (1-5)'].append(entry)
        elif d.turn <= 12:
            phases['mid (6-12)'].append(entry)
        else:
            phases['late (13+)'].append(entry)

    # Also compute phase stats for non-slot-3 decisions as baseline
    baseline_phases = {'early (1-5)': [], 'mid (6-12)': [], 'late (13+)': []}
    for d in decisions:
        if player_filter and d.player != player_filter:
            continue
        slot = get_slot_number(d)
        if slot == 3 or slot is None:
            continue
        game = outcome_map.get(d.game_file)
        if not game:
            continue
        won = did_player_win(game, d.player)
        entry = {'won': won}
        if d.turn <= 5:
            baseline_phases['early (1-5)'].append(entry)
        elif d.turn <= 12:
            baseline_phases['mid (6-12)'].append(entry)
        else:
            baseline_phases['late (13+)'].append(entry)

    results = {}
    for phase_name in phases:
        entries = phases[phase_name]
        base = baseline_phases[phase_name]

        def win_rate(items):
            wins = sum(1 for e in items if e['won'] is True)
            losses = sum(1 for e in items if e['won'] is False)
            return wins / (wins + losses) * 100 if (wins + losses) > 0 else 0

        # Top perks in this phase
        perk_counts = defaultdict(int)
        for e in entries:
            if e.get('perk'):
                perk_counts[e['perk']] += 1
        top_perks = sorted(perk_counts.items(), key=lambda x: -x[1])[:5]

        results[phase_name] = {
            'slot3_count': len(entries),
            'slot3_win_rate': round(win_rate(entries), 1),
            'baseline_count': len(base),
            'baseline_win_rate': round(win_rate(base), 1),
            'delta': round(win_rate(entries) - win_rate(base), 1) if entries and base else None,
            'top_perks': top_perks,
        }

    return results


# =============================================================================
# Report 5: Board State at Decision
# =============================================================================

def report_board_state(decisions: list[Decision],
                       outcome_map: dict[str, GameSummary],
                       player_filter: Optional[str]) -> dict:
    """Analyze board contexts where slot 3 is chosen (vs not chosen)."""
    slot3_boards = {'win': [], 'loss': []}
    other_boards = {'win': [], 'loss': []}

    for d in decisions:
        if player_filter and d.player != player_filter:
            continue
        if not d.board_state:
            continue

        game = outcome_map.get(d.game_file)
        if not game:
            continue

        won = did_player_win(game, d.player)
        if won is None:
            continue

        stats = compute_lane_stats(d.board_state, d.player)
        if not stats:
            continue

        slot = get_slot_number(d)
        outcome = 'win' if won else 'loss'

        if slot == 3:
            slot3_boards[outcome].append(stats)
        elif slot is not None:
            other_boards[outcome].append(stats)

    def avg_stats(items):
        if not items:
            return {'count': 0}
        return {
            'count': len(items),
            'avg_our_near_win': round(statistics.mean([s['our_near_win'] for s in items]), 2),
            'avg_opp_near_win': round(statistics.mean([s['opp_near_win'] for s in items]), 2),
            'avg_contested': round(statistics.mean([s['contested'] for s in items]), 2),
        }

    return {
        'slot3_in_wins': avg_stats(slot3_boards['win']),
        'slot3_in_losses': avg_stats(slot3_boards['loss']),
        'other_in_wins': avg_stats(other_boards['win']),
        'other_in_losses': avg_stats(other_boards['loss']),
    }


# =============================================================================
# Printing
# =============================================================================

def print_report1(data: dict):
    print("\n" + "=" * 65)
    print("REPORT 1: SLOT 3 WIN/LOSS CORRELATION")
    print("=" * 65)
    print(f"\n{'Bucket':<20} {'Games':>6} {'Wins':>6} {'Losses':>7} {'WinRate':>8} {'AvgTurns':>9} {'Avg S3%':>8}")
    print("-" * 65)
    for bucket, stats in data.items():
        if stats['count'] == 0:
            print(f"{bucket:<20} {'(none)':>6}")
            continue
        print(f"{bucket:<20} {stats['count']:>6} {stats['wins']:>6} {stats['losses']:>7} "
              f"{stats['win_rate']:>7.1f}% {stats['avg_turns']:>9.1f} {stats['avg_slot3_rate']:>7.1f}%")


def print_report2(data: dict):
    print("\n" + "=" * 90)
    print("REPORT 2: PER-PERK WIN CORRELATION (slot 3 perks)")
    print("=" * 90)
    print(f"\n{'Perk':<15} {'Chosen':>7} {'GamesW':>7} {'GamesL':>7} {'WinRate':>8} {'AvgScr':>7} {'vs S1':>7} {'vs S2':>7}")
    print("-" * 90)
    for perk, stats in data.items():
        margin1 = f"{stats['avg_margin_vs_slot1']:>7.1f}" if stats['avg_margin_vs_slot1'] is not None else "    n/a"
        margin2 = f"{stats['avg_margin_vs_slot2']:>7.1f}" if stats['avg_margin_vs_slot2'] is not None else "    n/a"
        print(f"{perk:<15} {stats['chosen_count']:>7} {stats['unique_games_won']:>7} {stats['unique_games_lost']:>7} "
              f"{stats['win_rate']:>7.1f}% {stats['avg_score']:>7.1f} {margin1} {margin2}")


def print_report3(data: dict):
    print("\n" + "=" * 70)
    print("REPORT 3: SCORE MARGIN ANALYSIS (slot 3 score - slot 1 score)")
    print("=" * 70)
    print(f"\n{'Margin Bucket':<22} {'Count':>6} {'Wins':>6} {'Losses':>7} {'WinRate':>8} {'AvgMgn':>7}")
    print("-" * 65)
    for bucket, stats in data.items():
        if stats['count'] == 0:
            print(f"{bucket:<22} {'(none)':>6}")
            continue
        print(f"{bucket:<22} {stats['count']:>6} {stats['wins']:>6} {stats['losses']:>7} "
              f"{stats['win_rate']:>7.1f}% {stats['avg_margin']:>7.1f}")
        if stats.get('top_perks'):
            perks_str = ", ".join(f"{p}({c})" for p, c in stats['top_perks'])
            print(f"  {'perks:':<20} {perks_str}")


def print_report4(data: dict):
    print("\n" + "=" * 75)
    print("REPORT 4: GAME PHASE ANALYSIS")
    print("=" * 75)
    print(f"\n{'Phase':<15} {'S3 Count':>9} {'S3 WR':>7} {'Base Count':>11} {'Base WR':>8} {'Delta':>7}")
    print("-" * 65)
    for phase, stats in data.items():
        delta = f"{stats['delta']:>+6.1f}%" if stats['delta'] is not None else "    n/a"
        print(f"{phase:<15} {stats['slot3_count']:>9} {stats['slot3_win_rate']:>6.1f}% "
              f"{stats['baseline_count']:>11} {stats['baseline_win_rate']:>7.1f}% {delta}")
        if stats.get('top_perks'):
            perks_str = ", ".join(f"{p}({c})" for p, c in stats['top_perks'])
            print(f"  {'perks:':<13} {perks_str}")


def print_report5(data: dict):
    print("\n" + "=" * 70)
    print("REPORT 5: BOARD STATE AT DECISION")
    print("=" * 70)
    print(f"\n{'Context':<22} {'Count':>6} {'NearWin':>8} {'OppNear':>8} {'Contested':>10}")
    print("-" * 60)
    for label, stats in data.items():
        if stats['count'] == 0:
            print(f"{label:<22} {'(none)':>6}")
            continue
        print(f"{label:<22} {stats['count']:>6} {stats['avg_our_near_win']:>8.2f} "
              f"{stats['avg_opp_near_win']:>8.2f} {stats['avg_contested']:>10.2f}")


def print_overall_slot_usage(decisions: list[Decision], player_filter: Optional[str]):
    """Print overall slot usage distribution as context."""
    slot_counts = defaultdict(int)
    total = 0
    for d in decisions:
        if player_filter and d.player != player_filter:
            continue
        slot = get_slot_number(d)
        if slot is not None:
            slot_counts[slot] += 1
            total += 1

    print("\n" + "=" * 45)
    print("OVERALL SLOT USAGE")
    print("=" * 45)
    if total == 0:
        print("No decisions found.")
        return

    for s in sorted(slot_counts):
        pct = slot_counts[s] / total * 100
        print(f"  Slot {s}: {slot_counts[s]:>5} ({pct:>5.1f}%)")
    print(f"  Total: {total:>5}")


def main():
    parser = argparse.ArgumentParser(
        description='Analyze slot 3 perk win/loss correlation')
    parser.add_argument('log_dir', nargs='?', default='logs',
                        help='Directory containing game logs (default: logs)')
    parser.add_argument('--player', choices=['PLAYER1', 'PLAYER2'],
                        help='Filter to only analyze one player')
    parser.add_argument('--json', type=str, metavar='FILE',
                        help='Export analysis to JSON file')

    args = parser.parse_args()

    # Load logs
    print(f"Loading logs from {args.log_dir}...")
    logs = load_logs(args.log_dir)
    print(f"Loaded {len(logs)} game logs")

    # Extract data
    decisions = extract_decisions(logs)
    summaries = extract_game_summaries(logs)
    outcome_map = build_game_outcome_map(summaries)

    player_filter = args.player
    filtered = [d for d in decisions if not player_filter or d.player == player_filter]

    print(f"Extracted {len(filtered)} decisions from {len(summaries)} games"
          f"{f' (filtered to {player_filter})' if player_filter else ''}")

    if not filtered:
        print("\nNo decisions found. Run with minimax AI to get decision logs.")
        return

    # Overall context
    print_overall_slot_usage(decisions, player_filter)

    # Run all reports
    r1 = report_slot3_win_loss(decisions, outcome_map, player_filter)
    print_report1(r1)

    r2 = report_per_perk_win(decisions, outcome_map, player_filter)
    print_report2(r2)

    r3 = report_score_margins(decisions, outcome_map, player_filter)
    print_report3(r3)

    r4 = report_game_phase(decisions, outcome_map, player_filter)
    print_report4(r4)

    r5 = report_board_state(decisions, outcome_map, player_filter)
    print_report5(r5)

    # Export
    if args.json:
        export = {
            'slot3_win_loss': r1,
            'per_perk_win': r2,
            'score_margins': {k: {kk: vv for kk, vv in v.items() if kk != 'top_perks'}
                              for k, v in r3.items()},
            'game_phase': {k: {kk: vv for kk, vv in v.items() if kk != 'top_perks'}
                           for k, v in r4.items()},
            'board_state': r5,
        }
        with open(args.json, 'w') as f:
            json.dump(export, f, indent=2)
        print(f"\nExported to {args.json}")


if __name__ == '__main__':
    main()
