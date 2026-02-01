#!/usr/bin/env python3
"""
Analyze game logs for AI heuristic bug detection.

Usage:
    python analyze_logs.py                  # Analyze logs/ directory
    python analyze_logs.py logs             # Explicit directory
    python analyze_logs.py --verbose        # Show detailed anomalies

This script reads JSON game logs and reports:
1. Decision quality (did AI pick highest-scored option?)
2. Score distributions by perk type
3. Game length outliers
4. Anomalies (suspicious decisions to investigate)
"""

import json
import sys
from pathlib import Path
from collections import defaultdict
import statistics
from typing import Optional
from dataclasses import dataclass, field


@dataclass
class Decision:
    """A single AI decision from a game."""
    game_file: str
    turn: int
    player: str
    ai_type: str
    offered_perks: dict  # slot -> perk name
    evaluations: dict    # slot -> {perk, score, target}
    selected_slot: str | int
    selected_target: any
    board_state: Optional[dict] = None  # Board state at decision time

    @property
    def selected_score(self) -> float:
        """Get the score of the selected option."""
        slot_key = str(self.selected_slot)
        if slot_key in self.evaluations:
            return self.evaluations[slot_key].get('score', 0)
        return 0

    @property
    def best_score(self) -> float:
        """Get the highest score among all options."""
        scores = [e.get('score', 0) for e in self.evaluations.values()]
        return max(scores) if scores else 0

    @property
    def best_slot(self) -> str:
        """Get the slot with highest score."""
        if not self.evaluations:
            return 'pass'
        return max(self.evaluations.keys(), key=lambda s: self.evaluations[s].get('score', 0))

    @property
    def is_optimal(self) -> bool:
        """Did AI pick the highest-scored option?"""
        return abs(self.selected_score - self.best_score) < 0.01

    @property
    def score_gap(self) -> float:
        """Difference between best score and selected score."""
        return self.best_score - self.selected_score


@dataclass
class Anomaly:
    """A suspicious decision that warrants investigation."""
    anomaly_type: str
    game_file: str
    turn: int
    player: str
    description: str
    details: dict = field(default_factory=dict)

    def __str__(self):
        return f"[{self.anomaly_type}] {self.game_file} turn {self.turn}: {self.description}"


@dataclass
class GameSummary:
    """Summary of a single game."""
    game_file: str
    seed: Optional[int]
    total_turns: int
    winner: Optional[str]
    p1_lanes: int
    p2_lanes: int
    decisions: list[Decision] = field(default_factory=list)


def load_logs(log_dir: str = 'logs') -> list[dict]:
    """Load all game logs from directory."""
    logs = []
    log_path = Path(log_dir)

    if not log_path.exists():
        print(f"Error: Log directory '{log_dir}' not found.")
        print(f"Run: python run_simulation.py -n 50 --p1 hard --p2 hard --log-games")
        sys.exit(1)

    json_files = sorted(log_path.glob('game_*.json'))
    if not json_files:
        print(f"Error: No game_*.json files found in '{log_dir}'.")
        sys.exit(1)

    for path in json_files:
        try:
            with open(path) as f:
                data = json.load(f)
                data['_filename'] = path.name
                logs.append(data)
        except json.JSONDecodeError as e:
            print(f"Warning: Could not parse {path}: {e}")

    return logs


def extract_decisions(logs: list[dict]) -> list[Decision]:
    """Extract all AI decisions from game logs."""
    decisions = []

    for log in logs:
        filename = log.get('_filename', 'unknown')
        events = log.get('events', [])

        # Build a map of turn -> board state from turn_start events
        turn_boards = {}
        for event in events:
            if event.get('event_type') == 'turn_start':
                turn = event.get('turn', 0)
                board = event.get('data', {}).get('board')
                if board:
                    turn_boards[turn] = board

        # Extract AI decisions
        for event in events:
            if event.get('event_type') != 'ai_decision':
                continue

            data = event.get('data', {})
            turn = event.get('turn', 0)

            decision = Decision(
                game_file=filename,
                turn=turn,
                player=event.get('player', 'unknown'),
                ai_type=data.get('ai_type', 'unknown'),
                offered_perks=data.get('offered_perks', {}),
                evaluations=data.get('evaluations', {}),
                selected_slot=data.get('selected', {}).get('slot', 'pass'),
                selected_target=data.get('selected', {}).get('target'),
                board_state=turn_boards.get(turn)
            )
            decisions.append(decision)

    return decisions


