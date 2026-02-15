"""Genetic algorithm implementation for profile optimization."""

import random
from dataclasses import dataclass, asdict
from typing import Optional

from src.ai.profiles import HeuristicProfile, PROFILES
from .bounds import ParameterBounds
from .fitness import evaluate_profile, FitnessResult


@dataclass
class Individual:
    """A candidate profile with its fitness."""
    params: dict[str, float]
    fitness: Optional[FitnessResult] = None

    def to_profile(self, name: str) -> HeuristicProfile:
        """Convert to HeuristicProfile instance."""
        return HeuristicProfile(name=name, **self.params)


def profile_to_params(profile: HeuristicProfile) -> dict[str, float]:
    """Extract numeric parameters from a profile."""
    params = {}
    for key, value in asdict(profile).items():
        if key != 'name' and isinstance(value, (int, float)):
            params[key] = float(value)
    return params


class GeneticOptimizer:
    """Genetic algorithm optimizer for HeuristicProfile parameters."""

    def __init__(self,
                 population_size: int = 20,
                 elite_count: int = 4,
                 mutation_rate: float = 0.3,
                 mutation_strength: float = 0.15,
                 games_per_eval: int = 200,
                 seed: int = 42,
                 slot3_target: float = 22.0,
                 slot4_target: float = 22.0,
                 win_target: float = 0.65):
        """
        Initialize the genetic optimizer.

        Args:
            population_size: Number of individuals in population
            elite_count: Top N individuals preserved unchanged each generation
            mutation_rate: Probability of mutating each parameter
            mutation_strength: Gaussian noise scale relative to parameter range
            games_per_eval: Games to run per fitness evaluation
            seed: Random seed for reproducibility
            slot3_target: Target percentage for slot 3 usage
            slot4_target: Target percentage for slot 4 usage
            win_target: Target win rate vs v1 (0.65 = 65%)
        """
        self.pop_size = population_size
        # Ensure elite_count is reasonable for population size
        self.elite_count = min(elite_count, max(1, population_size // 2))
        self.mutation_rate = mutation_rate
        self.mutation_strength = mutation_strength
        self.games_per_eval = games_per_eval
        self.bounds = ParameterBounds()
        self.seed = seed
        self.rng = random.Random(seed)
        self.generation = 0
        self.best_ever: Optional[Individual] = None
        self.history: list[dict] = []
        self.population: list[Individual] = []
        # Fitness targets
        self.slot3_target = slot3_target
        self.slot4_target = slot4_target
        self.win_target = win_target

    def initialize_population(self) -> list[Individual]:
        """Create initial population with seeded profiles."""
        population = []

        # Include existing profiles as seeds (they have proven behavior)
        if 'v1' in PROFILES:
            population.append(Individual(params=profile_to_params(PROFILES['v1'])))
        if 'v2' in PROFILES:
            population.append(Individual(params=profile_to_params(PROFILES['v2'])))

        # Fill rest with random individuals
        while len(population) < self.pop_size:
            params = self.bounds.sample_random(self.rng)
            population.append(Individual(params=params))

        return population

    def evaluate_population(self, population: list[Individual], seed_offset: int = 0):
        """Evaluate fitness for all individuals without cached fitness."""
        for i, ind in enumerate(population):
            if ind.fitness is None:
                profile = ind.to_profile(f'gen{self.generation}_ind{i}')
                ind.fitness = evaluate_profile(
                    profile,
                    n_games=self.games_per_eval,
                    seed=seed_offset + i * 1000,
                    slot3_target=self.slot3_target,
                    slot4_target=self.slot4_target,
                    win_target=self.win_target
                )

    def select_parents(self, population: list[Individual]) -> list[Individual]:
        """Tournament selection: pick 3 random, keep best."""
        parents = []
        num_offspring = self.pop_size - self.elite_count

        for _ in range(num_offspring):
            candidates = self.rng.sample(population, min(3, len(population)))
            winner = max(candidates, key=lambda x: x.fitness.fitness_score)
            parents.append(winner)

        return parents

    def crossover(self, parent1: Individual, parent2: Individual) -> Individual:
        """Uniform crossover: randomly pick each parameter from one parent."""
        child_params = {}
        for key in parent1.params:
            if self.rng.random() < 0.5:
                child_params[key] = parent1.params[key]
            else:
                child_params[key] = parent2.params[key]
        return Individual(params=child_params)

    def mutate(self, individual: Individual) -> Individual:
        """Add Gaussian noise to parameters with probability mutation_rate."""
        params = individual.params.copy()

        for key in params:
            if self.rng.random() < self.mutation_rate:
                low, high = self.bounds.get_range(key)
                range_size = high - low
                noise = self.rng.gauss(0, range_size * self.mutation_strength)
                params[key] = max(low, min(high, params[key] + noise))

        return Individual(params=params)

    def run(self, max_generations: int = 50,
            target_fitness: float = 95.0,
            verbose: bool = True,
            callback=None) -> Individual:
        """
        Run the genetic optimization.

        Args:
            max_generations: Maximum generations before stopping
            target_fitness: Stop early if this fitness is achieved
            verbose: Print progress each generation
            callback: Optional callback(generation, best_individual) called each gen

        Returns:
            Best individual found
        """
        self.population = self.initialize_population()

        for gen in range(max_generations):
            self.generation = gen

            # Evaluate fitness
            self.evaluate_population(self.population, seed_offset=gen * 100000)

            # Sort by fitness (descending)
            self.population.sort(key=lambda x: x.fitness.fitness_score, reverse=True)

            # Track best ever
            current_best = self.population[0]
            if (self.best_ever is None or
                current_best.fitness.fitness_score > self.best_ever.fitness.fitness_score):
                self.best_ever = Individual(
                    params=current_best.params.copy(),
                    fitness=current_best.fitness
                )

            # Record history
            self.history.append({
                'generation': gen,
                'best_fitness': current_best.fitness.fitness_score,
                'slot1': current_best.fitness.slot1_pct,
                'slot2': current_best.fitness.slot2_pct,
                'slot3': current_best.fitness.slot3_pct,
                'slot4': current_best.fitness.slot4_pct,
                'win_rate': current_best.fitness.win_rate_vs_v1,
                'meets_criteria': current_best.fitness.meets_criteria(
                    self.slot3_target, self.slot4_target, self.win_target),
            })

            # Print progress
            if verbose:
                f = current_best.fitness
                print(f"Gen {gen:3d}: fitness={f.fitness_score:.1f}, "
                      f"slots=[{f.slot1_pct:.0f},{f.slot2_pct:.0f},{f.slot3_pct:.0f},{f.slot4_pct:.0f}], "
                      f"win={f.win_rate_vs_v1*100:.0f}%"
                      + (" *" if f.meets_criteria(self.slot3_target, self.slot4_target, self.win_target) else ""))

            # Callback
            if callback:
                callback(gen, current_best)

            # Check termination
            if current_best.fitness.fitness_score >= target_fitness:
                if verbose:
                    print(f"\nTarget fitness {target_fitness} reached at generation {gen}!")
                break

            # Selection and reproduction
            elite = self.population[:self.elite_count]

            # Tournament selection for parents
            parents = self.select_parents(self.population)

            # Generate offspring through crossover and mutation
            offspring = []
            num_offspring_needed = self.pop_size - self.elite_count
            while len(offspring) < num_offspring_needed:
                # Handle small parent pools
                if len(parents) >= 2:
                    p1, p2 = self.rng.sample(parents, 2)
                    child = self.crossover(p1, p2)
                elif len(parents) == 1:
                    # Clone and mutate single parent
                    child = Individual(params=parents[0].params.copy())
                else:
                    # Fallback to random if no parents
                    child = Individual(params=self.bounds.sample_random(self.rng))
                child = self.mutate(child)
                offspring.append(child)

            # New population = elite (unchanged) + offspring (new)
            self.population = elite + offspring

        return self.best_ever

    def get_statistics(self) -> dict:
        """Get summary statistics from the optimization run."""
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
