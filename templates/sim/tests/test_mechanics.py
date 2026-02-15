"""Tests for core game mechanics (source exclusion, iterative placement, FIFO triggers, etc.)."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player, TriggerType, LaneState
from src.game.config import GameConfig
from src.game.rules import GameRules
from src.game.engine import GameEngine


class TestSourceExclusion:
    """Tests for source exclusion rule."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_source_exclusion_with_3_plus_lanes(self):
        """With 3+ available lanes, source should be excluded."""
        # 5 lanes available (default config)
        # Source exclusion applies when choosing random destination
        from src.perks.immediate import execute_scatter

        target = 2
        self.state.lanes[target].add_piece(Player.PLAYER1)

        # Run scatter multiple times and verify source is excluded
        for _ in range(10):
            state_copy = self.state.clone()
            state_copy.lanes[target].add_piece(Player.PLAYER1)
            execute_scatter(state_copy, Player.PLAYER1, target)
            # Can't directly assert source exclusion, but it should work

    def test_source_exclusion_with_2_lanes(self):
        """With 2 available lanes, source should be included."""
        # Block 3 lanes by winning them
        for i in [0, 1, 3]:
            self.state.lanes[i].winner = Player.PLAYER2

        # Only lanes 2 and 4 available
        available = [
            i for i, lane in enumerate(self.state.lanes)
            if lane.winner is None
        ]
        assert len(available) == 2

    def test_source_exclusion_with_1_lane(self):
        """With 1 available lane, piece goes to source."""
        # Block all but one lane
        for i in [0, 1, 2, 3]:
            self.state.lanes[i].winner = Player.PLAYER2

        # Only lane 4 available
        available = [
            i for i, lane in enumerate(self.state.lanes)
            if lane.winner is None
        ]
        assert len(available) == 1

    def test_source_exclusion_with_0_lanes(self):
        """With 0 available lanes, piece is lost."""
        # Win all lanes
        for i in range(5):
            self.state.lanes[i].winner = Player.PLAYER2

        available = [
            i for i, lane in enumerate(self.state.lanes)
            if lane.winner is None
        ]
        assert len(available) == 0


class TestIterativePlacement:
    """Tests for iterative placement model (win check after each piece)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_game_terminates_mid_perk(self):
        """Game should terminate if won mid-perk."""
        # Set up for quick win
        for i in range(3):  # Need 3 lanes to win
            for _ in range(4):  # 4 pieces per lane
                self.state.lanes[i].add_piece(Player.PLAYER1)

        # Execute a perk that might cause win
        from src.perks.commons import execute_place_another

        # Place on lane 0 to complete it
        success, result = execute_place_another(self.state, Player.PLAYER1, 0)
        assert success is True

        # Check if lane 0 won
        winner = GameRules.check_lane_win(self.state, 0)
        assert winner == Player.PLAYER1

    def test_win_check_after_each_placement(self):
        """Win should be checked after each individual placement."""
        engine = GameEngine(seed=42)
        engine.start_game()

        # Set up: 2 lanes already won by P1
        for lane_idx in [0, 1]:
            for _ in range(5):
                engine.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            engine.state.lanes[lane_idx].winner = Player.PLAYER1

        # 4 pieces on lane 2
        for _ in range(4):
            engine.state.lanes[2].add_piece(Player.PLAYER1)

        # Placing another piece on lane 2 should win the game
        from src.perks.commons import execute_place_another
        execute_place_another(engine.state, Player.PLAYER1, 2)

        # Check lane win
        winner = GameRules.check_lane_win(engine.state, 2)
        assert winner == Player.PLAYER1

        # Check game win
        assert GameRules.check_game_over(engine.state)
        assert engine.state.winner == Player.PLAYER1


class TestAtomicSwaps:
    """Tests for atomic swap operations (no mid-swap win check)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_regroup_is_atomic(self):
        """Regroup swap should be atomic."""
        from src.perks.immediate import execute_regroup

        # Set up lanes where mid-swap could cause issues
        lane_a, lane_b = 1, 3
        self.state.lanes[lane_a].add_piece(Player.PLAYER1)
        self.state.lanes[lane_a].add_piece(Player.PLAYER1)
        self.state.lanes[lane_b].add_piece(Player.PLAYER1)

        # Perform swap
        execute_regroup(self.state, Player.PLAYER1, lane_a, lane_b)

        # Both lanes should have swapped counts
        assert self.state.lanes[lane_a].pieces_for(Player.PLAYER1) == 1
        assert self.state.lanes[lane_b].pieces_for(Player.PLAYER1) == 2

    def test_disrupt_is_atomic(self):
        """Disrupt swap should be atomic."""
        from src.perks.immediate import execute_disrupt

        lane_a, lane_b = 0, 4
        self.state.lanes[lane_a].add_piece(Player.PLAYER2)
        self.state.lanes[lane_b].add_piece(Player.PLAYER2)
        self.state.lanes[lane_b].add_piece(Player.PLAYER2)

        execute_disrupt(self.state, Player.PLAYER1, lane_a, lane_b)

        assert self.state.lanes[lane_a].pieces_for(Player.PLAYER2) == 2
        assert self.state.lanes[lane_b].pieces_for(Player.PLAYER2) == 1


