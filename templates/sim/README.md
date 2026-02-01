# Perk Balance Simulation Engine

Python simulation engine for testing perk balance in the grid placement game. Pure Python with zero external dependencies.

## Quick Start

```bash
cd sim

# Run simulation with random AI (default: 1000 games)
python run_simulation.py

# Run with specific number of games
python run_simulation.py -n 5000

# Run with specific AI difficulty levels
python run_simulation.py -n 500 --p1 hard --p2 random

# Compare all AI difficulty combinations
python run_simulation.py --compare -n 100

# Analyze slot allocation balance
python run_simulation.py --balance -n 500

# Show detailed perk usage analysis
python run_simulation.py -n 500 --perks

# Export results to JSON
python run_simulation.py -n 1000 --export results.json

# Quiet mode (minimal output)
python run_simulation.py -n 1000 -q

# Run with minimax AI (depth 2 lookahead)
python run_simulation.py -n 100 --p1 minimax2 --p2 hard

# Run with custom minimax depth
python run_simulation.py -n 100 --p1 minimax1 --depth 4

# Compare minimax depth 4 vs depth 5
python run_simulation.py -n 100 --p1 minimax1 --p1-depth 4 --p2 minimax1 --p2-depth 5

# Run with extensive per-game logging and analyze results
python run_simulation.py -n 50 --p1 hard --p2 hard --log-games --seed 0
python analyze_logs.py
```

### Quick Tests

```bash
# Run a single verbose game
python run_test.py --seed 42

# Run batch of games
python run_test.py -n 100

# Run with custom seed start
python run_test.py -n 100 --seed 1000
```

### Run All Unit Tests

```bash
# Install pytest (one-time)
pip install pytest

# Run entire test suite
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_perks_immediate.py -v

# Run with coverage (if pytest-cov installed)
python -m pytest tests/ --cov=src
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `python run_simulation.py` | Main simulation runner |
| `-n, --games N` | Number of games (default: 1000) |
| `--p1 {easy,medium,hard,random,minimax1,minimax2,minimax3}` | Player 1 AI |
| `--p2 {easy,medium,hard,random,minimax1,minimax2,minimax3}` | Player 2 AI |
| `--depth N` | Custom depth for minimax AI (applies to both players) |
| `--p1-depth N` | Custom depth for Player 1 minimax AI |
| `--p2-depth N` | Custom depth for Player 2 minimax AI |
| `--compare` | Compare all difficulty combinations |
| `--balance` | Test slot allocation balance |
| `--perks` | Show detailed perk analysis |
| `--export FILE` | Export results to JSON |
| `--seed N` | Starting random seed |
| `--log-games` | Save detailed per-game logs to `logs/` |
| `-q, --quiet` | Minimal output |
| `python run_test.py` | Quick test runner |
| `--seed N` | Seed for single game |
| `python analyze_logs.py` | Analyze game logs for anomalies |

## Project Structure

```
sim/
├── run_simulation.py    # Main CLI for batch simulations
├── run_test.py          # Quick test runner
├── analyze_logs.py      # Analyze game logs for AI decision quality
├── requirements.txt     # No external dependencies
├── src/
│   ├── game/
│   │   ├── config.py    # Game constants (lanes, slots, durations)
│   │   ├── state.py     # GameState, LaneState, Player, TurnPhase
│   │   ├── engine.py    # GameEngine (turn flow, perk execution)
│   │   ├── rules.py     # Validation, win conditions
│   │   └── logger.py    # Event recording
│   ├── perks/
│   │   ├── base.py      # PerkType enum, slot definitions
│   │   ├── commons.py   # PlaceAnother, RemoveEnemy
│   │   ├── immediate.py # Freeze + 11 immediate perks
│   │   ├── triggers.py  # 9 trigger perks
│   │   ├── duration.py  # 4 duration perks (Cloak, Blind, Sanctuary, Capture)
│   │   └── deferred.py  # 5 deferred perks
│   ├── ai/
│   │   ├── heuristics.py # Lane scoring, difficulty weights
│   │   ├── strategy.py   # AIPlayer class, perk evaluation
│   │   └── minimax.py    # Expectimax AI with alpha-beta pruning
│   └── simulation/
│       ├── runner.py    # SimulationRunner, batch execution
│       └── analysis.py  # Reporting, statistics, JSON export
└── tests/
    ├── test_perks_common.py    # PlaceAnother, RemoveEnemy
    ├── test_perks_immediate.py # Scramble, Split, Kamikaze, etc.
    ├── test_perks_triggers.py  # Portal, Trap, Mirror, etc.
    ├── test_perks_duration.py  # Freeze, Cloak, Blind, etc.
    ├── test_perks_deferred.py  # Signal, Ambush, Raid, etc.
    ├── test_mechanics.py       # Core game mechanics
    └── test_edge_cases.py      # Complex interactions
