// @vitest-environment jsdom

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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
  // Combat and AdventureMap measure themselves and honor reduced motion.
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
});

beforeEach(() => localStorage.clear());
afterEach(cleanup);

async function renderHome() {
  render(<App />);
  return screen.findByText('Play Solo'); // waits out the boot gate
}

describe('home menu', () => {
  it('shows the four modes after boot', async () => {
    await renderHome();
    for (const label of ['Play Solo', 'Adventure', '2 Players', 'How to Play']) {
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
    expect(await screen.findByText('Play Solo')).toBeTruthy();
  });
});

describe('Play Solo difficulty', () => {
  it('defaults to medium, persists the choice, and starts a battle', async () => {
    await renderHome();
    fireEvent.click(screen.getByText('Play Solo'));
    await screen.findByText('Choose your hero');

    const hard = screen.getByRole('radio', { name: 'Hard' });
    expect(screen.getByRole('radio', { name: 'Medium' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(hard);
    expect(hard.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('solo_difficulty_v1')).toBe('hard');

    fireEvent.click(screen.getByText('Sloth'));
    fireEvent.click(screen.getByText('Start'));
    // Battle mounts: the player's hero appears in the combat header.
    expect((await screen.findAllByText('Sloth')).length).toBeGreaterThan(0);
    expect(screen.getByText('Your Turn!')).toBeTruthy();
  });

  it('reads a previously saved difficulty', async () => {
    localStorage.setItem('solo_difficulty_v1', 'easy');
    await renderHome();
    fireEvent.click(screen.getByText('Play Solo'));
    await screen.findByText('Choose your hero');
    expect(screen.getByRole('radio', { name: 'Easy' }).getAttribute('aria-checked')).toBe('true');
  });
});
