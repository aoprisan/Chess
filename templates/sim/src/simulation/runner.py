"""Batch simulation runner for large-scale testing."""

from typing import Callable, Optional, Any
from dataclasses import dataclass, field
from collections import Counter
from pathlib import Path
import json
import time

from src.game.engine import GameEngine
from src.game.state import GameState, Player
from src.game.config import GameConfig
from src.game.logger import GameLogger
from src.ai import easy_ai, medium_ai, hard_ai, random_ai, Difficulty, create_ai_function


@dataclass
class SimulationResult:
    """Results from a batch simulation."""
    games_played: int = 0
    player1_wins: int = 0
    player2_wins: int = 0
    draws: int = 0
    total_turns: int = 0
    slot_usage_p1: Counter = field(default_factory=Counter)
    slot_usage_p2: Counter = field(default_factory=Counter)
    perk_usage_p1: Counter = field(default_factory=Counter)
    perk_usage_p2: Counter = field(default_factory=Counter)
    game_lengths: list[int] = field(default_factory=list)
    elapsed_time: float = 0.0
    seed_start: int = 0

    @property
    def slot_usage(self) -> Counter:
        """Combined slot usage (backward compat)."""
        return self.slot_usage_p1 + self.slot_usage_p2

    @property
    def perk_usage(self) -> Counter:
        """Combined perk usage (backward compat)."""
        return self.perk_usage_p1 + self.perk_usage_p2

    @property
    def player1_win_rate(self) -> float:
        return self.player1_wins / self.games_played if self.games_played > 0 else 0.0

    @property
    def player2_win_rate(self) -> float:
        return self.player2_wins / self.games_played if self.games_played > 0 else 0.0

    @property
    def avg_turns(self) -> float:
        return self.total_turns / self.games_played if self.games_played > 0 else 0.0

    @staticmethod
    def _slot_pcts(usage: Counter) -> dict[int, float]:
        """Compute slot percentages from a usage counter."""
        total = sum(v for k, v in usage.items() if k != 'pass')
        if total == 0:
            return {1: 0, 2: 0, 3: 0, 4: 0}
        return {slot: (usage[slot] / total * 100) for slot in [1, 2, 3, 4]}

    @property
    def slot_percentages(self) -> dict[int, float]:
        return self._slot_pcts(self.slot_usage)

    @property
    def slot_percentages_p1(self) -> dict[int, float]:
        return self._slot_pcts(self.slot_usage_p1)

    @property
    def slot_percentages_p2(self) -> dict[int, float]:
        return self._slot_pcts(self.slot_usage_p2)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'games_played': self.games_played,
            'player1_wins': self.player1_wins,
            'player2_wins': self.player2_wins,
            'player1_win_rate': round(self.player1_win_rate * 100, 1),
            'player2_win_rate': round(self.player2_win_rate * 100, 1),
            'draws': self.draws,
            'avg_turns': round(self.avg_turns, 1),
            'elapsed_time': round(self.elapsed_time, 2),
            'slot_percentages': {k: round(v, 1) for k, v in self.slot_percentages.items()},
            'slot_usage': dict(self.slot_usage),
            'perk_usage': dict(self.perk_usage),
            'slot_percentages_p1': {k: round(v, 1) for k, v in self.slot_percentages_p1.items()},
            'slot_percentages_p2': {k: round(v, 1) for k, v in self.slot_percentages_p2.items()},
            'slot_usage_p1': dict(self.slot_usage_p1),
            'slot_usage_p2': dict(self.slot_usage_p2),
            'perk_usage_p1': dict(self.perk_usage_p1),
            'perk_usage_p2': dict(self.perk_usage_p2),
            'game_lengths': self.game_lengths,
        }


