"""Duration perks - effects that last multiple turns."""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..game.state import GameState, Player


def execute_cloak(state: 'GameState', player: 'Player') -> tuple[bool, dict]:
    """
    Cloak (Slot 3)
    Effect: Hide your ENTIRE field for 2 turns. No lane targeting needed.
    Opponent cannot see any of your piece counts.

    Args:
        state: Game state
        player: Player executing

    Returns:
        (success, result_dict)
    """
    # Check if already cloaked
    if state.is_cloaked(player):
        return False, {'error': 'Already cloaked'}

    # Apply cloak to entire field
    state.set_cloaked(player, 2)

    return True, {
        'perk': 'CLOAK',
        'player': player.name,
        'affects': 'entire_field',
        'duration': 2
    }


def execute_blind(state: 'GameState', player: 'Player') -> tuple[bool, dict]:
    """
    Blind (Slot 4)
    Effect: Blind OPPONENT for 2 turns. No lane targeting needed.
    Opponent cannot see any of YOUR piece counts.

    Args:
        state: Game state
        player: Player executing

    Returns:
        (success, result_dict)
    """
    opponent = player.opponent()

    # Check if opponent already blinded
    if state.is_blinded(opponent):
        return False, {'error': 'Opponent already blinded'}

    # Apply blind to opponent
    state.set_blinded(opponent, 2)

    return True, {
        'perk': 'BLIND',
        'player': player.name,
        'affects': opponent.name,
        'affects_entire_field': True,
        'duration': 2
    }


def execute_sanctuary(state: 'GameState', player: 'Player',
                      target: int) -> tuple[bool, dict]:
    """
    Sanctuary (Slot 3)
    Effect: For 2 turns, ALL your lost pieces (from any lane) redirect to target lane.
    Target must be your available lane (not won, not full), no piece requirement.
    Multiple sanctuaries can be active simultaneously - one is randomly selected when triggered.

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory) - where lost pieces redirect to

    Returns:
        (success, result_dict)
    """
    # Find valid lanes (not won, not full for player)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(player)
    ]

    if not valid_lanes:
        return False, {'error': 'No lanes available for sanctuary'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for sanctuary'}

    # Apply sanctuary (adds to list, multiple can be active)
    state.add_sanctuary(player, target, 2)

    return True, {
        'perk': 'SANCTUARY',
        'lane': target,
        'player': player.name,
        'redirects_all_losses': True,
        'duration': 2,
        'multiple_allowed': True
    }


def execute_capture(state: 'GameState', player: 'Player',
                    target: int) -> tuple[bool, dict]:
    """
    Capture (Slot 4)
    Effect: For 2 turns, ALL enemy pieces you remove redirect to target lane as YOUR pieces.
    Target must be YOUR field (lane where you have pieces).
    Multiple capture zones can be active simultaneously - one is randomly selected when triggered.

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory) - YOUR field, where captured enemies go

    Returns:
        (success, result_dict)
    """
    # Find valid lanes (not won, not full for player - any empty lane is valid)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
        and not lane.is_full_for(player)  # Must have space
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for capture (need lane with space)'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for capture'}

    # Apply capture (adds to list, multiple can be active)
    state.add_capture(player, target, 2)

    return True, {
        'perk': 'CAPTURE',
        'lane': target,
        'player': player.name,
        'captures_all_removed_enemies': True,
        'duration': 2,
        'multiple_allowed': True
    }
