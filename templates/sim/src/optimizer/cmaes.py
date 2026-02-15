"""CMA-ES optimizer for profile parameters."""

import cma
from dataclasses import dataclass
from typing import Optional

from src.ai.profiles import HeuristicProfile, PROFILES
from .bounds import ParameterBounds
from .fitness import evaluate_profile, FitnessResult
from .genetic import Individual, profile_to_params


class CMAESOptimizer:
    """CMA-ES optimizer for HeuristicProfile parameters.

    Uses Covariance Matrix Adaptation Evolution Strategy to search the
    parameter space. Better than genetic algorithms at:
    - Adapting search distribution based on successful steps
    - Handling correlated parameters
    - Escaping local optima in continuous spaces
    """

    def __init__(self,
                 sigma: float = 0.3,
                 games_per_eval: int = 200,
                 seed: int = 42,
                 slot3_target: float = 22.0,
                 slot4_target: float = 22.0,
                 win_target: float = 0.65):
        """
        Args:
            sigma: Initial step size in normalized [0,1] space
            games_per_eval: Games to run per fitness evaluation
            seed: Random seed for reproducibility
            slot3_target: Target percentage for slot 3 usage
            slot4_target: Target percentage for slot 4 usage
            win_target: Target win rate vs v1 (0.65 = 65%)
        """
        self.sigma = sigma
        self.games_per_eval = games_per_eval
        self.seed = seed
        self.bounds = ParameterBounds()
        self.slot3_target = slot3_target
        self.slot4_target = slot4_target
        self.win_target = win_target

        # Results tracking (compatible with save_results)
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

    def _evaluate(self, vector: list[float], eval_seed: int) -> tuple[float, FitnessResult]:
        """Evaluate a solution vector.

        Returns:
            (negative_fitness, FitnessResult) - negative because CMA-ES minimizes.
        """
        params = self._vector_to_params(vector)
        profile = HeuristicProfile(name='cmaes_candidate', **params)

        result = evaluate_profile(
            profile,
            n_games=self.games_per_eval,
            seed=eval_seed,
            slot3_target=self.slot3_target,
            slot4_target=self.slot4_target,
            win_target=self.win_target
        )

        return -result.fitness_score, result

    def run(self, max_generations: int = 100,
            target_fitness: float = 95.0,
            verbose: bool = True) -> Individual:
        """
        Run CMA-ES optimization.

        Args:
            max_generations: Maximum generations before stopping
            target_fitness: Stop early if this fitness is achieved
            verbose: Print progress each generation

        Returns:
            Best Individual found
        """
        n_params = len(self._param_names)

        # Start from v2 profile if available, else center of bounds
        if 'v2' in PROFILES:
            x0 = self._params_to_vector(profile_to_params(PROFILES['v2']))
        elif 'v1' in PROFILES:
            x0 = self._params_to_vector(profile_to_params(PROFILES['v1']))
        else:
            x0 = [0.5] * n_params

        # CMA-ES options
        opts = {
            'seed': self.seed,
            'bounds': [0, 1],
            'maxiter': max_generations,
            'verbose': -9,  # Suppress cma's own output
            'CMA_stds': self.sigma,
        }

        es = cma.CMAEvolutionStrategy(x0, self.sigma, opts)
        self.pop_size = es.popsize

        gen = 0
        while not es.stop():
            solutions = es.ask()

            # Evaluate all solutions
            fitness_values = []
            fitness_results = []
            for i, sol in enumerate(solutions):
                neg_fit, result = self._evaluate(
                    sol, self.seed + gen * 10000 + i * 100
                )
                fitness_values.append(neg_fit)
                fitness_results.append(result)

            es.tell(solutions, fitness_values)

            # Find best in this generation
            best_idx = min(range(len(fitness_values)), key=lambda i: fitness_values[i])
            best_result = fitness_results[best_idx]
            best_params = self._vector_to_params(solutions[best_idx])

            # Track best ever
            if (self.best_ever is None or
                    best_result.fitness_score > self.best_ever.fitness.fitness_score):
                self.best_ever = Individual(
                    params=best_params.copy(),
                    fitness=best_result
                )

            # Record history
            self.history.append({
                'generation': gen,
                'best_fitness': best_result.fitness_score,
                'best_ever_fitness': self.best_ever.fitness.fitness_score,
                'slot1': best_result.slot1_pct,
                'slot2': best_result.slot2_pct,
                'slot3': best_result.slot3_pct,
                'slot4': best_result.slot4_pct,
                'win_rate': best_result.win_rate_vs_v1,
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
                      f"win={f.win_rate_vs_v1*100:.0f}%, "
                      f"sigma={es.sigma:.3f}{marker}")

            # Early stopping
            if self.best_ever.fitness.fitness_score >= target_fitness:
                if verbose:
                    print(f"\nTarget fitness {target_fitness} reached!")
                break

            gen += 1
            self.generation = gen

        return self.best_ever

    def get_statistics(self) -> dict:
        """Get summary statistics (compatible with save_results)."""
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
