"""Parameter search bounds for minimax profile optimization."""

from dataclasses import dataclass, fields
import random


@dataclass
class MinimaxParameterBounds:
    """Min/max bounds for each MinimaxProfile parameter.

    Each field is a tuple of (min, max) defining the search range.
    Board-structure weights get narrow ranges (expected to stay near defaults).
    Effect values get wide ranges to allow exploration.
    """

    # Board structure weights (narrow ranges — these are well-calibrated)
    lane_win_weight: tuple[float, float] = (800.0, 1200.0)
    near_game_win_bonus: tuple[float, float] = (150.0, 500.0)
    piece_advantage_mult: tuple[float, float] = (3.0, 40.0)
    near_win_bonus: tuple[float, float] = (100.0, 400.0)
    near_threat_bonus: tuple[float, float] = (20.0, 120.0)

    # Trigger effect values (wide ranges)
    trigger_trap_portal_mult: tuple[float, float] = (5.0, 150.0)
    trigger_mirror_value: tuple[float, float] = (10.0, 250.0)
    trigger_echo_hydra_value: tuple[float, float] = (10.0, 250.0)
    trigger_shockwave_backfire_value: tuple[float, float] = (10.0, 200.0)
    trigger_absorb_value: tuple[float, float] = (5.0, 100.0)
    trigger_retaliate_value: tuple[float, float] = (10.0, 150.0)
    trigger_default_value: tuple[float, float] = (5.0, 100.0)

    # Deferred effect values (wide ranges)
    deferred_signal_value: tuple[float, float] = (5.0, 50.0)
    deferred_enlist_value: tuple[float, float] = (10.0, 60.0)
    deferred_ambush_value: tuple[float, float] = (10.0, 50.0)
    deferred_reinforce_value: tuple[float, float] = (5.0, 50.0)
    deferred_raid_value: tuple[float, float] = (5.0, 40.0)
    deferred_default_value: tuple[float, float] = (2.0, 30.0)
    deferred_discount: tuple[float, float] = (0.3, 0.95)

    # Freeze weights
    freeze_near_win: tuple[float, float] = (50.0, 200.0)
    freeze_near_threat: tuple[float, float] = (30.0, 150.0)
    freeze_base: tuple[float, float] = (15.0, 80.0)

    # Global effects
    cloak_value: tuple[float, float] = (10.0, 60.0)
    blind_value: tuple[float, float] = (10.0, 60.0)

    # Pending raid
    raid_pending_value: tuple[float, float] = (10.0, 50.0)
    raid_discount_base: tuple[float, float] = (0.2, 0.8)

    # Duration effects
    sanctuary_value: tuple[float, float] = (5.0, 50.0)
    capture_value: tuple[float, float] = (10.0, 50.0)

    # Trigger targeting bias
    trigger_targeting_bias: tuple[float, float] = (1.0, 5.0)

    # Freeze protection
    freeze_protect_near_win: tuple[float, float] = (50.0, 250.0)

    # Trigger contest boost
    trigger_contest_boost: tuple[float, float] = (0.5, 3.0)

    def get_param_names(self) -> list[str]:
        """Get list of all parameter names."""
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
