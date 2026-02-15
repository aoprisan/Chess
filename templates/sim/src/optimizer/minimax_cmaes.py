"""CMA-ES optimizer for minimax profile parameters."""

import cma
from dataclasses import dataclass, asdict
from typing import Optional

from src.ai.minimax import MinimaxProfile
from src.ai.profiles import MINIMAX_PROFILES
from .minimax_bounds import MinimaxParameterBounds
from .minimax_fitness import evaluate_minimax_profile, MinimaxFitnessResult
from .genetic import Individual


def minimax_profile_to_params(profile: MinimaxProfile) -> dict[str, float]:
    """Extract numeric parameters from a MinimaxProfile."""
    params = {}
    for key, value in asdict(profile).items():
        if key != 'name' and isinstance(value, (int, float)):
            params[key] = float(value)
    return params


class MinimaxCMAESOptimizer:
    """CMA-ES optimizer for MinimaxProfile parameters."""

    def __init__(self,
                 sigma: float = 0.3,
                 games_per_eval: int = 200,
                 seed: int = 42,
                 depth: int = 1,
                 slot3_target: float = 25.0,
                 slot4_target: float = 25.0,
                 win_target: float = 0.65):
        self.sigma = sigma
        self.games_per_eval = games_per_eval
        self.seed = seed
        self.depth = depth
        self.bounds = MinimaxParameterBounds()
        self.slot3_target = slot3_target
        self.slot4_target = slot4_target
        self.win_target = win_target

        # Results tracking
        self.best_ever: Optional[Individual] = None
        self.history: list[dict] = []
        self.generation = 0

        # For save_results compatibility
        self.pop_size = 0
        self.elite_count = 0
        self.mutation_rate = 0.0
        self.mutation_strength = sigma

        self._param_names = self.bounds.get_param_names()

    def _params_to_vector(self, params: dict[str, float]) -> list[float]:
        """Convert params dict to normalized [0,1] vector."""
        vector = []
        for name in self._param_names:
            low, high = self.bounds.get_range(name)
            normalized = (params[name] - low) / (high - low)
            vector.append(normalized)
        return vector

    def _vector_to_params(self, vector: list[float]) -> dict[str, float]:
        """Convert normalized vector back to params dict, clamped to bounds."""
        params = {}
        for i, name in enumerate(self._param_names):
            low, high = self.bounds.get_range(name)
            normalized = max(0.0, min(1.0, vector[i]))
            params[name] = low + normalized * (high - low)
        return params

    def _evaluate(self, vector: list[float], eval_seed: int) -> tuple[float, MinimaxFitnessResult]:
        """Evaluate a solution vector. Returns (negative_fitness, result)."""
        params = self._vector_to_params(vector)
        profile = MinimaxProfile(name='cmaes_candidate', **params)

        result = evaluate_minimax_profile(
            profile,
            n_games=self.games_per_eval,
            seed=eval_seed,
            depth=self.depth,
            slot3_target=self.slot3_target,
            slot4_target=self.slot4_target,
            win_target=self.win_target
        )

        return -result.fitness_score, result

    def run(self, max_generations: int = 100,
            target_fitness: float = 95.0,
            verbose: bool = True) -> Individual:
        """Run CMA-ES optimization."""
        n_params = len(self._param_names)

        # Start from best known profile (minimax-v3 if available, else v1)
        start_profile = 'minimax-v3' if 'minimax-v3' in MINIMAX_PROFILES else 'minimax-v1'
        if start_profile in MINIMAX_PROFILES:
            x0 = self._params_to_vector(minimax_profile_to_params(MINIMAX_PROFILES[start_profile]))
        else:
            x0 = [0.5] * n_params

        opts = {
            'seed': self.seed,
            'bounds': [0, 1],
            'maxiter': max_generations,
            'verbose': -9,
            'CMA_stds': self.sigma,
        }

        es = cma.CMAEvolutionStrategy(x0, self.sigma, opts)
        self.pop_size = es.popsize

        gen = 0
        while not es.stop():
            solutions = es.ask()

            fitness_values = []
            fitness_results = []
            for i, sol in enumerate(solutions):
                neg_fit, result = self._evaluate(
                    sol, self.seed + gen * 10000 + i * 100
                )
                fitness_values.append(neg_fit)
                fitness_results.append(result)

            es.tell(solutions, fitness_values)

            best_idx = min(range(len(fitness_values)), key=lambda i: fitness_values[i])
            best_result = fitness_results[best_idx]
            best_params = self._vector_to_params(solutions[best_idx])

            if (self.best_ever is None or
                    best_result.fitness_score > self.best_ever.fitness.fitness_score):
                self.best_ever = Individual(
                    params=best_params.copy(),
                    fitness=best_result
                )

            self.history.append({
                'generation': gen,
                'best_fitness': best_result.fitness_score,
                'best_ever_fitness': self.best_ever.fitness.fitness_score,
                'slot1': best_result.slot1_pct,
                'slot2': best_result.slot2_pct,
                'slot3': best_result.slot3_pct,
                'slot4': best_result.slot4_pct,
                'win_rate': best_result.win_rate,
                'meets_criteria': best_result.meets_criteria(
                    self.slot3_target, self.slot4_target, self.win_target),
                'sigma': es.sigma,
            })

            if verbose:
                f = best_result
                marker = " *" if f.meets_criteria(
                    self.slot3_target, self.slot4_target, self.win_target) else ""
                print(f"Gen {gen:3d}: fitness={f.fitness_score:.1f} "
                      f"(best={self.best_ever.fitness.fitness_score:.1f}), "
                      f"slots=[{f.slot1_pct:.0f},{f.slot2_pct:.0f},"
                      f"{f.slot3_pct:.0f},{f.slot4_pct:.0f}], "
                      f"win={f.win_rate*100:.0f}%, "
                      f"sigma={es.sigma:.3f}{marker}")

            if self.best_ever.fitness.fitness_score >= target_fitness:
                if verbose:
                    print(f"\nTarget fitness {target_fitness} reached!")
                break

            gen += 1
            self.generation = gen

        return self.best_ever

    def get_statistics(self) -> dict:
        """Get summary statistics."""
        if not self.history:
            return {}

        best_gen = max(self.history, key=lambda x: x['best_fitness'])
        qualifying = [h for h in self.history if h.get('meets_criteria', False)]

        return {
            'generations_run': len(self.history),
            'best_fitness': best_gen['best_fitness'],
            'best_generation': best_gen['generation'],
            'qualifying_generations': len(qualifying),
            'final_best': self.best_ever.fitness.fitness_score if self.best_ever else 0,
        }


