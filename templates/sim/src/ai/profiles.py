"""AI heuristic parameter profiles for A/B testing."""

from dataclasses import dataclass
from typing import Dict


@dataclass
class HeuristicProfile:
    """Configuration for AI perk evaluation."""
    name: str

    # Slot 1-2 bonuses (added to lane score)
    place_another_bonus: float = 20.0
    remove_enemy_bonus: float = 15.0

    # Slot 3 base scores - Duration perks
    freeze_base: float = 25.0
    freeze_single_threat: float = 40.0
    freeze_multi_threat: float = 80.0
    cloak_base: float = 25.0
    cloak_piece_mult: float = 5.0
    blind_base: float = 25.0
    blind_piece_mult: float = 5.0
    sanctuary_base: float = 30.0
    sanctuary_piece_mult: float = 10.0
    capture_base: float = 25.0
    capture_piece_mult: float = 15.0

    # Slot 3 base scores - Trigger perks
    trigger_offensive_mult: float = 15.0
    trigger_offensive_bonus: float = 25.0
    trigger_defensive_mult: float = 15.0
    trigger_defensive_bonus: float = 25.0

    # Slot 4 base scores - Immediate perks
    gambit_base: float = 25.0
    gambit_low: float = 5.0
    split_base: float = 35.0
    scramble_base: float = 30.0
    scramble_piece_mult: float = 2.0
    kamikaze_base: float = 35.0
    steal_full: float = 45.0
    steal_partial: float = 35.0
    rush_base: float = 35.0
    nullify_base: float = 25.0
    disperse_base: float = 25.0
    scatter_base: float = 20.0
    disrupt_base: float = 25.0
    regroup_base: float = 20.0

    # Slot 4 base scores - Deferred perks
    signal_base: float = 35.0
    signal_piece_mult: float = 10.0
    enlist_base: float = 50.0
    ambush_full: float = 45.0
    ambush_partial: float = 25.0
    reinforce_base: float = 40.0
    reinforce_near_win: float = 70.0
    raid_base: float = 30.0
    raid_piece_mult: float = 5.0


# === PROFILE DEFINITIONS ===

PROFILES: Dict[str, HeuristicProfile] = {
    # Original parameters (baseline)
    'v1': HeuristicProfile(
        name='v1',
        place_another_bonus=20.0,
        remove_enemy_bonus=15.0,
        freeze_base=25.0,
        freeze_single_threat=40.0,
        freeze_multi_threat=80.0,
        cloak_base=25.0,
        cloak_piece_mult=5.0,
        blind_base=25.0,
        blind_piece_mult=5.0,
        sanctuary_base=30.0,
        sanctuary_piece_mult=10.0,
        capture_base=25.0,
        capture_piece_mult=15.0,
        trigger_offensive_mult=15.0,
        trigger_offensive_bonus=25.0,
        trigger_defensive_mult=15.0,
        trigger_defensive_bonus=25.0,
        gambit_base=25.0,
        gambit_low=5.0,
        split_base=35.0,
        scramble_base=30.0,
        scramble_piece_mult=2.0,
        kamikaze_base=35.0,
        steal_full=45.0,
        steal_partial=35.0,
        rush_base=35.0,
        nullify_base=25.0,
        disperse_base=25.0,
        scatter_base=20.0,
        disrupt_base=25.0,
        regroup_base=20.0,
        signal_base=35.0,
        signal_piece_mult=10.0,
        enlist_base=50.0,
        ambush_full=45.0,
        ambush_partial=25.0,
        reinforce_base=40.0,
        reinforce_near_win=70.0,
        raid_base=30.0,
        raid_piece_mult=5.0,
    ),

    # Balanced parameters (target 22% slots 3-4)
    'v2': HeuristicProfile(
        name='v2',
        # REDUCED slot 1-2 bonuses to make them less dominant
        place_another_bonus=8.0,    # REDUCED from 20
        remove_enemy_bonus=5.0,     # REDUCED from 15

        # INCREASED slot 3 scores - Duration perks
        freeze_base=35.0,           # INCREASED from 25
        freeze_single_threat=55.0,  # INCREASED from 40
        freeze_multi_threat=85.0,   # INCREASED from 80
        cloak_base=35.0,            # INCREASED from 25
        cloak_piece_mult=6.0,       # INCREASED from 5
        blind_base=35.0,            # INCREASED from 25
        blind_piece_mult=6.0,       # INCREASED from 5
        sanctuary_base=42.0,        # INCREASED from 30
        sanctuary_piece_mult=12.0,  # INCREASED from 10
        capture_base=35.0,          # INCREASED from 25
        capture_piece_mult=18.0,    # INCREASED from 15

        # INCREASED slot 3 scores - Trigger perks
        trigger_offensive_mult=18.0,  # INCREASED from 15
        trigger_offensive_bonus=32.0, # INCREASED from 25
        trigger_defensive_mult=18.0,  # INCREASED from 15
        trigger_defensive_bonus=32.0, # INCREASED from 25

        # INCREASED slot 4 scores - Immediate perks
        gambit_base=35.0,           # INCREASED from 25
        gambit_low=10.0,            # INCREASED from 5
        split_base=48.0,            # INCREASED from 35
        scramble_base=40.0,         # INCREASED from 30
        scramble_piece_mult=3.0,    # INCREASED from 2
        kamikaze_base=48.0,         # INCREASED from 35
        steal_full=55.0,            # INCREASED from 45
        steal_partial=45.0,         # INCREASED from 35
        rush_base=48.0,             # INCREASED from 35
        nullify_base=35.0,          # INCREASED from 25
        disperse_base=35.0,         # INCREASED from 25
        scatter_base=30.0,          # INCREASED from 20
        disrupt_base=35.0,          # INCREASED from 25
        regroup_base=30.0,          # INCREASED from 20

        # INCREASED slot 4 scores - Deferred perks
        signal_base=48.0,           # INCREASED from 35
        signal_piece_mult=12.0,     # INCREASED from 10
        enlist_base=58.0,           # INCREASED from 50
        ambush_full=55.0,           # INCREASED from 45
        ambush_partial=35.0,        # INCREASED from 25
        reinforce_base=52.0,        # INCREASED from 40
        reinforce_near_win=78.0,    # INCREASED from 70
        raid_base=40.0,             # INCREASED from 30
        raid_piece_mult=6.0,        # INCREASED from 5
    ),
}


def get_profile(name: str) -> HeuristicProfile:
    """Get a profile by name, or raise KeyError."""
    if name not in PROFILES:
        available = ', '.join(PROFILES.keys())
        raise KeyError(f"Unknown profile '{name}'. Available: {available}")
    return PROFILES[name]
