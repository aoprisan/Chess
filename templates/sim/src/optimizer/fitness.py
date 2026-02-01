"""Fitness evaluation for profile optimization."""

from dataclasses import dataclass
from typing import Optional

from src.ai import create_ai_function, Difficulty, HeuristicProfile, PROFILES
from src.simulation import SimulationRunner


@dataclass
class FitnessResult:
    """Results from fitness evaluation."""
    slot3_pct: float
    slot4_pct: float
    win_rate_vs_v1: float
    fitness_score: float
    games_played: int
    # Additional metrics for debugging
    slot1_pct: float = 0.0
    slot2_pct: float = 0.0

    def meets_criteria(self, slot_target: float = 22.0, win_target: float = 0.45) -> bool:
        """Check if this result meets all optimization criteria."""
        return (self.slot3_pct >= slot_target and
                self.slot4_pct >= slot_target and
                self.win_rate_vs_v1 >= win_target)

    def __str__(self) -> str:
        status = "PASS" if self.meets_criteria() else "FAIL"
        return (f"[{status}] fitness={self.fitness_score:.1f}, "
                f"slots=[{self.slot1_pct:.1f}%, {self.slot2_pct:.1f}%, "
                f"{self.slot3_pct:.1f}%, {self.slot4_pct:.1f}%], "
                f"win_rate={self.win_rate_vs_v1*100:.1f}%")


def evaluate_profile(profile: HeuristicProfile,
                     n_games: int = 200,
                     seed: int = 0,
                     slot_target: float = 22.0,
                     win_target: float = 0.45) -> FitnessResult:
    """
    Evaluate a profile's fitness.

    Runs two test suites:
    1. Self-play (profile vs profile) - measures slot distribution
    2. vs v1 (profile as P2 vs v1) - measures competitiveness

    Args:
        profile: The HeuristicProfile to evaluate
        n_games: Total games to run (split between self-play and vs-v1)
        seed: Random seed for reproducibility
        slot_target: Target percentage for slots 3-4 (default 22%)
        win_target: Target win rate vs v1 (default 45%)

    Returns:
        FitnessResult with all metrics and composite score
    """
    # Register profile temporarily
    temp_name = f'_temp_{id(profile)}'
    PROFILES[temp_name] = profile

    try:
        # Self-play for slot distribution
        ai_self = create_ai_function(Difficulty.HARD, temp_name)
        runner_self = SimulationRunner(ai_self, ai_self, seed_start=seed)
        self_result = runner_self.run(n_games // 2, verbose=False)

        slot_pcts = self_result.slot_percentages
        slot1 = slot_pcts.get(1, 0)
        slot2 = slot_pcts.get(2, 0)
        slot3 = slot_pcts.get(3, 0)
        slot4 = slot_pcts.get(4, 0)

        # vs v1 for competitiveness (profile as P2 to remove first-move advantage)
        ai_v1 = create_ai_function(Difficulty.HARD, 'v1')
        ai_test = create_ai_function(Difficulty.HARD, temp_name)
        runner_vs = SimulationRunner(ai_v1, ai_test, seed_start=seed + 10000)
        vs_result = runner_vs.run(n_games // 2, verbose=False)

        win_rate = vs_result.player2_win_rate  # Test profile is P2

    finally:
        # Clean up temporary profile
        del PROFILES[temp_name]

    # Compute composite fitness
    fitness = compute_fitness(slot3, slot4, win_rate, slot_target, win_target)

    return FitnessResult(
        slot1_pct=slot1,
        slot2_pct=slot2,
        slot3_pct=slot3,
        slot4_pct=slot4,
        win_rate_vs_v1=win_rate,
        fitness_score=fitness,
        games_played=n_games
    )


def compute_fitness(slot3: float, slot4: float, win_rate: float,
                    slot_target: float = 22.0, win_target: float = 0.45) -> float:
    """
    Compute composite fitness score.

    Objectives (all must be met for perfect score):
    - slot3 >= slot_target (default 22%)
    - slot4 >= slot_target (default 22%)
    - win_rate >= win_target (default 0.45 = 45%)

    Score breakdown:
    - Slot 3 component: 0-25 points (full points if >= target)
    - Slot 4 component: 0-25 points (full points if >= target)
    - Win rate component: 0-50 points (full points if >= target)

    Total possible: 100 points
    """
    score = 0.0

    # Slot 3 component (0-25 points)
    if slot3 >= slot_target:
        score += 25.0
    else:
        # Partial credit: linear scaling up to target
        score += max(0.0, (slot3 / slot_target) * 25.0)

    # Slot 4 component (0-25 points)
    if slot4 >= slot_target:
        score += 25.0
    else:
        score += max(0.0, (slot4 / slot_target) * 25.0)

    # Win rate component (0-50 points)
    if win_rate >= win_target:
        score += 50.0
    else:
        score += max(0.0, (win_rate / win_target) * 50.0)

    return score


def quick_evaluate(profile: HeuristicProfile, n_games: int = 50, seed: int = 0) -> FitnessResult:
    """Quick evaluation with fewer games for initial screening."""
    return evaluate_profile(profile, n_games=n_games, seed=seed)
