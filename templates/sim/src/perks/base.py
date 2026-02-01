"""Perk type definitions and base execution."""

from enum import Enum, auto
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..game.state import GameState, Player


class PerkSlot(Enum):
    """Perk slot assignment."""
    SLOT_1 = 1  # Fixed: PlaceAnother
    SLOT_2 = 2  # Fixed: RemoveEnemy
    SLOT_3 = 3  # React & Protect pool
    SLOT_4 = 4  # Act & Disrupt pool


class PerkType(Enum):
    """All perk types in the game."""

    # Slot 1 - Fixed Common
    PLACE_ANOTHER = auto()

    # Slot 2 - Fixed Common
    REMOVE_ENEMY = auto()

    # Slot 3 - React & Protect (15 perks)
    FREEZE = auto()          # Duration: Block lane 1 turn
    CLOAK = auto()           # Duration: Hide yours 2 turns
    PORTAL = auto()          # Placement Trigger: Teleport to random
    TRAP = auto()            # Placement Trigger: Remove piece
    MIRROR = auto()          # Placement Trigger: +2 same lane
    ECHO = auto()            # Placement Trigger: +2 random
    SHOCKWAVE = auto()       # Placement Trigger: -2 elsewhere
    HYDRA = auto()           # Removal Trigger: +2 random
    BACKFIRE = auto()        # Removal Trigger: -2 theirs
    REGROUP = auto()         # Immediate: Swap yours between lanes
    SCATTER = auto()         # Immediate: Move yours to random
    SIGNAL = auto()          # Deferred: Pull 1 to lane
    ABSORB = auto()          # Removal Trigger: Recover piece
    SANCTUARY = auto()       # Duration: Redirect losses
    RETALIATE = auto()       # Placement Trigger: Counter-raid

    # Slot 4 - Act & Disrupt (15 perks)
    SCRAMBLE = auto()        # Immediate: Redistribute all enemy
    BLIND = auto()           # Duration: Hide theirs 2 turns
    SPLIT = auto()           # Immediate: -1 yours -> +2 random
    KAMIKAZE = auto()        # Immediate: -1 yours -> -2 theirs
    DISRUPT = auto()         # Immediate: Swap theirs between lanes
    DISPERSE = auto()        # Immediate: Move theirs to random
    GAMBIT = auto()          # Immediate: Give 3, get 2
    STEAL = auto()           # Immediate: -1 theirs, +1 yours
    RUSH = auto()            # Immediate: +2/+2/-1 same lane
    ENLIST = auto()          # Deferred: Capture attempt
    AMBUSH = auto()          # Deferred: -1 enemy next turn
    REINFORCE = auto()       # Deferred: +1 next turn
    NULLIFY = auto()         # Immediate: Cancel triggers
    CAPTURE = auto()         # Duration: Convert removed
    RAID = auto()            # Deferred: Place on enemy side


# Slot assignments
SLOT_3_PERKS = [
    'FREEZE', 'CLOAK', 'PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE',
    'HYDRA', 'BACKFIRE', 'REGROUP', 'SCATTER', 'SIGNAL', 'ABSORB',
    'SANCTUARY', 'RETALIATE'
]

SLOT_4_PERKS = [
    'SCRAMBLE', 'BLIND', 'SPLIT', 'KAMIKAZE', 'DISRUPT', 'DISPERSE',
    'GAMBIT', 'STEAL', 'RUSH', 'ENLIST', 'AMBUSH', 'REINFORCE',
    'NULLIFY', 'CAPTURE', 'RAID'
]


def get_perks_for_slot(slot: int) -> list[str]:
    """Get list of perk names available for a slot."""
    if slot == 1:
        return ['PLACE_ANOTHER']
    elif slot == 2:
        return ['REMOVE_ENEMY']
    elif slot == 3:
        return SLOT_3_PERKS
    elif slot == 4:
        return SLOT_4_PERKS
    return []


from typing import Union

# Target can be: None, int, or tuple of two ints
TargetType = Union[None, int, tuple[int, int]]