def format_minimax_profile_as_code(params: dict[str, float], name: str = 'minimax-v2') -> str:
    """Format minimax profile parameters as Python code for profiles.py."""
    lines = [f"    '{name}': MinimaxProfile("]
    lines.append(f"        name='{name}',")

    categories = {
        'Board structure': ['lane_win_weight', 'near_game_win_bonus', 'piece_advantage_mult',
                           'near_win_bonus', 'near_threat_bonus'],
        'Trigger effects': ['trigger_trap_portal_mult', 'trigger_mirror_value',
                           'trigger_echo_hydra_value', 'trigger_shockwave_backfire_value',
                           'trigger_absorb_value', 'trigger_retaliate_value', 'trigger_default_value'],
        'Deferred effects': ['deferred_signal_value', 'deferred_enlist_value', 'deferred_ambush_value',
                            'deferred_reinforce_value', 'deferred_raid_value', 'deferred_default_value',
                            'deferred_discount'],
        'Freeze': ['freeze_near_win', 'freeze_near_threat', 'freeze_base'],
        'Global effects': ['cloak_value', 'blind_value'],
        'Pending raid': ['raid_pending_value', 'raid_discount_base'],
        'Duration effects': ['sanctuary_value', 'capture_value'],
        'Targeting & protection': ['trigger_targeting_bias', 'freeze_protect_near_win',
                                   'trigger_contest_boost'],
    }

    for category, param_names in categories.items():
        lines.append(f"        # {category}")
        for pname in param_names:
            if pname in params:
                lines.append(f"        {pname}={params[pname]:.1f},")

    lines.append("    ),")
    return '\n'.join(lines)