def extract_game_summaries(logs: list[dict]) -> list[GameSummary]:
    """Extract game summaries from logs."""
    summaries = []

    for log in logs:
        filename = log.get('_filename', 'unknown')
        metadata = log.get('metadata', {})
        summary = log.get('summary', {})
        events = log.get('events', [])

        # Get total_turns from summary, but fall back to last event's turn if 0
        # (handles games that didn't complete properly)
        total_turns = summary.get('total_turns', 0)
        if total_turns == 0 and events:
            # Find the max turn number from events
            total_turns = max(e.get('turn', 0) for e in events)

        # Get winner from summary or look for game_over event
        winner = summary.get('winner')
        if winner is None:
            for e in events:
                if e.get('event_type') == 'game_over':
                    winner = e.get('data', {}).get('winner')
                    break

        game_summary = GameSummary(
            game_file=filename,
            seed=metadata.get('seed'),
            total_turns=total_turns,
            winner=winner,
            p1_lanes=summary.get('lane_wins', {}).get('PLAYER1', 0),
            p2_lanes=summary.get('lane_wins', {}).get('PLAYER2', 0),
        )
        summaries.append(game_summary)

    return summaries


def analyze_decision_quality(decisions: list[Decision]) -> dict:
    """Analyze how often AI picked the best-scored option."""
    total = len(decisions)
    if total == 0:
        return {'total': 0, 'optimal': 0, 'suboptimal': []}

    optimal = 0
    suboptimal_by_rank = defaultdict(int)  # rank -> count
    suboptimal_details = []

    for d in decisions:
        if d.is_optimal:
            optimal += 1
        else:
            # Find rank of selected option
            scores = sorted(
                [(s, d.evaluations[s].get('score', 0)) for s in d.evaluations],
                key=lambda x: -x[1]
            )
            selected_key = str(d.selected_slot)
            rank = next((i for i, (s, _) in enumerate(scores) if s == selected_key), len(scores))
            suboptimal_by_rank[rank + 1] += 1

            if d.score_gap > 10:  # Significant gap
                suboptimal_details.append({
                    'game': d.game_file,
                    'turn': d.turn,
                    'player': d.player,
                    'gap': d.score_gap,
                    'selected': d.selected_slot,
                    'best': d.best_slot,
                    'selected_perk': d.evaluations.get(str(d.selected_slot), {}).get('perk'),
                    'best_perk': d.evaluations.get(d.best_slot, {}).get('perk'),
                })

    return {
        'total': total,
        'optimal': optimal,
        'optimal_rate': optimal / total * 100,
        'by_rank': dict(suboptimal_by_rank),
        'suboptimal_significant': sorted(suboptimal_details, key=lambda x: -x['gap'])[:20]
    }


def analyze_score_distributions(decisions: list[Decision]) -> dict:
    """Compute score statistics per perk type."""
    perk_scores = defaultdict(list)

    for d in decisions:
        for slot, eval_data in d.evaluations.items():
            perk = eval_data.get('perk', 'UNKNOWN')
            score = eval_data.get('score', 0)
            if perk and score >= -99:  # Exclude invalid options (-100)
                perk_scores[perk].append(score)

    stats = {}
    for perk, scores in sorted(perk_scores.items()):
        if len(scores) >= 5:  # Need minimum samples
            stats[perk] = {
                'count': len(scores),
                'avg': round(statistics.mean(scores), 1),
                'min': round(min(scores), 1),
                'max': round(max(scores), 1),
                'stddev': round(statistics.stdev(scores), 1) if len(scores) > 1 else 0,
                'median': round(statistics.median(scores), 1),
            }

    return stats


def analyze_game_lengths(summaries: list[GameSummary]) -> dict:
    """Analyze game length distribution."""
    if not summaries:
        return {}

    lengths = [s.total_turns for s in summaries]

    avg = statistics.mean(lengths)
    stddev = statistics.stdev(lengths) if len(lengths) > 1 else 0

    # Find outliers (>2 std from mean)
    outliers = []
    for s in summaries:
        z_score = (s.total_turns - avg) / stddev if stddev > 0 else 0
        if abs(z_score) > 2:
            outliers.append({
                'game': s.game_file,
                'turns': s.total_turns,
                'z_score': round(z_score, 2),
                'winner': s.winner,
                'lanes': f"P1:{s.p1_lanes} P2:{s.p2_lanes}"
            })

    return {
        'count': len(lengths),
        'avg': round(avg, 1),
        'min': min(lengths),
        'max': max(lengths),
        'stddev': round(stddev, 1),
        'median': round(statistics.median(lengths), 1),
        'outliers': sorted(outliers, key=lambda x: abs(x['z_score']), reverse=True)
    }


