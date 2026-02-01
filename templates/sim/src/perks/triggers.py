"""Trigger perks - fire when opponent takes actions."""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from src.game.state import GameState, Player, TriggerType


# =============================================================================
# TRIGGER SETUP FUNCTIONS (called when perk is used to SET a trigger)
# =============================================================================

def execute_portal(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Portal (Slot 3 - Placement Trigger)
    Effect: Set a trap on opponent's field. When they place, piece teleports to random lane.
    Duration: 2 turns
    """
    from src.game.state import TriggerType

    # Find valid lanes (not won by player, no existing portal) - opponent's field
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner != player and not lane.has_trigger_type(TriggerType.PORTAL)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Portal'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Portal'}

    order_id = state.get_next_trigger_order()
    state.lanes[target].add_trigger(TriggerType.PORTAL, player, state.config.TRIGGER_DURATION, order_id)

    return True, {
        'perk': 'PORTAL',
        'lane': target,
        'player': player.name,
        'duration': state.config.TRIGGER_DURATION
    }


def execute_trap(state: 'GameState', player: 'Player',
                 target: int) -> tuple[bool, dict]:
    """
    Trap (Slot 3 - Placement Trigger)
    Effect: Set a trap on opponent's field. When they place, piece vanishes.
    Duration: 2 turns
    """
    from src.game.state import TriggerType

    # Find valid lanes (not won by player, no existing trap) - opponent's field
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner != player and not lane.has_trigger_type(TriggerType.TRAP)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Trap'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Trap'}

    order_id = state.get_next_trigger_order()
    state.lanes[target].add_trigger(TriggerType.TRAP, player, state.config.TRIGGER_DURATION, order_id)

    return True, {
        'perk': 'TRAP',
        'lane': target,
        'player': player.name,
        'duration': state.config.TRIGGER_DURATION
    }


def execute_mirror(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Mirror (Slot 3 - Placement Trigger)
    Effect: When opponent places here, you get +2 pieces on same lane.
    Duration: 1 turn (fires once)
    """
    from src.game.state import TriggerType

    # Find valid lanes (not won by player, no existing mirror) - opponent's field
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner != player and not lane.has_trigger_type(TriggerType.MIRROR)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Mirror'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Mirror'}

    # Mirror has 1 turn duration (fires once)
    order_id = state.get_next_trigger_order()
    duration = state.config.MIRROR_DURATION
    state.lanes[target].add_trigger(TriggerType.MIRROR, player, duration, order_id)

    return True, {
        'perk': 'MIRROR',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


def execute_echo(state: 'GameState', player: 'Player',
                 target: int) -> tuple[bool, dict]:
    """
    Echo (Slot 3 - Placement Trigger)
    Effect: When opponent places here, you get +2 pieces on random lanes.
    Duration: 1 turn (fires once)
    """
    from src.game.state import TriggerType

    # Find valid lanes (not won by player, no existing echo) - opponent's field
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner != player and not lane.has_trigger_type(TriggerType.ECHO)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Echo'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Echo'}

    order_id = state.get_next_trigger_order()
    duration = state.config.ECHO_DURATION
    state.lanes[target].add_trigger(TriggerType.ECHO, player, duration, order_id)

    return True, {
        'perk': 'ECHO',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


def execute_shockwave(state: 'GameState', player: 'Player',
                      target: int) -> tuple[bool, dict]:
    """
    Shockwave (Slot 3 - Placement Trigger)
    Effect: When opponent places here, they lose 2 pieces from other lanes.
    Duration: 1 turn (fires once)
    """
    from src.game.state import TriggerType

    # Find valid lanes (not won by player, no existing shockwave) - opponent's field
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner != player and not lane.has_trigger_type(TriggerType.SHOCKWAVE)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Shockwave'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Shockwave'}

    order_id = state.get_next_trigger_order()
    duration = state.config.SHOCKWAVE_DURATION
    state.lanes[target].add_trigger(TriggerType.SHOCKWAVE, player, duration, order_id)

    return True, {
        'perk': 'SHOCKWAVE',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


def execute_hydra(state: 'GameState', player: 'Player',
                  target: int) -> tuple[bool, dict]:
    """
    Hydra (Slot 3 - Removal Trigger)
    Effect: Set on your lane. If opponent removes your piece, you get +2 on random lanes.
    Duration: 1 turn
    """
    from src.game.state import TriggerType

    # Must set on lane where player has pieces
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
        and lane.pieces_for(player) > 0
        and not lane.has_trigger_type(TriggerType.HYDRA)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Hydra (need your pieces)'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Hydra'}

    order_id = state.get_next_trigger_order()
    duration = state.config.HYDRA_DURATION
    state.lanes[target].add_trigger(TriggerType.HYDRA, player, duration, order_id)

    return True, {
        'perk': 'HYDRA',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


def execute_backfire(state: 'GameState', player: 'Player',
                     target: int) -> tuple[bool, dict]:
    """
    Backfire (Slot 3 - Removal Trigger)
    Effect: Set on your lane. If opponent removes your piece, they lose 2 pieces.
    Duration: 1 turn
    """
    from src.game.state import TriggerType

    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
        and lane.pieces_for(player) > 0
        and not lane.has_trigger_type(TriggerType.BACKFIRE)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Backfire (need your pieces)'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Backfire'}

    order_id = state.get_next_trigger_order()
    duration = state.config.BACKFIRE_DURATION
    state.lanes[target].add_trigger(TriggerType.BACKFIRE, player, duration, order_id)

    return True, {
        'perk': 'BACKFIRE',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


def execute_absorb(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Absorb (Slot 3 - Removal Trigger)
    Effect: Set on your lane. If opponent removes your piece, you get it back on random lane.
    Duration: 1 turn. Uses source exclusion.
    """
    from src.game.state import TriggerType

    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
        and lane.pieces_for(player) > 0
        and not lane.has_trigger_type(TriggerType.ABSORB)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Absorb (need your pieces)'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Absorb'}

    order_id = state.get_next_trigger_order()
    duration = state.config.ABSORB_DURATION
    state.lanes[target].add_trigger(TriggerType.ABSORB, player, duration, order_id)

    return True, {
        'perk': 'ABSORB',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


def execute_retaliate(state: 'GameState', player: 'Player',
                      target: int) -> tuple[bool, dict]:
    """
    Retaliate (Slot 3 - Placement Trigger)
    Effect: When opponent places here, your piece appears on their side (raid mechanic).
    Duration: 1 turn
    Raid piece resolves after 2 full turns (opponent turn, your turn, opponent turn, then resolve).
    """
    from src.game.state import TriggerType

    # Must set on YOUR field (where you have pieces)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
        and lane.pieces_for(player) > 0
        and not lane.has_trigger_type(TriggerType.RETALIATE)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for Retaliate (need your pieces)'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} not valid for Retaliate'}

    order_id = state.get_next_trigger_order()
    duration = state.config.RETALIATE_DURATION
    state.lanes[target].add_trigger(TriggerType.RETALIATE, player, duration, order_id)

    return True, {
        'perk': 'RETALIATE',
        'lane': target,
        'player': player.name,
        'duration': duration
    }


# =============================================================================
# TRIGGER FIRE HANDLERS (called by engine when trigger conditions are met)
# =============================================================================

def fire_placement_triggers(state: 'GameState', lane_idx: int,
                            placing_player: 'Player',
                            chain_depth: int = 0) -> list[dict]:
    """
    Fire all placement triggers on a lane when a player places there.
    Returns list of trigger results. Triggers fire in FIFO order.

    Args:
        state: Game state
        lane_idx: Lane where placement happened
        placing_player: Player who placed the piece
        chain_depth: Current recursion depth for trigger chaining (max 10)
    """
    from src.game.state import TriggerType
    from src.game.rules import GameRules

    MAX_CHAIN_DEPTH = 10

    if chain_depth >= MAX_CHAIN_DEPTH:
        return [{'warning': 'Max trigger chain depth reached'}]

    lane = state.lanes[lane_idx]

    # Skip if lane is won
    if lane.winner is not None:
        return []

    triggers = lane.get_placement_triggers(for_opponent_of=placing_player)
    results = []

    for ttype, owner, order_id in triggers:
        # Check if lane is still active (might have been won by previous trigger)
        if state.lanes[lane_idx].winner is not None:
            break

        result = _fire_single_trigger(state, lane_idx, ttype, owner, placing_player, chain_depth)
        if result:
            results.append(result)
            # Remove trigger after firing (one-time use) by order_id
            lane.remove_trigger_by_order(order_id)

            # Check for lane win after trigger
            winner = GameRules.check_lane_win(state, lane_idx)
            if winner:
                state.cleanup_won_lane(lane_idx)
                result['lane_won_by'] = winner.name

            # Check for game win
            if state.check_game_over():
                result['game_won'] = True
                break

    return results


def fire_removal_triggers(state: 'GameState', lane_idx: int,
                          removing_player: 'Player') -> list[dict]:
    """
    Fire all removal triggers on a lane when a player removes from there.
    Returns list of trigger results. Triggers fire in FIFO order.
    """
    from src.game.state import TriggerType
    from src.game.rules import GameRules

    lane = state.lanes[lane_idx]

    # Skip if lane is won
    if lane.winner is not None:
        return []

    # The trigger owner is the one whose piece was removed
    triggers = lane.get_removal_triggers(for_opponent_of=removing_player)
    results = []

    for ttype, owner, order_id in triggers:
        # Check if lane is still active
        if state.lanes[lane_idx].winner is not None:
            break

        result = _fire_single_trigger(state, lane_idx, ttype, owner, removing_player, chain_depth=0)
        if result:
            results.append(result)
            # Remove trigger after firing by order_id
            lane.remove_trigger_by_order(order_id)

            # Check for game win (removal triggers can lead to placements)
            if state.check_game_over():
                result['game_won'] = True
                break

    return results


def _fire_single_trigger(state: 'GameState', lane_idx: int,
                         trigger_type: 'TriggerType', owner: 'Player',
                         opponent: 'Player', chain_depth: int = 0) -> Optional[dict]:
    """Fire a single trigger and return the result."""
    from src.game.state import TriggerType

    if trigger_type == TriggerType.PORTAL:
        return _handle_portal(state, lane_idx, opponent, chain_depth)
    elif trigger_type == TriggerType.TRAP:
        return _handle_trap(state, lane_idx, opponent)
    elif trigger_type == TriggerType.MIRROR:
        return _handle_mirror(state, lane_idx, owner)
    elif trigger_type == TriggerType.ECHO:
        return _handle_echo(state, lane_idx, owner)
    elif trigger_type == TriggerType.SHOCKWAVE:
        return _handle_shockwave(state, lane_idx, opponent)
    elif trigger_type == TriggerType.HYDRA:
        return _handle_hydra(state, lane_idx, owner)
    elif trigger_type == TriggerType.BACKFIRE:
        return _handle_backfire(state, lane_idx, opponent)
    elif trigger_type == TriggerType.ABSORB:
        return _handle_absorb(state, lane_idx, owner)
    elif trigger_type == TriggerType.RETALIATE:
        return _handle_retaliate(state, lane_idx, owner, opponent)

    return None


def _handle_portal(state: 'GameState', lane_idx: int, placing_player: 'Player',
                   chain_depth: int = 0) -> dict:
    """
    Portal: Teleport the placed piece to a random other lane.
    Uses source exclusion. Trigger chaining: piece landing fires destination triggers.
    """
    from src.game.rules import GameRules

    # Remove the piece that was just placed
    state.lanes[lane_idx].remove_piece(placing_player)

    # Find available lanes with source exclusion
    available = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(placing_player)
    ]

    # Source exclusion: if threshold lanes available, exclude source
    if len(available) >= state.config.SOURCE_EXCLUSION_THRESHOLD and lane_idx in available:
        available = [l for l in available if l != lane_idx]

    destination = None
    chained_triggers = []

    if available:
        destination = state.rng.choice(available)
        state.lanes[destination].add_piece(placing_player)

        # Check lane win at destination
        winner = GameRules.check_lane_win(state, destination)
        if winner:
            state.cleanup_won_lane(destination)

        # Trigger chaining: fire placement triggers at destination (if not won)
        if state.lanes[destination].winner is None:
            chained_triggers = fire_placement_triggers(state, destination, placing_player, chain_depth + 1)

    # If no lanes available, piece is lost

    return {
        'trigger': 'PORTAL',
        'source_lane': lane_idx,
        'destination_lane': destination,
        'player': placing_player.name,
        'chained_triggers': chained_triggers if chained_triggers else None
    }


def _handle_trap(state: 'GameState', lane_idx: int, placing_player: 'Player') -> dict:
    """Trap: Remove the placed piece (it vanishes). Uses Sanctuary/Capture redirection."""
    # The trap owner set this trigger, so they are the "remover" for Capture purposes
    # However, Trap is triggered by placement - the piece owner is placing_player
    # No one is "removing" it in the traditional sense, so no Capture applies
    # But Sanctuary still applies (owner's own protection)
    removal_result = state.remove_piece_with_redirects(lane_idx, placing_player, remover=None)

    return {
        'trigger': 'TRAP',
        'lane': lane_idx,
        'player': placing_player.name,
        'piece_lost': not removal_result.get('redirected', False),
        'redirected': removal_result.get('redirected', False),
        'redirect_type': removal_result.get('redirect_type'),
        'redirect_destination': removal_result.get('destination')
    }


def _handle_mirror(state: 'GameState', lane_idx: int, owner: 'Player') -> dict:
    """Mirror: Owner gets +2 pieces on the same lane."""
    pieces_added = 0
    for _ in range(state.config.MIRROR_PIECES):
        if not state.lanes[lane_idx].is_full_for(owner):
            state.lanes[lane_idx].add_piece(owner)
            pieces_added += 1

    return {
        'trigger': 'MIRROR',
        'lane': lane_idx,
        'owner': owner.name,
        'pieces_added': pieces_added
    }


def _handle_echo(state: 'GameState', lane_idx: int, owner: 'Player') -> dict:
    """Echo: Owner gets +2 pieces on random lanes (with source exclusion). Iterative with game win check."""
    from src.game.rules import GameRules

    placements = []
    game_won_mid_trigger = False

    for _ in range(state.config.ECHO_PIECES):
        if game_won_mid_trigger:
            break

        # Find available lanes with source exclusion
        available = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(owner)
        ]

        # Source exclusion if threshold lanes available
        if len(available) >= state.config.SOURCE_EXCLUSION_THRESHOLD and lane_idx in available:
            available = [l for l in available if l != lane_idx]

        if available:
            dest = state.rng.choice(available)
            state.lanes[dest].add_piece(owner)
            placements.append(dest)

            # Check lane win and game win
            GameRules.check_lane_win(state, dest)
            if GameRules.check_game_win_mid_perk(state):
                game_won_mid_trigger = True

    return {
        'trigger': 'ECHO',
        'source_lane': lane_idx,
        'owner': owner.name,
        'placements': placements,
        'game_won_mid_trigger': game_won_mid_trigger
    }


def _handle_shockwave(state: 'GameState', lane_idx: int, placing_player: 'Player') -> dict:
    """Shockwave: Placing player loses 2 pieces from OTHER lanes. Uses Sanctuary/Capture redirection."""
    removed_from = []
    redirections = []

    for _ in range(state.config.SHOCKWAVE_REMOVES):
        # Find lanes with placing_player's pieces (excluding trigger lane)
        other_lanes = [
            i for i, lane in enumerate(state.lanes)
            if i != lane_idx and lane.winner is None and lane.pieces_for(placing_player) > 0
        ]

        if other_lanes:
            lane = state.rng.choice(other_lanes)
            # The trigger owner is the "remover" (opponent of placing_player)
            trigger_owner = placing_player.opponent()
            removal_result = state.remove_piece_with_redirects(lane, placing_player, remover=trigger_owner)
            removed_from.append(lane)
            if removal_result.get('redirected'):
                redirections.append({
                    'from_lane': lane,
                    'type': removal_result.get('redirect_type'),
                    'destination': removal_result.get('destination'),
                    'converted': removal_result.get('converted', False)
                })

    return {
        'trigger': 'SHOCKWAVE',
        'trigger_lane': lane_idx,
        'player': placing_player.name,
        'removed_from': removed_from,
        'redirections': redirections if redirections else None
    }


def _handle_hydra(state: 'GameState', lane_idx: int, owner: 'Player') -> dict:
    """Hydra: Owner gets +2 pieces on random lanes (cut one head, two grow back). Iterative with game win check."""
    from src.game.rules import GameRules

    placements = []
    game_won_mid_trigger = False

    for _ in range(state.config.HYDRA_PIECES):
        if game_won_mid_trigger:
            break

        available = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(owner)
        ]

        # Source exclusion
        if len(available) >= state.config.SOURCE_EXCLUSION_THRESHOLD and lane_idx in available:
            available = [l for l in available if l != lane_idx]

        if available:
            dest = state.rng.choice(available)
            state.lanes[dest].add_piece(owner)
            placements.append(dest)

            # Check lane win and game win
            GameRules.check_lane_win(state, dest)
            if GameRules.check_game_win_mid_perk(state):
                game_won_mid_trigger = True

    return {
        'trigger': 'HYDRA',
        'source_lane': lane_idx,
        'owner': owner.name,
        'placements': placements,
        'game_won_mid_trigger': game_won_mid_trigger
    }


def _handle_backfire(state: 'GameState', lane_idx: int, removing_player: 'Player') -> dict:
    """Backfire: Removing player loses 2 pieces. Uses Sanctuary/Capture redirection."""
    removed_from = []
    redirections = []

    for _ in range(state.config.BACKFIRE_REMOVES):
        lanes_with_pieces = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and lane.pieces_for(removing_player) > 0
        ]

        if lanes_with_pieces:
            lane = state.rng.choice(lanes_with_pieces)
            # The trigger owner (opponent of removing_player) is causing this removal
            trigger_owner = removing_player.opponent()
            removal_result = state.remove_piece_with_redirects(lane, removing_player, remover=trigger_owner)
            removed_from.append(lane)
            if removal_result.get('redirected'):
                redirections.append({
                    'from_lane': lane,
                    'type': removal_result.get('redirect_type'),
                    'destination': removal_result.get('destination'),
                    'converted': removal_result.get('converted', False)
                })

    return {
        'trigger': 'BACKFIRE',
        'trigger_lane': lane_idx,
        'player': removing_player.name,
        'removed_from': removed_from,
        'redirections': redirections if redirections else None
    }


def _handle_absorb(state: 'GameState', lane_idx: int, owner: 'Player') -> dict:
    """Absorb: Owner recovers the removed piece on a random available lane. Uses source exclusion."""
    from src.game.rules import GameRules

    available = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(owner)
    ]

    # Source exclusion: if threshold lanes available, exclude source
    if len(available) >= state.config.SOURCE_EXCLUSION_THRESHOLD and lane_idx in available:
        available = [l for l in available if l != lane_idx]

    destination = None
    if available:
        destination = state.rng.choice(available)
        state.lanes[destination].add_piece(owner)

        # Check lane win at destination
        winner = GameRules.check_lane_win(state, destination)
        if winner:
            state.cleanup_won_lane(destination)

    return {
        'trigger': 'ABSORB',
        'source_lane': lane_idx,
        'owner': owner.name,
        'destination': destination,
        'source_exclusion_applied': len(available) >= state.config.SOURCE_EXCLUSION_THRESHOLD
    }


def _handle_retaliate(state: 'GameState', lane_idx: int, owner: 'Player',
                      opponent: 'Player') -> dict:
    """
    Retaliate: Owner's piece appears on opponent's side as a Raid piece.
    The raid piece is placed on the SAME lane where the opponent placed.
    Raid resolves after 2 full turns (opponent turn, owner turn, opponent turn, then at owner's turn start).
    """
    from src.game.rules import GameRules

    lane = state.lanes[lane_idx]

    # Check if there's space on opponent's side of this lane
    if lane.is_full_for(opponent):
        # No space - raid cannot be placed
        return {
            'trigger': 'RETALIATE',
            'trigger_lane': lane_idx,
            'owner': owner.name,
            'raid_placed': False,
            'reason': 'Enemy side full'
        }

    # Place the raid piece on opponent's side (counts as opponent's piece mechanically)
    lane.add_piece(opponent)

    # Track the raid for resolution - resolves after 2 full turns
    # turns_until_resolve = 2 means: decrement each turn, resolve when it reaches 0 at owner's turn start
    state.pending_raids.append({
        'owner': owner,
        'lane': lane_idx,
        'turns_until_resolve': 2,
        'source': 'RETALIATE'
    })

    # Check lane win (raid piece counts for opponent)
    winner = GameRules.check_lane_win(state, lane_idx)
    if winner:
        state.cleanup_won_lane(lane_idx)

    return {
        'trigger': 'RETALIATE',
        'trigger_lane': lane_idx,
        'owner': owner.name,
        'raid_placed': True,
        'resolves_in_turns': 2,
        'lane_won_by': winner.name if winner else None
    }
