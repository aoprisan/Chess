"""Fitness evaluation for minimax profile optimization."""

from dataclasses import dataclass

from src.ai.minimax import MinimaxProfile, create_expectimax_ai
from src.simulation import SimulationRunner


@dataclass
class MinimaxFitnessResult:
    """Results from minimax fitness evaluation."""
    slot3_pct: float
    slot4_pct: float
    win_rate: float
    fitness_score: float
    games_played: int
    slot1_pct: float = 0.0
    slot2_pct: float = 0.0

    def meets_criteria(self, slot3_target: float = 25.0, slot4_target: float = 25.0,
                       win_target: float = 0.65) -> bool:
        """Check if this result meets all optimization criteria."""
        return (self.slot3_pct >= slot3_target and
                self.slot4_pct >= slot4_target and
                self.win_rate >= win_target)

    def __str__(self) -> str:
        status = "PASS" if self.meets_criteria() else "FAIL"
        return (f"[{status}] fitness={self.fitness_score:.1f}, "
                f"slots=[{self.slot1_pct:.1f}%, {self.slot2_pct:.1f}%, "
                f"{self.slot3_pct:.1f}%, {self.slot4_pct:.1f}%], "
                f"win_rate={self.win_rate*100:.1f}%")


def evaluate_minimax_profile(profile: MinimaxProfile,
                             n_games: int = 200,
                             seed: int = 0,
                             depth: int = 1,
                             slot3_target: float = 25.0,
                             slot4_target: float = 25.0,
                             win_target: float = 0.65) -> MinimaxFitnessResult:
    """
    Evaluate a minimax profile's fitness.

    Runs three test suites:
    1. Self-play (profile vs profile) - measures slot distribution
    2. vs minimax-v1 as P1 - measures competitiveness with first-move advantage
    3. vs minimax-v1 as P2 - measures competitiveness without first-move advantage

    Win rate is averaged across P1 and P2 tests to remove first-mover bias.
    Slot distribution uses per-player stats from vs-opponent games.

    Args:
        profile: The MinimaxProfile to evaluate
        n_games: Total games to run (split into thirds)
        seed: Random seed for reproducibility
        depth: Search depth for minimax (1 recommended for speed)
        slot3_target: Target percentage for slot 3
        slot4_target: Target percentage for slot 4
        win_target: Target win rate vs minimax-v1

    Returns:
        MinimaxFitnessResult with all metrics and composite score
    """
    games_per_suite = n_games // 3
    opponent_profile = MinimaxProfile(name='minimax-v1')  # default weights

    # Suite 1: Self-play for slot distribution baseline
    ai_self1 = create_expectimax_ai(depth, profile=profile)
    ai_self2 = create_expectimax_ai(depth, profile=profile)
    runner_self = SimulationRunner(ai_self1, ai_self2, seed_start=seed)
    self_result = runner_self.run(games_per_suite, verbose=False)

    # Suite 2: Candidate as P1 vs minimax-v1 as P2
    ai_p1 = create_expectimax_ai(depth, profile=profile)
    ai_opp_p2 = create_expectimax_ai(depth, profile=opponent_profile)
    runner_as_p1 = SimulationRunner(ai_p1, ai_opp_p2, seed_start=seed + 10000)
    result_as_p1 = runner_as_p1.run(games_per_suite, verbose=False)

    # Suite 3: minimax-v1 as P1 vs candidate as P2
    ai_opp_p1 = create_expectimax_ai(depth, profile=opponent_profile)
    ai_p2 = create_expectimax_ai(depth, profile=profile)
    runner_as_p2 = SimulationRunner(ai_opp_p1, ai_p2, seed_start=seed + 20000)
    result_as_p2 = runner_as_p2.run(games_per_suite, verbose=False)

    # Slot distribution: average self-play + per-player stats from vs-opponent games
    # Self-play: combined stats (both sides are the same AI)
    self_slots = self_result.slot_percentages
    # As P1: use P1 stats (the candidate)
    p1_slots = result_as_p1.slot_percentages_p1
    # As P2: use P2 stats (the candidate)
    p2_slots = result_as_p2.slot_percentages_p2

    # Average slot percentages across all three suites
    slot1 = (self_slots.get(1, 0) + p1_slots.get(1, 0) + p2_slots.get(1, 0)) / 3
    slot2 = (self_slots.get(2, 0) + p1_slots.get(2, 0) + p2_slots.get(2, 0)) / 3
    slot3 = (self_slots.get(3, 0) + p1_slots.get(3, 0) + p2_slots.get(3, 0)) / 3
    slot4 = (self_slots.get(4, 0) + p1_slots.get(4, 0) + p2_slots.get(4, 0)) / 3

    # Win rate: average P1 and P2 win rates to remove first-mover bias
    win_rate = (result_as_p1.player1_win_rate + result_as_p2.player2_win_rate) / 2

    # Compute composite fitness
    fitness = compute_minimax_fitness(slot3, slot4, win_rate, slot3_target, slot4_target, win_target)

    return MinimaxFitnessResult(
        slot1_pct=slot1,
        slot2_pct=slot2,
        slot3_pct=slot3,
        slot4_pct=slot4,
        win_rate=win_rate,
        fitness_score=fitness,
        games_played=n_games
    )


def compute_minimax_fitness(slot3: float, slot4: float, win_rate: float,
                            slot3_target: float = 25.0, slot4_target: float = 25.0,
                            win_target: float = 0.65) -> float:
    """
    Compute composite fitness score.

    Score breakdown:
    - Slot 3 component: 0-25 points
    - Slot 4 component: 0-25 points
    - Win rate component: 0-25 points
    - All criteria met bonus: +25 points
    Total possible: 100 points
    """
    score = 0.0
    all_met = True

    if slot3 >= slot3_target:
        score += 25.0
    else:
        all_met = False
        score += max(0.0, (slot3 / slot3_target) * 25.0)

    if slot4 >= slot4_target:
        score += 25.0
    else:
        all_met = False
        score += max(0.0, (slot4 / slot4_target) * 25.0)

    if win_rate >= win_target:
        score += 25.0
    else:
        all_met = False
        score += max(0.0, (win_rate / win_target) * 25.0)

    if all_met:
        score += 25.0

    return score
