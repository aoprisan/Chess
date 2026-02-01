"""Game rules and validation."""

from typing import Optional
from .state import GameState, Player, TurnPhase


class GameRules:
    """Static validation methods for game rules."""

    @staticmethod
    def can_place_piece(state: GameState, player: Player, lane: int) -> bool:
        """Check if player can place a piece on the given lane."""
        if lane < 0 or lane >= state.config.LANES:
            return False

        lane_state = state.lanes[lane]

        # Can't place on won lanes
        if lane_state.winner is not None:
            return False

        # Can't place if lane is full for player
        if lane_state.is_full_for(player):
            return False

        # Can't place if lane is frozen for player
        if lane_state.is_frozen_for(player):
            return False

        return True

    @staticmethod
    def can_remove_piece(state: GameState, player: Player, lane: int) -> bool:
        """Check if player can remove an opponent's piece from the given lane."""
        if lane < 0 or lane >= state.config.LANES:
            return False

        lane_state = state.lanes[lane]
        opponent = player.opponent()

        # Can't remove from won lanes
        if lane_state.winner is not None:
            return False

        # Need at least one opponent piece to remove
        if lane_state.pieces_for(opponent) <= 0:
            return False

        return True

    @staticmethod
    def get_valid_placement_lanes(state: GameState, player: Player) -> list[int]:
        """Get all lanes where player can place a piece."""
        return [i for i in range(state.config.LANES)
                if GameRules.can_place_piece(state, player, i)]

    @staticmethod
    def get_valid_removal_lanes(state: GameState, player: Player) -> list[int]:
        """Get all lanes where player can remove an opponent's piece."""
        return [i for i in range(state.config.LANES)
                if GameRules.can_remove_piece(state, player, i)]

    @staticmethod
    def check_lane_win(state: GameState, lane: int, current_player: Optional[Player] = None) -> Optional[Player]:
        """
        Check if a lane has been won and return winner.
        If lane is won, cleanup_won_lane is called to remove all effects.

        Args:
            state: Game state
            lane: Lane index to check
            current_player: Player who just acted (prioritized on ties)
        """
        if lane < 0 or lane >= state.config.LANES:
            return None

        lane_state = state.lanes[lane]

        # Skip if already won
        if lane_state.winner is not None:
            return lane_state.winner

        # Pass current player for tie-breaking priority
        winner = lane_state.check_winner(current_player if current_player else state.current_player)

        # If lane was just won, clean it up
        if winner is not None:
            state.cleanup_won_lane(lane)

        return winner

    @staticmethod
    def check_game_win_mid_perk(state: GameState) -> bool:
        """
        Check if game has been won. Use this during iterative perk operations.
        Returns True if game is over, perk should terminate.
        """
        return state.check_game_over()

    @staticmethod
    def check_game_over(state: GameState) -> bool:
        """Check if the game is over."""
        return state.check_game_over()

    @staticmethod
    def is_perk_available(state: GameState, player: Player, perk_type: str) -> bool:
        """Check if a perk can be used in the current game state."""
        # Import here to avoid circular imports
        from src.perks.base import PerkType

        try:
            perk = PerkType[perk_type]
        except KeyError:
            return False

        # Slot 1: PlaceAnother - needs available lane
        if perk == PerkType.PLACE_ANOTHER:
            return len(GameRules.get_valid_placement_lanes(state, player)) > 0

        # Slot 2: RemoveEnemy - needs enemy piece to remove
        if perk == PerkType.REMOVE_ENEMY:
            return len(GameRules.get_valid_removal_lanes(state, player)) > 0

        # Freeze - needs unfrozen lane
        if perk == PerkType.FREEZE:
            # Can freeze any lane that isn't already frozen or won
            for lane in state.lanes:
                if lane.winner is None and lane.freeze_turns == 0:
                    return True
            return False

        # Gambit - always available (give them 3, get 2)
        if perk == PerkType.GAMBIT:
            return True

        # Split - needs own piece to sacrifice
        if perk == PerkType.SPLIT:
            return len(state.get_lanes_with_pieces(player)) > 0

        # Default: available
        return True

    @staticmethod
    def get_available_perks(state: GameState, player: Player, slot: int) -> list[str]:
        """Get list of available perks for a slot."""
        from src.perks.base import get_perks_for_slot

        all_perks = get_perks_for_slot(slot)
        return [p for p in all_perks if GameRules.is_perk_available(state, player, p)]
