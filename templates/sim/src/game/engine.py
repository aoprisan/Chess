"""Game engine - main game loop and turn execution."""

from typing import Optional, Callable, TYPE_CHECKING
from .state import GameState, Player, TurnPhase
from .rules import GameRules
from .config import GameConfig, DEFAULT_CONFIG

if TYPE_CHECKING:
    from .logger import GameLogger


class GameEngine:
    """Main game engine that executes turns and manages game flow."""

    def __init__(self, seed: Optional[int] = None, config: Optional[GameConfig] = None,
                 logger: Optional['GameLogger'] = None):
        """
        Initialize a new game.

        Args:
            seed: Random seed for deterministic games
            config: Game configuration (uses default if not provided)
            logger: Optional GameLogger for recording game events
        """
        self.config = config or DEFAULT_CONFIG
        self._seed = seed  # Store seed for reuse in start_game
        self.state = GameState(config=self.config)
        self.logger = logger

        if seed is not None:
            self.state.set_seed(seed)

        # Event callbacks
        self.on_auto_place: Optional[Callable[[int, Player], None]] = None
        self.on_perk_executed: Optional[Callable[[str, Player, dict], None]] = None
        self.on_lane_won: Optional[Callable[[int, Player], None]] = None
        self.on_game_over: Optional[Callable[[Player], None]] = None

    def start_game(self) -> None:
        """Start a new game."""
        self.state = GameState(config=self.config)
        if self._seed is not None:
            self.state.set_seed(self._seed)
        self.state.turn_phase = TurnPhase.AUTO_PLACEMENT

        # Log game start
        if self.logger:
            self.logger.log_game_start(self._seed)

    def do_auto_placement(self) -> Optional[int]:
        """Execute auto-placement phase. Returns lane where piece was placed, or None if no valid lane."""
        if self.state.turn_phase != TurnPhase.AUTO_PLACEMENT:
            return None

        player = self.state.current_player

        # Log turn start with board state
        if self.logger:
            from .logger import serialize_board_state
            board_state = serialize_board_state(self.state)
            self.logger.log_turn_start(self.state.turn_number, player.name, board_state)

        # Process pending raids first (probability resolution)
        from src.perks.deferred import process_pending_raids, process_deferred_effects
        raid_results = process_pending_raids(self.state, player)

        # Log raid resolutions
        if self.logger:
            for raid_result in raid_results:
                self.logger.log_raid_resolved(
                    self.state.turn_number,
                    player.name,
                    raid_result
                )

        # Process deferred effects from previous turn
        deferred_results = process_deferred_effects(self.state, player)

        # Log deferred resolutions
        if self.logger:
            for deferred_result in deferred_results:
                self.logger.log_deferred_resolved(
                    self.state.turn_number,
                    player.name,
                    deferred_result
                )

        # Check for lane wins after deferred effects (cleanup_won_lane called in check_lane_win)
        for i in range(self.config.LANES):
            lane = self.state.lanes[i]
            if lane.winner is None:
                winner = GameRules.check_lane_win(self.state, i)
                if winner:
                    if self.logger:
                        self.logger.log_lane_won(self.state.turn_number, i, winner.name)
                    if self.on_lane_won:
                        self.on_lane_won(i, winner)

        # Check for game over after deferred effects
        if GameRules.check_game_over(self.state):
            if self.logger:
                self.logger.log_game_over(
                    self.state.turn_number,
                    self.state.winner.name if self.state.winner else None
                )
            if self.on_game_over:
                self.on_game_over(self.state.winner)
            return None

        available_lanes = GameRules.get_valid_placement_lanes(self.state, player)

        if not available_lanes:
            # No valid lanes - rare edge case, skip to perk selection
            self.state.turn_phase = TurnPhase.PERK_SELECTION
            return None

        # Random lane selection
        lane = self.state.rng.choice(available_lanes)

        # Place the piece
        self.state.lanes[lane].add_piece(player)
        self.state.auto_placed_lane = lane

        # Fire placement triggers (opponent's triggers on this lane)
        from src.perks.triggers import fire_placement_triggers
        trigger_results = fire_placement_triggers(self.state, lane, player)

        # Log auto-placement with trigger results
        if self.logger:
            self.logger.log_auto_placement(
                self.state.turn_number,
                player.name,
                lane,
                trigger_results
            )

        # Check for lane win
        winner = GameRules.check_lane_win(self.state, lane)
        if winner:
            if self.logger:
                self.logger.log_lane_won(self.state.turn_number, lane, winner.name)
            if self.on_lane_won:
                self.on_lane_won(lane, winner)

        # Check for game over
        if GameRules.check_game_over(self.state):
            if self.logger:
                self.logger.log_game_over(
                    self.state.turn_number,
                    self.state.winner.name if self.state.winner else None
                )
            if self.on_game_over:
                self.on_game_over(self.state.winner)
            return lane

        # Callback
        if self.on_auto_place:
            self.on_auto_place(lane, player)

        # Move to perk selection
        self.state.turn_phase = TurnPhase.PERK_SELECTION
        self._offer_perks()

        return lane

    def _offer_perks(self) -> None:
        """Generate perk options for each slot."""
        from src.perks.base import get_perks_for_slot

        player = self.state.current_player

        for slot in [1, 2, 3, 4]:
            available = GameRules.get_available_perks(self.state, player, slot)
            if available:
                # For slots 3 and 4, pick a random perk from the pool
                if slot in [3, 4]:
                    perk = self.state.rng.choice(available)
                else:
                    # Slots 1 and 2 are fixed (PlaceAnother, RemoveEnemy)
                    perk = available[0] if available else None

                if perk:
                    self.state.offered_perks[slot] = perk

    def select_perk(self, slot: int | str, target: Optional[int] = None,
                    silent_fail: bool = False) -> bool:
        """
        Select a perk slot to use.

        Args:
            slot: 1, 2, 3, 4, or 'pass'
            target: Lane index for targeting (if required)
            silent_fail: If True, invalid moves due to Cloak/Blind will silently
                        pass the turn instead of returning False

        Returns:
            True if perk was executed successfully (or silently passed)
        """
        if self.state.turn_phase != TurnPhase.PERK_SELECTION:
            return False

        player = self.state.current_player

        # Handle pass
        if slot == 'pass' or slot == 0:
            self.state.record_slot_usage('pass')
            if self.logger:
                self.logger.log_perk_selection(
                    self.state.turn_number,
                    player.name,
                    'pass'
                )
            self._end_turn()
            return True

        # Validate slot
        if slot not in [1, 2, 3, 4]:
            return False

        if slot not in self.state.offered_perks:
            return False

        perk_type = self.state.offered_perks[slot]

        # Execute the perk
        from src.perks.base import execute_perk

        success, result = execute_perk(self.state, player, perk_type, target)

        if success:
            self.state.record_slot_usage(slot)
            self.state.record_perk_usage(perk_type)
            self.state.selected_perk = perk_type

            # Log perk selection
            if self.logger:
                self.logger.log_perk_selection(
                    self.state.turn_number,
                    player.name,
                    slot,
                    perk_type,
                    target,
                    result
                )

            if self.on_perk_executed:
                self.on_perk_executed(perk_type, player, result)

            # Check for lane wins after perk execution
            for i in range(self.config.LANES):
                lane = self.state.lanes[i]
                if lane.winner is None:  # Only check if not already won
                    winner = GameRules.check_lane_win(self.state, i)
                    if winner:
                        if self.logger:
                            self.logger.log_lane_won(self.state.turn_number, i, winner.name)
                        if self.on_lane_won:
                            self.on_lane_won(i, winner)

            # Check for game over
            if GameRules.check_game_over(self.state):
                if self.logger:
                    self.logger.log_game_over(
                        self.state.turn_number,
                        self.state.winner.name if self.state.winner else None
                    )
                if self.on_game_over:
                    self.on_game_over(self.state.winner)
                return True

            self._end_turn()
            return True

        # Perk execution failed
        if silent_fail:
            # Silent failure: treat as pass (used when AI has stale belief state)
            self.state.record_slot_usage('pass')
            if self.logger:
                self.logger.log_perk_selection(
                    self.state.turn_number,
                    player.name,
                    'pass',
                    perk=None,
                    target=None,
                    result={'silent_fail': True, 'attempted_perk': perk_type}
                )
            self._end_turn()
            return True

        return False

    def _end_turn(self) -> None:
        """End the current turn and switch players."""
        self.state.switch_player()

    def play_turn(self, slot_selector: Callable[[GameState], tuple[int | str, Optional[int]]]) -> bool:
        """
        Play a complete turn using the provided slot selector.

        When Cloak/Blind effects are active, the AI may make decisions based on
        stale "belief state" and choose invalid targets. In this case, the move
        silently fails (treated as pass).

        Args:
            slot_selector: Function that takes GameState and returns (slot, target)

        Returns:
            True if turn was completed successfully
        """
        if self.state.game_over:
            return False

        # Auto-placement
        self.do_auto_placement()

        if self.state.game_over:
            return True

        # Get AI decision
        slot, target = slot_selector(self.state)

        # Log AI decision if logger is enabled and AI has evaluation data
        if self.logger:
            self._log_ai_decision(slot_selector, slot, target)

        # Check if AI's vision is obscured (opponent cloaked or AI blinded)
        # If so, enable silent failure for invalid moves
        player = self.state.current_player
        opponent = player.opponent()
        vision_obscured = self.state.is_cloaked(opponent) or self.state.is_blinded(player)

        # Execute perk with silent failure if vision is obscured
        return self.select_perk(slot, target, silent_fail=vision_obscured)

    def _log_ai_decision(self, slot_selector, slot, target) -> None:
        """Log AI decision with evaluation data if available."""
        from .logger import serialize_board_state

        player = self.state.current_player

        # Try to get evaluation data from AI
        evaluations = None
        ai_type = 'unknown'

        if hasattr(slot_selector, 'get_last_evaluation'):
            evaluations = slot_selector.get_last_evaluation()
        if hasattr(slot_selector, 'ai_type'):
            ai_type = slot_selector.ai_type

        if evaluations is not None:
            self.logger.log_ai_decision(
                turn=self.state.turn_number,
                player=player.name,
                ai_type=ai_type,
                offered_perks=self.state.offered_perks.copy(),
                evaluations=evaluations,
                selected_slot=slot,
                selected_target=target
            )

    def run_game(self,
                 player1_ai: Callable[[GameState], tuple[int | str, Optional[int]]],
                 player2_ai: Callable[[GameState], tuple[int | str, Optional[int]]],
                 max_turns: int = 200) -> GameState:
        """
        Run a complete game with two AI players.

        Args:
            player1_ai: AI function for player 1
            player2_ai: AI function for player 2
            max_turns: Maximum turns before declaring draw

        Returns:
            Final game state
        """
        self.start_game()

        turn = 0
        while not self.state.game_over and turn < max_turns:
            ai = player1_ai if self.state.current_player == Player.PLAYER1 else player2_ai
            self.play_turn(ai)
            turn += 1

        return self.state

    def get_game_summary(self) -> dict:
        """Get a summary of the game state."""
        return {
            'turn_number': self.state.turn_number,
            'game_over': self.state.game_over,
            'winner': self.state.winner.name if self.state.winner else None,
            'player1_lanes': self.state.lanes_won_by(Player.PLAYER1),
            'player2_lanes': self.state.lanes_won_by(Player.PLAYER2),
            'slot_usage': self.state.slot_usage.copy(),
            'perk_usage': self.state.perk_usage.copy(),
            'lanes': [
                {
                    'p1_pieces': lane.player1_pieces,
                    'p2_pieces': lane.player2_pieces,
                    'winner': lane.winner.name if lane.winner else None
                }
                for lane in self.state.lanes
            ]
        }
