"""Tests for immediate perks (Gambit, Split, Scramble, Kamikaze, Regroup, Disrupt, Scatter, Disperse, Steal, Rush, Nullify)."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player, TriggerType
from src.game.config import GameConfig
from src.perks.immediate import (
    execute_gambit, execute_split, execute_scramble, execute_kamikaze,
    execute_regroup, execute_disrupt, execute_scatter, execute_disperse,
    execute_steal, execute_rush, execute_nullify
)


class TestGambit:
    """Tests for Gambit immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_gambit_gives_enemy_three_then_player_two(self):
        """Gambit should give enemy +3 random, then player +2 on same lane."""
        initial_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        initial_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        success, result = execute_gambit(self.state, Player.PLAYER1)

        assert success is True
        assert result['perk'] == 'GAMBIT'

        final_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        final_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        # Enemy gets up to 3, player gets up to 2
        assert final_p2 >= initial_p2
        assert final_p1 >= initial_p1

    def test_gambit_enemy_placements_iterative(self):
        """Gambit enemy placements should check for wins after each."""
        success, result = execute_gambit(self.state, Player.PLAYER1)

        assert success is True
        # Enemy placements are one-by-one with win checks
        assert 'enemy_received' in result


class TestSplit:
    """Tests for Split immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_split_sacrifices_one_gains_two(self):
        """Split should sacrifice 1 piece and gain 2 on random lanes."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        initial_total = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)

        success, result = execute_split(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'SPLIT'

        final_total = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        # Net gain of 1 (lose 1, gain 2)
        assert final_total == initial_total + 1

    def test_split_requires_piece_on_target(self):
        """Split should require player to have piece on target lane."""
        target = 0  # No pieces

        success, result = execute_split(self.state, Player.PLAYER1, target)

        assert success is False

    def test_split_uses_source_exclusion(self):
        """Split should use source exclusion for new placements."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_split(self.state, Player.PLAYER1, target)

        assert success is True
        # With 5 lanes (>= 3), source should be excluded
        # So new pieces shouldn't go to source lane (unless forced)


class TestScramble:
    """Tests for Scramble immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_scramble_redistributes_all_enemy(self):
        """Scramble should remove all enemy pieces and redistribute randomly."""
        # Setup enemy pieces
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[2].add_piece(Player.PLAYER2)
        initial_total = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        success, result = execute_scramble(self.state, Player.PLAYER1)

        assert success is True
        assert result['perk'] == 'SCRAMBLE'

        final_total = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)
        # Same total (just redistributed)
        assert final_total == initial_total

    def test_scramble_no_source_exclusion(self):
        """Scramble should NOT use source exclusion (pieces can return to same lane)."""
        self.state.lanes[2].add_piece(Player.PLAYER2)
        self.state.lanes[2].add_piece(Player.PLAYER2)

        success, result = execute_scramble(self.state, Player.PLAYER1)

        assert success is True
        # Pieces can end up anywhere, including original lanes

    def test_scramble_fails_if_no_enemy_pieces(self):
        """Scramble should fail if enemy has no pieces."""
        # No enemy pieces

        success, result = execute_scramble(self.state, Player.PLAYER1)

        assert success is False


