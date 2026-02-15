# Perk Competitiveness Analysis — Findings

## Test Conditions

| Parameter | Value |
|-----------|-------|
| Board | 5 lanes x 10 columns (5 per side) — **5x5** |
| Lanes to win | 3 |
| Perk slots | 4 (slot 1: PLACE_ANOTHER, slot 2: REMOVE_ENEMY, slot 3/4: from pools of 15 each) |
| Default pool split | 15/15 (30 total perks) |
| Test AI | Expectimax (minimax) with profile `minimax-v3` (CMA-ES optimized) |
| Opponent AI | Heuristic `hard` with profile `v1` |
| Evaluation method | Two-suite (test as P1 + test as P2), averaged to remove first-mover bias |
| Seed | 0 |

### Depth 1 Run
- Collection: 1000 games (39,941 decisions captured)
- Config evaluation: 37 configs x 400 games each
- Wall time: 2m 26s

### Depth 2 Run
- Collection: 2000 games (52,623 decisions captured)
- Config evaluation: 37 configs x 600 games each
- Wall time: 4h 37m

---

## Depth 1 Results

### Perk Rankings

| Rank | Perk | Sel% | Score | Category |
|------|------|------|-------|----------|
| 1 | AMBUSH | 58.6% | 0.665 | deferred |
| 2 | REINFORCE | 57.9% | 0.657 | deferred |
| 3 | ENLIST | 56.9% | 0.644 | deferred |
| 4 | SIGNAL | 60.1% | 0.636 | deferred |
| 5 | RUSH | 53.0% | 0.605 | immediate |
| 6 | PORTAL | 67.3% | 0.554 | placement trigger |
| 7 | SPLIT | 48.0% | 0.552 | immediate |
| 8 | TRAP | 65.1% | 0.529 | placement trigger |
| 9 | SCATTER | 45.7% | 0.492 | immediate |
| 10 | STEAL | 31.8% | 0.478 | immediate |
| 11-29 | *remaining 19 perks* | 0-15% | 0.14–0.32 | various |

**Slot usage (baseline):** S1=45%, S2=12%, S3=18%, S4=26%

**Key observation:** Only 8-10 perks ever compete with slots 1/2. The competitive perks are almost entirely **immediate** and **deferred** types. Conditional triggers (MIRROR, ECHO, SHOCKWAVE, RETALIATE, HYDRA, BACKFIRE, ABSORB) have 0% selection rate.

**Best balanced config:** 65.8% WR (interleaved_even_slot3_noise2, 15/15). No balanced config reached 75%.

---

## Depth 2 Results

### Perk Rankings — Comparison with Depth 1

| Perk | D1 Rank | D2 Rank | Change | D1 Sel% | D2 Sel% |
|------|---------|---------|--------|---------|---------|
| SPLIT | 7 | 1 | +6 | 48.0% | 38.2% |
| RUSH | 5 | 2 | +3 | 53.0% | 43.2% |
| KAMIKAZE | 15 | 3 | **+12** | 11.2% | 43.9% |
| SIGNAL | 4 | 4 | = | 60.1% | 34.1% |
| REINFORCE | 2 | 5 | -3 | 57.9% | 32.3% |
| SCATTER | 9 | 6 | +3 | 45.7% | 38.2% |
| AMBUSH | 1 | 7 | -6 | 58.6% | 28.1% |
| ENLIST | 3 | 8 | -5 | 56.9% | 23.2% |
| STEAL | 10 | 9 | +1 | 31.8% | 23.4% |
| PORTAL | 6 | 19 | **-13** | 67.3% | 3.0% |
| TRAP | 8 | 13 | -5 | 65.1% | 5.0% |
| BLIND | 11 | 21 | -10 | 14.0% | 0.2% |
| CLOAK | 13 | 24 | -11 | 13.6% | 0.2% |

### Slot Usage Inversion

| Depth | S1 (PLACE) | S2 (REMOVE) | S3 | S4 | S3+S4 |
|-------|------------|-------------|----|----|-------|
| 1 | 45% | 12% | 18% | 26% | 44% |
| 2 | 31% | **45%** | varies | varies | **24%** |

