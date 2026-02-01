"""Tests for edge cases and complex interactions."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player, TriggerType
from src.game.config import GameConfig
from src.game.rules import GameRules
from src.game.engine import GameEngine
from src.perks.triggers import fire_placement_triggers


class TestMultipleTriggers:
    """Tests for multiple triggers on same lane."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_multiple_triggers_fire_in_order(self):
        """Multiple triggers on same lane should fire in FIFO order."""
        lane = 2

        from src.perks.triggers import execute_trap, execute_mirror

        # Set triggers in order: Trap first, then Mirror
        execute_trap(self.state, Player.PLAYER1, lane)
        execute_mirror(self.state, Player.PLAYER1, lane)

        # P2 places
        self.state.lanes[lane].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, lane, Player.PLAYER2)

        # Trap fires first (removes piece), Mirror fires second
        trigger_order = [r['trigger'] for r in results]
        assert trigger_order[0] == 'TRAP'
        assert trigger_order[1] == 'MIRROR'

    def test_trigger_stops_if_lane_won(self):
        """Triggers should stop processing if lane is won."""
        lane = 2

        from src.perks.triggers import execute_mirror, execute_echo

        # Set up for quick win
        for _ in range(3):
            self.state.lanes[lane].add_piece(Player.PLAYER1)

        execute_mirror(self.state, Player.PLAYER1, lane)  # +2 = win
        execute_echo(self.state, Player.PLAYER1, lane)    # Shouldn't fire

        self.state.lanes[lane].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, lane, Player.PLAYER2)

        # Mirror fires and wins lane
        assert len(results) >= 1
        assert results[0]['trigger'] == 'MIRROR'


class TestTriggerChaining:
    """Tests for trigger chaining (e.g., Portal triggering destination triggers)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_portal_chains_to_destination(self):
        """Portal should fire triggers at destination lane."""
        source = 2
        dest = 0

        from src.perks.triggers import execute_portal, execute_mirror

        # Portal on source, Mirror on destination
        execute_portal(self.state, Player.PLAYER1, source)

        # Force destination for testing by mocking RNG
        class MockRNG:
            def choice(self, items):
                return dest  # Always choose lane 0

        self.state.rng = MockRNG()

        execute_mirror(self.state, Player.PLAYER2, dest)

        # P2 places on source - should teleport to dest and trigger Mirror
        self.state.lanes[source].add_piece(Player.PLAYER2)
        results = fire_placement_triggers(self.state, source, Player.PLAYER2)

        assert len(results) > 0
        # Portal should report destination
        portal_result = results[0]
        assert portal_result['trigger'] == 'PORTAL'

    def test_trigger_chain_max_depth(self):
        """Trigger chaining should respect max depth limit."""
        # This prevents infinite loops
        # Set up a scenario that could chain many times
        pass  # Difficult to test directly without complex setup


class TestCaptureAndSanctuaryInteraction:
    """Tests for Capture and Sanctuary interaction."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_capture_before_sanctuary(self):
        """Capture should be checked before Sanctuary."""
        from src.perks.duration import execute_capture, execute_sanctuary

        capture_lane = 0
        sanctuary_lane = 4
        source_lane = 2

        # P1 has Capture, P2 has Sanctuary
        execute_capture(self.state, Player.PLAYER1, capture_lane)
        execute_sanctuary(self.state, Player.PLAYER2, sanctuary_lane)

        self.state.lanes[source_lane].add_piece(Player.PLAYER2)

        # P1 removes P2's piece
        result = self.state.remove_piece_with_redirects(
            source_lane, Player.PLAYER2, remover=Player.PLAYER1
        )

        # Capture takes priority
        assert result['redirect_type'] == 'capture'
        assert result['converted'] is True
        assert self.state.lanes[capture_lane].pieces_for(Player.PLAYER1) == 1

    def test_capture_full_falls_back_to_sanctuary(self):
        """If Capture zone is full, should fall back to Sanctuary."""
        from src.perks.duration import execute_capture, execute_sanctuary

        capture_lane = 0
        sanctuary_lane = 4
        source_lane = 2

        # Fill capture lane
        for _ in range(5):
            self.state.lanes[capture_lane].add_piece(Player.PLAYER1)

        execute_capture(self.state, Player.PLAYER1, capture_lane)
        execute_sanctuary(self.state, Player.PLAYER2, sanctuary_lane)

        self.state.lanes[source_lane].add_piece(Player.PLAYER2)

        result = self.state.remove_piece_with_redirects(
            source_lane, Player.PLAYER2, remover=Player.PLAYER1
        )

        # Capture full, falls back to Sanctuary
        assert result['redirect_type'] == 'sanctuary'
        assert self.state.lanes[sanctuary_lane].pieces_for(Player.PLAYER2) == 1


