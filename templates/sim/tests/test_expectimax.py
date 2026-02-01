"""Tests for Expectimax AI implementation."""

import pytest
import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.game.state import GameState, Player, TurnPhase, TriggerType
from src.game.config import GameConfig
from src.game.rules import GameRules
from src.ai.minimax import (
    ExpectimaxAI,
    expectimax,
    get_valid_targets_for_perk,
    get_all_moves,
    simulate_perk_selection,
    simulate_auto_placement,
    terminal_score,
    evaluate_board_state,
    NodeType,
    SearchResult,
    NO_TARGET_PERKS,
    TWO_TARGET_PERKS,
    create_expectimax_ai,
    expectimax_depth1,
    expectimax_depth2,
    expectimax_depth3,
)


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - No-Target Perks
# =============================================================================

class TestGetValidTargetsNoTargetPerks:
    """Tests for perks that require no targeting."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_gambit_returns_none_target(self):
        """GAMBIT should return [None] as valid target."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'GAMBIT')
        assert targets == [None]

    def test_scramble_returns_none_target(self):
        """SCRAMBLE should return [None] as valid target."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'SCRAMBLE')
        assert targets == [None]

    def test_steal_returns_none_target(self):
        """STEAL should return [None] as valid target."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'STEAL')
        assert targets == [None]

    def test_cloak_returns_none_target(self):
        """CLOAK should return [None] as valid target."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'CLOAK')
        assert targets == [None]

    def test_blind_returns_none_target(self):
        """BLIND should return [None] as valid target."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'BLIND')
        assert targets == [None]


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - Two-Target Perks
# =============================================================================

class TestGetValidTargetsTwoTargetPerks:
    """Tests for perks that require two targets."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_regroup_requires_two_lanes_with_pieces(self):
        """REGROUP should return combinations of player lanes with pieces."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[2].add_piece(Player.PLAYER1)
        self.state.lanes[4].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'REGROUP')

        # Should return combinations like (0, 2), (0, 4), (2, 4)
        assert len(targets) == 3
        assert (0, 2) in targets
        assert (0, 4) in targets
        assert (2, 4) in targets

    def test_regroup_returns_empty_with_single_lane(self):
        """REGROUP should return empty if player has pieces on fewer than 2 lanes."""
        self.state.lanes[1].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'REGROUP')
        assert targets == []

    def test_disrupt_requires_two_enemy_lanes_with_pieces(self):
        """DISRUPT should return combinations of enemy lanes with pieces."""
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[3].add_piece(Player.PLAYER2)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'DISRUPT')

        assert len(targets) == 1
        assert (1, 3) in targets

    def test_disrupt_returns_empty_with_single_enemy_lane(self):
        """DISRUPT should return empty if enemy has pieces on fewer than 2 lanes."""
        self.state.lanes[2].add_piece(Player.PLAYER2)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'DISRUPT')
        assert targets == []


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - Placement Perks
# =============================================================================

class TestGetValidTargetsPlacementPerks:
    """Tests for perks that target placement lanes."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_place_another_targets_valid_placement_lanes(self):
        """PLACE_ANOTHER should target lanes where player can place."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

        # All 5 lanes should be valid initially
        assert len(targets) == 5
        assert set(targets) == {0, 1, 2, 3, 4}

    def test_place_another_excludes_full_lanes(self):
        """PLACE_ANOTHER should exclude lanes full for player."""
        for _ in range(5):
            self.state.lanes[2].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

        assert 2 not in targets
        assert len(targets) == 4

    def test_place_another_excludes_frozen_lanes(self):
        """PLACE_ANOTHER should exclude lanes frozen for player."""
        self.state.lanes[1].freeze_player = Player.PLAYER1
        self.state.lanes[1].freeze_turns = 2

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

        assert 1 not in targets

    def test_place_another_excludes_won_lanes(self):
        """PLACE_ANOTHER should exclude already won lanes."""
        self.state.lanes[0].winner = Player.PLAYER2

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'PLACE_ANOTHER')

        assert 0 not in targets

    def test_reinforce_targets_valid_placement_lanes(self):
        """REINFORCE should target lanes where player can place."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'REINFORCE')
        assert len(targets) == 5

    def test_signal_targets_valid_placement_lanes(self):
        """SIGNAL should target lanes where player can place."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'SIGNAL')
        assert len(targets) == 5


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - Removal Perks
# =============================================================================

