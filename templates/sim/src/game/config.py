"""Game configuration constants."""

from dataclasses import dataclass


@dataclass(frozen=True)
class GameConfig:
    """Immutable game configuration."""

    # Board dimensions
    LANES: int = 5
    SLOTS_PER_SIDE: int = 5  # Each player has 5 slots per lane

    # Win condition
    LANES_TO_WIN: int = 3  # First to win 3 lanes wins the game

    # Perk durations (in turns)
    FREEZE_DURATION: int = 1
    CLOAK_DURATION: int = 2
    BLIND_DURATION: int = 2
    SANCTUARY_DURATION: int = 2
    CAPTURE_DURATION: int = 2

    # Trigger durations (turns until they expire if not triggered)
    TRIGGER_DURATION: int = 2  # Default duration for waiting triggers (Portal, Trap)

    # Placement trigger durations (1 turn = fires once on next opponent placement)
    MIRROR_DURATION: int = 1
    ECHO_DURATION: int = 1
    SHOCKWAVE_DURATION: int = 1
    RETALIATE_DURATION: int = 2  # Design doc Section 7: Retaliate has 2 turns duration

    # Removal trigger durations (1 turn = fires once when opponent removes)
    HYDRA_DURATION: int = 1
    BACKFIRE_DURATION: int = 1
    ABSORB_DURATION: int = 1

    # Raid probabilities
    RAID_LOST_PROB: float = 0.10
    RAID_TWO_RECRUITS_PROB: float = 0.15
    RAID_ONE_RECRUIT_PROB: float = 0.30
    RAID_ALONE_PROB: float = 0.45  # = 1 - (0.10 + 0.15 + 0.30)

    # Perk magnitude constants (from design doc Section 15)
    MIRROR_PIECES: int = 2
    ECHO_PIECES: int = 2
    SHOCKWAVE_REMOVES: int = 2
    HYDRA_PIECES: int = 2
    BACKFIRE_REMOVES: int = 2
    SPLIT_GAIN: int = 2
    KAMIKAZE_REMOVES: int = 2
    GAMBIT_ENEMY_GAIN: int = 3
    GAMBIT_PLAYER_GAIN: int = 2
    RUSH_PIECES_EACH: int = 2
    RUSH_PLAYER_LOSS: int = 1

    # Source exclusion threshold (exclude source lane if 3+ lanes available)
    SOURCE_EXCLUSION_THRESHOLD: int = 3


# Default config instance
DEFAULT_CONFIG = GameConfig()
