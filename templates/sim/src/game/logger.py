"""Game logging for replay and debugging."""

import json
from dataclasses import dataclass, field, asdict
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class EventType(Enum):
    """Types of game events that can be logged."""
    GAME_START = "game_start"
    TURN_START = "turn_start"
    AUTO_PLACEMENT = "auto_placement"
    RAID_RESOLVED = "raid_resolved"
    DEFERRED_RESOLVED = "deferred_resolved"
    PERK_SELECTION = "perk_selection"
    TRIGGER_FIRED = "trigger_fired"
    LANE_WON = "lane_won"
    GAME_OVER = "game_over"
    AI_DECISION = "ai_decision"


@dataclass
class GameEvent:
    """A single game event."""
    event_type: EventType
    turn: int
    player: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    data: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert event to dictionary."""
        return {
            'event_type': self.event_type.value,
            'turn': self.turn,
            'player': self.player,
            'timestamp': self.timestamp,
            'data': self.data
        }


class GameLogger:
    """
    Logger for recording game events for replay and analysis.

    Usage:
        logger = GameLogger()
        engine = GameEngine(seed=42, logger=logger)
        engine.run_game(ai1, ai2)

        # Get log in various formats
        print(logger.get_text_log())
        print(logger.to_json())

        # Save to file
        logger.save("game_replay.json")
    """

    def __init__(self, enabled: bool = True, verbose: bool = False):
        """
        Initialize the logger.

        Args:
            enabled: Whether logging is enabled
            verbose: Whether to log verbose details
        """
        self.enabled = enabled
        self.verbose = verbose
        self.events: list[GameEvent] = []
        self.game_seed: Optional[int] = None
        self.start_time: Optional[str] = None
        self.end_time: Optional[str] = None

    def log_game_start(self, seed: Optional[int] = None) -> None:
        """Log game start event."""
        if not self.enabled:
            return

        self.game_seed = seed
        self.start_time = datetime.now().isoformat()

        self._add_event(
            EventType.GAME_START,
            turn=0,
            player="SYSTEM",
            data={
                'seed': seed,
                'start_time': self.start_time
            }
        )

    def log_turn_start(self, turn: int, player: str, board_state: Optional[dict] = None) -> None:
        """
        Log turn start event with optional board state snapshot.

        Args:
            turn: Current turn number
            player: Current player
            board_state: Optional board state snapshot from serialize_board_state()
        """
        if not self.enabled:
            return

        data = {}
        if board_state is not None:
            data['board'] = board_state

        self._add_event(
            EventType.TURN_START,
            turn=turn,
            player=player,
            data=data
        )

    def log_auto_placement(self, turn: int, player: str, lane: int,
                           trigger_results: Optional[list] = None) -> None:
        """
        Log auto-placement event.

        Args:
            turn: Current turn number
            player: Player who placed (PLAYER1 or PLAYER2)
            lane: Lane where piece was placed
            trigger_results: Results from any triggers that fired
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.AUTO_PLACEMENT,
            turn=turn,
            player=player,
            data={
                'lane': lane,
                'triggers_fired': trigger_results if trigger_results else []
            }
        )

    def log_raid_resolved(self, turn: int, player: str, result: dict) -> None:
        """
        Log raid resolution event.

        Args:
            turn: Current turn number
            player: Raid owner
            result: Raid resolution result (outcome, lane, pieces gained, etc.)
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.RAID_RESOLVED,
            turn=turn,
            player=player,
            data=result
        )

    def log_deferred_resolved(self, turn: int, player: str, result: dict) -> None:
        """
        Log deferred effect resolution event.

        Args:
            turn: Current turn number
            player: Effect owner
            result: Resolution result
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.DEFERRED_RESOLVED,
            turn=turn,
            player=player,
            data=result
        )

    def log_perk_selection(self, turn: int, player: str, slot: int | str,
                           perk: Optional[str] = None, target: Any = None,
                           result: Optional[dict] = None) -> None:
        """
        Log perk selection event.

        Args:
            turn: Current turn number
            player: Player who selected perk
            slot: Slot chosen (1, 2, 3, 4, or 'pass')
            perk: Perk name if not pass
            target: Target(s) for the perk
            result: Perk execution result
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.PERK_SELECTION,
            turn=turn,
            player=player,
            data={
                'slot': slot if isinstance(slot, str) else int(slot),
                'perk': perk,
                'target': target,
                'result': result
            }
        )

    def log_trigger_fired(self, turn: int, trigger_type: str, lane: int,
                          owner: str, result: dict) -> None:
        """
        Log trigger fired event.

        Args:
            turn: Current turn number
            trigger_type: Type of trigger
            lane: Lane where trigger fired
            owner: Trigger owner
            result: Trigger result
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.TRIGGER_FIRED,
            turn=turn,
            player=owner,
            data={
                'trigger_type': trigger_type,
                'lane': lane,
                'result': result
            }
        )

    def log_lane_won(self, turn: int, lane: int, winner: str) -> None:
        """
        Log lane win event.

        Args:
            turn: Current turn number
            lane: Lane that was won
            winner: Winning player
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.LANE_WON,
            turn=turn,
            player=winner,
            data={
                'lane': lane
            }
        )

    def log_ai_decision(self, turn: int, player: str, ai_type: str,
                        offered_perks: dict, evaluations: dict,
                        selected_slot: int | str, selected_target: Any) -> None:
        """
        Log AI decision with all evaluated options.

        Args:
            turn: Current turn number
            player: Player making the decision
            ai_type: Type of AI (e.g., 'hard', 'minimax2')
            offered_perks: Dict mapping slot -> perk name
            evaluations: Dict mapping slot/pass -> {perk, score, target}
            selected_slot: The slot that was selected
            selected_target: The target that was selected
        """
        if not self.enabled:
            return

        self._add_event(
            EventType.AI_DECISION,
            turn=turn,
            player=player,
            data={
                'ai_type': ai_type,
                'offered_perks': {str(k): v for k, v in offered_perks.items()},
                'evaluations': evaluations,
                'selected': {
                    'slot': selected_slot if isinstance(selected_slot, str) else int(selected_slot),
                    'target': selected_target
                }
            }
        )

    def log_game_over(self, turn: int, winner: Optional[str] = None,
                      reason: str = "standard") -> None:
        """
        Log game over event.

        Args:
            turn: Final turn number
            winner: Winning player (None for draw)
            reason: Reason for game end
        """
        if not self.enabled:
            return

        self.end_time = datetime.now().isoformat()

        self._add_event(
            EventType.GAME_OVER,
            turn=turn,
            player=winner or "DRAW",
            data={
                'winner': winner,
                'reason': reason,
                'end_time': self.end_time
            }
        )

    def _add_event(self, event_type: EventType, turn: int, player: str,
                   data: dict) -> None:
        """Add an event to the log."""
        event = GameEvent(
            event_type=event_type,
            turn=turn,
            player=player,
            data=data
        )
        self.events.append(event)

    def get_events(self) -> list[GameEvent]:
        """Get all logged events."""
        return self.events.copy()

    def get_events_of_type(self, event_type: EventType) -> list[GameEvent]:
        """Get all events of a specific type."""
        return [e for e in self.events if e.event_type == event_type]

    def get_last_event_of_type(self, event_type: EventType) -> Optional[GameEvent]:
        """Get the most recent event of a specific type."""
        events = self.get_events_of_type(event_type)
        return events[-1] if events else None

    def get_text_log(self) -> str:
        """
        Get a human-readable text log of the game.

        Returns:
            Formatted text log
        """
        lines = []
        lines.append("=" * 60)
        lines.append("GAME REPLAY LOG")
        lines.append("=" * 60)

        if self.game_seed is not None:
            lines.append(f"Seed: {self.game_seed}")
        if self.start_time:
            lines.append(f"Started: {self.start_time}")
        lines.append("")

        current_turn = -1
        for event in self.events:
            # Turn header
            if event.turn != current_turn and event.event_type != EventType.GAME_START:
                current_turn = event.turn
                lines.append(f"\n--- Turn {current_turn} ---")

            # Format event
            lines.append(self._format_event_text(event))

        lines.append("\n" + "=" * 60)
        return "\n".join(lines)

    def _format_event_text(self, event: GameEvent) -> str:
        """Format a single event as text."""
        data = event.data

        if event.event_type == EventType.GAME_START:
            return f"[GAME START] Seed={data.get('seed')}"

        elif event.event_type == EventType.TURN_START:
            return f"[{event.player}] Turn begins"

        elif event.event_type == EventType.AUTO_PLACEMENT:
            line = f"[{event.player}] Auto-placed on lane {data.get('lane')}"
            triggers = data.get('triggers_fired', [])
            if triggers:
                line += f" (triggered: {len(triggers)} effects)"
            return line

        elif event.event_type == EventType.RAID_RESOLVED:
            outcome = data.get('outcome', 'unknown')
            lane = data.get('lane', '?')
            return f"[{event.player}] Raid on lane {lane} resolved: {outcome}"

        elif event.event_type == EventType.DEFERRED_RESOLVED:
            dtype = data.get('type', 'unknown')
            lane = data.get('lane', '?')
            success = data.get('success', False)
            status = "SUCCESS" if success else "FAILED"
            return f"[{event.player}] Deferred {dtype} on lane {lane}: {status}"

        elif event.event_type == EventType.PERK_SELECTION:
            slot = data.get('slot')
            perk = data.get('perk')
            target = data.get('target')
            if slot == 'pass' or slot == 0:
                return f"[{event.player}] Passed"
            else:
                target_str = f" -> lane {target}" if target is not None else ""
                return f"[{event.player}] Selected slot {slot}: {perk}{target_str}"

        elif event.event_type == EventType.TRIGGER_FIRED:
            ttype = data.get('trigger_type', 'unknown')
            lane = data.get('lane', '?')
            return f"[TRIGGER] {ttype} fired on lane {lane}"

        elif event.event_type == EventType.LANE_WON:
            lane = data.get('lane', '?')
            return f"[LANE WON] {event.player} won lane {lane}!"

        elif event.event_type == EventType.GAME_OVER:
            winner = data.get('winner')
            if winner:
                return f"[GAME OVER] {winner} wins!"
            else:
                return "[GAME OVER] Draw"

        elif event.event_type == EventType.AI_DECISION:
            ai_type = data.get('ai_type', 'unknown')
            selected = data.get('selected', {})
            slot = selected.get('slot')
            target = selected.get('target')
            evals = data.get('evaluations', {})
            # Format evaluations summary
            eval_strs = []
            for s, ev in evals.items():
                score = ev.get('score', 0)
                perk = ev.get('perk', 'PASS')
                eval_strs.append(f"{s}:{perk}={score:.1f}")
            eval_summary = ", ".join(eval_strs[:4])  # Limit to avoid too long lines
            target_str = f" -> {target}" if target is not None else ""
            return f"[{event.player}] AI({ai_type}) chose slot {slot}{target_str} [{eval_summary}]"

        return f"[{event.event_type.value}] {event.player}: {data}"

    def get_summary(self) -> dict:
        """
        Get a summary of the game.

        Returns:
            Dictionary with game summary statistics
        """
        lane_wins = self.get_events_of_type(EventType.LANE_WON)
        perk_selections = self.get_events_of_type(EventType.PERK_SELECTION)
        game_over = self.get_last_event_of_type(EventType.GAME_OVER)

        # Count perks by player
        p1_perks = {}
        p2_perks = {}
        for event in perk_selections:
            perk = event.data.get('perk')
            if perk:
                if event.player == "PLAYER1":
                    p1_perks[perk] = p1_perks.get(perk, 0) + 1
                else:
                    p2_perks[perk] = p2_perks.get(perk, 0) + 1

        return {
            'seed': self.game_seed,
            'total_turns': game_over.turn if game_over else 0,
            'winner': game_over.data.get('winner') if game_over else None,
            'lane_wins': {
                'PLAYER1': sum(1 for e in lane_wins if e.player == "PLAYER1"),
                'PLAYER2': sum(1 for e in lane_wins if e.player == "PLAYER2")
            },
            'perk_usage': {
                'PLAYER1': p1_perks,
                'PLAYER2': p2_perks
            },
            'total_events': len(self.events)
        }

    def to_json(self, indent: int = 2) -> str:
        """
        Get the log as JSON.

        Args:
            indent: JSON indentation level

        Returns:
            JSON string
        """
        data = {
            'metadata': {
                'seed': self.game_seed,
                'start_time': self.start_time,
                'end_time': self.end_time
            },
            'events': [e.to_dict() for e in self.events],
            'summary': self.get_summary()
        }
        return json.dumps(data, indent=indent)

    def save(self, filepath: str) -> None:
        """
        Save the log to a file.

        Args:
            filepath: Path to save the log to
        """
        with open(filepath, 'w') as f:
            f.write(self.to_json())

    @classmethod
    def load(cls, filepath: str) -> 'GameLogger':
        """
        Load a log from a file.

        Args:
            filepath: Path to load from

        Returns:
            GameLogger instance with loaded events
        """
        with open(filepath, 'r') as f:
            data = json.load(f)

        logger = cls()
        logger.game_seed = data.get('metadata', {}).get('seed')
        logger.start_time = data.get('metadata', {}).get('start_time')
        logger.end_time = data.get('metadata', {}).get('end_time')

        for event_data in data.get('events', []):
            event = GameEvent(
                event_type=EventType(event_data['event_type']),
                turn=event_data['turn'],
                player=event_data['player'],
                timestamp=event_data.get('timestamp', ''),
                data=event_data.get('data', {})
            )
            logger.events.append(event)

        return logger

    def clear(self) -> None:
        """Clear all logged events."""
        self.events = []
        self.game_seed = None
        self.start_time = None
        self.end_time = None


def get_replay(events: list[GameEvent]) -> list[dict]:
    """
    Convert events to a replay format.

    Args:
        events: List of game events

    Returns:
        List of dictionaries suitable for replay
    """
    return [e.to_dict() for e in events]


def serialize_board_state(state) -> dict:
    """
    Serialize the board state for logging.

    Args:
        state: GameState object

    Returns:
        Dictionary with complete board state
    """
    from .state import Player

    lanes = []
    for lane in state.lanes:
        lane_data = {
            'p1_pieces': lane.player1_pieces,
            'p2_pieces': lane.player2_pieces,
            'winner': lane.winner.name if lane.winner else None,
            'freeze_turns': lane.freeze_turns,
            'freeze_player': lane.freeze_player.name if lane.freeze_player else None,
            'triggers': [
                {
                    'type': t['type'].name if hasattr(t['type'], 'name') else str(t['type']),
                    'owner': t['owner'].name if hasattr(t['owner'], 'name') else str(t['owner']),
                    'turns': t['turns']
                }
                for t in lane.triggers
            ],
            'deferred': [
                {
                    'type': d['type'].name if hasattr(d['type'], 'name') else str(d['type']),
                    'owner': d['owner'].name if hasattr(d['owner'], 'name') else str(d['owner']),
                    'target_lane': d.get('target_lane')
                }
                for d in lane.deferred
            ]
        }
        lanes.append(lane_data)

    global_effects = {
        'p1_cloaked': state.player1_cloaked,
        'p2_cloaked': state.player2_cloaked,
        'p1_blinded': state.player1_blinded,
        'p2_blinded': state.player2_blinded,
        'p1_sanctuaries': [(l, t) for l, t in state.player1_sanctuaries],
        'p2_sanctuaries': [(l, t) for l, t in state.player2_sanctuaries],
        'p1_captures': [(l, t) for l, t in state.player1_captures],
        'p2_captures': [(l, t) for l, t in state.player2_captures],
        'pending_raids': [
            {
                'owner': r['owner'].name if hasattr(r['owner'], 'name') else str(r['owner']),
                'lane': r['lane'],
                'turns_until_resolve': r.get('turns_until_resolve', 0)
            }
            for r in state.pending_raids
        ]
    }

    return {
        'lanes': lanes,
        'global': global_effects,
        'lanes_won': {
            'p1': state.lanes_won_by(Player.PLAYER1),
            'p2': state.lanes_won_by(Player.PLAYER2)
        }
    }
