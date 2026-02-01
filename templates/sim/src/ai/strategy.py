"""AI strategy and decision making."""

from typing import Optional, Union, TYPE_CHECKING
from .heuristics import (
    Difficulty, get_best_placement_lane, get_best_removal_lane,
    score_lane_for_placement, score_lane_for_removal, evaluate_board_state
)
from .profiles import HeuristicProfile, get_profile, PROFILES

if TYPE_CHECKING:
    from ..game.state import GameState, Player

# Target type can be: None, single int, or tuple of two ints
TargetType = Union[None, int, tuple[int, int]]


class AIPlayer:
    """AI player with configurable difficulty and heuristic profile."""

    def __init__(self, difficulty: Difficulty = Difficulty.MEDIUM,
                 profile: str = 'v1'):
        """
        Initialize AI player.

        Args:
            difficulty: AI difficulty level
            profile: Name of heuristic profile to use (e.g., 'v1', 'v2')
        """
        self.difficulty = difficulty
        self.profile = get_profile(profile)
        self.profile_name = profile

        # Belief state for Cloak/Blind effects
        # When AI's vision is obscured (opponent cloaked or AI blinded),
        # we freeze a snapshot of what AI "believed" the board looked like
        self.belief_state: Optional['GameState'] = None
        self.belief_frozen_turn: int = -1  # Turn when belief was frozen

        # Last evaluation data for logging
        self._last_evaluation: Optional[dict] = None

    def _should_use_belief_state(self, state: 'GameState', player: 'Player') -> bool:
        """
        Check if AI should use belief state instead of real state.

        AI's vision is obscured when:
        - Opponent has activated Cloak (their pieces are hidden)
        - AI is Blinded (can't see opponent's pieces)

        Args:
            state: Real game state
            player: The AI player

        Returns:
            True if AI should use frozen belief state
        """
        opponent = player.opponent()
        # AI can't see opponent's pieces if opponent is cloaked or AI is blinded
        return state.is_cloaked(opponent) or state.is_blinded(player)

    def _update_belief_state(self, state: 'GameState', player: 'Player') -> 'GameState':
        """
        Get the state the AI should reason from.

        If vision is obscured and we don't have a belief state, freeze current state.
        If vision is obscured and we have a belief state, use the frozen one.
        If vision is clear, use real state (and clear belief state).

        Args:
            state: Real game state
            player: The AI player

        Returns:
            State to use for AI reasoning (real or belief)
        """
        should_use_belief = self._should_use_belief_state(state, player)

        if not should_use_belief:
            # Vision is clear - use real state, clear any frozen belief
            self.belief_state = None
            self.belief_frozen_turn = -1
            return state

        # Vision is obscured
        if self.belief_state is None or self.belief_frozen_turn < 0:
            # First turn of obscured vision - freeze current state as belief
            # Clone the state so changes don't affect the belief
            self.belief_state = state.clone()
            self.belief_frozen_turn = state.turn_number
            return self.belief_state
        else:
            # Continue using frozen belief state
            # But update non-opponent info (our pieces, turn number, etc.)
            # For simplicity, we use the stale belief but with updated "our" side
            return self._merge_belief_with_own_state(state, player)

    def _merge_belief_with_own_state(self, real_state: 'GameState', player: 'Player') -> 'GameState':
        """
        Create a merged state: AI's own pieces from real state, opponent pieces from belief.

        Args:
            real_state: Current real game state
            player: The AI player

        Returns:
            Merged state for AI reasoning
        """
        if self.belief_state is None:
            return real_state

        # Clone real state and replace opponent piece counts with belief
        merged = real_state.clone()
        opponent = player.opponent()

        for i, lane in enumerate(merged.lanes):
            if lane.winner is None:
                # Keep our pieces from real state, use belief for opponent
                belief_opponent_pieces = self.belief_state.lanes[i].pieces_for(opponent)
                lane.set_pieces_for(opponent, belief_opponent_pieces)

        return merged

    def choose_slot_and_target(self, state: 'GameState') -> tuple[int | str, TargetType]:
        """
        Choose which perk slot to use and target(s).

        When Cloak/Blind is active, AI uses a frozen "belief state" and may
        choose targets that are invalid in the real state. The engine should
        handle this by silently failing invalid moves.

        Args:
            state: Current game state

        Returns:
            Tuple of (slot, target) where target can be:
            - None (for no-target perks like Scramble, Gambit, Steal, Blind, Cloak)
            - int (for single-target perks)
            - tuple[int, int] (for two-target perks like Regroup, Disrupt)
        """
        player = state.current_player
        offered = state.offered_perks

        if not offered:
            self._last_evaluation = {'pass': {'perk': None, 'score': 0, 'target': None}}
            return 'pass', None

        # Get the state AI should reason from (may be belief state if vision obscured)
        reasoning_state = self._update_belief_state(state, player)

        # Evaluate each available slot using the reasoning state
        slot_scores = {}

        for slot, perk_name in offered.items():
            score, target = self._evaluate_perk(reasoning_state, player, perk_name)
            slot_scores[slot] = (score, target, perk_name)

        # Add pass option with baseline score
        pass_score = self._pass_score()
        slot_scores['pass'] = (pass_score, None, 'PASS')

        # Store evaluations for logging
        self._last_evaluation = {
            str(slot): {
                'perk': perk_name,
                'score': round(score, 2),
                'target': target
            }
            for slot, (score, target, perk_name) in slot_scores.items()
        }

        # Select best option
        if self.difficulty == Difficulty.EASY:
            # Easy: sometimes pick randomly
            if state.rng.random() < 0.25:
                available = list(offered.keys())
                slot = state.rng.choice(available)
                _, target, _ = slot_scores[slot]
                return slot, target

        # Pick highest scoring slot
        best_slot = max(slot_scores.keys(), key=lambda s: slot_scores[s][0])
        _, target, _ = slot_scores[best_slot]

        return best_slot, target

    def get_last_evaluation(self) -> Optional[dict]:
        """
        Get the evaluation data from the last decision.

        Returns:
            Dict mapping slot -> {perk, score, target} or None if no evaluation yet
        """
        return self._last_evaluation

    def validate_and_adjust_target(self, state: 'GameState', perk_name: str,
                                    target: TargetType) -> tuple[bool, TargetType]:
        """
        Validate a target against the real game state and adjust if invalid.

        When AI is using belief state, the chosen target may be invalid in reality.
        This method checks and either:
        - Returns the target unchanged if valid
        - Returns a valid alternative if possible
        - Returns (False, None) for silent failure

        Args:
            state: Real game state
            perk_name: Name of the perk
            target: Target chosen by AI (possibly from belief state)

        Returns:
            Tuple of (valid, adjusted_target)
        """
        player = state.current_player
        opponent = player.opponent()

        # No-target perks are always valid
        if perk_name in ['GAMBIT', 'SCRAMBLE', 'STEAL', 'CLOAK', 'BLIND']:
            return True, None

        # Validate based on perk type
        if perk_name == 'REMOVE_ENEMY':
            # Target must have enemy pieces
            valid_lanes = state.get_lanes_with_pieces(opponent)
            if target in valid_lanes:
                return True, target
            # Silent failure - no valid target
            return False, None

        elif perk_name == 'PLACE_ANOTHER':
            # Target must be available for placement
            from src.game.rules import GameRules
            valid_lanes = GameRules.get_valid_placement_lanes(state, player)
            if target in valid_lanes:
                return True, target
            # Try to find alternative
            if valid_lanes:
                return True, state.rng.choice(valid_lanes)
            return False, None

        # For other perks, trust the target (detailed validation happens in perk execution)
        return True, target

    def _pass_score(self) -> float:
        """Get baseline score for passing (not using a perk)."""
        # Passing is generally suboptimal but not terrible
        if self.difficulty == Difficulty.EASY:
            return 20  # Easy AI sometimes passes
        elif self.difficulty == Difficulty.MEDIUM:
            return 5   # Medium rarely passes
        else:
            return 0   # Hard never passes if there's a good option

    def _evaluate_perk(self, state: 'GameState', player: 'Player',
                       perk_name: str) -> tuple[float, TargetType]:
        """
        Evaluate a perk's expected value and best target(s).

        Args:
            state: Current game state
            player: Current player
            perk_name: Name of the perk

        Returns:
            Tuple of (expected_value, target) where target can be:
            - None (for no-target perks)
            - int (for single-target perks)
            - tuple[int, int] (for two-target perks)
        """
        opponent = player.opponent()

        p = self.profile  # Shorthand for profile access

        # Common perks - MANDATORY single target
        if perk_name == 'PLACE_ANOTHER':
            target = get_best_placement_lane(state, player, self.difficulty)
            if target is None:
                return -100, None
            score = score_lane_for_placement(state, player, target, self.difficulty)
            return score + p.place_another_bonus, target

        elif perk_name == 'REMOVE_ENEMY':
            target = get_best_removal_lane(state, player, self.difficulty)
            if target is None:
                return -100, None
            score = score_lane_for_removal(state, player, target, self.difficulty)
            return score + p.remove_enemy_bonus, target

        # Trigger perks - MANDATORY single target
        elif perk_name in ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE',
                           'HYDRA', 'BACKFIRE', 'ABSORB', 'RETALIATE']:
            return self._evaluate_trigger_perk(state, player, perk_name)

        # Duration perks - varies by perk
        elif perk_name in ['FREEZE', 'CLOAK', 'BLIND', 'SANCTUARY', 'CAPTURE']:
            return self._evaluate_duration_perk(state, player, perk_name)

        # Immediate action perks
        elif perk_name in ['GAMBIT', 'SPLIT', 'SCRAMBLE', 'KAMIKAZE', 'DISRUPT',
                           'DISPERSE', 'STEAL', 'RUSH', 'NULLIFY', 'REGROUP', 'SCATTER']:
            return self._evaluate_immediate_perk(state, player, perk_name)

        # Deferred perks
        elif perk_name in ['SIGNAL', 'ENLIST', 'AMBUSH', 'REINFORCE', 'RAID']:
            return self._evaluate_deferred_perk(state, player, perk_name)

        # Unknown perk - default low score
        return 10, None

    def _evaluate_trigger_perk(self, state: 'GameState', player: 'Player',
                               perk_name: str) -> tuple[float, Optional[int]]:
        """Evaluate a trigger-setting perk. All triggers require mandatory target."""
        opponent = player.opponent()
        p = self.profile
        from src.game.state import TriggerType

        # Map perk names to trigger types for checking existing triggers
        trigger_map = {
            'PORTAL': TriggerType.PORTAL, 'TRAP': TriggerType.TRAP,
            'MIRROR': TriggerType.MIRROR, 'ECHO': TriggerType.ECHO,
            'SHOCKWAVE': TriggerType.SHOCKWAVE, 'RETALIATE': TriggerType.RETALIATE,
            'HYDRA': TriggerType.HYDRA, 'BACKFIRE': TriggerType.BACKFIRE,
            'ABSORB': TriggerType.ABSORB
        }
        trigger_type = trigger_map.get(perk_name)

        best_score = 0
        best_lane = None

        for i, lane in enumerate(state.lanes):
            # Skip if trigger already exists on this lane (use has_trigger_type for list-based triggers)
            if trigger_type and lane.has_trigger_type(trigger_type):
                continue

            score = 0
            their_pieces = lane.pieces_for(opponent)
            my_pieces = lane.pieces_for(player)

            # Offensive placement triggers (opponent's field - not won by us)
            if perk_name in ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE']:
                if lane.winner == player:
                    continue  # Can't place on our won lanes
                if not lane.is_full_for(opponent):
                    score = their_pieces * p.trigger_offensive_mult
                    if their_pieces >= 3:
                        score += p.trigger_offensive_bonus

            # Retaliate: YOUR field (must have your pieces)
            elif perk_name == 'RETALIATE':
                if lane.winner is not None:
                    continue
                if my_pieces == 0:
                    continue  # Must have your pieces
                score = my_pieces * p.trigger_defensive_mult
                if their_pieces > 0:  # More valuable if opponent also has pieces
                    score += 20

            # Removal triggers (YOUR field - must have your pieces)
            elif perk_name in ['HYDRA', 'BACKFIRE', 'ABSORB']:
                if lane.winner is not None:
                    continue
                if my_pieces == 0:
                    continue  # Must have your pieces
                score = my_pieces * p.trigger_defensive_mult
                if my_pieces >= 3:
                    score += p.trigger_defensive_bonus

            if score > best_score:
                best_score = score
                best_lane = i

        if best_lane is None:
            return -100, None  # No valid target

        return best_score, best_lane

    def _evaluate_duration_perk(self, state: 'GameState', player: 'Player',
                                perk_name: str) -> tuple[float, TargetType]:
        """Evaluate a duration perk."""
        opponent = player.opponent()
        p = self.profile

        # CLOAK: No target - affects entire your field
        if perk_name == 'CLOAK':
            if state.is_cloaked(player):
                return -100, None  # Already cloaked
            # Value based on how many pieces we have
            total_pieces = sum(l.pieces_for(player) for l in state.lanes if l.winner is None)
            return p.cloak_base + total_pieces * p.cloak_piece_mult, None  # No target needed

        # BLIND: No target - affects entire enemy field
        elif perk_name == 'BLIND':
            if state.is_blinded(opponent):
                return -100, None  # Opponent already blinded
            # Value based on how many enemy pieces there are
            total_enemy = sum(l.pieces_for(opponent) for l in state.lanes if l.winner is None)
            return p.blind_base + total_enemy * p.blind_piece_mult, None  # No target needed

        # FREEZE: Mandatory single target
        elif perk_name == 'FREEZE':
            best_score = 0
            best_lane = None
            for i, lane in enumerate(state.lanes):
                if lane.winner is not None or lane.freeze_turns > 0:
                    continue
                their_pieces = lane.pieces_for(opponent)
                if their_pieces >= 4:
                    score = p.freeze_multi_threat
                elif their_pieces >= 3:
                    score = p.freeze_single_threat
                else:
                    score = p.freeze_base + their_pieces * 5
                if score > best_score:
                    best_score = score
                    best_lane = i
            if best_lane is None:
                return -100, None
            return best_score, best_lane

        # SANCTUARY: Mandatory target (your available lane, no piece req)
        # Multiple sanctuaries are now allowed
        elif perk_name == 'SANCTUARY':
            best_score = 0
            best_lane = None
            for i, lane in enumerate(state.lanes):
                if lane.winner is not None or lane.is_full_for(player):
                    continue
                my_pieces = lane.pieces_for(player)
                score = p.sanctuary_base + my_pieces * p.sanctuary_piece_mult  # Prefer lanes where we have pieces
                if score > best_score:
                    best_score = score
                    best_lane = i
            if best_lane is None:
                return -100, None
            return best_score, best_lane

        # CAPTURE: Mandatory target (YOUR field - must have your pieces)
        # Multiple captures are now allowed
        elif perk_name == 'CAPTURE':
            best_score = 0
            best_lane = None
            for i, lane in enumerate(state.lanes):
                if lane.winner is not None:
                    continue
                my_pieces = lane.pieces_for(player)
                if my_pieces == 0 or lane.is_full_for(player):
                    continue  # Must have your pieces and space
                their_pieces = lane.pieces_for(opponent)
                score = p.capture_base + their_pieces * p.capture_piece_mult  # Value based on enemy pieces to capture
                if score > best_score:
                    best_score = score
                    best_lane = i
            if best_lane is None:
                return -100, None
            return best_score, best_lane

        return -100, None

    def _evaluate_immediate_perk(self, state: 'GameState', player: 'Player',
                                 perk_name: str) -> tuple[float, TargetType]:
        """Evaluate an immediate effect perk."""
        opponent = player.opponent()
        p = self.profile

        # GAMBIT: No target (fully automatic)
        if perk_name == 'GAMBIT':
            available_lanes = sum(1 for l in state.lanes
                                 if l.winner is None and not l.is_full_for(player))
            return p.gambit_base if available_lanes >= 2 else p.gambit_low, None

        # SPLIT: Mandatory single target (lane to sacrifice from)
        elif perk_name == 'SPLIT':
            lanes_with_pieces = state.get_lanes_with_pieces(player)
            if not lanes_with_pieces:
                return -100, None
            # Pick lane with most pieces to sacrifice from
            best_lane = max(lanes_with_pieces, key=lambda i: state.lanes[i].pieces_for(player))
            return p.split_base, best_lane

        # SCRAMBLE: No target (affects all enemy pieces)
        elif perk_name == 'SCRAMBLE':
            enemy_pieces = sum(l.pieces_for(opponent) for l in state.lanes if l.winner is None)
            return p.scramble_base + enemy_pieces * p.scramble_piece_mult if enemy_pieces > 0 else -100, None

        # KAMIKAZE: Mandatory single target (lane to sacrifice from)
        elif perk_name == 'KAMIKAZE':
            my_lanes = state.get_lanes_with_pieces(player)
            if not my_lanes:
                return -100, None
            # Pick lane with fewest pieces to sacrifice from
            best_lane = min(my_lanes, key=lambda i: state.lanes[i].pieces_for(player))
            # Still valuable even if enemy has 0 pieces (sacrifice happens)
            return p.kamikaze_base, best_lane

        # STEAL: No target (fully automatic)
        # Requires enemy pieces to steal - placement is secondary
        elif perk_name == 'STEAL':
            enemy_lanes = state.get_lanes_with_pieces(opponent)
            if not enemy_lanes:
                return -100, None  # No enemy pieces to steal
            # Bonus for having space to place the stolen piece
            available_for_us = [i for i, l in enumerate(state.lanes)
                               if l.winner is None and not l.is_full_for(player)]
            if available_for_us:
                return p.steal_full, None  # Full value: steal + place
            return p.steal_partial, None  # Partial value: steal only (piece is lost)

        # RUSH: Mandatory single target
        elif perk_name == 'RUSH':
            valid_lanes = [i for i, l in enumerate(state.lanes) if l.winner is None]
            if not valid_lanes:
                return -100, None
            best_lane = get_best_placement_lane(state, player, self.difficulty)
            if best_lane is None:
                best_lane = state.rng.choice(valid_lanes)
            return p.rush_base, best_lane

        # NULLIFY: Mandatory single target (lane with triggers)
        elif perk_name == 'NULLIFY':
            lanes_with_triggers = [i for i, l in enumerate(state.lanes)
                                  if l.winner is None and l.has_triggers()]
            if not lanes_with_triggers:
                return -100, None
            # Pick lane with most triggers
            best_lane = max(lanes_with_triggers, key=lambda i: len(state.lanes[i].triggers))
            return p.nullify_base, best_lane

        # DISPERSE: Mandatory single target (enemy lane to disperse from)
        elif perk_name == 'DISPERSE':
            enemy_lanes = state.get_lanes_with_pieces(opponent)
            if not enemy_lanes:
                return -100, None
            # Pick lane with most enemy pieces
            best_lane = max(enemy_lanes, key=lambda i: state.lanes[i].pieces_for(opponent))
            return p.disperse_base, best_lane

        # SCATTER: Mandatory single target (your lane to scatter from)
        elif perk_name == 'SCATTER':
            my_lanes = state.get_lanes_with_pieces(player)
            if not my_lanes:
                return -100, None
            # Pick lane with most of your pieces
            best_lane = max(my_lanes, key=lambda i: state.lanes[i].pieces_for(player))
            return p.scatter_base, best_lane

        # DISRUPT: Two mandatory targets (enemy lanes to swap)
        elif perk_name == 'DISRUPT':
            enemy_lanes = state.get_lanes_with_pieces(opponent)
            if len(enemy_lanes) < 2:
                return -100, None
            # Pick two lanes with most enemy pieces
            sorted_lanes = sorted(enemy_lanes, key=lambda i: state.lanes[i].pieces_for(opponent), reverse=True)
            return p.disrupt_base, (sorted_lanes[0], sorted_lanes[1])

        # REGROUP: Two mandatory targets (your lanes to swap)
        elif perk_name == 'REGROUP':
            my_lanes = state.get_lanes_with_pieces(player)
            if len(my_lanes) < 2:
                return -100, None
            # Pick two lanes with most and least pieces (maximize impact)
            sorted_lanes = sorted(my_lanes, key=lambda i: state.lanes[i].pieces_for(player))
            # Swap from most populated to least populated
            return p.regroup_base, (sorted_lanes[-1], sorted_lanes[0])

        return -100, None

    def _evaluate_deferred_perk(self, state: 'GameState', player: 'Player',
                                perk_name: str) -> tuple[float, Optional[int]]:
        """Evaluate a deferred perk. All require mandatory single target."""
        opponent = player.opponent()
        p = self.profile
        best_score = 0
        best_lane = None

        for i, lane in enumerate(state.lanes):
            if lane.winner is not None:
                continue

            score = 0

            # SIGNAL: Target lane for immediate +1 and pull from most populated
            if perk_name == 'SIGNAL':
                if not lane.is_full_for(player):
                    my_pieces = lane.pieces_for(player)
                    score = p.signal_base + my_pieces * p.signal_piece_mult  # +immediate piece makes it better

            # ENLIST: Target must be YOUR field (has your pieces)
            elif perk_name == 'ENLIST':
                my_pieces = lane.pieces_for(player)
                if my_pieces > 0 and not lane.is_full_for(player):
                    score = p.enlist_base  # Immediate placement + capture later

            # AMBUSH: Target for immediate +1 and remove from lane or adjacent
            elif perk_name == 'AMBUSH':
                if not lane.is_full_for(player):
                    # Check if lane or adjacent has enemy pieces for deferred removal
                    adjacent = [i]
                    if i > 0: adjacent.append(i - 1)
                    if i < len(state.lanes) - 1: adjacent.append(i + 1)
                    has_enemy_nearby = any(state.lanes[j].pieces_for(opponent) > 0
                                          for j in adjacent if state.lanes[j].winner is None)
                    if has_enemy_nearby:
                        score = p.ambush_full  # Immediate + removal
                    else:
                        score = p.ambush_partial  # Just immediate

            # REINFORCE: Target for immediate +1 and +1 more next turn
            elif perk_name == 'REINFORCE':
                if not lane.is_full_for(player):
                    my_pieces = lane.pieces_for(player)
                    if my_pieces >= 3:
                        score = p.reinforce_near_win  # Near win - 2 pieces!
                    else:
                        score = p.reinforce_base  # Double placement value

            # RAID: Target must not be full for opponent, immediate on enemy side
            elif perk_name == 'RAID':
                if not lane.is_full_for(opponent):
                    their_pieces = lane.pieces_for(opponent)
                    score = p.raid_base + their_pieces * p.raid_piece_mult  # Probability of recruits

            if score > best_score:
                best_score = score
                best_lane = i

        if best_lane is None:
            return -100, None

        return best_score, best_lane


