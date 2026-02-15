"""Tests for perk dispatch system, slot/pool assignment, and target validation."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.config import GameConfig
from src.game.state import GameState, Player
from src.perks.base import (
    execute_perk, get_perks_for_slot,
    SLOT_3_PERKS, SLOT_4_PERKS, NO_TARGET_PERKS, TWO_TARGET_PERKS
)


# =============================================================================
# Slot/Pool System Tests
# =============================================================================

class TestGetPerksForSlot:
    """Tests for get_perks_for_slot function."""

    def test_slot_1_returns_place_another(self):
        result = get_perks_for_slot(1)
        assert result == ['PLACE_ANOTHER']

    def test_slot_2_returns_remove_enemy(self):
        result = get_perks_for_slot(2)
        assert result == ['REMOVE_ENEMY']

    def test_slot_3_returns_15_perks(self):
        result = get_perks_for_slot(3)
        assert len(result) == 15
        assert result == SLOT_3_PERKS

    def test_slot_4_returns_15_perks(self):
        result = get_perks_for_slot(4)
        assert len(result) == 15
        assert result == SLOT_4_PERKS

    def test_invalid_slot_returns_empty(self):
        assert get_perks_for_slot(0) == []
        assert get_perks_for_slot(5) == []
        assert get_perks_for_slot(-1) == []

    def test_slot_3_and_4_have_no_overlap(self):
        slot3 = set(get_perks_for_slot(3))
        slot4 = set(get_perks_for_slot(4))
        assert slot3.isdisjoint(slot4)

    def test_all_32_perks_assigned(self):
        all_perks = (
            get_perks_for_slot(1) + get_perks_for_slot(2) +
            get_perks_for_slot(3) + get_perks_for_slot(4)
        )
        assert len(all_perks) == 32
        assert len(set(all_perks)) == 32  # no duplicates

    def test_custom_config_slot3(self):
        """get_perks_for_slot with config returns config's pool."""
        config = GameConfig(slot3_pool=('FREEZE', 'TRAP'))
        result = get_perks_for_slot(3, config=config)
        assert result == ['FREEZE', 'TRAP']

    def test_custom_config_slot4(self):
        config = GameConfig(slot4_pool=('SPLIT', 'RUSH'))
        result = get_perks_for_slot(4, config=config)
        assert result == ['SPLIT', 'RUSH']

    def test_custom_config_does_not_affect_slot1_slot2(self):
        config = GameConfig(slot3_pool=('FREEZE',), slot4_pool=('SPLIT',))
        assert get_perks_for_slot(1, config=config) == ['PLACE_ANOTHER']
        assert get_perks_for_slot(2, config=config) == ['REMOVE_ENEMY']

    def test_no_config_returns_defaults(self):
        """Without config, slot 3/4 return module-level constants."""
        assert get_perks_for_slot(3) == SLOT_3_PERKS
        assert get_perks_for_slot(4) == SLOT_4_PERKS


# =============================================================================
# Target Validation Constants Tests
# =============================================================================

class TestTargetConstants:
    """Tests that NO_TARGET_PERKS and TWO_TARGET_PERKS are correct."""

    def test_no_target_perks_set(self):
        assert NO_TARGET_PERKS == {'SCRAMBLE', 'GAMBIT', 'STEAL', 'CLOAK', 'BLIND'}

    def test_two_target_perks_set(self):
        assert TWO_TARGET_PERKS == {'REGROUP', 'DISRUPT'}


# =============================================================================
# execute_perk Dispatch Tests
# =============================================================================

class TestExecutePerkDispatch:
    """Tests for the execute_perk dispatch function."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_invalid_perk_name_returns_error(self):
        success, result = execute_perk(self.state, Player.PLAYER1, 'NONEXISTENT')
        assert success is False
        assert 'error' in result

    def test_no_target_perk_succeeds_without_target(self):
        """No-target perks like CLOAK should work without a target."""
        success, result = execute_perk(self.state, Player.PLAYER1, 'CLOAK')
        assert success is True

    def test_single_target_perk_fails_without_target(self):
        """Single-target perks should fail when no target is provided."""
        success, result = execute_perk(self.state, Player.PLAYER1, 'PLACE_ANOTHER')
        assert success is False
        assert 'requires a target' in result['error']

    def test_two_target_perk_fails_with_none_target(self):
        """Two-target perks should fail when target is None."""
        success, result = execute_perk(self.state, Player.PLAYER1, 'DISRUPT')
        assert success is False
        assert 'requires two targets' in result['error']

    def test_two_target_perk_fails_with_list(self):
        """Two-target perks should fail when given a list instead of tuple."""
        # This was the actual bug we found
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)
        success, result = execute_perk(self.state, Player.PLAYER1, 'DISRUPT', [0, 1])
        assert success is False
        assert 'requires two targets' in result['error']

    def test_two_target_perk_fails_with_single_int(self):
        """Two-target perks should fail when given a single int."""
        success, result = execute_perk(self.state, Player.PLAYER1, 'REGROUP', 0)
        assert success is False
        assert 'requires two targets' in result['error']

    def test_two_target_perk_fails_with_wrong_length_tuple(self):
        """Two-target perks should fail when tuple has wrong length."""
        success, result = execute_perk(self.state, Player.PLAYER1, 'DISRUPT', (0, 1, 2))
        assert success is False
        assert 'requires two targets' in result['error']

    def test_two_target_perk_succeeds_with_tuple(self):
        """Two-target perks should succeed with a proper tuple."""
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)
        success, result = execute_perk(self.state, Player.PLAYER1, 'DISRUPT', (0, 1))
        assert success is True

    def test_single_target_perk_succeeds_with_target(self):
        """Single-target perks should succeed with a valid target."""
        success, result = execute_perk(self.state, Player.PLAYER1, 'PLACE_ANOTHER', 0)
        assert success is True

    def test_all_perks_have_executors(self):
        """Every perk in slots 1-4 should have an executor registered."""
        all_perks = (
            get_perks_for_slot(1) + get_perks_for_slot(2) +
            get_perks_for_slot(3) + get_perks_for_slot(4)
        )
        for perk_name in all_perks:
            # Just verify they don't return "not implemented"
            # We pass None target, so single/two-target perks will fail with
            # "requires a target" rather than "not implemented"
            success, result = execute_perk(self.state, Player.PLAYER1, perk_name)
            if not success:
                assert 'not implemented' not in result.get('error', ''), \
                    f"Perk {perk_name} has no executor"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
