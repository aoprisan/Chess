# Perk Balance Simulation Engine

Python simulation engine for testing perk balance in the grid placement game. Pure Python with zero external dependencies.

## Project Goal

### Phase 1 — Prove slot 3/4 efficiency

Build a minimax AI profile that:
- Uses **slot 3 perks >25%** (ideally >30%) and **slot 4 perks >25%** (ideally >30%)
- Beats a minimax AI profile that maximizes slots 1/2 by **>65-70% win rate**

This proves that the "React & Protect" and "Act & Disrupt" perk pools are competitively viable — not just filler options that a rational player ignores in favor of PlaceAnother/RemoveEnemy.

### Phase 2 — Ongoing balance

Once Phase 1 is proven, use the simulator to keep adding new perks and maintain balance across all four slots.

### Current status

- **Slot 4** (Act & Disrupt): target met — usage consistently >25% with CMA-ES optimized minimax weights.
- **Slot 3** (React & Protect): stuck at ~13% despite 100 generations of CMA-ES optimization on evaluation weights. Likely requires structural changes to the evaluation function or search (e.g., modeling trigger/duration perk value over future turns rather than static board scoring).

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

# Run with CMA-ES optimized profile
python run_simulation.py -n 500 --p1 hard --p2 hard --profile v3

# Compare profiles: v3 vs v1
python run_simulation.py -n 500 --p1 hard --p2 hard --p1-profile v3 --p2-profile v1

# Slot balance analysis with specific profile
python run_simulation.py --balance -n 500 --profile v3

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
| `--profile {v1,v2,v3}` | Set both p1 and p2 profile |
| `--p1-profile {v1,v2,v3}` | Heuristic profile for player 1 (default: v1) |
| `--p2-profile {v1,v2,v3}` | Heuristic profile for player 2 (default: v1) |
| `--compare` | Compare all difficulty combinations |
| `--balance` | Slot balance analysis (hard vs hard with selected profile) |
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
├── run_optimizer.py     # Genetic algorithm parameter optimizer
├── run_cmaes.py         # CMA-ES parameter optimizer (requires cma package)
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
│   │   ├── profiles.py   # Heuristic parameter profiles (v1, v2, v3)
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

## AI Profiles

Profiles control perk scoring weights for heuristic AI (easy/medium/hard). They are **not used by minimax AI**, which does its own lookahead evaluation.

| Profile | Method | Slot Distribution | Win Rate (P2 vs v1 Hard) |
|---------|--------|-------------------|--------------------------|
| **v1** | Hand-tuned baseline | Slots 1-2 dominant (~40% each), 3-4 underused (~10%) | baseline |
| **v2** | Manual rebalance | Better diversity (~22% for slots 3-4) | not optimized |
| **v3** | CMA-ES optimization | [26%, 20%, 27%, 27%] | 38.5% (ceiling ~39%) |

v3 was produced by CMA-ES numerical optimization (200 generations, 400 games/eval). The ~39% ceiling confirms that perk scoring weights alone cannot overcome P1's first-move advantage — strategic decisions (lane selection, when to pass) matter more.

Use `--profile v3` to apply to both players, or `--p1-profile`/`--p2-profile` for asymmetric matchups.

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
from src.ai import create_ai_function, Difficulty
from src.ai.minimax import create_expectimax_ai
from src.simulation.runner import SimulationRunner

# Using heuristic AI with profile
p1 = create_ai_function(Difficulty.HARD, 'v3')
p2 = create_ai_function(Difficulty.HARD, 'v1')

runner = SimulationRunner(player1_ai=p1, player2_ai=p2, seed_start=0)
result = runner.run(n_games=1000, verbose=True)
print(f"P1 win rate: {result.player1_win_rate:.1%}")
print(f"Avg turns: {result.avg_turns:.1f}")

# Using expectimax AI (profiles don't apply)
minimax = create_expectimax_ai(depth=2)
runner = SimulationRunner(player1_ai=minimax, player2_ai=p1, seed_start=0)
```