class SimulationRunner:
    """Run batch simulations with configurable AI players."""

    def __init__(self,
                 player1_ai: Callable[[GameState], tuple[int | str, Optional[int]]] = None,
                 player2_ai: Callable[[GameState], tuple[int | str, Optional[int]]] = None,
                 seed_start: int = 0,
                 max_turns: int = 100,
                 log_games: bool = False,
                 log_dir: str = 'logs',
                 config: Optional[GameConfig] = None):
        """
        Initialize simulation runner.

        Args:
            player1_ai: AI function for player 1 (default: hard_ai)
            player2_ai: AI function for player 2 (default: hard_ai)
            seed_start: Starting seed for deterministic runs
            max_turns: Maximum turns per game
            log_games: Whether to save detailed per-game logs
            log_dir: Directory for game logs (default: 'logs')
            config: Game configuration (uses default if not provided)
        """
        self.player1_ai = player1_ai or hard_ai
        self.player2_ai = player2_ai or hard_ai
        self.seed_start = seed_start
        self.max_turns = max_turns
        self.log_games = log_games
        self.log_dir = Path(log_dir)
        self.config = config

    def run(self, n_games: int, verbose: bool = False) -> SimulationResult:
        """
        Run a batch of games.

        Args:
            n_games: Number of games to run
            verbose: Print progress

        Returns:
            SimulationResult with aggregated statistics
        """
        result = SimulationResult()
        result.seed_start = self.seed_start
        start_time = time.time()

        # Create logs directory if logging is enabled
        if self.log_games:
            self.log_dir.mkdir(parents=True, exist_ok=True)

        for i in range(n_games):
            if verbose and (i + 1) % 100 == 0:
                print(f"  Game {i + 1}/{n_games}...")

            seed = self.seed_start + i

            # Create logger if logging is enabled
            logger = GameLogger(enabled=self.log_games) if self.log_games else None

            engine = GameEngine(seed=seed, config=self.config, logger=logger)
            final_state = engine.run_game(
                self.player1_ai,
                self.player2_ai,
                max_turns=self.max_turns
            )

            # Save game log if logging is enabled
            if self.log_games and logger:
                log_path = self.log_dir / f"game_{seed:04d}.json"
                logger.save(str(log_path))

            # Record results
            result.games_played += 1
            result.total_turns += final_state.turn_number
            result.game_lengths.append(final_state.turn_number)

            if final_state.winner == Player.PLAYER1:
                result.player1_wins += 1
            elif final_state.winner == Player.PLAYER2:
                result.player2_wins += 1
            else:
                result.draws += 1

            # Aggregate per-player slot/perk usage
            for slot, count in final_state.player1_slot_usage.items():
                result.slot_usage_p1[slot] += count
            for slot, count in final_state.player2_slot_usage.items():
                result.slot_usage_p2[slot] += count
            for perk, count in final_state.player1_perk_usage.items():
                result.perk_usage_p1[perk] += count
            for perk, count in final_state.player2_perk_usage.items():
                result.perk_usage_p2[perk] += count

        result.elapsed_time = time.time() - start_time
        return result


def run_comparison(
    n_games: int = 1000,
    configs: list[dict] = None,
    verbose: bool = True
) -> dict[str, SimulationResult]:
    """
    Run multiple simulation configurations for comparison.

    Args:
        n_games: Games per configuration
        configs: List of config dicts with 'name', 'player1', 'player2' keys
        verbose: Print progress

    Returns:
        Dict mapping config name to SimulationResult
    """
    if configs is None:
        # Default: test difficulty levels
        configs = [
            {'name': 'Hard vs Random', 'player1': hard_ai, 'player2': random_ai},
            {'name': 'Medium vs Random', 'player1': medium_ai, 'player2': random_ai},
            {'name': 'Easy vs Random', 'player1': easy_ai, 'player2': random_ai},
            {'name': 'Hard vs Hard', 'player1': hard_ai, 'player2': hard_ai},
            {'name': 'Random vs Random', 'player1': random_ai, 'player2': random_ai},
        ]

    results = {}

    for config in configs:
        name = config['name']
        if verbose:
            print(f"\nRunning: {name} ({n_games} games)...")

        runner = SimulationRunner(
            player1_ai=config['player1'],
            player2_ai=config['player2']
        )
        result = runner.run(n_games, verbose=verbose)
        results[name] = result

        if verbose:
            print(f"  P1 wins: {result.player1_win_rate*100:.1f}%")
            print(f"  Avg turns: {result.avg_turns:.1f}")
            print(f"  Time: {result.elapsed_time:.2f}s")

    return results


def run_slot_allocation_test(
    n_games: int = 500,
    verbose: bool = True
) -> dict:
    """
    Test slot allocation balance with different AI configurations.

    Returns dict with slot usage statistics.
    """
    if verbose:
        print("Testing slot allocation balance...")

    # Random AI for unbiased slot selection
    runner = SimulationRunner(
        player1_ai=random_ai,
        player2_ai=random_ai
    )
    result = runner.run(n_games, verbose=verbose)

    slot_pcts = result.slot_percentages

    if verbose:
        print(f"\nSlot Usage ({n_games} games with Random AI):")
        for slot in [1, 2, 3, 4]:
            pct = slot_pcts[slot]
            status = "✓" if 20 <= pct <= 30 else "!"
            print(f"  Slot {slot}: {pct:.1f}% {status}")

        # Check balance
        min_pct = min(slot_pcts.values())
        max_pct = max(slot_pcts.values())
        spread = max_pct - min_pct

        if spread < 10:
            print(f"\n✓ Good balance (spread: {spread:.1f}%)")
        else:
            print(f"\n! Imbalanced (spread: {spread:.1f}%)")

    return {
        'slot_percentages': slot_pcts,
        'perk_usage': dict(result.perk_usage),
        'games': n_games
    }
