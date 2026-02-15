#!/usr/bin/env python3
"""
Main CLI for running perk balance simulations.

Usage:
    python run_simulation.py                    # Default: 1000 games, Random vs Random
    python run_simulation.py -n 5000            # 5000 games
    python run_simulation.py --compare          # Run AI comparison tests
    python run_simulation.py --balance          # Run slot balance analysis
    python run_simulation.py --export results.json  # Export results to JSON
"""

import sys
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / 'src'))

from simulation import (
    SimulationRunner,
    run_comparison,
    run_slot_allocation_test,
    print_summary,
    print_comparison,
    print_perk_analysis,
    export_results
)
from ai import easy_ai, medium_ai, hard_ai, random_ai
from ai import create_expectimax_ai, expectimax_depth1, expectimax_depth2, expectimax_depth3
from ai import create_ai_function, Difficulty, PROFILES, MINIMAX_PROFILES, get_minimax_profile
from game.config import GameConfig


def format_ai_name(ai_type, p1_depth, p2_depth, global_depth, is_p1=True, profile='v1', minimax_profile='minimax-v1'):
    """Format AI name, including depth for minimax and profile for heuristic AI."""
    name = ai_type.title()
    if ai_type in ['minimax1', 'minimax2', 'minimax3']:
        if is_p1 and p1_depth is not None:
            depth = p1_depth
        elif not is_p1 and p2_depth is not None:
            depth = p2_depth
        elif global_depth is not None:
            depth = global_depth
        else:
            depth = int(ai_type[-1])  # minimax1 -> 1, etc.
        name = f"Minimax (d={depth}, {minimax_profile})"
    elif ai_type in ['easy', 'medium', 'hard']:
        name = f"{ai_type.title()} ({profile})"
    return name


