// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { App } from './App';
import { PERKS } from '../game/perks';

// The boot gate waits for every game image; jsdom never fires image
// load/error events, so resolve the preload immediately.
vi.mock('./preload', () => ({
  preloadGameImages: async (onProgress: (f: number) => void) => {
    onProgress(1);
  },
}));

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  // Combat and CampaignMap measure themselves and honor reduced motion.
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  // The campaign maps are fetched at boot; serve the committed JSONs.
  globalThis.fetch = (async (url: unknown) => {
    const match = String(url).match(/assets\/maps\/(map_\d)\.json$/);
    if (!match) throw new Error(`Unexpected fetch: ${String(url)}`);
    const body = readFileSync(`${process.cwd()}/public/assets/maps/${match[1]}.json`, 'utf-8');
    return { ok: true, json: async () => JSON.parse(body) };
  }) as typeof fetch;
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function renderHome() {
  render(<App />);
  return screen.findByText('Quick Match'); // waits out the boot gate
}

describe('home menu', () => {
  it('shows the four modes after boot', async () => {
    await renderHome();
    for (const label of ['Campaign', 'Quick Match', '2 Players', 'How to Play']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});

describe('How to Play', () => {
  it('lists the rules and every power from the catalog', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('How to Play'));
    expect(screen.getByText('The Battle')).toBeTruthy();
    for (const perk of Object.values(PERKS)) {
      if (perk.id === 0) continue; // Pass has no catalog entry
      expect(screen.getByText(perk.name)).toBeTruthy();
    }
    fireEvent.click(screen.getByText('Menu'));
    expect(await screen.findByText('Quick Match')).toBeTruthy();
  });
});

describe('Campaign', () => {
  it('opens the system list with only Street Grid unlocked, then the map', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('Campaign'));
    await screen.findByText('Choose a System');
    expect(screen.getByText('Street Grid')).toBeTruthy();
    const cards = document.querySelectorAll('.ls-card');
    expect(cards).toHaveLength(3);
    expect((cards[1] as HTMLButtonElement).disabled).toBe(true);
    expect((cards[2] as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByText('Street Grid'));
    expect(await screen.findByText(/critical systems secured/)).toBeTruthy();
    expect(screen.getByText(/0\/6/)).toBeTruthy();
  });

  it('shows the crew roster with the 5 starters unlocked', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('Campaign'));
    await screen.findByText('Choose a System');
    fireEvent.click(screen.getByText('Crew'));
    await screen.findByText('Your Crew');
    for (const starter of ['Bitzy', 'Pixel', 'Cache', 'Sparky', 'Momo']) {
      expect(screen.getByText(starter)).toBeTruthy();
    }
    // Unrecruited characters stay hidden.
    expect(screen.queryByText('Popcorn')).toBeNull();
    expect(screen.getAllByText('???').length).toBeGreaterThan(0);
  });
});

describe('Quick Match difficulty', () => {
  it('defaults to medium, persists the choice, and starts a battle', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('Quick Match'));
    await screen.findByText('Choose your character');

    const hard = screen.getByRole('radio', { name: 'Hard' });
    expect(screen.getByRole('radio', { name: 'Medium' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(hard);
    expect(hard.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('solo_difficulty_v1')).toBe('hard');

    fireEvent.click(screen.getByText('Bitzy'));
    fireEvent.click(screen.getByText('Start'));
    // Battle mounts: the player's character appears in the combat header.
    expect((await screen.findAllByText('Bitzy')).length).toBeGreaterThan(0);
    expect(screen.getByText('Your Turn!')).toBeTruthy();
  });

  it('reads a previously saved difficulty', async () => {
    localStorage.setItem('solo_difficulty_v1', 'easy');
    await renderHome();
    fireEvent.click(screen.getByText('Quick Match'));
    await screen.findByText('Choose your character');
    expect(screen.getByRole('radio', { name: 'Easy' }).getAttribute('aria-checked')).toBe('true');
  });
});
