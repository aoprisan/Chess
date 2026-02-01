"""Immediate effect perks - effects happen instantly."""

from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from ..game.state import GameState, Player


def execute_freeze(state: 'GameState', player: 'Player',
                   target: int) -> tuple[bool, dict]:
    """
    Freeze (Slot 3)
    Effect: Block opponent from placing on chosen lane for 1 turn

    Args:
        state: Game state
        player: Player executing
        target: Target lane index (mandatory)

    Returns:
        (success, result_dict)
    """
    opponent = player.opponent()

    # Find valid lanes (not won, not already frozen)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and lane.freeze_turns == 0
    ]

    if not valid_lanes:
        return False, {'error': 'No lanes available to freeze'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} cannot be frozen'}

    # Apply freeze
    state.lanes[target].freeze_player = opponent
    state.lanes[target].freeze_turns = state.config.FREEZE_DURATION

    return True, {
        'perk': 'FREEZE',
        'lane': target,
        'player': player.name,
        'frozen_player': opponent.name,
        'duration': state.config.FREEZE_DURATION
    }


def execute_gambit(state: 'GameState', player: 'Player',
                   target: Optional[int] = None) -> tuple[bool, dict]:
    """
    Gambit (Slot 4)
    Effect: Give enemy 3 pieces (random lanes, can repeat) -> you get 2 pieces (same random lane)
    Iterative: Checks game win after each piece placement.

    Args:
        state: Game state
        player: Player executing
        target: Ignored (random targeting)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    opponent = player.opponent()
    game_won_mid_perk = False

    # Get available lanes for opponent (to receive pieces)
    opponent_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(opponent)
    ]

    # Get available lanes for player (to receive pieces)
    player_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(player)
    ]

    if not player_lanes:
        return False, {'error': 'No lanes available for your pieces'}

    # Give opponent pieces (random lanes, can repeat)
    enemy_placements = []
    for _ in range(state.config.GAMBIT_ENEMY_GAIN):
        if game_won_mid_perk:
            break
        # Refresh available lanes (in case one filled up or won)
        current_lanes = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(opponent)
        ]
        if current_lanes:
            lane = state.rng.choice(current_lanes)
            state.lanes[lane].add_piece(opponent)
            enemy_placements.append(lane)
            # Check lane win and game win after each placement
            GameRules.check_lane_win(state, lane)
            if GameRules.check_game_win_mid_perk(state):
                game_won_mid_perk = True

    # You get pieces on the same randomly chosen lane (if game not over)
    player_placements = []
    if not game_won_mid_perk:
        # Refresh player lanes (might have changed)
        player_lanes = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(player)
        ]
        if player_lanes:
            player_lane = state.rng.choice(player_lanes)
            for _ in range(state.config.GAMBIT_PLAYER_GAIN):
                if game_won_mid_perk:
                    break
                if not state.lanes[player_lane].is_full_for(player) and state.lanes[player_lane].winner is None:
                    state.lanes[player_lane].add_piece(player)
                    player_placements.append(player_lane)
                    # Check lane win and game win
                    GameRules.check_lane_win(state, player_lane)
                    if GameRules.check_game_win_mid_perk(state):
                        game_won_mid_perk = True

    return True, {
        'perk': 'GAMBIT',
        'player': player.name,
        'enemy_received': enemy_placements,
        'player_received': player_placements,
        'game_won_mid_perk': game_won_mid_perk
    }


def execute_split(state: 'GameState', player: 'Player',
                  target: int) -> tuple[bool, dict]:
    """
    Split (Slot 4)
    Effect: Sacrifice 1 of your pieces -> get 2 pieces on random lanes (source exclusion applies)
    Iterative: Checks game win after each piece placement.

    Args:
        state: Game state
        player: Player executing
        target: Lane to sacrifice from (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    # Find lanes with player's pieces
    lanes_with_pieces = state.get_lanes_with_pieces(player)

    if not lanes_with_pieces:
        return False, {'error': 'No pieces to sacrifice'}

    # Validate target
    if target not in lanes_with_pieces:
        return False, {'error': f'No pieces on lane {target}'}
    source_lane = target

    # Remove the sacrificed piece
    state.lanes[source_lane].remove_piece(player)

    game_won_mid_perk = False

    # Place pieces on random lanes (one at a time)
    placements = []
    for _ in range(state.config.SPLIT_GAIN):
        if game_won_mid_perk:
            break

        # Find destination lanes (source exclusion if threshold lanes available)
        current_lanes = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(player)
        ]
        # Apply source exclusion if needed
        if len(current_lanes) >= state.config.SOURCE_EXCLUSION_THRESHOLD and source_lane in current_lanes:
            current_lanes = [l for l in current_lanes if l != source_lane]

        if current_lanes:
            lane = state.rng.choice(current_lanes)
            state.lanes[lane].add_piece(player)
            placements.append(lane)
            # Check lane win and game win
            GameRules.check_lane_win(state, lane)
            if GameRules.check_game_win_mid_perk(state):
                game_won_mid_perk = True

    return True, {
        'perk': 'SPLIT',
        'player': player.name,
        'source_lane': source_lane,
        'placements': placements,
        'net_gain': len(placements) - 1,
        'game_won_mid_perk': game_won_mid_perk
    }


