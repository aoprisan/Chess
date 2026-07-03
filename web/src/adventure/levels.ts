// Level catalog + unlock progression. Journeys are played in order: finishing
// level N unlocks level N+1. Unlock state and best stars persist separately
// from per-journey progress (see progress.ts) under 'adventure_levels_v1'.

import { journeyStorageKey, AdventureProgressJson } from './progress';

export interface JourneyMeta {
  id: string;
  level: number;
  name: string;
}

export const JOURNEYS: JourneyMeta[] = [
  { id: 'journey_1', level: 1, name: 'Meadow Trail' },
  { id: 'journey_2', level: 2, name: 'Winding Woods' },
  { id: 'journey_3', level: 3, name: 'Twin Rivers' },
  { id: 'journey_4', level: 4, name: 'Stormy Highlands' },
  { id: 'journey_5', level: 5, name: 'Summit of Legends' },
];

export function journeyById(id: string): JourneyMeta | undefined {
  return JOURNEYS.find((j) => j.id === id);
}

export function nextJourney(id: string): JourneyMeta | undefined {
  const meta = journeyById(id);
  return meta ? JOURNEYS.find((j) => j.level === meta.level + 1) : undefined;
}

const LEVELS_KEY = 'adventure_levels_v1';

interface LevelsStateJson {
  unlockedLevel: number;
  /** Best star haul per completed journey, keyed by journey id. */
  bestStars: Record<string, number>;
}

function loadState(): LevelsStateJson {
  try {
    const stored = localStorage.getItem(LEVELS_KEY);
    if (stored) {
      const json = JSON.parse(stored) as LevelsStateJson;
      return { unlockedLevel: json.unlockedLevel ?? 1, bestStars: json.bestStars ?? {} };
    }
  } catch {
    // fall through to defaults
  }
  // First run with the levels system: players who already finished the
  // original journey (saved before levels existed) shouldn't be locked
  // back to level 1.
  const state: LevelsStateJson = { unlockedLevel: 1, bestStars: {} };
  try {
    const legacy = localStorage.getItem(journeyStorageKey('journey_1'));
    if (legacy) {
      const progress = JSON.parse(legacy) as AdventureProgressJson;
      if (progress.completed) state.unlockedLevel = 2;
    }
  } catch {
    // ignore unreadable legacy progress
  }
  localStorage.setItem(LEVELS_KEY, JSON.stringify(state));
  return state;
}

function saveState(state: LevelsStateJson): void {
  localStorage.setItem(LEVELS_KEY, JSON.stringify(state));
}

export function unlockedLevel(): number {
  return loadState().unlockedLevel;
}

export function isJourneyUnlocked(id: string): boolean {
  const meta = journeyById(id);
  return meta !== undefined && meta.level <= unlockedLevel();
}

export function bestStarsFor(id: string): number | undefined {
  return loadState().bestStars[id];
}

/** Record a finished journey: keep the best star haul and unlock the next level. */
export function recordJourneyCompletion(id: string, stars: number): void {
  const state = loadState();
  const meta = journeyById(id);
  state.bestStars[id] = Math.max(state.bestStars[id] ?? 0, stars);
  if (meta) state.unlockedLevel = Math.max(state.unlockedLevel, Math.min(meta.level + 1, JOURNEYS.length));
  saveState(state);
}
