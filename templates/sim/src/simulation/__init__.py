"""Simulation runner and analysis module."""

from src.simulation.runner import (
    SimulationResult,
    SimulationRunner,
    run_comparison,
    run_slot_allocation_test
)
from src.simulation.analysis import (
    print_summary,
    print_comparison,
    analyze_perk_balance,
    print_perk_analysis,
    export_results,
    export_comparison
)

__all__ = [
    'SimulationResult',
    'SimulationRunner',
    'run_comparison',
    'run_slot_allocation_test',
    'print_summary',
    'print_comparison',
    'analyze_perk_balance',
    'print_perk_analysis',
    'export_results',
    'export_comparison'
]