def find_anomalies(decisions: list[Decision], summaries: list[GameSummary],
                   logs: list[dict] = None) -> list[Anomaly]:
    """Find suspicious decisions for manual review."""
    anomalies = []

    # Check for incomplete games (no game_over event)
    if logs:
        for log in logs:
            filename = log.get('_filename', 'unknown')
            events = log.get('events', [])
            has_game_over = any(e.get('event_type') == 'game_over' for e in events)
            if not has_game_over and events:
                max_turn = max(e.get('turn', 0) for e in events)
                anomalies.append(Anomaly(
                    anomaly_type='INCOMPLETE_GAME',
                    game_file=filename,
                    turn=max_turn,
                    player='SYSTEM',
                    description=f"Game has no game_over event (stopped at turn {max_turn})",
                    details={
                        'last_turn': max_turn,
                        'total_events': len(events),
                    }
                ))

    for d in decisions:
        # Anomaly 1: Passed when good options available
        if d.selected_slot == 'pass':
            best = d.best_score
            if best > 30:  # Had a decent option
                anomalies.append(Anomaly(
                    anomaly_type='PASS_WHEN_GOOD',
                    game_file=d.game_file,
                    turn=d.turn,
                    player=d.player,
                    description=f"Passed when best option scored {best:.1f}",
                    details={
                        'best_perk': d.evaluations.get(d.best_slot, {}).get('perk'),
                        'best_score': best,
                        'all_options': {
                            s: {'perk': e.get('perk'), 'score': e.get('score')}
                            for s, e in d.evaluations.items() if s != 'pass'
                        }
                    }
                ))

        # Anomaly 2: Large score inversion (picked much lower scored option)
        elif d.score_gap > 30:
            selected_perk = d.evaluations.get(str(d.selected_slot), {}).get('perk')
            best_perk = d.evaluations.get(d.best_slot, {}).get('perk')

            anomalies.append(Anomaly(
                anomaly_type='SCORE_INVERSION',
                game_file=d.game_file,
                turn=d.turn,
                player=d.player,
                description=f"Picked {selected_perk}({d.selected_score:.1f}) over {best_perk}({d.best_score:.1f})",
                details={
                    'selected_perk': selected_perk,
                    'selected_score': d.selected_score,
                    'best_perk': best_perk,
                    'best_score': d.best_score,
                    'gap': d.score_gap,
                }
            ))

        # Anomaly 3: Very high pass score (AI thinks passing is good)
        pass_eval = d.evaluations.get('pass', {})
        pass_score = pass_eval.get('score', 0)
        if pass_score > 15:  # Pass usually scores 0-20
            anomalies.append(Anomaly(
                anomaly_type='HIGH_PASS_SCORE',
                game_file=d.game_file,
                turn=d.turn,
                player=d.player,
                description=f"Pass scored unusually high: {pass_score:.1f}",
                details={
                    'pass_score': pass_score,
                    'ai_type': d.ai_type,
                }
            ))

        # Anomaly 4: All options scored negative (no good moves)
        if all(e.get('score', 0) < 0 for e in d.evaluations.values()):
            anomalies.append(Anomaly(
                anomaly_type='ALL_NEGATIVE',
                game_file=d.game_file,
                turn=d.turn,
                player=d.player,
                description="All options scored negative",
                details={
                    'options': {
                        s: {'perk': e.get('perk'), 'score': e.get('score')}
                        for s, e in d.evaluations.items()
                    }
                }
            ))

        # Anomaly 5: PLACE_ANOTHER or REMOVE_ENEMY scored very low when offered
        for slot, eval_data in d.evaluations.items():
            perk = eval_data.get('perk')
            score = eval_data.get('score', 0)

            # These core perks should generally be valuable
            if perk == 'PLACE_ANOTHER' and -50 < score < 10:
                anomalies.append(Anomaly(
                    anomaly_type='LOW_CORE_PERK',
                    game_file=d.game_file,
                    turn=d.turn,
                    player=d.player,
                    description=f"PLACE_ANOTHER scored low: {score:.1f}",
                    details={
                        'perk': perk,
                        'score': score,
                        'board': d.board_state,
                    }
                ))

    # Anomaly 6: Game length outliers
    if summaries:
        lengths = [s.total_turns for s in summaries]
        if len(lengths) > 5:
            avg = statistics.mean(lengths)
            stddev = statistics.stdev(lengths)

            for s in summaries:
                z_score = (s.total_turns - avg) / stddev if stddev > 0 else 0
                if z_score > 2.5:  # Very long game
                    anomalies.append(Anomaly(
                        anomaly_type='LONG_GAME',
                        game_file=s.game_file,
                        turn=s.total_turns,
                        player='SYSTEM',
                        description=f"Game lasted {s.total_turns} turns (avg={avg:.1f})",
                        details={
                            'turns': s.total_turns,
                            'z_score': round(z_score, 2),
                            'winner': s.winner,
                        }
                    ))
                elif z_score < -2:  # Very short game
                    anomalies.append(Anomaly(
                        anomaly_type='SHORT_GAME',
                        game_file=s.game_file,
                        turn=s.total_turns,
                        player='SYSTEM',
                        description=f"Game lasted only {s.total_turns} turns (avg={avg:.1f})",
                        details={
                            'turns': s.total_turns,
                            'z_score': round(z_score, 2),
                            'winner': s.winner,
                        }
                    ))

    return anomalies