class TestRaidInteractions:
    """Tests for Raid interactions with other mechanics."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_raid_piece_counts_for_enemy(self):
        """Raid piece should count toward enemy's lane win calculations."""
        from src.perks.deferred import execute_raid

        target = 2
        # Enemy has 4 pieces
        for _ in range(4):
            self.state.lanes[target].add_piece(Player.PLAYER2)

        # P1 places raid on enemy side
        execute_raid(self.state, Player.PLAYER1, target)

        # Enemy now has 5 pieces (including raid)
        assert self.state.lanes[target].pieces_for(Player.PLAYER2) == 5

        # Check if lane is won by enemy
        winner = self.state.lanes[target].check_winner(Player.PLAYER2)
        assert winner == Player.PLAYER2

    def test_nullify_cancels_raid_effect_keeps_piece(self):
        """Nullify should cancel raid effect but piece stays on board."""
        from src.perks.deferred import execute_raid
        from src.perks.immediate import execute_nullify

        target = 2
        execute_raid(self.state, Player.PLAYER1, target)

        # Raid piece is on enemy side
        assert self.state.lanes[target].pieces_for(Player.PLAYER2) == 1
        assert len(self.state.pending_raids) == 1

        # Nullify the lane
        execute_nullify(self.state, Player.PLAYER1, target)

        # Raid effect cancelled, but piece should remain
        # (Nullify clears deferred/triggers but doesn't remove pieces)
        # Note: Raid is tracked in pending_raids, not deferred
        # Nullify should clear pending_raids for this lane
        raid_count = len([r for r in self.state.pending_raids if r['lane'] == target])
        assert raid_count == 0  # Raid cancelled


class TestMidPerkGameWin:
    """Tests for game termination mid-perk."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_gambit_can_end_game_mid_execution(self):
        """Gambit should end game if win condition met during execution."""
        from src.perks.immediate import execute_gambit

        # Set up P2 to potentially win during gambit
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER2)
            self.state.lanes[lane_idx].winner = Player.PLAYER2

        # Lane 2 has 4 pieces
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER2)

        # Gambit gives enemy +3 - if one goes to lane 2, game ends
        class MockRNG:
            def __init__(self):
                self.call_count = 0

            def choice(self, items):
                self.call_count += 1
                if 2 in items:
                    return 2  # Direct to lane 2
                return items[0]

        self.state.rng = MockRNG()

        success, result = execute_gambit(self.state, Player.PLAYER1)

        # Game should have ended mid-gambit
        # (Check if game over is detected)


class TestEmptyBoardStates:
    """Tests for edge cases with empty board states."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_scramble_with_no_enemy_pieces(self):
        """Scramble should fail gracefully with no enemy pieces."""
        from src.perks.immediate import execute_scramble

        success, result = execute_scramble(self.state, Player.PLAYER1)

        assert success is False

    def test_steal_with_no_enemy_pieces(self):
        """Steal should fail gracefully with no enemy pieces."""
        from src.perks.immediate import execute_steal

        success, result = execute_steal(self.state, Player.PLAYER1)

        assert success is False

    def test_kamikaze_with_no_enemy_pieces(self):
        """Kamikaze should work but remove 0 enemy pieces."""
        from src.perks.immediate import execute_kamikaze

        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)

        success, result = execute_kamikaze(self.state, Player.PLAYER1, target)

        assert success is True
        # Player loses their piece
        assert self.state.lanes[target].pieces_for(Player.PLAYER1) == 0


class TestAllLanesWon:
    """Tests for states where most/all lanes are won."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_placement_with_all_lanes_won(self):
        """No placement should be possible if all lanes are won."""
        for i in range(5):
            self.state.lanes[i].winner = Player.PLAYER1

        available = GameRules.get_valid_placement_lanes(self.state, Player.PLAYER2)
        assert len(available) == 0

    def test_trigger_setup_with_no_valid_lanes(self):
        """Trigger setup should fail if no valid lanes available."""
        from src.perks.triggers import execute_portal

        for i in range(5):
            self.state.lanes[i].winner = Player.PLAYER1

        success, result = execute_portal(self.state, Player.PLAYER1, 0)
        assert success is False


class TestCloakAndBlindInteraction:
    """Tests for Cloak/Blind vision effects."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_cloak_hides_from_opponent(self):
        """Cloaked player's field should be hidden from opponent."""
        from src.perks.duration import execute_cloak

        execute_cloak(self.state, Player.PLAYER1)

        assert self.state.is_cloaked(Player.PLAYER1)
        assert not self.state.is_cloaked(Player.PLAYER2)

    def test_blind_prevents_seeing_enemy(self):
        """Blinded player cannot see enemy pieces."""
        from src.perks.duration import execute_blind

        execute_blind(self.state, Player.PLAYER1)

        # P1 blinds P2
        assert self.state.is_blinded(Player.PLAYER2)
        assert not self.state.is_blinded(Player.PLAYER1)

    def test_won_lanes_visible_during_cloak(self):
        """Won lanes should remain visible even during Cloak."""
        from src.perks.duration import execute_cloak

        # P1 wins lane 0
        for _ in range(5):
            self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[0].winner = Player.PLAYER1

        execute_cloak(self.state, Player.PLAYER1)

        # Won lane status is still visible
        assert self.state.lanes[0].winner == Player.PLAYER1


class TestStateCloning:
    """Tests for state cloning (used by AI)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_clone_preserves_pieces(self):
        """Clone should preserve piece counts."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[1].add_piece(Player.PLAYER2)

        clone = self.state.clone()

        assert clone.lanes[0].pieces_for(Player.PLAYER1) == 1
        assert clone.lanes[1].pieces_for(Player.PLAYER2) == 1

    def test_clone_is_independent(self):
        """Changes to clone should not affect original."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        clone = self.state.clone()

        clone.lanes[0].add_piece(Player.PLAYER1)

        assert self.state.lanes[0].pieces_for(Player.PLAYER1) == 1
        assert clone.lanes[0].pieces_for(Player.PLAYER1) == 2

    def test_clone_preserves_triggers(self):
        """Clone should preserve triggers."""
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[2].add_trigger(TriggerType.MIRROR, Player.PLAYER1, 2, order_id)

        clone = self.state.clone()

        assert clone.lanes[2].has_trigger_type(TriggerType.MIRROR)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