At depth 2, the AI discovered REMOVE_ENEMY is the dominant action and uses it nearly half the time. Slot 3+4 combined usage dropped from 44% to 24%.

### Config Win Rates

All 37 balanced configs (13-17 per pool) achieved 75%+ WR at depth 2:
- Best: 81.8% (top14_competitive_noise1, 14/16)
- Best 15/15: 81.0% (top15_competitive_noise1)
- Worst: 76.5% (top17_competitive_noise2)
- **WR spread: only 5.3 points** — pool composition barely matters

### Core Slot 3 Consensus (across top 10 configs)

Perks appearing in slot 3 of 8+ of top 10 configs:
SPLIT, TRAP, KAMIKAZE, REINFORCE, RUSH, AMBUSH, ENLIST, REGROUP, SCATTER, SIGNAL, STEAL, SCRAMBLE

---

## Key Insights

### 1. Only ~10 of 30 perks are competitive
Both depths agree on a core group of competitive perks. These are almost all **immediate** or **deferred** — direct, unconditional effects. The remaining ~20 perks dilute the pool.

### 2. Conditional triggers are genuinely weak
MIRROR, ECHO, RETALIATE, HYDRA, BACKFIRE, ABSORB stay near the bottom at both depths. They depend on the opponent placing/removing on the right lane — too unreliable to compete with guaranteed effects. This is not an AI artifact; it's a game mechanics issue on 5x5.

### 3. Depth 1 overvalues direct denial, depth 2 corrects
PORTAL and TRAP looked great at depth 1 (67%, 65% selection) but collapsed at depth 2 (3%, 5%). The shallow search overvalued immediate piece denial without seeing that the opponent recovers. KAMIKAZE showed the inverse — depth 2 can see the downstream payoff of sacrificing a piece.

### 4. The minimax-v3 profile is depth-1-specific
v3 was CMA-ES tuned for depth 1 to push slot 3/4 usage (19%/25%). At depth 2, the deeper game tree search overrides the evaluation heuristics. The profile's high trigger weights (trap/portal=150, echo/hydra=130) were compensating for depth-1's limited horizon, not reflecting true game value.

### 5. REMOVE_ENEMY dominates on 5x5
At depth 2, every config converges to ~45% slot 2 usage. Removing an enemy piece is the strongest action on a board where lanes fill in 5 turns. This may be a fundamental balance issue on the 5x5 board, or it may change on 7x7 where games are longer and lanes take more turns to fill.

### 6. Pool composition matters much less than AI skill
The 5.3-point WR spread across all configs at depth 2 (vs the AI using S2 45% of the time) shows that *how* the AI plays matters far more than *what* it's offered. The lopsided configs from the reshuffle optimizer (81.9% WR) achieved high WR primarily because the depth-1 AI is more sensitive to offering frequency, not because the pool composition is inherently better.

---

## Untested Hypotheses

- **7x7 board**: Longer games may give triggers and duration effects more time to pay off, potentially shifting rankings
- **Depth-2 optimized profile**: Re-running CMA-ES at depth 2 could find weights that better value slot 3/4 at that depth
- **REMOVE_ENEMY nerf**: If slot 2 is truly overpowered on 5x5, a design change (cooldown, cost, reduced effect) could rebalance toward slot 3/4

---

## Data Files

| File | Description |
|------|-------------|
| `competitiveness_results/full/final_report.json` | Depth 1: rankings + config evaluations |
| `competitiveness_results/full/rankings.json` | Depth 1: per-perk competitiveness scores |
| `competitiveness_results/depth2/final_report.json` | Depth 2: rankings + config evaluations |
| `competitiveness_results/depth2/rankings.json` | Depth 2: per-perk competitiveness scores |
| `competitiveness_results/*/generated_configs.json` | Pool configs that were evaluated |
| `competitiveness_results/*/history_incremental.json` | Per-config evaluation history |
