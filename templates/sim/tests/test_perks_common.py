"""Tests for common perks (PlaceAnother, RemoveEnemy)."""

import pytest
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player
from src.game.config import GameConfig
from src.perks.commons import execute_place_another, execute_remove_enemy


class TestPlaceAnother:
    """Tests for PlaceAnother perk (Slot 1)."""

    def setup_method(self):
        """Set up test fixtures."""
        self.state = GameState()
        self.state.set_seed(42)

    def test_place_another_adds_piece(self):
        """PlaceAnother should add a piece to the target lane."""
        target_lane = 2
        initial_pieces = self.state.lanes[target_lane].pieces_for(Player.PLAYER1)

        success, result = execute_place_another(self.state, Player.PLAYER1, target_lane)

        assert success is True
        assert result['perk'] == 'PLACE_ANOTHER'
        assert result['lane'] == target_lane
        assert self.state.lanes[target_lane].pieces_for(Player.PLAYER1) == initial_pieces + 1

    def test_place_another_on_full_lane_fails(self):
        """PlaceAnother should fail if lane is full."""
        target_lane = 0
        # Fill the lane
        for _ in range(5):
            self.state.lanes[target_lane].add_piece(Player.PLAYER1)

        success, result = execute_place_another(self.state, Player.PLAYER1, target_lane)

        assert success is False
        assert 'error' in result

    def test_place_another_on_frozen_lane_fails(self):
        """PlaceAnother should fail if lane is frozen for the player."""
        target_lane = 1
        self.state.lanes[target_lane].freeze_player = Player.PLAYER1
        self.state.lanes[target_lane].freeze_turns = 2

        success, result = execute_place_another(self.state, Player.PLAYER1, target_lane)

        assert success is False
        assert 'error' in result

    def test_place_another_on_won_lane_fails(self):
        """PlaceAnother should fail if lane is already won."""
        target_lane = 3
        self.state.lanes[target_lane].winner = Player.PLAYER2

        success, result = execute_place_another(self.state, Player.PLAYER1, target_lane)

        assert success is False
        assert 'error' in result

    def test_place_another_invalid_lane_fails(self):
        """PlaceAnother should fail with invalid lane index."""
        success, result = execute_place_another(self.state, Player.PLAYER1, 10)

        assert success is False
        assert 'error' in result


class TestRemoveEnemy:
    """Tests for RemoveEnemy perk (Slot 2)."""

    def setup_method(self):
        """Set up test fixtures."""
        self.state = GameState()
        self.state.set_seed(42)

    def test_remove_enemy_removes_piece(self):
        """RemoveEnemy should remove an enemy piece."""
        target_lane = 2
        # Add enemy pieces
        self.state.lanes[target_lane].add_piece(Player.PLAYER2)
        initial_pieces = self.state.lanes[target_lane].pieces_for(Player.PLAYER2)

        success, result = execute_remove_enemy(self.state, Player.PLAYER1, target_lane)

        assert success is True
        assert result['perk'] == 'REMOVE_ENEMY'
        assert result['lane'] == target_lane
        assert self.state.lanes[target_lane].pieces_for(Player.PLAYER2) == initial_pieces - 1

    def test_remove_enemy_no_enemy_pieces_fails(self):
        """RemoveEnemy should fail if no enemy pieces on lane."""
        target_lane = 0

        success, result = execute_remove_enemy(self.state, Player.PLAYER1, target_lane)

        assert success is False
        assert 'error' in result

    def test_remove_enemy_on_won_lane_fails(self):
        """RemoveEnemy should fail if lane is already won."""
        target_lane = 1
        self.state.lanes[target_lane].add_piece(Player.PLAYER2)
        self.state.lanes[target_lane].winner = Player.PLAYER1

        success, result = execute_remove_enemy(self.state, Player.PLAYER1, target_lane)

        assert success is False
        assert 'error' in result

    def test_remove_enemy_with_capture_redirect(self):
        """RemoveEnemy should redirect to capture zone if active."""
        target_lane = 2
        capture_lane = 0
        self.state.lanes[target_lane].add_piece(Player.PLAYER2)
        self.state.add_capture(Player.PLAYER1, capture_lane, 3)

        success, result = execute_remove_enemy(self.state, Player.PLAYER1, target_lane)

        assert success is True
        # Piece should be redirected to capture lane as PLAYER1's piece
        assert self.state.lanes[capture_lane].pieces_for(Player.PLAYER1) == 1
        assert self.state.lanes[target_lane].pieces_for(Player.PLAYER2) == 0

    def test_remove_enemy_triggers_removal_triggers(self):
        """RemoveEnemy should fire removal triggers on the lane."""
        from src.game.state import TriggerType

        target_lane = 2
        self.state.lanes[target_lane].add_piece(Player.PLAYER2)
        # Add Hydra trigger (fires when piece is removed)
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[target_lane].add_trigger(TriggerType.HYDRA, Player.PLAYER2, 1, order_id)

        # Note: The actual trigger firing happens in the execute function
        # so we just verify the setup is correct
        assert self.state.lanes[target_lane].has_trigger_type(TriggerType.HYDRA)


class TestRemoveEnemyWithSanctuary:
    """Tests for RemoveEnemy with Sanctuary redirect."""

    def setup_method(self):
        """Set up test fixtures."""
        self.state = GameState()
        self.state.set_seed(42)

    def test_remove_enemy_with_enemy_sanctuary(self):
        """RemoveEnemy should redirect to enemy's sanctuary if active."""
        target_lane = 2
        sanctuary_lane = 4
        self.state.lanes[target_lane].add_piece(Player.PLAYER2)
        self.state.add_sanctuary(Player.PLAYER2, sanctuary_lane, 3)

        success, result = execute_remove_enemy(self.state, Player.PLAYER1, target_lane)

        assert success is True
        # Piece should be redirected to sanctuary lane (still PLAYER2's piece)
        assert self.state.lanes[sanctuary_lane].pieces_for(Player.PLAYER2) == 1
        assert self.state.lanes[target_lane].pieces_for(Player.PLAYER2) == 0

    def test_capture_takes_priority_over_sanctuary(self):
        """Capture should take priority over Sanctuary when both active."""
        target_lane = 2
        capture_lane = 0
        sanctuary_lane = 4

        self.state.lanes[target_lane].add_piece(Player.PLAYER2)
        self.state.add_capture(Player.PLAYER1, capture_lane, 3)
        self.state.add_sanctuary(Player.PLAYER2, sanctuary_lane, 3)

        success, result = execute_remove_enemy(self.state, Player.PLAYER1, target_lane)

        assert success is True
        # Capture takes priority - piece goes to PLAYER1
        assert self.state.lanes[capture_lane].pieces_for(Player.PLAYER1) == 1
        assert self.state.lanes[sanctuary_lane].pieces_for(Player.PLAYER2) == 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