class TestGetValidTargetsRemovalPerks:
    """Tests for perks that target removal from enemy lanes."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_remove_enemy_targets_lanes_with_enemy_pieces(self):
        """REMOVE_ENEMY should target lanes where enemy has pieces."""
        self.state.lanes[1].add_piece(Player.PLAYER2)
        self.state.lanes[3].add_piece(Player.PLAYER2)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'REMOVE_ENEMY')

        assert set(targets) == {1, 3}

    def test_remove_enemy_returns_empty_with_no_enemy_pieces(self):
        """REMOVE_ENEMY should return empty if enemy has no pieces."""
        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'REMOVE_ENEMY')
        assert targets == []


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - Sacrifice Perks
# =============================================================================

class TestGetValidTargetsSacrificePerks:
    """Tests for perks requiring player's own pieces."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_split_targets_lanes_with_own_pieces(self):
        """SPLIT should target lanes where player has pieces."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[4].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'SPLIT')

        assert set(targets) == {0, 4}

    def test_kamikaze_targets_lanes_with_own_pieces(self):
        """KAMIKAZE should target lanes where player has pieces."""
        self.state.lanes[2].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'KAMIKAZE')

        assert targets == [2]

    def test_scatter_targets_lanes_with_own_pieces(self):
        """SCATTER should target lanes where player has pieces."""
        self.state.lanes[1].add_piece(Player.PLAYER1)
        self.state.lanes[3].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'SCATTER')

        assert set(targets) == {1, 3}


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - Trigger Perks
# =============================================================================

class TestGetValidTargetsTriggerPerks:
    """Tests for trigger placement perks."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_portal_targets_non_won_by_player_lanes(self):
        """PORTAL should target lanes not won by player."""
        self.state.lanes[0].winner = Player.PLAYER1  # Won by us
        self.state.lanes[1].winner = Player.PLAYER2  # Won by enemy

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'PORTAL')

        assert 0 not in targets  # Our won lane excluded
        assert 1 in targets      # Enemy won lane included
        assert 2 in targets

    def test_hydra_requires_own_pieces_on_lane(self):
        """HYDRA should target lanes where player has pieces."""
        self.state.lanes[2].add_piece(Player.PLAYER1)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'HYDRA')

        assert targets == [2]

    def test_hydra_excludes_won_lanes(self):
        """HYDRA should exclude won lanes."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[0].winner = Player.PLAYER1

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'HYDRA')

        assert 0 not in targets


# =============================================================================
# Category 1: Unit Tests for get_valid_targets_for_perk() - Special Perks
# =============================================================================

class TestGetValidTargetsSpecialPerks:
    """Tests for perks with special targeting rules."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_freeze_targets_non_frozen_non_won_lanes(self):
        """FREEZE should target lanes not already frozen or won."""
        self.state.lanes[0].freeze_turns = 1
        self.state.lanes[1].winner = Player.PLAYER1

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'FREEZE')

        assert 0 not in targets  # Already frozen
        assert 1 not in targets  # Already won
        assert set(targets) == {2, 3, 4}

    def test_rush_targets_any_non_won_lane(self):
        """RUSH should target any lane not yet won."""
        self.state.lanes[0].winner = Player.PLAYER2

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'RUSH')

        assert 0 not in targets
        assert set(targets) == {1, 2, 3, 4}

    def test_nullify_targets_lanes_with_triggers(self):
        """NULLIFY should target lanes with active triggers."""
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[2].add_trigger(TriggerType.MIRROR, Player.PLAYER2, 2, order_id)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'NULLIFY')

        assert targets == [2]

    def test_raid_targets_enemy_side_not_full(self):
        """RAID should target lanes not full for opponent."""
        # Fill lane 0 for opponent
        for _ in range(5):
            self.state.lanes[0].add_piece(Player.PLAYER2)

        targets = get_valid_targets_for_perk(self.state, Player.PLAYER1, 'RAID')

        assert 0 not in targets
        assert set(targets) == {1, 2, 3, 4}


# =============================================================================
# Category 2: Unit Tests for get_all_moves()
# =============================================================================

