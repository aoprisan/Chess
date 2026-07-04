import { describe, it, expect, beforeEach } from 'vitest';
import {
  JOURNEYS,
  nextJourney,
  unlockedLevel,
  isJourneyUnlocked,
  bestStarsFor,
  recordJourneyCompletion,
} from './levels';
import { journeyStorageKey } from './progress';

function stubLocalStorage() {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('level unlock progression', () => {
  beforeEach(stubLocalStorage);

  it('starts with only level 1 unlocked', () => {
    expect(unlockedLevel()).toBe(1);
    expect(isJourneyUnlocked('journey_1')).toBe(true);
    expect(isJourneyUnlocked('journey_2')).toBe(false);
  });

  it('completing a level unlocks the next and records best stars', () => {
    recordJourneyCompletion('journey_1', 17);
    expect(unlockedLevel()).toBe(2);
    expect(bestStarsFor('journey_1')).toBe(17);
    expect(isJourneyUnlocked('journey_2')).toBe(true);
    expect(isJourneyUnlocked('journey_3')).toBe(false);
  });

  it('keeps the best star haul across repeat completions', () => {
    recordJourneyCompletion('journey_1', 17);
    recordJourneyCompletion('journey_1', 9);
    expect(bestStarsFor('journey_1')).toBe(17);
    recordJourneyCompletion('journey_1', 21);
    expect(bestStarsFor('journey_1')).toBe(21);
  });

  it('never unlocks past the last level', () => {
    for (const j of JOURNEYS) recordJourneyCompletion(j.id, 5);
    expect(unlockedLevel()).toBe(JOURNEYS.length);
  });

  it('walks the journey chain via nextJourney', () => {
    expect(nextJourney('journey_1')?.id).toBe('journey_2');
    expect(nextJourney('journey_4')?.id).toBe('journey_5');
    expect(nextJourney('journey_5')).toBeUndefined();
  });

  it('players who beat the original journey before levels existed start with level 2 open', () => {
    localStorage.setItem(
      journeyStorageKey('journey_1'),
      JSON.stringify({
        mapId: 'journey_1',
        heroType: 'panda',
        currentNodeId: 'finish',
        completed: true,
      }),
    );
    expect(unlockedLevel()).toBe(2);
  });
});
