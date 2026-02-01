"""Common perks (Slot 1 and 2) - always available."""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..game.state import GameState, Player


def execute_place_another(state: 'GameState', player: 'Player',
                          target: int) -> tuple[bool, dict]:
    """
    Slot 1: Place Another
    Effect: +1 your piece on chosen lane

    Args:
        state: Game state
        player: Player executing
        target: Target lane index (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    # Get valid lanes
    valid_lanes = GameRules.get_valid_placement_lanes(state, player)

    if not valid_lanes:
        return False, {'error': 'No valid lanes for placement'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for placement'}

    # Place the piece
    state.lanes[target].add_piece(player)

    return True, {
        'perk': 'PLACE_ANOTHER',
        'lane': target,
        'player': player.name
    }


def execute_remove_enemy(state: 'GameState', player: 'Player',
                         target: int) -> tuple[bool, dict]:
    """
    Slot 2: Remove Enemy
    Effect: -1 enemy piece from chosen lane

    Args:
        state: Game state
        player: Player executing
        target: Target lane index (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    # Get valid lanes (lanes with enemy pieces)
    valid_lanes = GameRules.get_valid_removal_lanes(state, player)

    if not valid_lanes:
        return False, {'error': 'No enemy pieces to remove'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} has no enemy pieces'}

    # Remove the piece with Sanctuary/Capture redirection
    opponent = player.opponent()
    removal_result = state.remove_piece_with_redirects(target, opponent, remover=player)

    # Fire removal triggers (opponent's triggers on this lane)
    from src.perks.triggers import fire_removal_triggers
    trigger_results = fire_removal_triggers(state, target, player)

    return True, {
        'perk': 'REMOVE_ENEMY',
        'lane': target,
        'player': player.name,
        'removed_from': opponent.name,
        'triggers_fired': trigger_results,
        'redirected': removal_result.get('redirected', False),
        'redirect_type': removal_result.get('redirect_type'),
        'redirect_destination': removal_result.get('destination'),
        'converted': removal_result.get('converted', False)
    }