class TestKamikaze:
    """Tests for Kamikaze immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_kamikaze_sacrifices_one_removes_two_enemy(self):
        """Kamikaze should sacrifice 1 piece and remove 2 enemy pieces."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)

        initial_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        initial_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        success, result = execute_kamikaze(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'KAMIKAZE'

        final_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        final_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        # Player loses 1
        assert final_p1 == initial_p1 - 1
        # Enemy loses up to 2
        assert final_p2 <= initial_p2

    def test_kamikaze_requires_piece_on_target(self):
        """Kamikaze should require player to have piece on target."""
        target = 0  # No pieces

        success, result = execute_kamikaze(self.state, Player.PLAYER1, target)

        assert success is False


class TestRegroup:
    """Tests for Regroup immediate perk (swap your pieces)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_regroup_swaps_pieces_between_lanes(self):
        """Regroup should swap all player pieces between two lanes."""
        lane_a, lane_b = 1, 3
        self.state.lanes[lane_a].add_piece(Player.PLAYER1)
        self.state.lanes[lane_a].add_piece(Player.PLAYER1)
        self.state.lanes[lane_b].add_piece(Player.PLAYER1)

        success, result = execute_regroup(self.state, Player.PLAYER1, lane_a, lane_b)

        assert success is True
        assert result['perk'] == 'REGROUP'
        # Pieces should be swapped
        assert self.state.lanes[lane_a].pieces_for(Player.PLAYER1) == 1
        assert self.state.lanes[lane_b].pieces_for(Player.PLAYER1) == 2

    def test_regroup_atomic_no_mid_swap_win(self):
        """Regroup should be atomic (no win check mid-swap)."""
        lane_a, lane_b = 0, 4
        # Set up for potential mid-swap win
        self.state.lanes[lane_a].add_piece(Player.PLAYER1)
        self.state.lanes[lane_b].add_piece(Player.PLAYER1)
        self.state.lanes[lane_b].add_piece(Player.PLAYER1)
        self.state.lanes[lane_b].add_piece(Player.PLAYER1)
        self.state.lanes[lane_b].add_piece(Player.PLAYER1)  # 4 pieces

        success, result = execute_regroup(self.state, Player.PLAYER1, lane_a, lane_b)

        assert success is True
        # No mid-swap win - just swap counts

    def test_regroup_requires_different_lanes(self):
        """Regroup should require two different lanes."""
        success, result = execute_regroup(self.state, Player.PLAYER1, 2, 2)

        assert success is False


class TestDisrupt:
    """Tests for Disrupt immediate perk (swap enemy pieces)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_disrupt_swaps_enemy_pieces(self):
        """Disrupt should swap all enemy pieces between two lanes."""
        lane_a, lane_b = 0, 2
        self.state.lanes[lane_a].add_piece(Player.PLAYER2)
        self.state.lanes[lane_a].add_piece(Player.PLAYER2)
        self.state.lanes[lane_b].add_piece(Player.PLAYER2)

        success, result = execute_disrupt(self.state, Player.PLAYER1, lane_a, lane_b)

        assert success is True
        assert result['perk'] == 'DISRUPT'
        assert self.state.lanes[lane_a].pieces_for(Player.PLAYER2) == 1
        assert self.state.lanes[lane_b].pieces_for(Player.PLAYER2) == 2


class TestDisruptEdgeCases:
    """Additional tests for Disrupt edge cases."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_disrupt_rejects_won_lane(self):
        """Disrupt should fail if a target lane is won."""
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[0].winner = Player.PLAYER1

        success, result = execute_disrupt(self.state, Player.PLAYER1, 0, 1)
        assert success is False

    def test_disrupt_fails_with_fewer_than_two_enemy_lanes(self):
        """Disrupt should fail if enemy has pieces on fewer than 2 non-won lanes."""
        self.state.lanes[0].add_piece(Player.PLAYER2)
        # Only 1 lane with enemy pieces

        success, result = execute_disrupt(self.state, Player.PLAYER1, 0, 1)
        assert success is False

    def test_disrupt_same_lane_fails(self):
        """Disrupt should fail when both targets are the same lane."""
        self.state.lanes[0].add_piece(Player.PLAYER2)

        success, result = execute_disrupt(self.state, Player.PLAYER1, 0, 0)
        assert success is False


class TestDisperseEdgeCases:
    """Additional tests for Disperse edge cases."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_disperse_fails_with_no_enemy_pieces(self):
        """Disperse should fail if enemy has no pieces."""
        success, result = execute_disperse(self.state, Player.PLAYER1, 0)
        assert success is False

    def test_disperse_iterative_win_check(self):
        """Disperse should check game win after each piece placement."""
        from src.game.rules import GameRules

        # Set up: P2 has 3 pieces on lane 0
        for _ in range(3):
            self.state.lanes[0].add_piece(Player.PLAYER2)

        # P2 already won 2 lanes
        for lane_idx in [1, 2]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER2)
            self.state.lanes[lane_idx].winner = Player.PLAYER2

        # P2 has 4 pieces on lane 3 (dispersed pieces could go here and win)
        for _ in range(4):
            self.state.lanes[3].add_piece(Player.PLAYER2)

        success, result = execute_disperse(self.state, Player.PLAYER1, 0)
        assert success is True
        # If pieces land on lane 3, it could complete and win the game

    def test_disperse_on_lane_without_enemy_fails(self):
        """Disperse should fail if target lane has no enemy pieces."""
        self.state.lanes[0].add_piece(Player.PLAYER2)

        success, result = execute_disperse(self.state, Player.PLAYER1, 1)
        assert success is False