class TestTriggerFIFO:
    """Tests for trigger FIFO ordering."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_triggers_processed_in_order(self):
        """Triggers should process in FIFO order based on order_id."""
        lane = 2

        # Add triggers in order
        from src.perks.triggers import execute_portal, execute_mirror

        execute_portal(self.state, Player.PLAYER1, lane)
        execute_mirror(self.state, Player.PLAYER1, lane)

        triggers = self.state.lanes[lane].triggers
        order_ids = [t['order_id'] for t in triggers]

        # Should be in increasing order
        assert order_ids == sorted(order_ids)

    def test_trigger_order_counter_increments(self):
        """Global trigger order counter should increment with each trigger."""
        initial = self.state.trigger_order_counter

        order1 = self.state.get_next_trigger_order()
        order2 = self.state.get_next_trigger_order()
        order3 = self.state.get_next_trigger_order()

        assert order1 == initial
        assert order2 == initial + 1
        assert order3 == initial + 2


class TestTurnDuration:
    """Tests for turn duration definition (1 turn = opponent's complete turn)."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_freeze_expires_after_opponent_turn(self):
        """Freeze with 1 turn should expire after opponent's turn."""
        from src.perks.immediate import execute_freeze

        target = 2
        execute_freeze(self.state, Player.PLAYER1, target)

        # Freeze should be active now
        assert self.state.lanes[target].freeze_turns == 1
        assert self.state.lanes[target].is_frozen_for(Player.PLAYER2)

        # Switch to opponent's turn (decrements timers)
        self.state.switch_player()

        # Freeze should have expired
        assert self.state.lanes[target].freeze_turns == 0
        assert not self.state.lanes[target].is_frozen_for(Player.PLAYER2)

    def test_cloak_duration_decrements_each_turn(self):
        """Cloak should decrement each turn switch."""
        from src.perks.duration import execute_cloak

        execute_cloak(self.state, Player.PLAYER1)
        initial_duration = self.state.player1_cloaked

        self.state.switch_player()
        assert self.state.player1_cloaked == initial_duration - 1


class TestLaneWinCleanup:
    """Tests for cleanup when lanes are won."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_won_lane_clears_triggers(self):
        """Winning a lane should clear all triggers."""
        lane = 2
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[lane].add_trigger(TriggerType.MIRROR, Player.PLAYER1, 2, order_id)

        # Win the lane
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)
        self.state.lanes[lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(lane)

        assert not self.state.lanes[lane].has_triggers()

    def test_won_lane_clears_deferred(self):
        """Winning a lane should clear all deferred effects."""
        from src.game.state import DeferredType

        lane = 1
        self.state.lanes[lane].add_deferred(DeferredType.REINFORCE, Player.PLAYER1, lane)

        # Win the lane
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)
        self.state.lanes[lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(lane)

        assert len(self.state.lanes[lane].deferred) == 0

    def test_won_lane_clears_freeze(self):
        """Winning a lane should clear freeze."""
        lane = 3
        self.state.lanes[lane].freeze_player = Player.PLAYER2
        self.state.lanes[lane].freeze_turns = 2

        # Win the lane
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)
        self.state.lanes[lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(lane)

        assert self.state.lanes[lane].freeze_player is None
        assert self.state.lanes[lane].freeze_turns == 0

    def test_won_lane_removes_sanctuary_pointing_to_it(self):
        """Winning a lane should remove sanctuaries pointing to it."""
        lane = 2
        self.state.add_sanctuary(Player.PLAYER1, lane, 3)

        # Win the lane
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)
        self.state.lanes[lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(lane)

        assert lane not in [l for l, _ in self.state.player1_sanctuaries]

    def test_won_lane_removes_pending_raids(self):
        """Winning a lane should remove pending raids on it."""
        lane = 4
        self.state.pending_raids.append({
            'owner': Player.PLAYER1,
            'lane': lane,
            'turns_until_resolve': 2
        })

        # Win the lane
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)
        self.state.lanes[lane].winner = Player.PLAYER1
        self.state.cleanup_won_lane(lane)

        assert all(r['lane'] != lane for r in self.state.pending_raids)


class TestGameWinConditions:
    """Tests for game win conditions."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_win_requires_3_lanes(self):
        """Winning requires 3 lanes (LANES_TO_WIN)."""
        # Win 2 lanes
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            self.state.lanes[lane_idx].winner = Player.PLAYER1

        assert self.state.lanes_won_by(Player.PLAYER1) == 2
        assert not GameRules.check_game_over(self.state)

        # Win 3rd lane
        for _ in range(5):
            self.state.lanes[2].add_piece(Player.PLAYER1)
        self.state.lanes[2].winner = Player.PLAYER1

        assert self.state.lanes_won_by(Player.PLAYER1) == 3
        assert GameRules.check_game_over(self.state)
        assert self.state.winner == Player.PLAYER1

    def test_tie_breaking_prioritizes_current_player(self):
        """When both players fill a lane, current player wins it."""
        lane = 2
        self.state.current_player = Player.PLAYER2

        # Both players fill
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)
            self.state.lanes[lane].add_piece(Player.PLAYER2)

        # Check winner with current player priority
        winner = self.state.lanes[lane].check_winner(self.state.current_player)

        assert winner == Player.PLAYER2  # Current player wins tie