def analyze_perk_selection_patterns(decisions: list[Decision]) -> dict:
    """Analyze which perks get picked vs passed over."""
    perk_offered = defaultdict(int)
    perk_selected = defaultdict(int)
    perk_passed_over = defaultdict(int)  # Offered but another option picked

    for d in decisions:
        selected_key = str(d.selected_slot)
        selected_perk = d.evaluations.get(selected_key, {}).get('perk') if selected_key != 'pass' else None

        for slot, eval_data in d.evaluations.items():
            if slot == 'pass':
                continue
            perk = eval_data.get('perk')
            if not perk:
                continue

            perk_offered[perk] += 1

            if slot == selected_key:
                perk_selected[perk] += 1
            else:
                perk_passed_over[perk] += 1

    # Calculate selection rate
    selection_rates = {}
    for perk in perk_offered:
        offered = perk_offered[perk]
        selected = perk_selected[perk]
        rate = selected / offered * 100 if offered > 0 else 0
        selection_rates[perk] = {
            'offered': offered,
            'selected': selected,
            'passed_over': perk_passed_over[perk],
            'selection_rate': round(rate, 1),
        }

    return selection_rates


def print_decision_report(quality: dict) -> None:
    """Print decision quality analysis."""
    print("\n" + "=" * 60)
    print("AI DECISION QUALITY ANALYSIS")
    print("=" * 60)

    total = quality['total']
    optimal = quality['optimal']
    rate = quality.get('optimal_rate', 0)

    print(f"\nTotal decisions analyzed: {total}")
    print(f"Chose highest-scored option: {optimal} ({rate:.1f}%)")

    if quality['by_rank']:
        print("\nSuboptimal choices by rank:")
        for rank, count in sorted(quality['by_rank'].items()):
            pct = count / total * 100
            print(f"  Chose #{rank} option: {count} ({pct:.1f}%)")

    if quality['suboptimal_significant']:
        print("\nSignificant suboptimal choices (gap > 10):")
        for i, item in enumerate(quality['suboptimal_significant'][:10]):
            print(f"  {item['game']} turn {item['turn']}: "
                  f"picked {item['selected_perk']}({item['gap']:.0f} lower than {item['best_perk']})")


def print_score_report(stats: dict) -> None:
    """Print score distribution report."""
    print("\n" + "=" * 60)
    print("PERK SCORE DISTRIBUTIONS (when offered)")
    print("=" * 60)

    # Sort by average score descending
    sorted_perks = sorted(stats.items(), key=lambda x: -x[1]['avg'])

    print(f"\n{'Perk':<20} {'Avg':>8} {'Min':>8} {'Max':>8} {'StdDev':>8} {'Count':>8}")
    print("-" * 60)

    for perk, s in sorted_perks:
        print(f"{perk:<20} {s['avg']:>8.1f} {s['min']:>8.1f} {s['max']:>8.1f} "
              f"{s['stddev']:>8.1f} {s['count']:>8}")


def print_game_length_report(length_stats: dict) -> None:
    """Print game length analysis."""
    print("\n" + "=" * 60)
    print("GAME LENGTH DISTRIBUTION")
    print("=" * 60)

    print(f"\nGames analyzed: {length_stats['count']}")
    print(f"Average turns: {length_stats['avg']:.1f}")
    print(f"Median turns: {length_stats['median']:.1f}")
    print(f"Range: {length_stats['min']} - {length_stats['max']}")
    print(f"Std deviation: {length_stats['stddev']:.1f}")

    outliers = length_stats.get('outliers', [])
    if outliers:
        print(f"\nOutlier games (>2 std from mean):")
        for o in outliers[:10]:
            print(f"  {o['game']}: {o['turns']} turns (z={o['z_score']}) - {o['winner'] or 'draw'}")


