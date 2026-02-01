"""Tests for duration perks (Freeze, Cloak, Blind, Sanctuary, Capture)."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player
from src.game.config import GameConfig
from src.perks.duration import (
    execute_cloak, execute_blind, execute_sanctuary, execute_capture
)
from src.perks.immediate import execute_freeze  # Note: Freeze is in immediate.py


class TestFreeze:
    """Tests for Freeze duration perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_freeze_blocks_lane(self):
        """Freeze should block a lane for the opponent."""
        target = 2
        success, result = execute_freeze(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'FREEZE'
        assert self.state.lanes[target].is_frozen_for(Player.PLAYER2)
        assert self.state.lanes[target].freeze_turns == self.state.config.FREEZE_DURATION

    def test_freeze_does_not_affect_owner(self):
        """Freeze should not block the lane for the player who set it."""
        target = 1
        execute_freeze(self.state, Player.PLAYER1, target)

        assert not self.state.lanes[target].is_frozen_for(Player.PLAYER1)

    def test_freeze_expires_after_turns(self):
        """Freeze should expire after specified turns."""
        target = 3
        execute_freeze(self.state, Player.PLAYER1, target)

        # Simulate turn switch (which decrements freeze)
        self.state.switch_player()

        assert self.state.lanes[target].freeze_turns == 0
        assert not self.state.lanes[target].is_frozen_for(Player.PLAYER2)

    def test_freeze_on_won_lane_fails(self):
        """Freeze should fail on won lanes."""
        target = 0
        self.state.lanes[target].winner = Player.PLAYER1

        success, result = execute_freeze(self.state, Player.PLAYER1, target)

        assert success is False


class TestCloak:
    """Tests for Cloak duration perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_cloak_hides_player_field(self):
        """Cloak should hide player's entire field from opponent."""
        success, result = execute_cloak(self.state, Player.PLAYER1)

        assert success is True
        assert result['perk'] == 'CLOAK'
        assert self.state.is_cloaked(Player.PLAYER1)
        assert self.state.player1_cloaked == self.state.config.CLOAK_DURATION

    def test_cloak_does_not_affect_opponent(self):
        """Cloak should not hide opponent's field."""
        execute_cloak(self.state, Player.PLAYER1)

        assert not self.state.is_cloaked(Player.PLAYER2)

    def test_cloak_expires_after_turns(self):
        """Cloak should expire after specified turns."""
        execute_cloak(self.state, Player.PLAYER1)

        # Simulate turn switches (2 turns = CLOAK_DURATION)
        for _ in range(self.state.config.CLOAK_DURATION):
            self.state.switch_player()

        assert not self.state.is_cloaked(Player.PLAYER1)


class TestBlind:
    """Tests for Blind duration perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_blind_blinds_opponent(self):
        """Blind should make opponent unable to see player's pieces."""
        success, result = execute_blind(self.state, Player.PLAYER1)

        assert success is True
        assert result['perk'] == 'BLIND'
        assert self.state.is_blinded(Player.PLAYER2)
        assert self.state.player2_blinded == self.state.config.BLIND_DURATION

    def test_blind_does_not_affect_caster(self):
        """Blind should not affect the caster."""
        execute_blind(self.state, Player.PLAYER1)

        assert not self.state.is_blinded(Player.PLAYER1)

    def test_blind_expires_after_turns(self):
        """Blind should expire after specified turns."""
        execute_blind(self.state, Player.PLAYER1)

        for _ in range(self.state.config.BLIND_DURATION):
            self.state.switch_player()

        assert not self.state.is_blinded(Player.PLAYER2)


class TestSanctuary:
    """Tests for Sanctuary duration perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_sanctuary_sets_redirect(self):
        """Sanctuary should set a redirect for lost pieces."""
        target = 2
        success, result = execute_sanctuary(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'SANCTUARY'
        assert self.state.has_sanctuary(Player.PLAYER1)

    def test_sanctuary_redirects_lost_pieces(self):
        """Sanctuary should redirect lost pieces to sanctuary lane."""
        sanctuary_lane = 2
        source_lane = 0
        execute_sanctuary(self.state, Player.PLAYER1, sanctuary_lane)

        # Add piece to source and then remove it
        self.state.lanes[source_lane].add_piece(Player.PLAYER1)
        removal_result = self.state.remove_piece_with_redirects(
            source_lane, Player.PLAYER1, remover=Player.PLAYER2
        )

        assert removal_result['redirected'] is True
        assert removal_result['redirect_type'] == 'sanctuary'
        assert removal_result['destination'] == sanctuary_lane
        assert self.state.lanes[sanctuary_lane].pieces_for(Player.PLAYER1) == 1

    def test_sanctuary_expires_after_turns(self):
        """Sanctuary should expire after specified turns."""
        target = 1
        execute_sanctuary(self.state, Player.PLAYER1, target)

        for _ in range(self.state.config.SANCTUARY_DURATION):
            self.state.switch_player()

        assert not self.state.has_sanctuary(Player.PLAYER1)

    def test_multiple_sanctuaries_can_be_active(self):
        """Multiple sanctuaries can be active simultaneously."""
        execute_sanctuary(self.state, Player.PLAYER1, 0)
        execute_sanctuary(self.state, Player.PLAYER1, 2)

        assert len(self.state.player1_sanctuaries) == 2

    def test_sanctuary_on_won_lane_fails(self):
        """Sanctuary should fail on won lanes."""
        target = 3
        self.state.lanes[target].winner = Player.PLAYER2

        success, result = execute_sanctuary(self.state, Player.PLAYER1, target)

        assert success is False


class TestCapture:
    """Tests for Capture duration perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_capture_sets_redirect(self):
        """Capture should set a redirect for removed enemy pieces."""
        target = 3
        success, result = execute_capture(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'CAPTURE'
        assert self.state.has_capture(Player.PLAYER1)

    def test_capture_converts_enemy_pieces(self):
        """Capture should convert removed enemy pieces to player's pieces."""
        capture_lane = 3
        source_lane = 0
        execute_capture(self.state, Player.PLAYER1, capture_lane)

        # Add enemy piece and remove it
        self.state.lanes[source_lane].add_piece(Player.PLAYER2)
        removal_result = self.state.remove_piece_with_redirects(
            source_lane, Player.PLAYER2, remover=Player.PLAYER1
        )

        assert removal_result['redirected'] is True
        assert removal_result['redirect_type'] == 'capture'
        assert removal_result['destination'] == capture_lane
        assert removal_result['converted'] is True
        assert self.state.lanes[capture_lane].pieces_for(Player.PLAYER1) == 1
        assert self.state.lanes[source_lane].pieces_for(Player.PLAYER2) == 0

    def test_capture_expires_after_turns(self):
        """Capture should expire after specified turns."""
        target = 2
        execute_capture(self.state, Player.PLAYER1, target)

        for _ in range(self.state.config.CAPTURE_DURATION):
            self.state.switch_player()

        assert not self.state.has_capture(Player.PLAYER1)

    def test_multiple_captures_can_be_active(self):
        """Multiple capture zones can be active simultaneously."""
        execute_capture(self.state, Player.PLAYER1, 1)
        execute_capture(self.state, Player.PLAYER1, 4)

        assert len(self.state.player1_captures) == 2

    def test_capture_takes_priority_over_sanctuary(self):
        """Capture should take priority over enemy's Sanctuary."""
        capture_lane = 0
        sanctuary_lane = 4
        source_lane = 2

        execute_capture(self.state, Player.PLAYER1, capture_lane)
        self.state.add_sanctuary(Player.PLAYER2, sanctuary_lane, 3)

        self.state.lanes[source_lane].add_piece(Player.PLAYER2)
        removal_result = self.state.remove_piece_with_redirects(
            source_lane, Player.PLAYER2, remover=Player.PLAYER1
        )

        # Capture takes priority
        assert removal_result['redirect_type'] == 'capture'
        assert self.state.lanes[capture_lane].pieces_for(Player.PLAYER1) == 1


class TestDurationCleanupOnLaneWin:
    """Tests for duration effect cleanup when lanes are won."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_sanctuary_removed_when_lane_won(self):
        """Sanctuary pointing to won lane should be removed."""
        sanctuary_lane = 2
        execute_sanctuary(self.state, Player.PLAYER1, sanctuary_lane)

        # Win the lane
        for _ in range(5):
            self.state.lanes[sanctuary_lane].add_piece(Player.PLAYER1)
        self.state.lanes[sanctuary_lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(sanctuary_lane)

        # Sanctuary should be removed
        assert sanctuary_lane not in [l for l, _ in self.state.player1_sanctuaries]

    def test_capture_removed_when_lane_won(self):
        """Capture zone on won lane should be removed."""
        capture_lane = 1
        execute_capture(self.state, Player.PLAYER1, capture_lane)

        # Win the lane
        for _ in range(5):
            self.state.lanes[capture_lane].add_piece(Player.PLAYER1)
        self.state.lanes[capture_lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(capture_lane)

        # Capture should be removed
        assert capture_lane not in [l for l, _ in self.state.player1_captures]


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
