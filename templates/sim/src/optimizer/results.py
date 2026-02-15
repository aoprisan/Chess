"""Result storage and logging for optimization runs."""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional

from src.ai.profiles import HeuristicProfile


def save_results(optimizer, output_dir: str = 'optimizer_results'):
    """
    Save optimization results to files.

    Creates:
    - history_TIMESTAMP.json: Generation-by-generation metrics
    - best_profile_TIMESTAMP.json: Best profile parameters and fitness
    - qualifying_TIMESTAMP.json: All profiles meeting criteria (if any)

    Args:
        optimizer: GeneticOptimizer instance after run()
        output_dir: Directory to save results
    """
    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    # Save generation history
    history_file = path / f'history_{timestamp}.json'
    with open(history_file, 'w') as f:
        json.dump(optimizer.history, f, indent=2)

    # Save best profile
    if optimizer.best_ever:
        best = optimizer.best_ever
        profile_data = {
            'params': best.params,
            'fitness': {
                'slot1_pct': best.fitness.slot1_pct,
                'slot2_pct': best.fitness.slot2_pct,
                'slot3_pct': best.fitness.slot3_pct,
                'slot4_pct': best.fitness.slot4_pct,
                'win_rate': getattr(best.fitness, 'win_rate', None) or getattr(best.fitness, 'win_rate_vs_v1', 0),
                'fitness_score': best.fitness.fitness_score,
                'meets_criteria': best.fitness.meets_criteria(),
            },
            'generation': optimizer.generation,
            'timestamp': timestamp,
        }

        best_file = path / f'best_profile_{timestamp}.json'
        with open(best_file, 'w') as f:
            json.dump(profile_data, f, indent=2)

    # Save statistics summary
    stats = optimizer.get_statistics()
    stats['timestamp'] = timestamp
    stats['settings'] = {
        'population_size': optimizer.pop_size,
        'elite_count': optimizer.elite_count,
        'mutation_rate': optimizer.mutation_rate,
        'mutation_strength': optimizer.mutation_strength,
        'games_per_eval': optimizer.games_per_eval,
        'seed': getattr(optimizer, 'seed', None),
    }

    stats_file = path / f'stats_{timestamp}.json'
    with open(stats_file, 'w') as f:
        json.dump(stats, f, indent=2)

    return {
        'history': str(history_file),
        'best_profile': str(best_file) if optimizer.best_ever else None,
        'stats': str(stats_file),
    }


def load_best_profile(filepath: str) -> Optional[HeuristicProfile]:
    """
    Load a profile from a best_profile JSON file.

    Args:
        filepath: Path to best_profile_*.json file

    Returns:
        HeuristicProfile instance or None if file not found
    """
    path = Path(filepath)
    if not path.exists():
        return None

    with open(path, 'r') as f:
        data = json.load(f)

    params = data.get('params', {})
    return HeuristicProfile(name='loaded', **params)


def format_profile_as_code(params: dict[str, float], name: str = 'v3') -> str:
    """
    Format profile parameters as Python code for profiles.py.

    Args:
        params: Parameter dict from optimization
        name: Profile name to use

    Returns:
        String of Python code that can be added to PROFILES dict
    """
    lines = [f"    '{name}': HeuristicProfile("]
    lines.append(f"        name='{name}',")

    # Group parameters by category for readability
    categories = {
        'Slot 1-2 bonuses': ['place_another_bonus', 'remove_enemy_bonus'],
        'Slot 3 - Duration': ['freeze_base', 'freeze_single_threat', 'freeze_multi_threat',
                              'cloak_base', 'cloak_piece_mult', 'blind_base', 'blind_piece_mult',
                              'sanctuary_base', 'sanctuary_piece_mult', 'capture_base', 'capture_piece_mult'],
        'Slot 3 - Triggers': ['trigger_offensive_mult', 'trigger_offensive_bonus',
                              'trigger_defensive_mult', 'trigger_defensive_bonus'],
        'Slot 4 - Immediate': ['gambit_base', 'gambit_low', 'split_base', 'scramble_base',
                               'scramble_piece_mult', 'kamikaze_base', 'steal_full', 'steal_partial',
                               'rush_base', 'nullify_base', 'disperse_base', 'scatter_base',
                               'disrupt_base', 'regroup_base'],
        'Slot 4 - Deferred': ['signal_base', 'signal_piece_mult', 'enlist_base',
                              'ambush_full', 'ambush_partial', 'reinforce_base',
                              'reinforce_near_win', 'raid_base', 'raid_piece_mult'],
    }

    for category, param_names in categories.items():
        lines.append(f"        # {category}")
        for name in param_names:
            if name in params:
                lines.append(f"        {name}={params[name]:.1f},")

    lines.append("    ),")
    return '\n'.join(lines)


def print_comparison_table(profiles: dict[str, dict]) -> None:
    """Print a comparison table of multiple profiles."""
    if not profiles:
        print("No profiles to compare")
        return

    # Get all parameter names from first profile
    first_key = next(iter(profiles))
    param_names = list(profiles[first_key].keys())

    # Header
    header = f"{'Parameter':<30}"
    for name in profiles:
        header += f"{name:>12}"
    print(header)
    print("-" * len(header))

    # Rows
    for param in param_names:
        row = f"{param:<30}"
        for profile_name, params in profiles.items():
            value = params.get(param, 0)
            row += f"{value:>12.1f}"
        print(row)