class TestGetAllMoves:
    """Tests for move generation."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION

    def test_always_includes_pass_move(self):
        """get_all_moves should always include pass option."""
        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

        moves = get_all_moves(self.state, Player.PLAYER1)

        assert ('pass', None) in moves

    def test_generates_moves_for_all_offered_perks(self):
        """Should generate moves for each offered perk."""
        self.state.offered_perks = {
            1: 'PLACE_ANOTHER',
            2: 'REMOVE_ENEMY',
            3: 'GAMBIT'
        }
        self.state.lanes[0].add_piece(Player.PLAYER2)  # For removal

        moves = get_all_moves(self.state, Player.PLAYER1)

        # Should have pass + PlaceAnother targets + RemoveEnemy targets + Gambit
        assert len(moves) >= 3

    def test_no_target_perk_generates_single_move(self):
        """No-target perks should generate exactly one (slot, None) move."""
        self.state.offered_perks = {3: 'GAMBIT'}

        moves = get_all_moves(self.state, Player.PLAYER1)

        gambit_moves = [(s, t) for s, t in moves if s == 3]
        assert len(gambit_moves) == 1
        assert gambit_moves[0] == (3, None)

    def test_two_target_perk_generates_combination_moves(self):
        """Two-target perks should generate moves for all valid combinations."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[2].add_piece(Player.PLAYER1)
        self.state.lanes[4].add_piece(Player.PLAYER1)
        self.state.offered_perks = {3: 'REGROUP'}

        moves = get_all_moves(self.state, Player.PLAYER1)

        regroup_moves = [(s, t) for s, t in moves if s == 3]
        # 3 choose 2 = 3 combinations
        assert len(regroup_moves) == 3

    def test_empty_offered_perks_returns_only_pass(self):
        """Empty offered perks should return only pass move."""
        self.state.offered_perks = {}

        moves = get_all_moves(self.state, Player.PLAYER1)

        assert moves == [('pass', None)]

    def test_perk_with_no_valid_targets_generates_no_moves(self):
        """Perks with no valid targets should not generate moves (except pass)."""
        self.state.offered_perks = {2: 'REMOVE_ENEMY'}
        # No enemy pieces to remove

        moves = get_all_moves(self.state, Player.PLAYER1)

        remove_moves = [(s, t) for s, t in moves if s == 2]
        assert len(remove_moves) == 0


# =============================================================================
# Category 3: Unit Tests for terminal_score()
# =============================================================================