def main():
    parser = argparse.ArgumentParser(
        description='Run perk balance simulations',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_simulation.py -n 1000              # 1000 games with random AI
  python run_simulation.py -n 500 --p1 hard     # Hard AI vs Hard AI
  python run_simulation.py --compare            # Compare all AI levels
  python run_simulation.py --balance            # Test slot balance
  python run_simulation.py -n 1000 --export results.json
        """
    )

    parser.add_argument('-n', '--games', type=int, default=1000,
                        help='Number of games to run (default: 1000)')
    parser.add_argument('--p1', choices=['easy', 'medium', 'hard', 'random', 'minimax1', 'minimax2', 'minimax3'],
                        default='random', help='Player 1 AI (default: random)')
    parser.add_argument('--p2', choices=['easy', 'medium', 'hard', 'random', 'minimax1', 'minimax2', 'minimax3'],
                        default='random', help='Player 2 AI (default: random)')
    parser.add_argument('--depth', type=int, default=None,
                        help='Custom depth for minimax AI (overrides minimax1/2/3)')
    parser.add_argument('--p1-depth', type=int, default=None,
                        help='Custom depth for Player 1 minimax AI')
    parser.add_argument('--p2-depth', type=int, default=None,
                        help='Custom depth for Player 2 minimax AI')
    parser.add_argument('--compare', action='store_true',
                        help='Run AI comparison tests')
    parser.add_argument('--balance', action='store_true',
                        help='Run slot balance analysis')
    parser.add_argument('--perks', action='store_true',
                        help='Show detailed perk usage analysis')
    parser.add_argument('--export', type=str, metavar='FILE',
                        help='Export results to JSON file')
    parser.add_argument('--seed', type=int, default=0,
                        help='Starting random seed (default: 0)')
    parser.add_argument('--log-games', action='store_true',
                        help='Save detailed per-game logs to logs/ directory')
    parser.add_argument('-q', '--quiet', action='store_true',
                        help='Minimal output')
    parser.add_argument('--p1-profile', default='v1',
                        choices=list(PROFILES.keys()),
                        help='Heuristic profile for player 1 (default: v1)')
    parser.add_argument('--p2-profile', default='v1',
                        choices=list(PROFILES.keys()),
                        help='Heuristic profile for player 2 (default: v1)')
    parser.add_argument('--profile', default=None,
                        choices=list(PROFILES.keys()),
                        help='Set both p1 and p2 profile (shortcut for --p1-profile + --p2-profile)')
    parser.add_argument('--p1-minimax-profile', default='minimax-v1',
                        choices=list(MINIMAX_PROFILES.keys()),
                        help='Minimax eval profile for player 1 (default: minimax-v1)')
    parser.add_argument('--p2-minimax-profile', default='minimax-v1',
                        choices=list(MINIMAX_PROFILES.keys()),
                        help='Minimax eval profile for player 2 (default: minimax-v1)')
    parser.add_argument('--minimax-profile', default=None,
                        choices=list(MINIMAX_PROFILES.keys()),
                        help='Set both p1 and p2 minimax profile (shortcut)')
    parser.add_argument('--lanes', type=int, default=5,
                        help='Number of lanes (default: 5)')
    parser.add_argument('--slots', type=int, default=5,
                        help='Slots per side per lane (default: 5)')
    parser.add_argument('--max-turns', type=int, default=None,
                        help='Max turns per game (default: auto-scaled from board size)')

    args = parser.parse_args()

    if args.profile:
        args.p1_profile = args.profile
        args.p2_profile = args.profile

    if args.minimax_profile:
        args.p1_minimax_profile = args.minimax_profile
        args.p2_minimax_profile = args.minimax_profile

    # Build custom config if board size differs from default
    custom_config = None
    if args.lanes != 5 or args.slots != 5:
        lanes_to_win = args.lanes // 2 + 1
        custom_config = GameConfig(
            LANES=args.lanes,
            SLOTS_PER_SIDE=args.slots,
            LANES_TO_WIN=lanes_to_win
        )

    # Auto-scale max_turns based on board size if not explicitly set
    max_turns = args.max_turns if args.max_turns is not None else args.lanes * args.slots * 4

    # AI selection helper
    def get_ai(ai_type: str, profile: str, depth: int = None, minimax_profile: str = 'minimax-v1'):
        """Get AI function based on type and profile."""
        if ai_type == 'random':
            return random_ai
        elif ai_type == 'easy':
            return create_ai_function(Difficulty.EASY, profile)
        elif ai_type == 'medium':
            return create_ai_function(Difficulty.MEDIUM, profile)
        elif ai_type == 'hard':
            return create_ai_function(Difficulty.HARD, profile)
        elif ai_type in ['minimax1', 'minimax2', 'minimax3']:
            mp = get_minimax_profile(minimax_profile)
            if depth is not None:
                return create_expectimax_ai(depth, profile=mp)
            else:
                return create_expectimax_ai(int(ai_type[-1]), profile=mp)
        else:
            raise ValueError(f"Unknown AI type: {ai_type}")

    # Determine depths for minimax
    p1_mm_depth = args.p1_depth if args.p1_depth is not None else args.depth
    p2_mm_depth = args.p2_depth if args.p2_depth is not None else args.depth

    if args.compare:
        # Run comparison mode
        print("Running AI Comparison Tests")
        print("=" * 50)
        results = run_comparison(n_games=args.games, verbose=not args.quiet)
        print_comparison(results)

    elif args.balance:
        profile_name = args.p1_profile
        print(f"Running Slot Balance Analysis (profile: {profile_name})")
        print("=" * 50)
        p1_ai = get_ai('hard', profile_name)
        p2_ai = get_ai('hard', profile_name)
        runner = SimulationRunner(p1_ai, p2_ai, seed_start=args.seed, max_turns=max_turns, config=custom_config)
        result = runner.run(args.games, verbose=not args.quiet)
        print_summary(result, f"Hard ({profile_name}) vs Hard ({profile_name})")
        # Show slot distribution
        slot_pcts = result.slot_percentages
        print(f"\nSlot Distribution:")
        for slot in [1, 2, 3, 4]:
            pct = slot_pcts.get(slot, 0)
            print(f"  Slot {slot}: {pct:.1f}%")

    else:
        # Run single configuration
        p1_ai = get_ai(args.p1, args.p1_profile, p1_mm_depth, args.p1_minimax_profile)
        p2_ai = get_ai(args.p2, args.p2_profile, p2_mm_depth, args.p2_minimax_profile)

        p1_name = format_ai_name(args.p1, args.p1_depth, args.p2_depth, args.depth, is_p1=True, profile=args.p1_profile, minimax_profile=args.p1_minimax_profile)
        p2_name = format_ai_name(args.p2, args.p1_depth, args.p2_depth, args.depth, is_p1=False, profile=args.p2_profile, minimax_profile=args.p2_minimax_profile)

        if not args.quiet:
            print(f"Running {args.games} games: {p1_name} vs {p2_name}")
            if custom_config:
                print(f"Board: {custom_config.LANES} lanes x {custom_config.SLOTS_PER_SIDE} slots/side (win {custom_config.LANES_TO_WIN}, max {max_turns} turns)")
            print("=" * 50)

        runner = SimulationRunner(
            player1_ai=p1_ai,
            player2_ai=p2_ai,
            seed_start=args.seed,
            max_turns=max_turns,
            log_games=args.log_games,
            config=custom_config
        )
        result = runner.run(args.games, verbose=not args.quiet)

        if args.log_games:
            print(f"\nGame logs saved to: logs/")

        print_summary(result, f"{p1_name} vs {p2_name}")

        if args.perks:
            print_perk_analysis(result)

        if args.export:
            export_results(result, args.export)


if __name__ == '__main__':
    main()
