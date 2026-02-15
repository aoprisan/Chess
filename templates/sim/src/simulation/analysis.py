"""Analysis and reporting for simulation results."""

from typing import Optional
from collections import Counter
import json

from src.simulation.runner import SimulationResult
from src.perks.base import SLOT_3_PERKS, SLOT_4_PERKS


def print_summary(result: SimulationResult, title: str = "Simulation Results") -> None:
    """Print a formatted summary of simulation results."""
    print(f"\n{'='*50}")
    print(f" {title}")
    print(f"{'='*50}")

    print(f"\nGames: {result.games_played}")
    print(f"Time: {result.elapsed_time:.2f}s ({result.games_played/result.elapsed_time:.0f} games/sec)")
    seed_end = result.seed_start + result.games_played - 1
    print(f"Seeds: {result.seed_start}..{seed_end}")

    print(f"\nWin Rates:")
    print(f"  Player 1: {result.player1_win_rate*100:.1f}% ({result.player1_wins} wins)")
    print(f"  Player 2: {result.player2_win_rate*100:.1f}% ({result.player2_wins} wins)")
    if result.draws > 0:
        print(f"  Draws: {result.draws}")

    print(f"\nGame Length:")
    print(f"  Average: {result.avg_turns:.1f} turns")
    if result.game_lengths:
        print(f"  Min: {min(result.game_lengths)}, Max: {max(result.game_lengths)}")

    print(f"\nSlot Usage (P1 / P2):")
    p1_pcts = result.slot_percentages_p1
    p2_pcts = result.slot_percentages_p2
    for slot in [1, 2, 3, 4]:
        print(f"  Slot {slot}: {p1_pcts[slot]:5.1f}% / {p2_pcts[slot]:5.1f}%")

    print(f"\nTop Perks (P1):")
    top_p1 = result.perk_usage_p1.most_common(5)
    if top_p1:
        max_c = top_p1[0][1]
        for perk, count in top_p1:
            bar = "█" * int(count / max_c * 15)
            print(f"  {perk:15s}: {count:5d} {bar}")

    print(f"\nTop Perks (P2):")
    top_p2 = result.perk_usage_p2.most_common(5)
    if top_p2:
        max_c = top_p2[0][1]
        for perk, count in top_p2:
            bar = "█" * int(count / max_c * 15)
            print(f"  {perk:15s}: {count:5d} {bar}")


def print_comparison(results: dict[str, SimulationResult]) -> None:
    """Print a comparison table of multiple simulation results."""
    print(f"\n{'='*70}")
    print(" Comparison Results")
    print(f"{'='*70}")

    # Header
    print(f"\n{'Configuration':<25} {'P1 Win%':>10} {'P2 Win%':>10} {'Avg Turns':>10}")
    print("-" * 55)

    for name, result in results.items():
        print(f"{name:<25} {result.player1_win_rate*100:>9.1f}% {result.player2_win_rate*100:>9.1f}% {result.avg_turns:>10.1f}")


def analyze_perk_balance(result: SimulationResult) -> dict:
    """
    Analyze perk usage balance.

    Returns dict with balance metrics.
    """
    all_perks = ['PLACE_ANOTHER', 'REMOVE_ENEMY'] + SLOT_3_PERKS + SLOT_4_PERKS

    # Calculate usage rates
    total_perk_uses = sum(result.perk_usage.values())
    usage_rates = {
        perk: result.perk_usage.get(perk, 0) / total_perk_uses * 100
        if total_perk_uses > 0 else 0
        for perk in all_perks
    }

    # Identify unused and underused perks
    unused = [p for p in all_perks if result.perk_usage.get(p, 0) == 0]
    underused = [p for p, rate in usage_rates.items() if 0 < rate < 0.5]
    overused = [p for p, rate in usage_rates.items() if rate > 10]

    # Slot-specific analysis
    slot3_usage = sum(result.perk_usage.get(p, 0) for p in SLOT_3_PERKS)
    slot4_usage = sum(result.perk_usage.get(p, 0) for p in SLOT_4_PERKS)

    return {
        'total_perk_uses': total_perk_uses,
        'usage_rates': usage_rates,
        'unused_perks': unused,
        'underused_perks': underused,
        'overused_perks': overused,
        'slot3_total': slot3_usage,
        'slot4_total': slot4_usage,
        'slot3_vs_slot4_ratio': slot3_usage / slot4_usage if slot4_usage > 0 else float('inf'),
    }


def print_perk_analysis(result: SimulationResult) -> None:
    """Print detailed perk usage analysis."""
    analysis = analyze_perk_balance(result)

    print(f"\n{'='*50}")
    print(" Perk Balance Analysis")
    print(f"{'='*50}")

    print(f"\nTotal perk uses: {analysis['total_perk_uses']}")

    if analysis['unused_perks']:
        print(f"\nUnused perks ({len(analysis['unused_perks'])}):")
        for perk in analysis['unused_perks']:
            print(f"  - {perk}")

    if analysis['underused_perks']:
        print(f"\nUnderused perks (<0.5%):")
        for perk in analysis['underused_perks']:
            rate = analysis['usage_rates'][perk]
            print(f"  - {perk}: {rate:.2f}%")

    if analysis['overused_perks']:
        print(f"\nMost used perks (>10%):")
        for perk in analysis['overused_perks']:
            rate = analysis['usage_rates'][perk]
            print(f"  - {perk}: {rate:.1f}%")

    print(f"\nSlot 3 vs Slot 4:")
    print(f"  Slot 3 uses: {analysis['slot3_total']}")
    print(f"  Slot 4 uses: {analysis['slot4_total']}")
    ratio = analysis['slot3_vs_slot4_ratio']
    if ratio != float('inf'):
        print(f"  Ratio: {ratio:.2f}")


def export_results(result: SimulationResult, filepath: str) -> None:
    """Export results to JSON file."""
    with open(filepath, 'w') as f:
        json.dump(result.to_dict(), f, indent=2)
    print(f"Results exported to: {filepath}")


def export_comparison(results: dict[str, SimulationResult], filepath: str) -> None:
    """Export comparison results to JSON file."""
    data = {
        name: result.to_dict()
        for name, result in results.items()
    }
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Comparison exported to: {filepath}")
