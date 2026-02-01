#!/usr/bin/env python3
"""Simple test runner for the simulation engine MVP."""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from game.engine import GameEngine
from game.state import GameState, Player
from ai.strategy import medium_ai
from typing import Optional


def random_ai(state: GameState) -> tuple[int | str, Optional[int]]:
    """Use medium AI for proper target selection."""
    # Delegate to medium AI which handles all perk signatures correctly
    return medium_ai(state)


def run_single_game(seed: int = 42, verbose: bool = True) -> dict:
    """Run a single game and return summary."""
    engine = GameEngine(seed=seed)

    if verbose:
        def on_auto_place(lane, player):
            print(f"  Turn {engine.state.turn_number}: {player.name} auto-placed on lane {lane}")

        def on_perk(perk, player, result):
            print(f"    {player.name} used {perk}: {result}")

        def on_lane_won(lane, player):
            print(f"    >>> Lane {lane} won by {player.name}!")

        def on_game_over(winner):
            print(f"\n=== GAME OVER: {winner.name} wins! ===")

        engine.on_auto_place = on_auto_place
        engine.on_perk_executed = on_perk
        engine.on_lane_won = on_lane_won
        engine.on_game_over = on_game_over

    if verbose:
        print("Starting game...")
        print(f"Win condition: First to {engine.config.LANES_TO_WIN} lanes\n")

    final_state = engine.run_game(random_ai, random_ai, max_turns=100)

    summary = engine.get_game_summary()

    if verbose:
        print(f"\nGame completed in {summary['turn_number']} turns")
        print(f"Winner: {summary['winner']}")
        print(f"Lanes: P1={summary['player1_lanes']}, P2={summary['player2_lanes']}")
        print(f"\nSlot usage: {summary['slot_usage']}")
        print(f"Perk usage: {summary['perk_usage']}")
        print("\nFinal board:")
        for i, lane in enumerate(summary['lanes']):
            winner_str = f" [{lane['winner']}]" if lane['winner'] else ""
            print(f"  Lane {i}: P1={lane['p1_pieces']} | P2={lane['p2_pieces']}{winner_str}")

    return summary


def run_batch(n_games: int = 100, seed_start: int = 0) -> dict:
    """Run multiple games and aggregate statistics."""
    print(f"Running {n_games} games...")

    total_slot_usage = {1: 0, 2: 0, 3: 0, 4: 0, 'pass': 0}
    total_perk_usage = {}
    p1_wins = 0
    p2_wins = 0
    total_turns = 0

    for i in range(n_games):
        summary = run_single_game(seed=seed_start + i, verbose=False)

        if summary['winner'] == 'PLAYER1':
            p1_wins += 1
        elif summary['winner'] == 'PLAYER2':
            p2_wins += 1

        total_turns += summary['turn_number']

        for slot, count in summary['slot_usage'].items():
            total_slot_usage[slot] += count

        for perk, count in summary['perk_usage'].items():
            total_perk_usage[perk] = total_perk_usage.get(perk, 0) + count

    # Calculate percentages
    total_actions = sum(v for k, v in total_slot_usage.items() if k != 'pass')
    slot_percentages = {
        k: (v / total_actions * 100) if total_actions > 0 else 0
        for k, v in total_slot_usage.items() if k != 'pass'
    }

    print(f"\n=== Batch Results ({n_games} games) ===")
    print(f"P1 wins: {p1_wins} ({p1_wins/n_games*100:.1f}%)")
    print(f"P2 wins: {p2_wins} ({p2_wins/n_games*100:.1f}%)")
    print(f"Average turns: {total_turns/n_games:.1f}")
    print(f"\nSlot usage percentages:")
    for slot, pct in sorted(slot_percentages.items()):
        print(f"  Slot {slot}: {pct:.1f}%")
    print(f"  Pass: {total_slot_usage['pass']} total")
    print(f"\nPerk usage:")
    for perk, count in sorted(total_perk_usage.items(), key=lambda x: -x[1]):
        print(f"  {perk}: {count}")

    return {
        'games': n_games,
        'p1_wins': p1_wins,
        'p2_wins': p2_wins,
        'avg_turns': total_turns / n_games,
        'slot_percentages': slot_percentages,
        'perk_usage': total_perk_usage
    }


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Run perk simulation')
    parser.add_argument('--games', '-n', type=int, default=1,
                        help='Number of games to run')
    parser.add_argument('--seed', '-s', type=int, default=42,
                        help='Random seed (or start seed for batch)')
    parser.add_argument('--verbose', '-v', action='store_true',
                        help='Verbose output for single game')

    args = parser.parse_args()

    if args.games == 1:
        run_single_game(seed=args.seed, verbose=True)
    else:
        run_batch(n_games=args.games, seed_start=args.seed)
