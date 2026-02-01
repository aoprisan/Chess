"""Tests for deferred perks (Signal, Enlist, Ambush, Reinforce, Raid)."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player, DeferredType
from src.game.config import GameConfig
from src.perks.deferred import (
    execute_signal, execute_enlist, execute_ambush, execute_reinforce,
    execute_raid, process_deferred_effects, process_pending_raids
)


class TestSignal:
    """Tests for Signal deferred perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_signal_immediate_placement(self):
        """Signal should immediately place a piece on target lane."""
        target = 2
        initial = self.state.lanes[target].pieces_for(Player.PLAYER1)

        success, result = execute_signal(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'SIGNAL'
        assert result['immediate_placed'] is True
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == initial + 1

    def test_signal_adds_deferred_effect(self):
        """Signal should add a deferred effect for next turn."""
        target = 3
        execute_signal(self.state, Player.PLAYER1, target)

        # Check deferred effect was added
        deferred = self.state.lanes[target].deferred
        assert len(deferred) == 1
        assert deferred[0]['type'] == DeferredType.SIGNAL
        assert deferred[0]['owner'] == Player.PLAYER1

    def test_signal_deferred_pulls_from_most_populated(self):
        """Signal deferred effect should pull from most populated lane."""
        target = 2
        # Set up: lane 0 has most pieces
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[1].add_piece(Player.PLAYER1)

        execute_signal(self.state, Player.PLAYER1, target)

        # Process deferred effects
        results = process_deferred_effects(self.state, Player.PLAYER1)

        # Should have pulled from lane 0 (most populated)
        assert len(results) > 0
        signal_result = [r for r in results if r['type'] == 'SIGNAL'][0]
        assert signal_result['success'] is True
        assert signal_result['pulled_from'] == 0

    def test_signal_on_full_lane_fails(self):
        """Signal should fail if target lane is full."""
        target = 1
        for _ in range(5):
            self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_signal(self.state, Player.PLAYER1, target)

        assert success is False


class TestEnlist:
    """Tests for Enlist deferred perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_enlist_immediate_placement(self):
        """Enlist should immediately place a piece on target lane."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)  # Must have pieces
        initial = self.state.lanes[target].pieces_for(Player.PLAYER1)

        success, result = execute_enlist(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'ENLIST'
        assert result['immediate_placed'] is True
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == initial + 1

    def test_enlist_requires_player_pieces(self):
        """Enlist should require player to have pieces on target lane."""
        target = 0  # No pieces

        success, result = execute_enlist(self.state, Player.PLAYER1, target)

        assert success is False

    def test_enlist_deferred_captures_and_moves(self):
        """Enlist deferred effect should capture enemy and move both to least populated."""
        target = 2
        # Setup: player pieces on target, enemy piece on target
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[target].add_piece(Player.PLAYER2)  # Enemy to capture
        # Lane 4 is empty (least populated)

        execute_enlist(self.state, Player.PLAYER1, target)

        # Process deferred
        results = process_deferred_effects(self.state, Player.PLAYER1)

        enlist_result = [r for r in results if r['type'] == 'ENLIST'][0]
        assert enlist_result['success'] is True
        assert enlist_result['enemy_captured'] is True

    def test_enlist_without_enemy_only_moves_own(self):
        """Enlist should only move own piece if no enemy to capture."""
        target = 3
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[target].add_piece(Player.PLAYER1)
        # No enemy pieces

        execute_enlist(self.state, Player.PLAYER1, target)
        results = process_deferred_effects(self.state, Player.PLAYER1)

        enlist_result = [r for r in results if r['type'] == 'ENLIST'][0]
        assert enlist_result['success'] is True
        assert enlist_result['enemy_captured'] is False


class TestAmbush:
    """Tests for Ambush deferred perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_ambush_immediate_placement(self):
        """Ambush should immediately place a piece on target lane."""
        target = 1
        initial = self.state.lanes[target].pieces_for(Player.PLAYER1)

        success, result = execute_ambush(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'AMBUSH'
        assert result['immediate_placed'] is True
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == initial + 1

    def test_ambush_adds_deferred_effect(self):
        """Ambush should add a deferred effect."""
        target = 2
        execute_ambush(self.state, Player.PLAYER1, target)

        deferred = self.state.lanes[target].deferred
        assert len(deferred) == 1
        assert deferred[0]['type'] == DeferredType.AMBUSH

    def test_ambush_removes_from_target_or_adjacent(self):
        """Ambush deferred should remove enemy from target or adjacent lanes."""
        target = 2  # Middle lane, adjacent = 1, 3
        self.state.lanes[1].add_piece(Player.PLAYER2)  # Adjacent lane

        execute_ambush(self.state, Player.PLAYER1, target)
        results = process_deferred_effects(self.state, Player.PLAYER1)

        ambush_result = [r for r in results if r['type'] == 'AMBUSH'][0]
        assert ambush_result['success'] is True
        assert ambush_result['removed_from_lane'] in [1, 2, 3]

    def test_ambush_no_adjacent_lanes_at_edge(self):
        """Ambush at edge lane should only check valid adjacent lanes."""
        target = 0  # Edge lane, only adjacent to 1
        self.state.lanes[1].add_piece(Player.PLAYER2)

        execute_ambush(self.state, Player.PLAYER1, target)
        results = process_deferred_effects(self.state, Player.PLAYER1)

        ambush_result = [r for r in results if r['type'] == 'AMBUSH'][0]
        assert ambush_result['success'] is True
        assert ambush_result['removed_from_lane'] in [0, 1]

    def test_ambush_fails_if_no_enemies(self):
        """Ambush deferred should fail if no enemy pieces nearby."""
        target = 2
        # No enemy pieces

        execute_ambush(self.state, Player.PLAYER1, target)
        results = process_deferred_effects(self.state, Player.PLAYER1)

        ambush_result = [r for r in results if r['type'] == 'AMBUSH'][0]
        assert ambush_result['success'] is False


class TestReinforce:
    """Tests for Reinforce deferred perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_reinforce_immediate_placement(self):
        """Reinforce should immediately place a piece on target lane."""
        target = 3
        initial = self.state.lanes[target].pieces_for(Player.PLAYER1)

        success, result = execute_reinforce(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'REINFORCE'
        assert result['immediate_placed'] is True
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == initial + 1

    def test_reinforce_deferred_adds_another_piece(self):
        """Reinforce deferred should add another piece to same lane."""
        target = 1
        execute_reinforce(self.state, Player.PLAYER1, target)

        initial = self.state.lanes[target].pieces_for(Player.PLAYER1)
        results = process_deferred_effects(self.state, Player.PLAYER1)

        reinforce_result = [r for r in results if r['type'] == 'REINFORCE'][0]
        assert reinforce_result['success'] is True
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == initial + 1

    def test_reinforce_deferred_fails_if_lane_full(self):
        """Reinforce deferred should fail if lane becomes full."""
        target = 0
        execute_reinforce(self.state, Player.PLAYER1, target)

        # Fill the lane before deferred resolves
        while not self.state.lanes[target].is_full_for(Player.PLAYER1):
            self.state.lanes[target].add_piece(Player.PLAYER1)

        results = process_deferred_effects(self.state, Player.PLAYER1)

        reinforce_result = [r for r in results if r['type'] == 'REINFORCE'][0]
        assert reinforce_result['success'] is False


class TestRaid:
    """Tests for Raid deferred perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_raid_places_on_enemy_side(self):
        """Raid should place a piece on enemy's side (counts as enemy piece)."""
        target = 2
        initial_p2 = self.state.lanes[target].pieces_for(Player.PLAYER2)

        success, result = execute_raid(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'RAID'
        # Raid piece counts as enemy piece on their side
        assert self.state.lanes[target].pieces_for(Player.PLAYER2) == initial_p2 + 1

    def test_raid_creates_pending_raid(self):
        """Raid should create a pending raid for resolution."""
        target = 3
        execute_raid(self.state, Player.PLAYER1, target)

        assert len(self.state.pending_raids) == 1
        raid = self.state.pending_raids[0]
        assert raid['owner'] == Player.PLAYER1
        assert raid['lane'] == target
        assert raid['turns_until_resolve'] == 2

    def test_raid_fails_if_enemy_side_full(self):
        """Raid should fail if enemy's side of target lane is full."""
        target = 1
        for _ in range(5):
            self.state.lanes[target].add_piece(Player.PLAYER2)

        success, result = execute_raid(self.state, Player.PLAYER1, target)

        assert success is False

    def test_raid_resolution_probability_lost(self):
        """Raid resolution with 'lost' outcome should remove the piece."""
        target = 2
        execute_raid(self.state, Player.PLAYER1, target)

        # Force the raid to resolve (set timer to 0)
        self.state.pending_raids[0]['turns_until_resolve'] = 0

        # Mock RNG to return < 10 (lost outcome)
        class MockRNG:
            def randint(self, a, b):
                return 5  # < 10 = lost

            def choice(self, items):
                return items[0]

        self.state.rng = MockRNG()
        results = process_pending_raids(self.state, Player.PLAYER1)

        assert len(results) == 1
        assert results[0]['outcome'] == 'lost'

    def test_raid_resolution_probability_recruits(self):
        """Raid resolution with '+2_recruits' should convert and add pieces."""
        target = 2
        execute_raid(self.state, Player.PLAYER1, target)
        self.state.pending_raids[0]['turns_until_resolve'] = 0

        class MockRNG:
            def randint(self, a, b):
                return 15  # 10-24 = +2 recruits

            def choice(self, items):
                return items[0]

        self.state.rng = MockRNG()
        results = process_pending_raids(self.state, Player.PLAYER1)

        assert len(results) == 1
        assert results[0]['outcome'] == '+2_recruits'
        # Should have gained pieces
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) >= 1


class TestRaidTimerDecrement:
    """Tests for raid timer mechanics."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_raid_timer_decrements_on_turn_switch(self):
        """Raid timer should decrement when turn switches."""
        target = 2
        execute_raid(self.state, Player.PLAYER1, target)

        assert self.state.pending_raids[0]['turns_until_resolve'] == 2

        self.state.switch_player()
        assert self.state.pending_raids[0]['turns_until_resolve'] == 1

        self.state.switch_player()
        assert self.state.pending_raids[0]['turns_until_resolve'] == 0

    def test_raid_resolves_after_two_full_turns(self):
        """Raid should resolve after 2 full turns."""
        target = 3
        execute_raid(self.state, Player.PLAYER1, target)

        # Turn 1 switch (P1 -> P2)
        self.state.switch_player()
        # Turn 2 switch (P2 -> P1) - raid should now be ready
        self.state.switch_player()

        # Now at P1's turn, raid should resolve
        results = process_pending_raids(self.state, Player.PLAYER1)
        assert len(results) == 1


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