def execute_scramble(state: 'GameState', player: 'Player',
                     target: Optional[int] = None) -> tuple[bool, dict]:
    """
    Scramble (Slot 4)
    Effect: Collect all enemy pieces and redistribute them randomly across lanes.
    Iterative: Checks game win after each piece placement. No source exclusion.

    Args:
        state: Game state
        player: Player executing
        target: Ignored (affects all lanes)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    opponent = player.opponent()

    # Count total enemy pieces across all non-won lanes (atomic removal)
    total_pieces = 0
    for lane in state.lanes:
        if lane.winner is None:
            pieces = lane.pieces_for(opponent)
            total_pieces += pieces
            # Remove all enemy pieces
            for _ in range(pieces):
                lane.remove_piece(opponent)

    if total_pieces == 0:
        return False, {'error': 'No enemy pieces to scramble'}

    game_won_mid_perk = False

    # Redistribute randomly (iterative with win checks)
    placements = []
    for _ in range(total_pieces):
        if game_won_mid_perk:
            break

        available = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(opponent)
        ]
        if available:
            lane = state.rng.choice(available)
            state.lanes[lane].add_piece(opponent)
            placements.append(lane)
            # Check lane win and game win
            GameRules.check_lane_win(state, lane)
            if GameRules.check_game_win_mid_perk(state):
                game_won_mid_perk = True

    return True, {
        'perk': 'SCRAMBLE',
        'player': player.name,
        'pieces_scrambled': total_pieces,
        'new_distribution': placements,
        'game_won_mid_perk': game_won_mid_perk
    }


def execute_kamikaze(state: 'GameState', player: 'Player',
                     target: int) -> tuple[bool, dict]:
    """
    Kamikaze (Slot 4)
    Effect: Sacrifice 1 of your pieces -> remove up to 2 enemy pieces.
    Note: Proceeds even if enemy has 0 pieces (you still sacrifice).

    Args:
        state: Game state
        player: Player executing
        target: Lane to sacrifice from (mandatory)

    Returns:
        (success, result_dict)
    """
    opponent = player.opponent()

    # Find lanes with player's pieces
    lanes_with_player_pieces = state.get_lanes_with_pieces(player)
    if not lanes_with_player_pieces:
        return False, {'error': 'No pieces to sacrifice'}

    # Validate target
    if target not in lanes_with_player_pieces:
        return False, {'error': f'No pieces on lane {target}'}
    source_lane = target

    # Sacrifice the piece (no redirection for voluntary sacrifice)
    state.lanes[source_lane].remove_piece(player)

    # Remove enemy pieces from random lanes (may remove 0 if enemy has none)
    # Uses Sanctuary/Capture redirection
    removals = []
    redirections = []
    for _ in range(state.config.KAMIKAZE_REMOVES):
        current_enemy_lanes = state.get_lanes_with_pieces(opponent)
        if current_enemy_lanes:
            lane = state.rng.choice(current_enemy_lanes)
            removal_result = state.remove_piece_with_redirects(lane, opponent, remover=player)
            removals.append(lane)
            if removal_result.get('redirected'):
                redirections.append({
                    'from_lane': lane,
                    'type': removal_result.get('redirect_type'),
                    'destination': removal_result.get('destination'),
                    'converted': removal_result.get('converted', False)
                })

    return True, {
        'perk': 'KAMIKAZE',
        'player': player.name,
        'sacrificed_from': source_lane,
        'removed_from': removals,
        'enemy_pieces_removed': len(removals),
        'redirections': redirections if redirections else None
    }


def execute_regroup(state: 'GameState', player: 'Player',
                    target1: int, target2: int) -> tuple[bool, dict]:
    """
    Regroup (Slot 3)
    Effect: Swap ALL your pieces between two lanes (atomic operation).
    At least one lane must have pieces to swap. Empty lane is valid as destination.

    Args:
        state: Game state
        player: Player executing
        target1: First lane (mandatory)
        target2: Second lane (mandatory)

    Returns:
        (success, result_dict)
    """
    # Valid lanes are non-won lanes
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
    ]

    if len(valid_lanes) < 2:
        return False, {'error': 'Need at least 2 non-won lanes'}

    # Validate both targets are valid (non-won)
    if target1 not in valid_lanes:
        return False, {'error': f'Lane {target1} is not valid (won or invalid)'}
    if target2 not in valid_lanes:
        return False, {'error': f'Lane {target2} is not valid (won or invalid)'}
    if target1 == target2:
        return False, {'error': 'Cannot swap lane with itself'}

    lane1, lane2 = target1, target2

    # Get piece counts
    pieces1 = state.lanes[lane1].pieces_for(player)
    pieces2 = state.lanes[lane2].pieces_for(player)

    # At least one lane must have pieces to swap
    if pieces1 == 0 and pieces2 == 0:
        return False, {'error': 'At least one lane must have pieces to swap'}

    # Remove all from both lanes
    for _ in range(pieces1):
        state.lanes[lane1].remove_piece(player)
    for _ in range(pieces2):
        state.lanes[lane2].remove_piece(player)

    # Add swapped amounts (respecting limits)
    pieces_to_lane1 = min(pieces2, state.config.SLOTS_PER_SIDE)
    pieces_to_lane2 = min(pieces1, state.config.SLOTS_PER_SIDE)

    for _ in range(pieces_to_lane1):
        if not state.lanes[lane1].is_full_for(player):
            state.lanes[lane1].add_piece(player)
    for _ in range(pieces_to_lane2):
        if not state.lanes[lane2].is_full_for(player):
            state.lanes[lane2].add_piece(player)

    return True, {
        'perk': 'REGROUP',
        'player': player.name,
        'lane1': lane1,
        'lane2': lane2,
        'original_pieces1': pieces1,
        'original_pieces2': pieces2,
        'swapped': True
    }


def execute_disrupt(state: 'GameState', player: 'Player',
                    target1: int, target2: int) -> tuple[bool, dict]:
    """
    Disrupt (Slot 4)
    Effect: Swap ALL enemy pieces between two lanes.

    Args:
        state: Game state
        player: Player executing
        target1: First lane (mandatory)
        target2: Second lane (mandatory)

    Returns:
        (success, result_dict)
    """
    opponent = player.opponent()

    # Find lanes with enemy pieces
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and lane.pieces_for(opponent) > 0
    ]

    if len(valid_lanes) < 2:
        return False, {'error': 'Need at least 2 lanes with enemy pieces to swap'}

    # Validate both targets
    if target1 not in valid_lanes:
        return False, {'error': f'Lane {target1} has no enemy pieces'}
    if target2 not in valid_lanes:
        return False, {'error': f'Lane {target2} has no enemy pieces'}
    if target1 == target2:
        return False, {'error': 'Cannot swap lane with itself'}

    lane1, lane2 = target1, target2

    # Get piece counts
    pieces1 = state.lanes[lane1].pieces_for(opponent)
    pieces2 = state.lanes[lane2].pieces_for(opponent)

    # Remove all from both lanes
    for _ in range(pieces1):
        state.lanes[lane1].remove_piece(opponent)
    for _ in range(pieces2):
        state.lanes[lane2].remove_piece(opponent)

    # Add swapped amounts (respecting limits)
    pieces_to_lane1 = min(pieces2, state.config.SLOTS_PER_SIDE)
    pieces_to_lane2 = min(pieces1, state.config.SLOTS_PER_SIDE)

    for _ in range(pieces_to_lane1):
        if not state.lanes[lane1].is_full_for(opponent):
            state.lanes[lane1].add_piece(opponent)
    for _ in range(pieces_to_lane2):
        if not state.lanes[lane2].is_full_for(opponent):
            state.lanes[lane2].add_piece(opponent)

    return True, {
        'perk': 'DISRUPT',
        'player': player.name,
        'lane1': lane1,
        'lane2': lane2,
        'original_pieces1': pieces1,
        'original_pieces2': pieces2,
        'swapped': True
    }


def execute_scatter(state: 'GameState', player: 'Player',
                    target: int) -> tuple[bool, dict]:
    """
    Scatter (Slot 3)
    Effect: Move ALL your pieces from source lane to random different lanes.
    Iterative: Checks game win after each piece placement. Uses source exclusion.

    Args:
        state: Game state
        player: Player executing
        target: Source lane (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    # Find lanes with player's pieces
    source_lanes = state.get_lanes_with_pieces(player)
    if not source_lanes:
        return False, {'error': 'No pieces to scatter'}

    # Validate target
    if target not in source_lanes:
        return False, {'error': f'No pieces on lane {target}'}
    source = target

    # Count pieces to move and remove them first (atomic removal)
    pieces_to_move = state.lanes[source].pieces_for(player)
    for _ in range(pieces_to_move):
        state.lanes[source].remove_piece(player)

    game_won_mid_perk = False

    # Move pieces to random destinations (iterative with win checks)
    moved_to = []
    for _ in range(pieces_to_move):
        if game_won_mid_perk:
            break

        # Find destination lanes with source exclusion
        dest_lanes = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(player)
        ]

        # Source exclusion if threshold lanes available
        if len(dest_lanes) >= state.config.SOURCE_EXCLUSION_THRESHOLD and source in dest_lanes:
            dest_lanes = [l for l in dest_lanes if l != source]

        if not dest_lanes:
            break  # No more valid destinations - piece is lost

        dest = state.rng.choice(dest_lanes)
        state.lanes[dest].add_piece(player)
        moved_to.append(dest)

        # Check lane win and game win
        GameRules.check_lane_win(state, dest)
        if GameRules.check_game_win_mid_perk(state):
            game_won_mid_perk = True

    if not moved_to and pieces_to_move > 0:
        return True, {
            'perk': 'SCATTER',
            'player': player.name,
            'from_lane': source,
            'pieces_moved': 0,
            'note': 'No valid destination lanes - pieces lost'
        }

    return True, {
        'perk': 'SCATTER',
        'player': player.name,
        'from_lane': source,
        'pieces_moved': len(moved_to),
        'moved_to': moved_to,
        'game_won_mid_perk': game_won_mid_perk
    }


