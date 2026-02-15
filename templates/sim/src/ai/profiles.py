"""AI parameter profiles for A/B testing."""

from dataclasses import dataclass
from typing import Dict


@dataclass
class HeuristicProfile:
    """Configuration for AI perk evaluation."""
    name: str

    # When True, slot 3/4 perks use dynamic lane-score evaluation
    # instead of flat base scores. Only v3+ uses this.
    state_aware_scoring: bool = False

    # Slot 1-2 bonuses (added to lane score)
    place_another_bonus: float = 20.0
    remove_enemy_bonus: float = 15.0

    # Slot 3 base scores - Duration perks
    freeze_base: float = 25.0
    freeze_single_threat: float = 40.0
    freeze_multi_threat: float = 80.0
    cloak_base: float = 25.0
    cloak_piece_mult: float = 5.0
    blind_base: float = 25.0
    blind_piece_mult: float = 5.0
    sanctuary_base: float = 30.0
    sanctuary_piece_mult: float = 10.0
    capture_base: float = 25.0
    capture_piece_mult: float = 15.0

    # Slot 3 base scores - Trigger perks
    trigger_offensive_mult: float = 15.0
    trigger_offensive_bonus: float = 25.0
    trigger_defensive_mult: float = 15.0
    trigger_defensive_bonus: float = 25.0

    # Slot 4 base scores - Immediate perks
    gambit_base: float = 25.0
    gambit_low: float = 5.0
    split_base: float = 35.0
    scramble_base: float = 30.0
    scramble_piece_mult: float = 2.0
    kamikaze_base: float = 35.0
    steal_full: float = 45.0
    steal_partial: float = 35.0
    rush_base: float = 35.0
    nullify_base: float = 25.0
    disperse_base: float = 25.0
    scatter_base: float = 20.0
    disrupt_base: float = 25.0
    regroup_base: float = 20.0

    # Slot 4 base scores - Deferred perks
    signal_base: float = 35.0
    signal_piece_mult: float = 10.0
    enlist_base: float = 50.0
    ambush_full: float = 45.0
    ambush_partial: float = 25.0
    reinforce_base: float = 40.0
    reinforce_near_win: float = 70.0
    raid_base: float = 30.0
    raid_piece_mult: float = 5.0


# === PROFILE DEFINITIONS ===