# Perks that require NO target
NO_TARGET_PERKS = {'SCRAMBLE', 'GAMBIT', 'STEAL', 'CLOAK', 'BLIND'}

# Perks that require TWO targets
TWO_TARGET_PERKS = {'REGROUP', 'DISRUPT'}


def execute_perk(state: 'GameState', player: 'Player', perk_name: str,
                 target: TargetType = None) -> tuple[bool, dict]:
    """
    Execute a perk.

    Args:
        state: Current game state (will be modified)
        player: Player executing the perk
        perk_name: Name of the perk to execute
        target: Target(s) - None for no-target perks, int for single-target, tuple for two-target

    Returns:
        Tuple of (success, result_dict)
    """
    from .commons import execute_place_another, execute_remove_enemy
    from .immediate import (
        execute_freeze, execute_gambit, execute_split,
        execute_scramble, execute_kamikaze, execute_regroup,
        execute_disrupt, execute_scatter, execute_disperse,
        execute_steal, execute_rush, execute_nullify
    )
    from .triggers import (
        execute_portal, execute_trap, execute_mirror, execute_echo,
        execute_shockwave, execute_hydra, execute_backfire, execute_absorb,
        execute_retaliate
    )
    from .duration import (
        execute_cloak, execute_blind, execute_sanctuary, execute_capture
    )
    from .deferred import (
        execute_signal, execute_enlist, execute_ambush, execute_reinforce, execute_raid
    )

    executors = {
        # Commons (Slot 1 & 2) - single target
        'PLACE_ANOTHER': execute_place_another,
        'REMOVE_ENEMY': execute_remove_enemy,
        # Immediate perks (Slot 3) - single target
        'FREEZE': execute_freeze,
        'SCATTER': execute_scatter,
        # Immediate perks (Slot 3) - two targets
        'REGROUP': execute_regroup,
        # Immediate perks (Slot 4) - single target
        'SPLIT': execute_split,
        'KAMIKAZE': execute_kamikaze,
        'DISPERSE': execute_disperse,
        'RUSH': execute_rush,
        'NULLIFY': execute_nullify,
        # Immediate perks (Slot 4) - no target
        'GAMBIT': execute_gambit,
        'SCRAMBLE': execute_scramble,
        'STEAL': execute_steal,
        # Immediate perks (Slot 4) - two targets
        'DISRUPT': execute_disrupt,
        # Trigger perks (Slot 3) - single target
        'PORTAL': execute_portal,
        'TRAP': execute_trap,
        'MIRROR': execute_mirror,
        'ECHO': execute_echo,
        'SHOCKWAVE': execute_shockwave,
        'HYDRA': execute_hydra,
        'BACKFIRE': execute_backfire,
        'ABSORB': execute_absorb,
        'RETALIATE': execute_retaliate,
        # Duration perks (Slot 3) - varies
        'CLOAK': execute_cloak,       # No target
        'SANCTUARY': execute_sanctuary,  # Single target
        # Duration perks (Slot 4) - varies
        'BLIND': execute_blind,       # No target
        'CAPTURE': execute_capture,   # Single target
        # Deferred perks (Slot 3) - single target
        'SIGNAL': execute_signal,
        # Deferred perks (Slot 4) - single target
        'ENLIST': execute_enlist,
        'AMBUSH': execute_ambush,
        'REINFORCE': execute_reinforce,
        'RAID': execute_raid,
    }

    executor = executors.get(perk_name)
    if executor is None:
        return False, {'error': f'Perk {perk_name} not implemented'}

    # Handle different target types
    if perk_name in NO_TARGET_PERKS:
        # No target perks - call without target argument
        return executor(state, player)
    elif perk_name in TWO_TARGET_PERKS:
        # Two-target perks - unpack tuple
        if target is None or not isinstance(target, tuple) or len(target) != 2:
            return False, {'error': f'Perk {perk_name} requires two targets'}
        return executor(state, player, target[0], target[1])
    else:
        # Single target perks - pass target directly
        if target is None:
            return False, {'error': f'Perk {perk_name} requires a target'}
        return executor(state, player, target)