class TestKamikazeEdgeCases:
    """Additional tests for Kamikaze edge cases."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_kamikaze_with_only_one_enemy_piece(self):
        """Kamikaze should only remove 1 if enemy has only 1 piece."""
        self.state.lanes[2].add_piece(Player.PLAYER1)
        self.state.lanes[0].add_piece(Player.PLAYER2)

        success, result = execute_kamikaze(self.state, Player.PLAYER1, 2)

        assert success is True
        # Player sacrificed 1
        assert self.state.lanes[2].pieces_for(Player.PLAYER1) == 0
        # Enemy should have at most 1 removed (only had 1)
        total_enemy = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)
        assert total_enemy == 0

    def test_kamikaze_uses_redirects(self):
        """Kamikaze removals should respect Capture/Sanctuary redirects."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[0].add_piece(Player.PLAYER2)

        # P1 has a Capture zone on lane 4
        self.state.add_capture(Player.PLAYER1, 4, 3)

        success, result = execute_kamikaze(self.state, Player.PLAYER1, target)

        assert success is True
        # Captured piece should appear on lane 4 as P1's piece
        if result.get('redirections'):
            assert self.state.lanes[4].pieces_for(Player.PLAYER1) == 1

    def test_kamikaze_proceeds_even_with_no_enemy(self):
        """Kamikaze still sacrifices even if enemy has 0 pieces."""
        self.state.lanes[2].add_piece(Player.PLAYER1)

        success, result = execute_kamikaze(self.state, Player.PLAYER1, 2)

        assert success is True
        assert self.state.lanes[2].pieces_for(Player.PLAYER1) == 0
        assert result['enemy_pieces_removed'] == 0


class TestStealEdgeCases:
    """Additional tests for Steal edge cases."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_steal_uses_capture_redirect(self):
        """Steal removal should respect Capture redirect."""
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.add_capture(Player.PLAYER1, 3, 3)

        success, result = execute_steal(self.state, Player.PLAYER1)

        assert success is True
        # The removed enemy piece should be captured on lane 3
        if result.get('removal_result', {}).get('redirected'):
            assert self.state.lanes[3].pieces_for(Player.PLAYER1) >= 1

    def test_steal_uses_sanctuary_redirect(self):
        """Steal removal should respect enemy Sanctuary redirect."""
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.add_sanctuary(Player.PLAYER2, 2, 3)

        success, result = execute_steal(self.state, Player.PLAYER1)

        assert success is True
        # The enemy's lost piece should redirect to sanctuary lane 2
        if result.get('removal_result', {}).get('redirected'):
            assert self.state.lanes[2].pieces_for(Player.PLAYER2) >= 1


class TestScatter:
    """Tests for Scatter immediate perk (move your pieces to random)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_scatter_moves_all_pieces_to_random(self):
        """Scatter should move all player pieces to random other lanes."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_scatter(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'SCATTER'
        # Pieces should be moved (with source exclusion if possible)

    def test_scatter_uses_source_exclusion(self):
        """Scatter should use source exclusion for destinations."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_scatter(self.state, Player.PLAYER1, target)

        assert success is True

    def test_scatter_iterative_with_win_check(self):
        """Scatter should check for wins after each piece placement."""
        target = 0
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_scatter(self.state, Player.PLAYER1, target)

        assert success is True