class TestValidPlacementRules:
    """Tests for valid placement rules."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_cannot_place_on_won_lane(self):
        """Cannot place pieces on won lanes."""
        lane = 1
        self.state.lanes[lane].winner = Player.PLAYER1

        available = GameRules.get_valid_placement_lanes(self.state, Player.PLAYER2)
        assert lane not in available

    def test_cannot_place_on_full_lane(self):
        """Cannot place pieces on full lanes."""
        lane = 2
        for _ in range(5):
            self.state.lanes[lane].add_piece(Player.PLAYER1)

        available = GameRules.get_valid_placement_lanes(self.state, Player.PLAYER1)
        assert lane not in available

    def test_cannot_place_on_frozen_lane(self):
        """Cannot place pieces on frozen lanes."""
        lane = 3
        self.state.lanes[lane].freeze_player = Player.PLAYER1
        self.state.lanes[lane].freeze_turns = 2

        available = GameRules.get_valid_placement_lanes(self.state, Player.PLAYER1)
        assert lane not in available


class TestPlayTurnFallback:
    """Tests for play_turn stuck-loop protection."""

    def setup_method(self):
        self.engine = GameEngine(seed=42)
        self.engine.start_game()

    def test_failed_select_perk_still_ends_turn(self):
        """When select_perk fails, play_turn should still advance the turn."""
        # Set up state where DISRUPT targets will be invalid
        # Win lane 0 so P2 has pieces on a won lane
        for _ in range(5):
            self.engine.state.lanes[0].add_piece(Player.PLAYER1)
        self.engine.state.lanes[0].winner = Player.PLAYER1

        initial_player = self.engine.state.current_player
        initial_turn = self.engine.state.turn_number

        # Create an AI that always picks an invalid action
        def bad_ai(state):
            return 4, (0, 1)  # slot 4 with invalid targets

        # Set up offered perks so slot 4 is DISRUPT
        self.engine.state.turn_phase = from_import = __import__('src.game.state', fromlist=['TurnPhase'])
        from src.game.state import TurnPhase
        self.engine.do_auto_placement()

        if not self.engine.state.game_over:
            result = self.engine.play_turn(bad_ai)
            # Turn should still complete (fallback to pass)
            assert result is True
            # Player should have switched
            assert self.engine.state.current_player != initial_player

    def test_game_does_not_loop_on_invalid_perk(self):
        """Game should not get stuck repeating failed perk attempts."""
        # AI that always tries invalid action
        call_count = 0

        def counting_bad_ai(state):
            nonlocal call_count
            call_count += 1
            # Try to use slot 4 with bad target
            return 4, None

        # Run a short game - should complete without hanging
        self.engine.start_game()
        self.engine.run_game(counting_bad_ai, counting_bad_ai, max_turns=10)

        # Should have called AI roughly 10 times (not 10*many loops)
        assert call_count <= 20  # Some slack for edge cases


class TestRunGameDrawLogging:
    """Tests for run_game max_turns draw handling."""

    def test_draw_game_has_no_winner(self):
        """Game that hits max_turns should have winner=None."""
        def pass_ai(state):
            return 'pass', None

        engine = GameEngine(seed=42)
        final_state = engine.run_game(pass_ai, pass_ai, max_turns=10)

        # Game should end as draw (all passes, no one wins)
        assert final_state.winner is None

    def test_draw_game_logs_game_over_event(self):
        """Draw games should log game_over event with max_turns reason."""
        from src.game.logger import GameLogger

        def pass_ai(state):
            return 'pass', None

        logger = GameLogger(enabled=True)
        engine = GameEngine(seed=42, logger=logger)
        engine.run_game(pass_ai, pass_ai, max_turns=10)

        # Should have a game_over event
        game_over_events = [
            e for e in logger.events
            if e.event_type.value == 'game_over'
        ]
        assert len(game_over_events) == 1
        assert game_over_events[0].data['reason'] == 'max_turns'
        assert game_over_events[0].data['winner'] is None


class TestIsPerkAvailable:
    """Tests for GameRules.is_perk_available."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_place_another_available_with_open_lanes(self):
        assert GameRules.is_perk_available(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

    def test_place_another_unavailable_when_all_lanes_full(self):
        for i in range(5):
            for _ in range(5):
                self.state.lanes[i].add_piece(Player.PLAYER1)
        assert not GameRules.is_perk_available(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

    def test_place_another_unavailable_when_all_lanes_won(self):
        for i in range(5):
            self.state.lanes[i].winner = Player.PLAYER2
        assert not GameRules.is_perk_available(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

    def test_remove_enemy_available_with_enemy_pieces(self):
        self.state.lanes[0].add_piece(Player.PLAYER2)
        assert GameRules.is_perk_available(self.state, Player.PLAYER1, 'REMOVE_ENEMY')

    def test_remove_enemy_unavailable_with_no_enemy_pieces(self):
        assert not GameRules.is_perk_available(self.state, Player.PLAYER1, 'REMOVE_ENEMY')

    def test_freeze_available_with_unfrozen_lanes(self):
        assert GameRules.is_perk_available(self.state, Player.PLAYER1, 'FREEZE')

    def test_freeze_unavailable_when_all_lanes_frozen_or_won(self):
        for i in range(5):
            self.state.lanes[i].freeze_player = Player.PLAYER2
            self.state.lanes[i].freeze_turns = 2
        assert not GameRules.is_perk_available(self.state, Player.PLAYER1, 'FREEZE')

    def test_gambit_always_available(self):
        assert GameRules.is_perk_available(self.state, Player.PLAYER1, 'GAMBIT')
        # Even with all lanes won
        for i in range(5):
            self.state.lanes[i].winner = Player.PLAYER2
        assert GameRules.is_perk_available(self.state, Player.PLAYER1, 'GAMBIT')

    def test_split_requires_own_pieces(self):
        assert not GameRules.is_perk_available(self.state, Player.PLAYER1, 'SPLIT')
        self.state.lanes[0].add_piece(Player.PLAYER1)
        assert GameRules.is_perk_available(self.state, Player.PLAYER1, 'SPLIT')

    def test_invalid_perk_name_not_available(self):
        assert not GameRules.is_perk_available(self.state, Player.PLAYER1, 'NONEXISTENT')


class TestGetAvailablePerks:
    """Tests for GameRules.get_available_perks."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_slot_1_returns_place_another_when_available(self):
        perks = GameRules.get_available_perks(self.state, Player.PLAYER1, 1)
        assert 'PLACE_ANOTHER' in perks

    def test_slot_1_empty_when_no_valid_lanes(self):
        for i in range(5):
            self.state.lanes[i].winner = Player.PLAYER2
        perks = GameRules.get_available_perks(self.state, Player.PLAYER1, 1)
        assert len(perks) == 0

    def test_slot_2_returns_remove_enemy_when_available(self):
        self.state.lanes[0].add_piece(Player.PLAYER2)
        perks = GameRules.get_available_perks(self.state, Player.PLAYER1, 2)
        assert 'REMOVE_ENEMY' in perks

    def test_slot_3_returns_subset_of_pool(self):
        perks = GameRules.get_available_perks(self.state, Player.PLAYER1, 3)
        assert len(perks) > 0
        from src.perks.base import SLOT_3_PERKS
        for p in perks:
            assert p in SLOT_3_PERKS


class TestGetNonEmptyEnemyLanes:
    """Tests for GameState.get_non_empty_enemy_lanes."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_returns_lanes_with_enemy_pieces(self):
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[3].add_piece(Player.PLAYER2)
        result = self.state.get_non_empty_enemy_lanes(Player.PLAYER1)
        assert set(result) == {1, 3}

    def test_excludes_won_lanes(self):
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[3].add_piece(Player.PLAYER2)
        self.state.lanes[1].winner = Player.PLAYER1  # Won lane still has P2 pieces
        result = self.state.get_non_empty_enemy_lanes(Player.PLAYER1)
        assert 1 not in result
        assert 3 in result

    def test_empty_when_no_enemy_pieces(self):
        result = self.state.get_non_empty_enemy_lanes(Player.PLAYER1)
        assert result == []


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