```

## Game Rules

1. **Auto-placement**: Each turn, 1 piece automatically places on a random available lane
2. **Perk selection**: Player chooses Slot 1, 2, 3, 4, or Pass
3. **Lane win**: First to fill 5 slots on their side wins the lane
4. **Game win**: First to win 3 lanes wins the game

## Slot Allocation

The game uses **React & Protect vs Act & Disrupt** perk pools:

| Slot | Type | Perks |
|------|------|-------|
| 1 | Fixed | PlaceAnother |
| 2 | Fixed | RemoveEnemy |
| 3 | React & Protect | Freeze, Cloak, Sanctuary, Portal, Trap, Mirror, Echo, Shockwave, Retaliate, Hydra, Backfire, Absorb, Regroup, Scatter, Signal |
| 4 | Act & Disrupt | Blind, Capture, Scramble, Split, Kamikaze, Disrupt, Disperse, Gambit, Steal, Rush, Nullify, Enlist, Ambush, Reinforce, Raid |

## Perk Categories

**32 total perks**: 2 fixed (slots 1-2) + 30 in random pools (15 each in slots 3-4)

### Duration Perks (5)
Effects that persist for multiple turns:
- **Freeze** (1 turn): Block opponent's placement on target lane
- **Cloak** (2 turns): Hide your pieces from opponent
- **Blind** (2 turns): Hide opponent's pieces from you
- **Sanctuary** (2 turns): Redirect removed pieces to random lane
- **Capture** (2 turns): Convert removed enemy pieces to yours

### Trigger Perks (9)
Fire when placement/removal occurs on target lane:
- **Placement triggers** (6): Portal, Trap, Mirror, Echo, Shockwave, Retaliate
- **Removal triggers** (3): Hydra, Backfire, Absorb

### Immediate Perks (11)
Execute instantly with various effects:
- Scramble, Split, Kamikaze, Disrupt, Disperse, Gambit, Steal, Rush, Nullify, Regroup, Scatter

### Deferred Perks (5)
Queue effects for future turns:
- Signal, Enlist, Ambush, Reinforce, Raid

## AI Difficulty Levels

| Level | Behavior |
|-------|----------|
| **Easy** | 25% random moves, high noise (0-20), simplified scoring |
| **Medium** | Balanced play, moderate noise (0-10) |
| **Hard** | Optimal decisions, minimal noise (0-2), threat detection |

### Scoring Weights

| Factor | Easy | Medium | Hard |
|--------|------|--------|------|
| Win lane (4 pieces) | 60 | 100 | 120 |
| Block opponent (4 pieces) | 30 | 80 | 100 |
| Advance position | 10 | 15 | 20 |
| Trigger potential | 5 | 10 | 15 |
| Multiple threat bonus | - | - | +50 |

### Special Mechanics
- **Belief State**: When Cloak/Blind active, AI uses frozen "last seen" board state
- **Silent Failures**: Invalid moves from stale belief state fail silently
- **Perk Evaluation**: All 32 perks have custom AI scoring logic

## Minimax AI (Expectimax)

The simulator includes an expectimax AI with alpha-beta pruning for lookahead-based decision making.

### Algorithm

The AI uses **expectimax search** (decision-theoretic planning) with three node types:

| Node Type | Description |
|-----------|-------------|
| **MAX** | Current player's decision - maximizes score |
| **MIN** | Opponent's decision - minimizes score |
| **CHANCE** | Random auto-placement - averages over outcomes |

Alpha-beta pruning is applied to MAX/MIN nodes for efficiency.

### Depth Presets

| CLI Option | Depth | Lookahead |
|------------|-------|-----------|
| `minimax1` | 1 | 1 full turn |
| `minimax2` | 2 | 2 full turns |
| `minimax3` | 3 | 3 full turns |

Use `--depth N` to override both players, or `--p1-depth` / `--p2-depth` for per-player depths.

### Evaluation Function

The board evaluation considers:

| Factor | Score |
|--------|-------|
| Lane won | ±1000 |
| Two lanes won (near victory) | ±300 bonus |
| Piece advantage per lane | ±20 per piece |
| Four pieces in lane | ±200 |
| Three pieces in lane | ±50 |
| Trigger on lane | ±25 |
| Freeze on opponent's lane | ±40 |
| Cloak/Blind active | ±30 |
| Sanctuary active | +20 |
| Capture active | +25 |

## Statistics Tracked

The simulator tracks:
- Win rates per player
- Game length (turns, min/max/avg)
- Slot usage distribution (target: ~25% each)
- Perk usage frequency
- Performance throughput (games/second)
- Balance indicators (under/over-used perks)

## Example Output

```
=== Simulation Results ===
Games: 1000
Player 1 wins: 498 (49.8%)
Player 2 wins: 485 (48.5%)
Draws: 17 (1.7%)
Average turns: 12.3

Slot Usage:
  Slot 1: 26.1% ████████████████████████████
  Slot 2: 24.8% ████████████████████████████
  Slot 3: 24.3% ████████████████████████████
  Slot 4: 24.8% ████████████████████████████
```

## Programmatic Usage

```python
from src.ai.strategy import medium_ai, hard_ai
from src.ai.minimax import create_expectimax_ai, expectimax_depth2
from src.simulation.runner import SimulationRunner

# Using heuristic AI
runner = SimulationRunner(
    player1_ai=hard_ai,
    player2_ai=medium_ai,
    seed_start=0,
    max_turns=100
)

result = runner.run(n_games=1000, verbose=True)
print(f"P1 win rate: {result.player1_win_rate:.1%}")
print(f"Avg turns: {result.avg_turns:.1f}")

# Using expectimax AI
runner = SimulationRunner(
    player1_ai=expectimax_depth2,
    player2_ai=hard_ai,
    seed_start=0
)

# Or with custom depth
custom_ai = create_expectimax_ai(depth=4)
runner = SimulationRunner(player1_ai=custom_ai, player2_ai=hard_ai)
```