class TestTerminalScore:
    """Tests for terminal state scoring."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_player_win_returns_large_positive(self):
        """Winning state should return 10000."""
        self.state.game_over = True
        self.state.winner = Player.PLAYER1

        score = terminal_score(self.state, Player.PLAYER1)

        assert score == 10000.0

    def test_opponent_win_returns_large_negative(self):
        """Losing state should return -10000."""
        self.state.game_over = True
        self.state.winner = Player.PLAYER2

        score = terminal_score(self.state, Player.PLAYER1)

        assert score == -10000.0

    def test_draw_returns_zero(self):
        """Draw state should return 0."""
        self.state.game_over = True
        self.state.winner = None

        score = terminal_score(self.state, Player.PLAYER1)

        assert score == 0.0

    def test_score_is_symmetric(self):
        """Score should be negated when evaluated for opponent."""
        self.state.game_over = True
        self.state.winner = Player.PLAYER1

        p1_score = terminal_score(self.state, Player.PLAYER1)
        p2_score = terminal_score(self.state, Player.PLAYER2)

        assert p1_score == -p2_score


# =============================================================================
# Category 4: Unit Tests for evaluate_board_state()
# =============================================================================

class TestEvaluateBoardState:
    """Tests for heuristic board evaluation."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)

    def test_empty_board_returns_zero(self):
        """Empty board should evaluate to approximately 0."""
        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score == 0.0

    def test_lane_win_adds_1000_points(self):
        """Each won lane should add 1000 to score."""
        self.state.lanes[0].winner = Player.PLAYER1

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 1000.0

    def test_enemy_lane_win_subtracts_1000_points(self):
        """Each enemy won lane should subtract 1000 from score."""
        self.state.lanes[0].winner = Player.PLAYER2

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score <= -1000.0

    def test_piece_advantage_increases_score(self):
        """Having more pieces should increase score."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[0].add_piece(Player.PLAYER1)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score > 0

    def test_near_win_position_bonus(self):
        """Having 4 pieces on a lane (one from winning) should add bonus."""
        for _ in range(4):
            self.state.lanes[0].add_piece(Player.PLAYER1)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        # Should have piece value + near-win bonus (200)
        assert score >= 200.0

    def test_two_lanes_won_adds_urgency_bonus(self):
        """Having 2 lanes won should add urgency bonus."""
        self.state.lanes[0].winner = Player.PLAYER1
        self.state.lanes[1].winner = Player.PLAYER1

        score = evaluate_board_state(self.state, Player.PLAYER1)

        # 2000 (two lanes) + 300 (urgency bonus)
        assert score >= 2300.0

    def test_enemy_near_win_subtracts_bonus(self):
        """Enemy having 4 pieces should subtract bonus."""
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER2)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score <= -200.0

    def test_own_trigger_adds_value(self):
        """Own triggers on lanes should add value."""
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[2].add_trigger(TriggerType.MIRROR, Player.PLAYER1, 2, order_id)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 25.0

    def test_enemy_trigger_subtracts_value(self):
        """Enemy triggers should subtract value."""
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[2].add_trigger(TriggerType.TRAP, Player.PLAYER2, 2, order_id)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score <= -25.0

    def test_frozen_enemy_lane_adds_value(self):
        """Freezing opponent should add value."""
        self.state.lanes[1].freeze_player = Player.PLAYER2
        self.state.lanes[1].freeze_turns = 2

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 40.0

    def test_own_frozen_lane_subtracts_value(self):
        """Being frozen should subtract value."""
        self.state.lanes[1].freeze_player = Player.PLAYER1
        self.state.lanes[1].freeze_turns = 2

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score <= -40.0

    def test_cloak_adds_value(self):
        """Being cloaked should add value."""
        self.state.player1_cloaked = 2

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 30.0

    def test_blinded_enemy_adds_value(self):
        """Blinding enemy should add value."""
        self.state.player2_blinded = 2

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 30.0

    def test_sanctuary_adds_value(self):
        """Having a sanctuary should add value."""
        self.state.add_sanctuary(Player.PLAYER1, 0, 2)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 20.0

    def test_capture_adds_value(self):
        """Having a capture zone should add value."""
        self.state.add_capture(Player.PLAYER1, 0, 2)

        score = evaluate_board_state(self.state, Player.PLAYER1)

        assert score >= 25.0


# =============================================================================
# Category 5: Integration Tests for State Simulation
# =============================================================================

class TestSimulatePerkSelection:
    """Tests for perk selection simulation."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.current_player = Player.PLAYER1
        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

    def test_pass_move_switches_player(self):
        """Pass move should switch to opponent's turn."""
        new_state = simulate_perk_selection(self.state, ('pass', None))

        assert new_state.current_player == Player.PLAYER2

    def test_perk_execution_applies_effect(self):
        """Perk should be executed and effect applied."""
        new_state = simulate_perk_selection(self.state, (1, 0))

        assert new_state.lanes[0].pieces_for(Player.PLAYER1) == 1

    def test_simulation_does_not_modify_original_state(self):
        """Original state should remain unchanged."""
        original_pieces = self.state.lanes[0].pieces_for(Player.PLAYER1)

        simulate_perk_selection(self.state, (1, 0))

        assert self.state.lanes[0].pieces_for(Player.PLAYER1) == original_pieces

    def test_game_over_detection(self):
        """Simulation should detect game over conditions."""
        # Setup near-win position
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            self.state.lanes[lane_idx].winner = Player.PLAYER1
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER1)

        new_state = simulate_perk_selection(self.state, (1, 2))

        assert new_state.game_over is True
        assert new_state.winner == Player.PLAYER1