PROFILES: Dict[str, HeuristicProfile] = {
    # v1: Hand-tuned baseline. Slots 1-2 dominate (~40% each), slots 3-4
    # underused (~10% each). Reasonable win rate but poor slot diversity.
    'v1': HeuristicProfile(
        name='v1',
        place_another_bonus=20.0,
        remove_enemy_bonus=15.0,
        freeze_base=25.0,
        freeze_single_threat=40.0,
        freeze_multi_threat=80.0,
        cloak_base=25.0,
        cloak_piece_mult=5.0,
        blind_base=25.0,
        blind_piece_mult=5.0,
        sanctuary_base=30.0,
        sanctuary_piece_mult=10.0,
        capture_base=25.0,
        capture_piece_mult=15.0,
        trigger_offensive_mult=15.0,
        trigger_offensive_bonus=25.0,
        trigger_defensive_mult=15.0,
        trigger_defensive_bonus=25.0,
        gambit_base=25.0,
        gambit_low=5.0,
        split_base=35.0,
        scramble_base=30.0,
        scramble_piece_mult=2.0,
        kamikaze_base=35.0,
        steal_full=45.0,
        steal_partial=35.0,
        rush_base=35.0,
        nullify_base=25.0,
        disperse_base=25.0,
        scatter_base=20.0,
        disrupt_base=25.0,
        regroup_base=20.0,
        signal_base=35.0,
        signal_piece_mult=10.0,
        enlist_base=50.0,
        ambush_full=45.0,
        ambush_partial=25.0,
        reinforce_base=40.0,
        reinforce_near_win=70.0,
        raid_base=30.0,
        raid_piece_mult=5.0,
    ),

    # v2: Manual rebalance of v1. Reduced slot 1-2 bonuses, uniformly
    # increased slot 3-4 scores. Better slot diversity (~22% for 3-4)
    # but not optimized for win rate.
    'v2': HeuristicProfile(
        name='v2',
        # REDUCED slot 1-2 bonuses to make them less dominant
        place_another_bonus=8.0,    # REDUCED from 20
        remove_enemy_bonus=5.0,     # REDUCED from 15

        # INCREASED slot 3 scores - Duration perks
        freeze_base=35.0,           # INCREASED from 25
        freeze_single_threat=55.0,  # INCREASED from 40
        freeze_multi_threat=85.0,   # INCREASED from 80
        cloak_base=35.0,            # INCREASED from 25
        cloak_piece_mult=6.0,       # INCREASED from 5
        blind_base=35.0,            # INCREASED from 25
        blind_piece_mult=6.0,       # INCREASED from 5
        sanctuary_base=42.0,        # INCREASED from 30
        sanctuary_piece_mult=12.0,  # INCREASED from 10
        capture_base=35.0,          # INCREASED from 25
        capture_piece_mult=18.0,    # INCREASED from 15

        # INCREASED slot 3 scores - Trigger perks
        trigger_offensive_mult=18.0,  # INCREASED from 15
        trigger_offensive_bonus=32.0, # INCREASED from 25
        trigger_defensive_mult=18.0,  # INCREASED from 15
        trigger_defensive_bonus=32.0, # INCREASED from 25

        # INCREASED slot 4 scores - Immediate perks
        gambit_base=35.0,           # INCREASED from 25
        gambit_low=10.0,            # INCREASED from 5
        split_base=48.0,            # INCREASED from 35
        scramble_base=40.0,         # INCREASED from 30
        scramble_piece_mult=3.0,    # INCREASED from 2
        kamikaze_base=48.0,         # INCREASED from 35
        steal_full=55.0,            # INCREASED from 45
        steal_partial=45.0,         # INCREASED from 35
        rush_base=48.0,             # INCREASED from 35
        nullify_base=35.0,          # INCREASED from 25
        disperse_base=35.0,         # INCREASED from 25
        scatter_base=30.0,          # INCREASED from 20
        disrupt_base=35.0,          # INCREASED from 25
        regroup_base=30.0,          # INCREASED from 20

        # INCREASED slot 4 scores - Deferred perks
        signal_base=48.0,           # INCREASED from 35
        signal_piece_mult=12.0,     # INCREASED from 10
        enlist_base=58.0,           # INCREASED from 50
        ambush_full=55.0,           # INCREASED from 45
        ambush_partial=35.0,        # INCREASED from 25
        reinforce_base=52.0,        # INCREASED from 40
        reinforce_near_win=78.0,    # INCREASED from 70
        raid_base=40.0,             # INCREASED from 30
        raid_piece_mult=6.0,        # INCREASED from 5
    ),

    # v3: CMA-ES numerical optimization (200 gens, 400 games/eval, seed=7).
    # Searched ~80k parameter combinations. Best win rate as P2 vs v1 HARD:
    # 38.5% (ceiling ~39% — perk weights alone can't overcome P1 advantage).
    # Slot distribution: [26%, 20%, 27%, 27%]. Sigma converged to 0.064.
    # Used only by heuristic AI (easy/medium/hard), not by minimax.
    'v3': HeuristicProfile(
        name='v3',
        state_aware_scoring=True,
        place_another_bonus=0.0,
        remove_enemy_bonus=6.4,
        freeze_base=53.9,
        freeze_single_threat=25.0,
        freeze_multi_threat=85.3,
        cloak_base=21.4,
        cloak_piece_mult=4.4,
        blind_base=27.0,
        blind_piece_mult=6.0,
        sanctuary_base=30.0,
        sanctuary_piece_mult=6.0,
        capture_base=15.8,
        capture_piece_mult=16.4,
        trigger_offensive_mult=24.4,
        trigger_offensive_bonus=49.7,
        trigger_defensive_mult=29.9,
        trigger_defensive_bonus=49.2,
        gambit_base=15.1,
        gambit_low=8.1,
        split_base=70.0,
        scramble_base=59.9,
        scramble_piece_mult=1.2,
        kamikaze_base=69.6,
        steal_full=73.5,
        steal_partial=33.9,
        rush_base=37.3,
        nullify_base=49.8,
        disperse_base=27.1,
        scatter_base=44.6,
        disrupt_base=17.9,
        regroup_base=32.2,
        signal_base=39.8,
        signal_piece_mult=6.6,
        enlist_base=80.0,
        ambush_full=79.9,
        ambush_partial=47.1,
        reinforce_base=69.8,
        reinforce_near_win=109.4,
        raid_base=51.5,
        raid_piece_mult=4.5,
    ),
}


