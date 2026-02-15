"""Deferred perks - effects that fire on next turn."""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..game.state import GameState, Player, DeferredType


def execute_signal(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Signal (Slot 3)
    Effect: Immediate +1 piece on target lane. Next turn, pull from MOST POPULATED lane.

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.state import DeferredType

    # Find valid destination lanes (not won, not full)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(player)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes to signal to'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for signal'}
    lane_idx = target

    # Immediate: +1 piece
    state.lanes[lane_idx].add_piece(player)

    # Add deferred effect to pull from most populated lane
    state.lanes[lane_idx].add_deferred(DeferredType.SIGNAL, player, lane_idx)

    return True, {
        'perk': 'SIGNAL',
        'lane': lane_idx,
        'player': player.name,
        'immediate_placed': True,
        'deferred_pull_from_most_populated': True
    }


def execute_enlist(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Enlist (Slot 4)
    Effect: Immediate +1 piece on target lane. Next turn, take enemy from X + move both to LEAST POPULATED lane.

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory) - non-won, not full for you

    Returns:
        (success, result_dict)
    """
    from src.game.state import DeferredType

    opponent = player.opponent()

    # Find valid lanes (not won, not full for you)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
        and not lane.is_full_for(player)  # Space for immediate placement
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for enlist'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for enlist'}
    lane_idx = target

    # Immediate: +1 piece
    state.lanes[lane_idx].add_piece(player)

    # Add deferred effect to take enemy + move to least populated
    state.lanes[lane_idx].add_deferred(DeferredType.ENLIST, player, lane_idx)

    return True, {
        'perk': 'ENLIST',
        'lane': lane_idx,
        'player': player.name,
        'immediate_placed': True,
        'deferred_capture_and_move_to_least_populated': True
    }


def execute_ambush(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Ambush (Slot 4)
    Effect: Immediate +1 piece on target lane. Next turn, remove enemy piece from lane X OR adjacent (X-1, X+1).

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.state import DeferredType

    # Find valid lanes (not won, not full for immediate placement)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(player)
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for ambush'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for ambush'}
    lane_idx = target

    # Immediate: +1 piece
    state.lanes[lane_idx].add_piece(player)

    # Add deferred effect to remove from lane or adjacent
    state.lanes[lane_idx].add_deferred(DeferredType.AMBUSH, player, lane_idx)

    return True, {
        'perk': 'AMBUSH',
        'lane': lane_idx,
        'player': player.name,
        'immediate_placed': True,
        'deferred_remove_from_lane_or_adjacent': True
    }


def execute_reinforce(state: 'GameState', player: 'Player',
                      target: int) -> tuple[bool, dict]:
    """
    Reinforce (Slot 4)
    Effect: Immediate +1 piece on target lane. Next turn, +1 more piece on same lane.

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.state import DeferredType

    # Find valid lanes (not won, not full - need space for at least 1)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(player)
    ]

    if not valid_lanes:
        return False, {'error': 'No lanes available for reinforcement'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for reinforcement'}
    lane_idx = target

    # Immediate: +1 piece
    state.lanes[lane_idx].add_piece(player)

    # Add deferred effect for +1 more next turn
    state.lanes[lane_idx].add_deferred(DeferredType.REINFORCE, player, lane_idx)

    return True, {
        'perk': 'REINFORCE',
        'lane': lane_idx,
        'player': player.name,
        'immediate_placed': True,
        'deferred_next_turn': True
    }


def execute_raid(state: 'GameState', player: 'Player',
                 target: int) -> tuple[bool, dict]:
    """
    Raid (Slot 4)
    Effect: Place YOUR piece marker on ENEMY's side of target lane.
    At start of your next turn, roll probability:
    - 10% lost (piece removed)
    - 15% +2 recruits (piece stays + 2 more)
    - 30% +1 recruit (piece stays + 1 more)
    - 45% alone (piece stays as is)

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory)

    Returns:
        (success, result_dict)
    """
    opponent = player.opponent()

    # Find valid lanes (not won, enemy side not full)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(opponent)
    ]

    if not valid_lanes:
        return False, {'error': 'No lanes available for raid'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid for raid'}
    lane_idx = target

    # Immediate: Place raid marker on enemy's side (counts as enemy piece for space)
    # This uses enemy's space but will convert to our piece if successful
    state.lanes[lane_idx].add_piece(opponent)  # Takes enemy slot

    # Track pending raid for resolution - resolves after 2 full turns
    # turns_until_resolve is decremented each turn in switch_player, resolves when 0
    state.pending_raids.append({
        'owner': player,
        'lane': lane_idx,
        'turns_until_resolve': 2,
        'source': 'RAID'
    })

    return True, {
        'perk': 'RAID',
        'lane': lane_idx,
        'player': player.name,
        'placed_on_enemy_side': True,
        'resolves_next_turn': True
    }


def process_pending_raids(state: 'GameState', player: 'Player') -> list[dict]:
    """
    Process pending raids for a player at the start of their turn.
    Called from engine before deferred effects.

    Raids resolve when turns_until_resolve reaches 0.

    Probability roll:
    - 10% lost (piece removed)
    - 15% +2 recruits (piece stays + 2 more)
    - 30% +1 recruit (piece stays + 1 more)
    - 45% alone (piece stays as is)

    Args:
        state: Game state
        player: Current player (the raider)

    Returns:
        List of raid resolution results
    """
    from src.game.rules import GameRules

    results = []
    opponent = player.opponent()

    # Find raids owned by this player that are ready to resolve
    ready_raids = [
        r for r in state.pending_raids
        if r['owner'] == player and r.get('turns_until_resolve', 0) <= 0
    ]

    # Remove resolved raids from pending
    state.pending_raids = [
        r for r in state.pending_raids
        if not (r['owner'] == player and r.get('turns_until_resolve', 0) <= 0)
    ]

    for raid in ready_raids:
        lane_idx = raid['lane']
        lane = state.lanes[lane_idx]
        result = {'type': 'RAID_RESOLUTION', 'lane': lane_idx, 'source': raid.get('source', 'RAID')}

        # Skip if lane is won (raid piece already counted for winner)
        if lane.winner is not None:
            result['success'] = False
            result['reason'] = 'Lane already won'
            results.append(result)
            continue

        # Roll probability (0-99)
        roll = state.rng.randint(0, 99)

        if roll < 10:
            # 10% - Lost: Remove the raid piece from enemy's side
            if lane.pieces_for(opponent) > 0:
                lane.remove_piece(opponent)
            result['success'] = True
            result['outcome'] = 'lost'
            result['roll'] = roll
        elif roll < 25:
            # 15% (10-24) - +2 recruits: Convert to our piece + 2 more
            # First remove from enemy side, then add to our side
            if lane.pieces_for(opponent) > 0:
                lane.remove_piece(opponent)

            pieces_added = 0
            for _ in range(3):  # Original + 2 recruits = 3
                if not lane.is_full_for(player):
                    lane.add_piece(player)
                    pieces_added += 1
                    # Check lane win after each placement
                    winner = GameRules.check_lane_win(state, lane_idx)
                    if winner:
                        break

            result['success'] = True
            result['outcome'] = '+2_recruits'
            result['pieces_gained'] = pieces_added
            result['roll'] = roll
        elif roll < 55:
            # 30% (25-54) - +1 recruit: Convert to our piece + 1 more
            if lane.pieces_for(opponent) > 0:
                lane.remove_piece(opponent)

            pieces_added = 0
            for _ in range(2):  # Original + 1 recruit = 2
                if not lane.is_full_for(player):
                    lane.add_piece(player)
                    pieces_added += 1
                    # Check lane win
                    winner = GameRules.check_lane_win(state, lane_idx)
                    if winner:
                        break

            result['success'] = True
            result['outcome'] = '+1_recruit'
            result['pieces_gained'] = pieces_added
            result['roll'] = roll
        else:
            # 45% (55-99) - Alone: Just convert to our piece
            if lane.pieces_for(opponent) > 0:
                lane.remove_piece(opponent)

            if not lane.is_full_for(player):
                lane.add_piece(player)
                result['pieces_gained'] = 1
                # Check lane win
                GameRules.check_lane_win(state, lane_idx)
            else:
                result['pieces_gained'] = 0

            result['success'] = True
            result['outcome'] = 'alone'
            result['roll'] = roll

        results.append(result)

    return results


def process_deferred_effects(state: 'GameState', player: 'Player') -> list[dict]:
    """
    Process all deferred effects for a player at the start of their turn.
    Called from engine before auto-placement.

    Args:
        state: Game state
        player: Current player

    Returns:
        List of effect results
    """
    from src.game.state import DeferredType

    results = []

    for lane_idx, lane in enumerate(state.lanes):
        if lane.winner is not None:
            continue

        # Get and remove deferred effects for this player on this lane
        effects = lane.pop_deferred_for(player)

        for effect in effects:
            effect_type = effect['type']
            result = {'type': effect_type.name, 'lane': lane_idx}

            if effect_type == DeferredType.SIGNAL:
                # Pull 1 piece from MOST POPULATED lane (not this lane)
                source_lanes = [
                    (i, l.pieces_for(player)) for i, l in enumerate(state.lanes)
                    if i != lane_idx and l.winner is None and l.pieces_for(player) > 0
                ]
                if source_lanes and not lane.is_full_for(player):
                    # Sort by piece count descending, pick most populated
                    source_lanes.sort(key=lambda x: x[1], reverse=True)
                    source = source_lanes[0][0]
                    state.lanes[source].remove_piece(player)
                    lane.add_piece(player)
                    result['success'] = True
                    result['pulled_from'] = source
                    result['source_was_most_populated'] = True
                else:
                    result['success'] = False
                    result['reason'] = 'No valid source or destination full'

            elif effect_type == DeferredType.ENLIST:
                # MOVE the immediate piece + captured enemy to LEAST POPULATED lane
                # Per rules: "move BOTH pieces (yours and captured enemy) to your LEAST populated available lane"
                opponent = player.opponent()

                # First, remove 1 of your pieces from this lane (the deferred piece)
                if lane.pieces_for(player) <= 0:
                    result['success'] = False
                    result['reason'] = 'No player piece on lane to move'
                    results.append(result)
                    continue

                lane.remove_piece(player)

                # Try to capture 1 enemy piece from this lane
                enemy_captured = False
                if lane.pieces_for(opponent) > 0:
                    lane.remove_piece(opponent)
                    enemy_captured = True

                # Find least populated lane for player (not won, not full, excluding current lane)
                dest_lanes = [
                    (i, l.pieces_for(player)) for i, l in enumerate(state.lanes)
                    if l.winner is None and not l.is_full_for(player) and i != lane_idx
                ]

                # If no other lane available, check if current lane is usable
                if not dest_lanes:
                    if not lane.is_full_for(player) and lane.winner is None:
                        dest_lanes = [(lane_idx, lane.pieces_for(player))]

                if dest_lanes:
                    # Sort by piece count ascending, pick least populated
                    dest_lanes.sort(key=lambda x: x[1])
                    dest = dest_lanes[0][0]

                    # Add both pieces to destination (your piece + captured enemy if any)
                    pieces_to_add = 2 if enemy_captured else 1
                    pieces_added = 0
                    for _ in range(pieces_to_add):
                        if not state.lanes[dest].is_full_for(player):
                            state.lanes[dest].add_piece(player)
                            pieces_added += 1

                    result['success'] = True
                    result['destination'] = dest
                    result['enemy_captured'] = enemy_captured
                    result['pieces_added'] = pieces_added
                else:
                    # No valid destination - pieces are lost
                    result['success'] = True
                    result['note'] = 'No valid destination, pieces removed'
                    result['enemy_captured'] = enemy_captured

            elif effect_type == DeferredType.AMBUSH:
                # Remove enemy piece from lane X OR adjacent (X-1, X+1)
                # Per rules: "Random pick from available targets"
                opponent = player.opponent()
                target_lane_idx = effect.get('target_lane', lane_idx)

                # Build list of valid removal targets: lane X, X-1, X+1
                adjacent_lanes = [target_lane_idx]
                if target_lane_idx > 0:
                    adjacent_lanes.append(target_lane_idx - 1)
                if target_lane_idx < len(state.lanes) - 1:
                    adjacent_lanes.append(target_lane_idx + 1)

                # Filter to lanes with enemy pieces
                valid_removal = [
                    i for i in adjacent_lanes
                    if state.lanes[i].winner is None and state.lanes[i].pieces_for(opponent) > 0
                ]

                if valid_removal:
                    # Random pick from ALL valid targets (no preferential selection)
                    remove_from = state.rng.choice(valid_removal)

                    state.lanes[remove_from].remove_piece(opponent)
                    result['success'] = True
                    result['removed_from_lane'] = remove_from
                else:
                    result['success'] = False
                    result['reason'] = 'No enemy pieces on lane or adjacent lanes'

            elif effect_type == DeferredType.REINFORCE:
                # Add 1 piece
                if not lane.is_full_for(player):
                    lane.add_piece(player)
                    result['success'] = True
                else:
                    result['success'] = False
                    result['reason'] = 'Lane is full'

            # Note: RAID is now handled by process_pending_raids, not here

            results.append(result)

    return results