def print_selection_report(selection_rates: dict) -> None:
    """Print perk selection pattern report."""
    print("\n" + "=" * 60)
    print("PERK SELECTION PATTERNS")
    print("=" * 60)

    # Sort by selection rate
    sorted_perks = sorted(selection_rates.items(), key=lambda x: -x[1]['selection_rate'])

    print(f"\n{'Perk':<20} {'Offered':>10} {'Selected':>10} {'Rate':>10}")
    print("-" * 50)

    for perk, data in sorted_perks:
        print(f"{perk:<20} {data['offered']:>10} {data['selected']:>10} {data['selection_rate']:>9.1f}%")


def print_anomaly_report(anomalies: list[Anomaly], verbose: bool = False) -> None:
    """Print anomaly report."""
    print("\n" + "=" * 60)
    print("ANOMALIES DETECTED")
    print("=" * 60)

    if not anomalies:
        print("\nNo anomalies found!")
        return

    # Group by type
    by_type = defaultdict(list)
    for a in anomalies:
        by_type[a.anomaly_type].append(a)

    print(f"\nTotal anomalies: {len(anomalies)}")

    for atype, items in sorted(by_type.items(), key=lambda x: -len(x[1])):
        print(f"\n[{atype}] ({len(items)} occurrences)")

        # Show first few examples
        for a in items[:5 if verbose else 3]:
            print(f"  {a.game_file} turn {a.turn}: {a.description}")

            if verbose and a.details:
                for k, v in a.details.items():
                    if k != 'board':  # Skip board state in output
                        print(f"    {k}: {v}")

        if len(items) > (5 if verbose else 3):
            print(f"  ... and {len(items) - (5 if verbose else 3)} more")


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Analyze game logs for AI heuristic bugs')
    parser.add_argument('log_dir', nargs='?', default='logs',
                        help='Directory containing game logs (default: logs)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Show detailed anomaly information')
    parser.add_argument('--json', '-j', type=str, metavar='FILE',
                        help='Export analysis to JSON file')

    args = parser.parse_args()

    # Load logs
    print(f"Loading logs from {args.log_dir}...")
    logs = load_logs(args.log_dir)
    print(f"Loaded {len(logs)} game logs")

    # Extract data
    decisions = extract_decisions(logs)
    summaries = extract_game_summaries(logs)

    print(f"Extracted {len(decisions)} AI decisions from {len(summaries)} games")

    if not decisions:
        print("\nNo AI decisions found in logs. Make sure you ran with heuristic AI (hard/medium/easy).")
        print("Random AI does not log decision evaluations.")
        return

    # Run analyses
    decision_quality = analyze_decision_quality(decisions)
    score_stats = analyze_score_distributions(decisions)
    length_stats = analyze_game_lengths(summaries)
    selection_rates = analyze_perk_selection_patterns(decisions)
    anomalies = find_anomalies(decisions, summaries, logs)

    # Print reports
    print_decision_report(decision_quality)
    print_score_report(score_stats)
    print_game_length_report(length_stats)
    print_selection_report(selection_rates)
    print_anomaly_report(anomalies, verbose=args.verbose)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Games: {len(summaries)}")
    print(f"Decisions: {len(decisions)}")
    print(f"Optimal decisions: {decision_quality.get('optimal_rate', 0):.1f}%")
    print(f"Anomalies found: {len(anomalies)}")

    if anomalies:
        print("\nTop anomaly types to investigate:")
        by_type = defaultdict(int)
        for a in anomalies:
            by_type[a.anomaly_type] += 1
        for atype, count in sorted(by_type.items(), key=lambda x: -x[1])[:5]:
            print(f"  {atype}: {count}")

    # Export to JSON if requested
    if args.json:
        export_data = {
            'summary': {
                'games': len(summaries),
                'decisions': len(decisions),
                'optimal_rate': decision_quality.get('optimal_rate', 0),
                'anomaly_count': len(anomalies),
            },
            'decision_quality': decision_quality,
            'score_distributions': score_stats,
            'game_lengths': length_stats,
            'selection_rates': selection_rates,
            'anomalies': [
                {
                    'type': a.anomaly_type,
                    'game': a.game_file,
                    'turn': a.turn,
                    'player': a.player,
                    'description': a.description,
                    'details': a.details,
                }
                for a in anomalies
            ],
        }

        with open(args.json, 'w') as f:
            json.dump(export_data, f, indent=2)
        print(f"\nExported analysis to {args.json}")


if __name__ == '__main__':
    main()