class TestSimulateAutoPlacement:
    """Tests for auto-placement simulation."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.AUTO_PLACEMENT
        self.state.current_player = Player.PLAYER1

    def test_auto_placement_adds_piece(self):
        """Auto-placement should add piece to specified lane."""
        new_state = simulate_auto_placement(self.state, 2)

        assert new_state.lanes[2].pieces_for(Player.PLAYER1) == 1

    def test_auto_placement_transitions_to_perk_selection(self):
        """After auto-placement, should be in perk selection phase."""
        new_state = simulate_auto_placement(self.state, 2)

        assert new_state.turn_phase == TurnPhase.PERK_SELECTION

    def test_auto_placement_offers_perks(self):
        """After auto-placement, perks should be offered."""
        new_state = simulate_auto_placement(self.state, 2)

        assert len(new_state.offered_perks) > 0

    def test_auto_placement_does_not_modify_original(self):
        """Original state should not be modified."""
        original_pieces = self.state.lanes[2].pieces_for(Player.PLAYER1)

        simulate_auto_placement(self.state, 2)

        assert self.state.lanes[2].pieces_for(Player.PLAYER1) == original_pieces


# =============================================================================
# Category 6: Integration Tests for Expectimax Search
# =============================================================================

class TestExpectimaxBasicBehavior:
    """Tests for basic expectimax search behavior."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.offered_perks = {1: 'PLACE_ANOTHER', 2: 'REMOVE_ENEMY'}

    def test_depth_zero_returns_evaluation(self):
        """Depth 0 should return board evaluation."""
        self.state.lanes[0].add_piece(Player.PLAYER1)

        result = expectimax(
            self.state, depth=0,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.MAX,
            root_player=Player.PLAYER1
        )

        expected = evaluate_board_state(self.state, Player.PLAYER1)
        assert result.score == expected
        assert result.move is None

    def test_game_over_returns_terminal_score(self):
        """Game over state should return terminal score."""
        self.state.game_over = True
        self.state.winner = Player.PLAYER1

        result = expectimax(
            self.state, depth=3,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.MAX,
            root_player=Player.PLAYER1
        )

        assert result.score == 10000.0

    def test_max_node_returns_best_move(self):
        """MAX node should return move with highest value."""
        self.state.lanes[2].add_piece(Player.PLAYER2)  # Target for removal

        result = expectimax(
            self.state, depth=1,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.MAX,
            root_player=Player.PLAYER1
        )

        assert result.move is not None
        assert result.move != ('pass', None) or len(self.state.offered_perks) == 0


class TestExpectimaxMoveSelection:
    """Tests for intelligent move selection."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.current_player = Player.PLAYER1

    def test_ai_chooses_winning_move(self):
        """AI should choose a move that wins the game."""
        # Setup: P1 has 2 lanes won, 4 pieces on lane 2
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            self.state.lanes[lane_idx].winner = Player.PLAYER1
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER1)

        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        # Should choose to place on lane 2 to win
        assert move == (1, 2)

    def test_ai_blocks_opponent_winning_move(self):
        """AI should block opponent's winning move when possible."""
        # Setup: P2 has 2 lanes won, 4 pieces on lane 2
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER2)
            self.state.lanes[lane_idx].winner = Player.PLAYER2
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER2)

        self.state.offered_perks = {2: 'REMOVE_ENEMY'}

        ai = ExpectimaxAI(depth=2)
        move = ai.choose_move(self.state)

        # Should choose to remove from lane 2 to block
        assert move == (2, 2)

    def test_ai_does_not_pass_when_winning_move_exists(self):
        """AI should not pass when a winning move is available."""
        # Setup a winning position
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            self.state.lanes[lane_idx].winner = Player.PLAYER1
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER1)

        self.state.offered_perks = {1: 'PLACE_ANOTHER', 3: 'GAMBIT'}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        # Should choose the winning move, not pass
        assert move != ('pass', None)


class TestExpectimaxAlphaBetaPruning:
    """Tests for alpha-beta pruning correctness."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.offered_perks = {1: 'PLACE_ANOTHER', 2: 'REMOVE_ENEMY'}
        self.state.lanes[0].add_piece(Player.PLAYER2)

    def test_pruning_gives_valid_result(self):
        """Alpha-beta pruning should give valid result."""
        result = expectimax(
            self.state, depth=2,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.MAX,
            root_player=Player.PLAYER1
        )

        assert result.move is not None
        assert result.score != float('-inf')
        assert result.score != float('inf')


class TestExpectimaxDepthBehavior:
    """Tests for depth-dependent behavior."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

    def test_deeper_search_finds_winning_move(self):
        """Deeper search should find winning move on obvious positions."""
        # Setup winning position
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            self.state.lanes[lane_idx].winner = Player.PLAYER1
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER1)

        ai_d1 = ExpectimaxAI(depth=1)
        ai_d2 = ExpectimaxAI(depth=2)

        move_d1 = ai_d1.choose_move(self.state)
        move_d2 = ai_d2.choose_move(self.state)

        # Both should find the winning move
        assert move_d1 == (1, 2)
        assert move_d2 == (1, 2)


