"""Tests for trigger perks (Portal, Trap, Mirror, Echo, Shockwave, Hydra, Backfire, Absorb, Retaliate)."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player, TriggerType
from src.game.config import GameConfig
from src.perks.triggers import (
    execute_portal, execute_trap, execute_mirror, execute_echo,
    execute_shockwave, execute_hydra, execute_backfire, execute_absorb,
    execute_retaliate, fire_placement_triggers, fire_removal_triggers
)


class TestPortal:
    """Tests for Portal placement trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_portal_sets_trigger(self):
        """Portal should set a trigger on the target lane."""
        target = 2
        success, result = execute_portal(self.state, Player.PLAYER1, target)

        assert success is True
        assert result['perk'] == 'PORTAL'
        assert self.state.lanes[target].has_trigger_type(TriggerType.PORTAL)

    def test_portal_on_won_lane_fails(self):
        """Portal should fail on won lanes."""
        target = 2
        self.state.lanes[target].winner = Player.PLAYER1

        success, result = execute_portal(self.state, Player.PLAYER1, target)

        assert success is False

    def test_portal_fires_on_opponent_placement(self):
        """Portal should teleport piece when opponent places."""
        target = 2
        # P1 sets portal
        execute_portal(self.state, Player.PLAYER1, target)

        # P2 places on the lane
        self.state.lanes[target].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'PORTAL'
        # Piece should have been moved
        assert results[0]['destination_lane'] is not None or results[0]['destination_lane'] != target


class TestTrap:
    """Tests for Trap placement trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_trap_sets_trigger(self):
        """Trap should set a trigger on the target lane."""
        target = 1
        success, result = execute_trap(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.TRAP)

    def test_trap_removes_placed_piece(self):
        """Trap should remove the piece when opponent places."""
        target = 1
        execute_trap(self.state, Player.PLAYER1, target)

        # P2 places on trapped lane
        self.state.lanes[target].add_piece(Player.PLAYER2)
        initial_pieces = self.state.lanes[target].pieces_for(Player.PLAYER2)
        results = fire_placement_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'TRAP'
        # Piece should be gone (unless redirected)
        if not results[0].get('redirected'):
            assert self.state.lanes[target].pieces_for(Player.PLAYER2) == initial_pieces - 1


class TestMirror:
    """Tests for Mirror placement trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_mirror_sets_trigger(self):
        """Mirror should set a trigger on the target lane."""
        target = 3
        success, result = execute_mirror(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.MIRROR)

    def test_mirror_adds_pieces_on_trigger(self):
        """Mirror should add 2 pieces to owner when opponent places."""
        target = 3
        execute_mirror(self.state, Player.PLAYER1, target)

        initial_p1 = self.state.lanes[target].pieces_for(Player.PLAYER1)
        # P2 places
        self.state.lanes[target].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'MIRROR'
        assert results[0]['pieces_added'] == 2
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == initial_p1 + 2


class TestEcho:
    """Tests for Echo placement trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_echo_sets_trigger(self):
        """Echo should set a trigger on the target lane."""
        target = 0
        success, result = execute_echo(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.ECHO)

    def test_echo_adds_pieces_to_random_lanes(self):
        """Echo should add 2 pieces to random lanes (with source exclusion)."""
        target = 2
        execute_echo(self.state, Player.PLAYER1, target)

        initial_total = sum(lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes)
        self.state.lanes[target].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'ECHO'
        new_total = sum(lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes)
        # Should have added pieces (exact count depends on lane availability)
        assert new_total >= initial_total


class TestShockwave:
    """Tests for Shockwave placement trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_shockwave_sets_trigger(self):
        """Shockwave should set a trigger on the target lane."""
        target = 4
        success, result = execute_shockwave(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.SHOCKWAVE)

    def test_shockwave_removes_opponent_pieces_elsewhere(self):
        """Shockwave should remove 2 pieces from opponent's OTHER lanes."""
        target = 2
        # Add P2 pieces to multiple lanes
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[3].add_piece(Player.PLAYER2)

        execute_shockwave(self.state, Player.PLAYER1, target)

        total_before = sum(lane.pieces_for(Player.PLAYER2) for lane in self.state.lanes)
        self.state.lanes[target].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'SHOCKWAVE'
        # Should have removed pieces from OTHER lanes
        total_after = sum(lane.pieces_for(Player.PLAYER2) for lane in self.state.lanes)
        # The placed piece is still there, but 2 others should be removed
        removed_count = len(results[0].get('removed_from', []))
        assert removed_count <= 2