def get_profile(name: str) -> HeuristicProfile:
    """Get a profile by name, or raise KeyError."""
    if name not in PROFILES:
        available = ', '.join(PROFILES.keys())
        raise KeyError(f"Unknown profile '{name}'. Available: {available}")
    return PROFILES[name]


# === MINIMAX PROFILES ===

from src.ai.minimax import MinimaxProfile

MINIMAX_PROFILES: Dict[str, MinimaxProfile] = {
    'minimax-v1': MinimaxProfile(name='minimax-v1'),  # all defaults = current behavior
    'minimax-v2': MinimaxProfile(
        name='minimax-v2',
        # Board structure
        lane_win_weight=1142.8,
        near_game_win_bonus=175.0,
        piece_advantage_mult=10.5,
        near_win_bonus=104.8,
        near_threat_bonus=116.1,
        # Trigger effects
        trigger_trap_portal_mult=46.6,
        trigger_mirror_value=76.8,
        trigger_echo_hydra_value=41.5,
        trigger_shockwave_backfire_value=51.7,
        trigger_absorb_value=13.0,
        trigger_retaliate_value=55.5,
        trigger_default_value=44.7,
        # Deferred effects
        deferred_signal_value=46.8,
        deferred_enlist_value=20.9,
        deferred_ambush_value=35.3,
        deferred_reinforce_value=44.0,
        deferred_raid_value=24.9,
        deferred_default_value=29.2,
        deferred_discount=0.37,
        # Freeze
        freeze_near_win=197.1,
        freeze_near_threat=94.0,
        freeze_base=40.5,
        # Global effects
        cloak_value=51.4,
        blind_value=59.9,
        # Pending raid
        raid_pending_value=31.5,
        raid_discount_base=0.72,
        # Duration effects
        sanctuary_value=34.5,
        capture_value=10.8,
    ),

    # minimax-v3: CMA-ES optimized (100 gens) with context-scaled trigger boosting.
    # Slot distribution: [46% / 9% / 19% / 25%], win rate 57.6% vs minimax-v1.
    # Key changes vs v2: much higher trigger_trap_portal_mult (150 vs 47),
    # higher echo_hydra (130 vs 42), lower retaliate (14 vs 56).
    'minimax-v3': MinimaxProfile(
        name='minimax-v3',
        # Board structure
        lane_win_weight=1057.2,
        near_game_win_bonus=352.0,
        piece_advantage_mult=6.9,
        near_win_bonus=116.3,
        near_threat_bonus=57.6,
        # Trigger effects
        trigger_trap_portal_mult=149.9,
        trigger_mirror_value=69.5,
        trigger_echo_hydra_value=130.2,
        trigger_shockwave_backfire_value=45.9,
        trigger_absorb_value=65.7,
        trigger_retaliate_value=14.5,
        trigger_default_value=24.2,
        # Deferred effects
        deferred_signal_value=30.0,
        deferred_enlist_value=15.4,
        deferred_ambush_value=31.1,
        deferred_reinforce_value=39.2,
        deferred_raid_value=7.5,
        deferred_default_value=22.0,
        deferred_discount=0.30,
        # Freeze
        freeze_near_win=71.6,
        freeze_near_threat=73.1,
        freeze_base=22.2,
        # Global effects
        cloak_value=27.8,
        blind_value=29.8,
        # Pending raid
        raid_pending_value=24.1,
        raid_discount_base=0.79,
        # Duration effects
        sanctuary_value=37.8,
        capture_value=37.0,
        # Context-aware trigger evaluation
        trigger_targeting_bias=2.03,
        freeze_protect_near_win=247.5,
        trigger_contest_boost=2.64,
    ),
}


def get_minimax_profile(name: str) -> MinimaxProfile:
    """Get a minimax profile by name, or raise KeyError."""
    if name not in MINIMAX_PROFILES:
        available = ', '.join(sorted(MINIMAX_PROFILES.keys()))
        raise KeyError(f"Unknown minimax profile '{name}'. Available: {available}")
    return MINIMAX_PROFILES[name]
