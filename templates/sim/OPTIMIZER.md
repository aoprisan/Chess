# Profile Parameter Optimizer

Automated search for AI heuristic parameters that achieve balanced slot usage while remaining competitive. Two optimizers are available: a genetic algorithm (`run_optimizer.py`) and CMA-ES (`run_cmaes.py`).

## Problem

The AI has ~38 tunable parameters controlling perk evaluation. We need parameters that:

1. **Slot 3 usage ≥ 22%** (duration perks)
2. **Slot 4 usage ≥ 22%** (immediate/deferred perks)
3. **Win rate** as high as possible vs v1 baseline (realistic ceiling: ~39% as P2)

## Quick Start

```bash
cd sim

# Quick test (verify it works)
python3 run_optimizer.py --population 5 --generations 3 --games 50

# Standard optimization (~7 minutes)
python3 run_optimizer.py --population 20 --generations 50 --games 200

# Thorough search (~30 minutes)
python3 run_optimizer.py --population 30 --generations 100 --games 300
```

## Command Options

| Option | Default | Description |
|--------|---------|-------------|
| `--population` | 20 | Number of candidate profiles per generation |
| `--generations` | 50 | Maximum generations before stopping |
| `--games` | 200 | Games per fitness evaluation (split: half self-play, half vs-v1) |
| `--target` | 95.0 | Stop early if this fitness score is reached |
| `--elite` | 4 | Top N profiles preserved unchanged each generation |
| `--mutation-rate` | 0.3 | Probability of mutating each parameter |
| `--mutation-strength` | 0.15 | Noise scale relative to parameter range |
| `--seed` | 42 | Random seed for reproducibility |
| `--output` | optimizer_results | Output directory |
| `--code` | - | Print best profile as Python code |
| `-q, --quiet` | - | Minimal output |

## Fitness Function

Total score: 0-100 points

| Component | Points | Condition |
|-----------|--------|-----------|
| Slot 3 | 0-25 | Full points if ≥ 22%, otherwise proportional |
| Slot 4 | 0-25 | Full points if ≥ 22%, otherwise proportional |
| Win rate | 0-25 | Proportional (ceiling ~39% as P2 vs v1 Hard) |
| All criteria bonus | +25 | Only awarded when ALL three criteria are met |

A score of **95+** is only achievable when ALL criteria are met (max without all met: 75). Note: the 65% win rate target in the genetic optimizer is aspirational — CMA-ES confirmed the realistic ceiling is ~39% as P2 vs v1 Hard.

## Output Files

Results are saved to `optimizer_results/` (or `--output` path):

| File | Contents |
|------|----------|
| `best_profile_TIMESTAMP.json` | Best parameters found + fitness metrics |
| `history_TIMESTAMP.json` | Generation-by-generation metrics |
| `stats_TIMESTAMP.json` | Summary statistics + settings used |

## Using Results

### Option 1: Copy to profiles.py

Run with `--code` flag to get ready-to-use Python:

```bash
python3 run_optimizer.py --population 20 --generations 50 --games 200 --code
```

Copy the output into `src/ai/profiles.py` in the `PROFILES` dict.

### Option 2: Load from JSON

```python
from optimizer import load_best_profile

profile = load_best_profile('optimizer_results/best_profile_20240101_120000.json')
```

### Option 3: Test existing profiles

The CMA-ES best result is already saved as the `v3` profile in `src/ai/profiles.py`:

```bash
python3 run_simulation.py -n 1000 --p1 hard --p2 hard --p1-profile v1 --p2-profile v3
python3 run_simulation.py --balance -n 500 --profile v3
```

## Algorithm

Uses a genetic algorithm with:

- **Seeded population**: Starts with v1, v2 profiles + random individuals
- **Tournament selection**: Pick 3 random, keep best as parent
- **Uniform crossover**: Each parameter randomly from one parent
- **Gaussian mutation**: Add noise scaled to parameter range
- **Elitism**: Top N preserved unchanged to next generation

## Runtime Estimates

| Settings | Games | Time |
|----------|-------|------|
| pop=5, gen=3, games=50 | 750 | ~2 sec |
| pop=20, gen=50, games=200 | 200,000 | ~7 min |
| pop=30, gen=100, games=300 | 900,000 | ~30 min |

Based on ~500 games/second throughput.

## Interpreting Output

```
Gen   0: fitness=76.6, slots=[40,24,19,17], win=32%
Gen   1: fitness=83.4, slots=[36,24,24,16], win=36%
Gen   2: fitness=88.3, slots=[36,21,21,22], win=36% *
```

- `fitness`: Composite score (0-100)
- `slots`: Usage percentages [slot1, slot2, slot3, slot4]
- `win`: Win rate as P2 against v1 profile
- `*`: Indicates all criteria met

## Troubleshooting

**Fitness plateaus early**: Try increasing `--mutation-rate` or `--mutation-strength`

**Too slow**: Reduce `--games` (minimum ~50 for meaningful signal)

**Results vary between runs**: Use same `--seed` for reproducibility

**Best profile doesn't meet criteria**: Run longer (`--generations`) or with larger population

## CMA-ES Optimizer

`run_cmaes.py` uses CMA-ES (Covariance Matrix Adaptation Evolution Strategy) for more efficient parameter search. Requires the `cma` package (`pip install cma`).

### Key Findings

CMA-ES optimization (200 generations, 400 games/eval, seed=7) produced the **v3 profile**:
- Slot distribution: [26%, 20%, 27%, 27%]
- Best win rate as P2 vs v1 Hard: **38.5%** (fitness 67.6)
- Sigma converged from 0.4 to 0.064 — search space fully exhausted

**Win rate ceiling at ~39%**: Over 200 generations, 0 reached 40% win rate. This confirms that perk scoring weights alone cannot overcome P1's first-move advantage. Further improvement requires changes to strategic decisions (lane selection, when to pass).

### CMA-ES vs Genetic Algorithm

| | Genetic (`run_optimizer.py`) | CMA-ES (`run_cmaes.py`) |
|---|---|---|
| Method | Tournament selection + crossover | Covariance matrix adaptation |
| Dependencies | None | `cma` package |
| Convergence | Slower, may not exhaust search space | Faster, sigma tracks convergence |
| Best for | Broad exploration | Fine-tuning near optima |