def execute_disperse(state: 'GameState', player: 'Player',
                     target: int) -> tuple[bool, dict]:
    """
    Disperse (Slot 4)
    Effect: Move ALL enemy pieces from source lane to random different lanes.
    Iterative: Checks game win after each piece placement. Uses source exclusion.

    Args:
        state: Game state
        player: Player executing
        target: Source lane (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    opponent = player.opponent()

    # Find lanes with enemy pieces
    source_lanes = state.get_lanes_with_pieces(opponent)
    if not source_lanes:
        return False, {'error': 'No enemy pieces to disperse'}

    # Validate target
    if target not in source_lanes:
        return False, {'error': f'No enemy pieces on lane {target}'}
    source = target

    # Count pieces to move and remove them first (atomic removal)
    pieces_to_move = state.lanes[source].pieces_for(opponent)
    for _ in range(pieces_to_move):
        state.lanes[source].remove_piece(opponent)

    game_won_mid_perk = False

    # Move pieces to random destinations (iterative with win checks)
    moved_to = []
    for _ in range(pieces_to_move):
        if game_won_mid_perk:
            break

        # Find destination lanes with source exclusion
        dest_lanes = [
            i for i, lane in enumerate(state.lanes)
            if lane.winner is None and not lane.is_full_for(opponent)
        ]

        # Source exclusion if threshold lanes available
        if len(dest_lanes) >= state.config.SOURCE_EXCLUSION_THRESHOLD and source in dest_lanes:
            dest_lanes = [l for l in dest_lanes if l != source]

        if not dest_lanes:
            break  # No more valid destinations - piece is lost

        dest = state.rng.choice(dest_lanes)
        state.lanes[dest].add_piece(opponent)
        moved_to.append(dest)

        # Check lane win and game win
        GameRules.check_lane_win(state, dest)
        if GameRules.check_game_win_mid_perk(state):
            game_won_mid_perk = True

    if not moved_to and pieces_to_move > 0:
        return True, {
            'perk': 'DISPERSE',
            'player': player.name,
            'from_lane': source,
            'pieces_moved': 0,
            'note': 'No valid destination lanes - pieces lost'
        }

    return True, {
        'perk': 'DISPERSE',
        'player': player.name,
        'from_lane': source,
        'pieces_moved': len(moved_to),
        'moved_to': moved_to,
        'game_won_mid_perk': game_won_mid_perk
    }


def execute_steal(state: 'GameState', player: 'Player') -> tuple[bool, dict]:
    """
    Steal (Slot 4)
    Effect: Fully automatic - remove 1 random enemy piece, add 1 piece to yourself on random lane.
    No targeting required. Uses Sanctuary/Capture redirection for the removal.

    Args:
        state: Game state
        player: Player executing

    Returns:
        (success, result_dict)
    """
    opponent = player.opponent()

    # Find lanes with enemy pieces
    enemy_lanes = state.get_lanes_with_pieces(opponent)

    # Fail if no enemy pieces to steal
    if not enemy_lanes:
        return False, {'error': 'No enemy pieces to steal'}

    steal_lane = None
    removal_result = None
    if enemy_lanes:
        steal_lane = state.rng.choice(enemy_lanes)
        removal_result = state.remove_piece_with_redirects(steal_lane, opponent, remover=player)

    # Find lane to place our piece
    available = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None and not lane.is_full_for(player)
    ]

    place_lane = None
    if available:
        place_lane = state.rng.choice(available)
        state.lanes[place_lane].add_piece(player)

    # Success as long as something happened
    if steal_lane is None and place_lane is None:
        return False, {'error': 'No enemy pieces to steal and no space for placement'}

    result = {
        'perk': 'STEAL',
        'player': player.name,
        'stolen_from': steal_lane,
        'placed_on': place_lane
    }

    if removal_result and removal_result.get('redirected'):
        result['redirected'] = True
        result['redirect_type'] = removal_result.get('redirect_type')
        result['redirect_destination'] = removal_result.get('destination')
        result['converted'] = removal_result.get('converted', False)

    return True, result


def execute_rush(state: 'GameState', player: 'Player',
                 target: int) -> tuple[bool, dict]:
    """
    Rush (Slot 4)
    Effect: On chosen lane: +2 yours, +2 theirs, -1 YOURS from OTHER lane (or same if no other).
    Net: +1 yours on target, +2 theirs on target.
    IMPORTANT: If the lane is won during piece placement, the "lose 1 piece" step is cancelled.

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory)

    Returns:
        (success, result_dict)
    """
    from src.game.rules import GameRules

    opponent = player.opponent()

    # Find valid lanes (not won)
    valid_lanes = [
        i for i, lane in enumerate(state.lanes)
        if lane.winner is None
    ]

    if not valid_lanes:
        return False, {'error': 'No valid lanes for rush'}

    # Validate target
    if target not in valid_lanes:
        return False, {'error': f'Lane {target} is not valid'}
    lane_idx = target

    lane = state.lanes[lane_idx]
    lane_won_during_placement = False

    # Add pieces to player (up to limit), check lane win after each
    player_added = 0
    for _ in range(state.config.RUSH_PIECES_EACH):
        if lane.winner is not None:
            lane_won_during_placement = True
            break
        if not lane.is_full_for(player):
            lane.add_piece(player)
            player_added += 1
            # Check lane win
            winner = GameRules.check_lane_win(state, lane_idx)
            if winner:
                lane_won_during_placement = True

    # Add pieces to opponent (up to limit), check lane win after each
    opponent_added = 0
    for _ in range(state.config.RUSH_PIECES_EACH):
        if lane.winner is not None:
            lane_won_during_placement = True
            break
        if not lane.is_full_for(opponent):
            lane.add_piece(opponent)
            opponent_added += 1
            # Check lane win
            winner = GameRules.check_lane_win(state, lane_idx)
            if winner:
                lane_won_during_placement = True

    # If lane was won during placement, cancel the "lose 1 piece" step
    player_removed = 0
    player_removed_from = None
    loss_cancelled = False

    if lane_won_during_placement:
        loss_cancelled = True
    else:
        # Remove pieces from PLAYER (prefer other lane, fallback to same)
        other_lanes_with_pieces = [
            i for i in state.get_lanes_with_pieces(player)
            if i != lane_idx
        ]
        for _ in range(state.config.RUSH_PLAYER_LOSS):
            if other_lanes_with_pieces:
                remove_lane = state.rng.choice(other_lanes_with_pieces)
                state.lanes[remove_lane].remove_piece(player)
                player_removed += 1
                player_removed_from = remove_lane
                # Refresh the list in case pieces depleted
                other_lanes_with_pieces = [
                    i for i in state.get_lanes_with_pieces(player)
                    if i != lane_idx
                ]
            elif lane.pieces_for(player) > 0:
                # Fallback to same lane
                lane.remove_piece(player)
                player_removed += 1
                player_removed_from = lane_idx

    return True, {
        'perk': 'RUSH',
        'player': player.name,
        'lane': lane_idx,
        'player_gained': player_added,
        'opponent_gained': opponent_added,
        'player_lost': player_removed,
        'player_lost_from': player_removed_from,
        'loss_cancelled_by_lane_win': loss_cancelled,
        'lane_won': lane_won_during_placement,
        'net_player_on_lane': player_added - (player_removed if player_removed_from == lane_idx else 0),
        'net_opponent_on_lane': opponent_added
    }


def execute_nullify(state: 'GameState', player: 'Player',
                    target: int) -> tuple[bool, dict]:
    """
    Nullify (Slot 4)
    Effect: Cancel and remove ALL triggers/markers on YOUR side of the chosen lane.
    This includes your own triggers if any. Clears all placement and removal triggers.
    Also cancels any pending Raid effects on this lane.

    Per rules: "Can be used defensively to clear opponent's effects, or to cancel
    your own triggers/markers if desired."

    Args:
        state: Game state
        player: Player executing
        target: Target lane (mandatory) - YOUR lane (not won)

    Returns:
        (success, result_dict)
    """
    # Validate target is a valid lane index and not won
    # Nullify can target any non-won lane - it succeeds even if nothing to clear
    if target < 0 or target >= len(state.lanes):
        return False, {'error': f'Invalid lane {target}'}
    if state.lanes[target].winner is not None:
        return False, {'error': f'Lane {target} is already won'}
    lane_idx = target

    lane = state.lanes[lane_idx]

    # Get triggers before clearing for logging (now it's a list of dicts)
    triggers_cleared = [t['type'].name for t in lane.triggers]

    # Clear all triggers on this lane
    lane.clear_triggers()

    # Also clear deferred effects on this lane
    deferred_cleared = len(lane.deferred)
    lane.clear_deferred()

    # Cancel any pending raids on this lane
    # Raid pieces are already on the lane as the opponent's pieces - they stay there
    # but the "raid resolution" (probability check) is cancelled
    raids_cancelled = 0
    remaining_raids = []
    for raid in state.pending_raids:
        if raid['lane'] == lane_idx:
            raids_cancelled += 1
            # The raid piece stays on the lane as a normal enemy piece (already placed)
            # We just don't add it to remaining_raids, so the conversion won't happen
        else:
            remaining_raids.append(raid)
    state.pending_raids = remaining_raids

    return True, {
        'perk': 'NULLIFY',
        'player': player.name,
        'lane': lane_idx,
        'triggers_cleared': triggers_cleared,
        'deferred_cleared': deferred_cleared,
        'raids_cancelled': raids_cancelled
    }