def create_ai_function(difficulty: Difficulty = Difficulty.MEDIUM,
                       profile: str = 'v1'):
    """
    Create an AI function compatible with GameEngine.run_game().

    Args:
        difficulty: AI difficulty level
        profile: Name of heuristic profile to use (e.g., 'v1', 'v2')

    Returns:
        Function that takes GameState and returns (slot, target)
        The function has a .get_last_evaluation() method for logging
    """
    ai = AIPlayer(difficulty, profile)

    def ai_function(state: 'GameState') -> tuple[int | str, Optional[int]]:
        return ai.choose_slot_and_target(state)

    # Attach method for evaluation retrieval
    ai_function.get_last_evaluation = ai.get_last_evaluation
    ai_function.ai_type = f'{difficulty.name.lower()}_{profile}'

    return ai_function


# Create persistent AI instances for convenience functions (using v1 profile)
_easy_ai_instance = AIPlayer(Difficulty.EASY, 'v1')
_medium_ai_instance = AIPlayer(Difficulty.MEDIUM, 'v1')
_hard_ai_instance = AIPlayer(Difficulty.HARD, 'v1')


def easy_ai(state: 'GameState') -> tuple[int | str, Optional[int]]:
    """Easy difficulty AI (v1 profile)."""
    return _easy_ai_instance.choose_slot_and_target(state)


