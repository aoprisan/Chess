"""Parameter search bounds for genetic optimization."""

from dataclasses import dataclass, fields
from typing import Any
import random


@dataclass
class ParameterBounds:
    """Min/max bounds for each HeuristicProfile parameter.

    Each field is a tuple of (min, max) defining the search range.
    Bounds are set based on reasonable ranges for each parameter type:
    - Bonuses: 0-30 (can be zero to disable)
    - Base scores: 15-80 (must provide some value)
    - Multipliers: 1-20 (per-piece scaling)
    - High-value scores: 30-120 (for powerful effects)
    """

    # Slot 1-2 bonuses (can be reduced to zero to shift balance)
    place_another_bonus: tuple[float, float] = (0.0, 30.0)
    remove_enemy_bonus: tuple[float, float] = (0.0, 25.0)

    # Slot 3 - Duration perks (base scores)
    freeze_base: tuple[float, float] = (15.0, 60.0)
    freeze_single_threat: tuple[float, float] = (25.0, 100.0)
    freeze_multi_threat: tuple[float, float] = (50.0, 150.0)
    cloak_base: tuple[float, float] = (15.0, 60.0)
    cloak_piece_mult: tuple[float, float] = (2.0, 15.0)
    blind_base: tuple[float, float] = (15.0, 60.0)
    blind_piece_mult: tuple[float, float] = (2.0, 15.0)
    sanctuary_base: tuple[float, float] = (20.0, 70.0)
    sanctuary_piece_mult: tuple[float, float] = (5.0, 20.0)
    capture_base: tuple[float, float] = (15.0, 60.0)
    capture_piece_mult: tuple[float, float] = (8.0, 25.0)

    # Slot 3 - Trigger perks
    trigger_offensive_mult: tuple[float, float] = (8.0, 30.0)
    trigger_offensive_bonus: tuple[float, float] = (15.0, 50.0)
    trigger_defensive_mult: tuple[float, float] = (8.0, 30.0)
    trigger_defensive_bonus: tuple[float, float] = (15.0, 50.0)

    # Slot 4 - Immediate perks
    gambit_base: tuple[float, float] = (15.0, 60.0)
    gambit_low: tuple[float, float] = (2.0, 20.0)
    split_base: tuple[float, float] = (20.0, 70.0)
    scramble_base: tuple[float, float] = (20.0, 60.0)
    scramble_piece_mult: tuple[float, float] = (1.0, 8.0)
    kamikaze_base: tuple[float, float] = (20.0, 70.0)
    steal_full: tuple[float, float] = (30.0, 80.0)
    steal_partial: tuple[float, float] = (20.0, 60.0)
    rush_base: tuple[float, float] = (20.0, 70.0)
    nullify_base: tuple[float, float] = (15.0, 50.0)
    disperse_base: tuple[float, float] = (15.0, 50.0)
    scatter_base: tuple[float, float] = (10.0, 45.0)
    disrupt_base: tuple[float, float] = (15.0, 50.0)
    regroup_base: tuple[float, float] = (10.0, 45.0)

    # Slot 4 - Deferred perks
    signal_base: tuple[float, float] = (20.0, 70.0)
    signal_piece_mult: tuple[float, float] = (5.0, 20.0)
    enlist_base: tuple[float, float] = (30.0, 80.0)
    ambush_full: tuple[float, float] = (30.0, 80.0)
    ambush_partial: tuple[float, float] = (15.0, 50.0)
    reinforce_base: tuple[float, float] = (25.0, 70.0)
    reinforce_near_win: tuple[float, float] = (50.0, 120.0)
    raid_base: tuple[float, float] = (20.0, 55.0)
    raid_piece_mult: tuple[float, float] = (3.0, 12.0)

    def get_param_names(self) -> list[str]:
        """Get list of all parameter names (excluding 'name')."""
        return [f.name for f in fields(self)]

    def sample_random(self, rng: random.Random) -> dict[str, float]:
        """Sample random values within bounds using provided RNG."""
        values = {}
        for field in fields(self):
            low, high = getattr(self, field.name)
            values[field.name] = rng.uniform(low, high)
        return values

    def clamp(self, values: dict[str, float]) -> dict[str, float]:
        """Clamp values to stay within bounds."""
        clamped = {}
        for name, value in values.items():
            if hasattr(self, name):
                low, high = getattr(self, name)
                clamped[name] = max(low, min(high, value))
            else:
                clamped[name] = value
        return clamped

    def get_range(self, param_name: str) -> tuple[float, float]:
        """Get the (min, max) range for a parameter."""
        if hasattr(self, param_name):
            return getattr(self, param_name)
        raise ValueError(f"Unknown parameter: {param_name}")

    def validate(self, values: dict[str, float]) -> list[str]:
        """Check if values are within bounds, return list of violations."""
        violations = []
        for name, value in values.items():
            if hasattr(self, name):
                low, high = getattr(self, name)
                if value < low or value > high:
                    violations.append(f"{name}: {value:.2f} not in [{low:.1f}, {high:.1f}]")
        return violations