# =============================================================================
# Category 7: Edge Case Tests
# =============================================================================

class TestExpectimaxEmptyBoard:
    """Tests for empty board edge cases."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION

    def test_empty_board_with_no_perks(self):
        """AI should pass when no perks offered."""
        self.state.offered_perks = {}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        assert move == ('pass', None)

    def test_empty_board_with_removal_perk_only(self):
        """AI should pass when only removal perk but no targets."""
        self.state.offered_perks = {2: 'REMOVE_ENEMY'}
        # No enemy pieces

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        assert move == ('pass', None)


class TestExpectimaxNearWinPositions:
    """Tests for near-win position handling."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION

    def test_immediate_win_detected_at_depth_1(self):
        """Immediate win should be found even at depth 1."""
        # P1 needs one piece to win
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER1)
            self.state.lanes[lane_idx].winner = Player.PLAYER1
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER1)

        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

        result = expectimax(
            self.state, depth=1,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.MAX,
            root_player=Player.PLAYER1
        )

        assert result.score == 10000.0
        assert result.move == (1, 2)

    def test_immediate_loss_threat_recognized(self):
        """Immediate loss threat should be recognized."""
        # P2 will win on their turn if not blocked
        for lane_idx in [0, 1]:
            for _ in range(5):
                self.state.lanes[lane_idx].add_piece(Player.PLAYER2)
            self.state.lanes[lane_idx].winner = Player.PLAYER2
        for _ in range(4):
            self.state.lanes[2].add_piece(Player.PLAYER2)

        self.state.offered_perks = {2: 'REMOVE_ENEMY'}

        ai = ExpectimaxAI(depth=2)
        move = ai.choose_move(self.state)

        # Should remove from lane 2
        assert move == (2, 2)


class TestExpectimaxNoValidMoves:
    """Tests for states with no valid moves."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION

    def test_all_lanes_full_for_placement(self):
        """Should handle all lanes being full for placement."""
        for lane in self.state.lanes:
            for _ in range(5):
                lane.add_piece(Player.PLAYER1)

        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        # No valid PlaceAnother targets, should pass
        assert move == ('pass', None)

    def test_game_already_over(self):
        """Should handle game over state."""
        for i, lane in enumerate(self.state.lanes):
            lane.winner = Player.PLAYER1 if i < 3 else Player.PLAYER2
        self.state.game_over = True
        self.state.winner = Player.PLAYER1

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        assert move == ('pass', None)


class TestExpectimaxComplexPerkInteractions:
    """Tests for complex perk interaction scenarios."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION

    def test_two_target_perk_execution(self):
        """AI should correctly handle two-target perks."""
        self.state.lanes[0].add_piece(Player.PLAYER1)
        self.state.lanes[2].add_piece(Player.PLAYER1)
        self.state.lanes[4].add_piece(Player.PLAYER1)

        self.state.offered_perks = {3: 'REGROUP'}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        # Should choose a valid two-lane combination or pass
        assert move[0] in [3, 'pass']
        if move[0] == 3:
            assert isinstance(move[1], tuple)
            assert len(move[1]) == 2

    def test_no_target_perk_execution(self):
        """AI should correctly handle no-target perks."""
        self.state.offered_perks = {4: 'GAMBIT'}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(self.state)

        # Should be either gambit or pass
        assert move[0] in [4, 'pass']
        if move[0] == 4:
            assert move[1] is None


# =============================================================================
# Category 8: Determinism and Consistency Tests
# =============================================================================