# Attach evaluation method
easy_ai.get_last_evaluation = _easy_ai_instance.get_last_evaluation
easy_ai.ai_type = 'easy_v1'


def medium_ai(state: 'GameState') -> tuple[int | str, Optional[int]]:
    """Medium difficulty AI (v1 profile)."""
    return _medium_ai_instance.choose_slot_and_target(state)


medium_ai.get_last_evaluation = _medium_ai_instance.get_last_evaluation
medium_ai.ai_type = 'medium_v1'


def hard_ai(state: 'GameState') -> tuple[int | str, Optional[int]]:
    """Hard difficulty AI (v1 profile)."""
    return _hard_ai_instance.choose_slot_and_target(state)


hard_ai.get_last_evaluation = _hard_ai_instance.get_last_evaluation
hard_ai.ai_type = 'hard_v1'


def random_ai(state: 'GameState') -> tuple[int | str, TargetType]:
    """Random AI - picks randomly from available slots and generates valid targets."""
    available = list(state.offered_perks.keys())
    if not available:
        return 'pass', None

    slot = state.rng.choice(available)
    perk_name = state.offered_perks.get(slot)
    player = state.current_player
    opponent = player.opponent()

    # Generate valid random target based on perk type
    target = None

    # No-target perks
    if perk_name in ['GAMBIT', 'SCRAMBLE', 'STEAL', 'CLOAK', 'BLIND']:
        return slot, None

    # Placement target perks (your lane, not full)
    if perk_name in ['PLACE_ANOTHER', 'FREEZE', 'SIGNAL', 'REINFORCE', 'SANCTUARY']:
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None and not l.is_full_for(player)]
        target = state.rng.choice(valid) if valid else None

    # Removal target perks (enemy lane with pieces)
    elif perk_name == 'REMOVE_ENEMY':
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None and l.pieces_for(opponent) > 0]
        target = state.rng.choice(valid) if valid else None

    # Your pieces target (sacrifice perks)
    elif perk_name in ['SPLIT', 'KAMIKAZE', 'SCATTER']:
        valid = state.get_lanes_with_pieces(player)
        target = state.rng.choice(valid) if valid else None

    # Enemy pieces target
    elif perk_name == 'DISPERSE':
        valid = state.get_lanes_with_pieces(opponent)
        target = state.rng.choice(valid) if valid else None

    # Rush - any non-won lane
    elif perk_name == 'RUSH':
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None]
        target = state.rng.choice(valid) if valid else None

    # Placement triggers (opponent's side, not won by us)
    elif perk_name in ['PORTAL', 'TRAP', 'MIRROR', 'ECHO', 'SHOCKWAVE']:
        valid = [i for i, l in enumerate(state.lanes) if l.winner != player]
        target = state.rng.choice(valid) if valid else None

    # Your-side triggers (need your pieces)
    elif perk_name in ['HYDRA', 'BACKFIRE', 'ABSORB', 'RETALIATE', 'ENLIST', 'CAPTURE']:
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None and l.pieces_for(player) > 0]
        target = state.rng.choice(valid) if valid else None

    # Ambush - any non-won lane not full
    elif perk_name == 'AMBUSH':
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None and not l.is_full_for(player)]
        target = state.rng.choice(valid) if valid else None

    # Raid - enemy side not full
    elif perk_name == 'RAID':
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None and not l.is_full_for(opponent)]
        target = state.rng.choice(valid) if valid else None

    # Nullify - lanes with triggers
    elif perk_name == 'NULLIFY':
        valid = [i for i, l in enumerate(state.lanes) if l.winner is None and l.has_triggers()]
        target = state.rng.choice(valid) if valid else None

    # Two-target perks
    elif perk_name == 'REGROUP':
        valid = state.get_lanes_with_pieces(player)
        if len(valid) >= 2:
            lanes = state.rng.sample(valid, 2)
            target = (lanes[0], lanes[1])

    elif perk_name == 'DISRUPT':
        valid = state.get_lanes_with_pieces(opponent)
        if len(valid) >= 2:
            lanes = state.rng.sample(valid, 2)
            target = (lanes[0], lanes[1])

    return slot, target