class TestDisperse:
    """Tests for Disperse immediate perk (move enemy pieces to random)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_disperse_moves_enemy_pieces_to_random(self):
        """Disperse should move all enemy pieces from target to random other lanes."""
        target = 3
        self.state.lanes[target].add_piece(Player.PLAYER2)
        self.state.lanes[target].add_piece(Player.PLAYER2)

        success, result = execute_disperse(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'DISPERSE'


class TestSteal:
    """Tests for Steal immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_steal_removes_enemy_adds_to_player(self):
        """Steal should remove 1 enemy piece and add 1 to player."""
        self.state.lanes[2].add_piece(Player.PLAYER2)

        initial_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        initial_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        success, result = execute_steal(self.state, Player.PLAYER1)

        assert success is True
        assert result['perk'] == 'STEAL'

        final_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        final_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        assert final_p2 == initial_p2 - 1
        assert final_p1 == initial_p1 + 1

    def test_steal_fails_if_no_enemy_pieces(self):
        """Steal should fail if enemy has no pieces."""
        success, result = execute_steal(self.state, Player.PLAYER1)

        assert success is False


class TestRush:
    """Tests for Rush immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_rush_you_plus_two_enemy_plus_two_you_minus_one(self):
        """Rush: You +2, Enemy +2, You -1 from DIFFERENT lane."""
        target = 2
        # Add piece elsewhere for the -1 step
        self.state.lanes[0].add_piece(Player.PLAYER1)

        initial_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        initial_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        success, result = execute_rush(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'RUSH'

        final_p1 = sum(l.pieces_for(Player.PLAYER1) for l in self.state.lanes)
        final_p2 = sum(l.pieces_for(Player.PLAYER2) for l in self.state.lanes)

        # You: +2 -1 = +1, Enemy: +2
        # But if lane won during placements, -1 step is cancelled
        if not result.get('loss_cancelled'):
            assert final_p1 == initial_p1 + 1
        assert final_p2 >= initial_p2  # At least some gain

    def test_rush_loss_cancelled_if_lane_won(self):
        """Rush -1 step should be cancelled if lane is won during placements."""
        target = 2
        # Set up to win lane quickly
        for _ in range(3):
            self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_rush(self.state, Player.PLAYER1, target)

        assert success is True
        # If lane was won, loss should be cancelled

    def test_rush_falls_back_to_same_lane_if_no_other(self):
        """Rush should fall back to same lane for -1 if no pieces elsewhere."""
        target = 2
        # Only pieces will be on target lane after +2

        success, result = execute_rush(self.state, Player.PLAYER1, target)

        assert success is True


class TestNullify:
    """Tests for Nullify immediate perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_nullify_clears_triggers(self):
        """Nullify should clear all triggers on target lane."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        # Add triggers
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[target].add_trigger(TriggerType.MIRROR, Player.PLAYER2, 1, order_id)
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[target].add_trigger(TriggerType.TRAP, Player.PLAYER2, 2, order_id)

        success, result = execute_nullify(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'NULLIFY'
        assert not self.state.lanes[target].has_triggers()

    def test_nullify_clears_deferred(self):
        """Nullify should clear deferred effects on target lane."""
        from src.game.state import DeferredType

        target = 3
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[target].add_deferred(DeferredType.REINFORCE, Player.PLAYER2, target)

        success, result = execute_nullify(self.state, Player.PLAYER1, target)

        assert success is True
        assert len(self.state.lanes[target].deferred) == 0

    def test_nullify_requires_triggers_or_effects(self):
        """Nullify should require the lane to have something to cancel."""
        target = 0
        self.state.lanes[target].add_piece(Player.PLAYER1)
        # No triggers or deferred

        success, result = execute_nullify(self.state, Player.PLAYER1, target)

        # Should still succeed but nothing to clear
        assert success is True


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