class TestExpectimaxDeterminism:
    """Tests for deterministic behavior."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.offered_perks = {1: 'PLACE_ANOTHER', 2: 'REMOVE_ENEMY'}
        self.state.lanes[1].add_piece(Player.PLAYER2)

    def test_same_seed_same_result(self):
        """Same seed should produce same AI decision."""
        ai1 = ExpectimaxAI(depth=2)
        ai2 = ExpectimaxAI(depth=2)

        move1 = ai1.choose_move(self.state)
        move2 = ai2.choose_move(self.state)

        assert move1 == move2

    def test_consistent_across_multiple_calls(self):
        """Multiple calls on same state should give same result."""
        ai = ExpectimaxAI(depth=2)

        # Clone state to avoid any state changes
        state_copy = self.state.clone()
        state_copy.set_seed(42)

        move1 = ai.choose_move(self.state)
        move2 = ai.choose_move(state_copy)

        assert move1 == move2


class TestExpectimaxChanceNodeAveraging:
    """Tests for CHANCE node probability handling."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.AUTO_PLACEMENT

    def test_chance_node_returns_finite_score(self):
        """CHANCE node should return finite score."""
        result = expectimax(
            self.state, depth=1,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.CHANCE,
            root_player=Player.PLAYER1
        )

        assert result.score != float('inf')
        assert result.score != float('-inf')

    def test_chance_node_with_limited_lanes(self):
        """CHANCE node with fewer available lanes."""
        self.state.lanes[0].winner = Player.PLAYER1
        self.state.lanes[1].winner = Player.PLAYER2

        result = expectimax(
            self.state, depth=1,
            alpha=float('-inf'), beta=float('inf'),
            node_type=NodeType.CHANCE,
            root_player=Player.PLAYER1
        )

        assert result.score is not None


class TestStateCloneIntegrity:
    """Tests for state cloning during search."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

    def test_search_does_not_modify_input_state(self):
        """Expectimax search should not modify the input state."""
        # Record initial state
        initial_pieces = [lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes]
        initial_phase = self.state.turn_phase
        initial_player = self.state.current_player

        # Run deep search
        ai = ExpectimaxAI(depth=3)
        ai.choose_move(self.state)

        # Verify state unchanged
        final_pieces = [lane.pieces_for(Player.PLAYER1) for lane in self.state.lanes]
        assert initial_pieces == final_pieces
        assert self.state.turn_phase == initial_phase
        assert self.state.current_player == initial_player

    def test_clone_preserves_offered_perks(self):
        """State clone should preserve offered perks."""
        clone = self.state.clone()

        assert clone.offered_perks == self.state.offered_perks

    def test_clone_preserves_triggers(self):
        """State clone should preserve trigger state."""
        order_id = self.state.get_next_trigger_order()
        self.state.lanes[2].add_trigger(TriggerType.MIRROR, Player.PLAYER1, 2, order_id)

        clone = self.state.clone()

        assert clone.lanes[2].has_trigger_type(TriggerType.MIRROR)


# =============================================================================
# Category 9: ExpectimaxAI Class and API Tests
# =============================================================================

class TestExpectimaxAIClass:
    """Tests for ExpectimaxAI class interface."""

    def test_default_depth(self):
        """Default depth should be 2."""
        ai = ExpectimaxAI()
        assert ai.depth == 2

    def test_custom_depth(self):
        """Custom depth should be respected."""
        ai = ExpectimaxAI(depth=4)
        assert ai.depth == 4

    def test_choose_move_returns_tuple(self):
        """choose_move should return (slot, target) tuple."""
        state = GameState()
        state.set_seed(42)
        state.turn_phase = TurnPhase.PERK_SELECTION
        state.offered_perks = {1: 'PLACE_ANOTHER'}

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(state)

        assert isinstance(move, tuple)
        assert len(move) == 2

    def test_game_over_returns_pass(self):
        """Game over state should return pass."""
        state = GameState()
        state.game_over = True

        ai = ExpectimaxAI(depth=1)
        move = ai.choose_move(state)

        assert move == ('pass', None)


class TestPresetDifficultyFunctions:
    """Tests for preset difficulty functions."""

    def setup_method(self):
        self.state = GameState()
        self.state.set_seed(42)
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self.state.offered_perks = {1: 'PLACE_ANOTHER'}

    def test_expectimax_depth1_function(self):
        """expectimax_depth1 should use depth 1."""
        move = expectimax_depth1(self.state)

        assert isinstance(move, tuple)
        assert len(move) == 2

    def test_expectimax_depth2_function(self):
        """expectimax_depth2 should use depth 2."""
        move = expectimax_depth2(self.state)

        assert isinstance(move, tuple)

    def test_expectimax_depth3_function(self):
        """expectimax_depth3 should use depth 3."""
        move = expectimax_depth3(self.state)

        assert isinstance(move, tuple)

    def test_create_expectimax_ai_factory(self):
        """create_expectimax_ai should create compatible AI function."""
        ai_fn = create_expectimax_ai(depth=2)
        move = ai_fn(self.state)

        assert isinstance(move, tuple)
        assert len(move) == 2


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