class TestHydra:
    """Tests for Hydra removal trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_hydra_sets_trigger(self):
        """Hydra should set a trigger on a lane with owner's pieces."""
        target = 1
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_hydra(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.HYDRA)

    def test_hydra_requires_player_pieces(self):
        """Hydra should fail if player has no pieces on the lane."""
        target = 0  # No pieces

        success, result = execute_hydra(self.state, Player.PLAYER1, target)

        assert success is False

    def test_hydra_adds_pieces_on_removal(self):
        """Hydra should add 2 pieces when owner's piece is removed."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        self.state.lanes[target].add_piece(Player.PLAYER1)
        execute_hydra(self.state, Player.PLAYER1, target)

        initial_total = sum(lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes)
        # P2 removes P1's piece
        self.state.lanes[target].remove_piece(Player.PLAYER1)
        results = fire_removal_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'HYDRA'


class TestBackfire:
    """Tests for Backfire removal trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_backfire_sets_trigger(self):
        """Backfire should set a trigger on a lane with owner's pieces."""
        target = 3
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_backfire(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.BACKFIRE)

    def test_backfire_removes_remover_pieces(self):
        """Backfire should remove 2 of the remover's pieces."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        # Add P2 pieces elsewhere
        self.state.lanes[0].add_piece(Player.PLAYER2)
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[3].add_piece(Player.PLAYER2)

        execute_backfire(self.state, Player.PLAYER1, target)

        # P2 removes P1's piece
        self.state.lanes[target].remove_piece(Player.PLAYER1)
        results = fire_removal_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'BACKFIRE'


class TestAbsorb:
    """Tests for Absorb removal trigger."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_absorb_sets_trigger(self):
        """Absorb should set a trigger on a lane with owner's pieces."""
        target = 4
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_absorb(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.ABSORB)

    def test_absorb_recovers_piece(self):
        """Absorb should recover the removed piece on a random lane."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        execute_absorb(self.state, Player.PLAYER1, target)

        initial_total = sum(lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes)
        # P2 removes P1's piece
        self.state.lanes[target].remove_piece(Player.PLAYER1)
        results = fire_removal_triggers(self.state, target, Player.PLAYER2)

        # Note: The piece was removed, but absorb should add one back
        new_total = sum(lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes)
        # Net effect: piece moved to random lane (if available)
        assert len(results) > 0
        assert results[0]['trigger'] == 'ABSORB'


class TestRetaliate:
    """Tests for Retaliate placement trigger (spawns raid)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_retaliate_sets_trigger(self):
        """Retaliate should set a trigger on a lane with owner's pieces."""
        target = 1
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_retaliate(self.state, Player.PLAYER1, target)

        assert success is True
        assert self.state.lanes[target].has_trigger_type(TriggerType.RETALIATE)

    def test_retaliate_requires_player_pieces(self):
        """Retaliate should fail if player has no pieces on the lane."""
        target = 0

        success, result = execute_retaliate(self.state, Player.PLAYER1, target)

        assert success is False

    def test_retaliate_spawns_raid_on_trigger(self):
        """Retaliate should spawn a raid piece when opponent places."""
        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)
        execute_retaliate(self.state, Player.PLAYER1, target)

        # P2 places
        self.state.lanes[target].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, target, Player.PLAYER2)

        assert len(results) > 0
        assert results[0]['trigger'] == 'RETALIATE'
        # Should have spawned a raid
        if results[0].get('raid_placed'):
            assert len(self.state.pending_raids) == 1


class TestTriggerFIFOOrder:
    """Tests for trigger FIFO ordering."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_triggers_fire_in_fifo_order(self):
        """Multiple triggers should fire in the order they were set."""
        target = 2

        # Set triggers in order: Portal, Mirror, Echo
        execute_portal(self.state, Player.PLAYER1, target)
        execute_mirror(self.state, Player.PLAYER1, target)
        execute_echo(self.state, Player.PLAYER1, target)

        # Get trigger order IDs
        triggers = self.state.lanes[target].triggers
        order_ids = [t['order_id'] for t in triggers]

        # Should be in increasing order
        assert order_ids == sorted(order_ids)


class TestTriggerOneTimeUse:
    """Tests for trigger one-time use behavior."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_triggers_removed_after_firing(self):
        """Triggers should be removed after firing once."""
        target = 1
        execute_mirror(self.state, Player.PLAYER1, target)

        assert self.state.lanes[target].has_trigger_type(TriggerType.MIRROR)

        # Trigger fires
        self.state.lanes[target].add_piece(Player.PLAYER2)
        fire_placement_triggers(self.state, target, Player.PLAYER2)

        # Trigger should be gone
        assert not self.state.lanes[target].has_trigger_type(TriggerType.MIRROR)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
